import { Effect, Schema } from "effect"
import {
  HEARTBEAT_INTERVAL_MS,
  MAX_AGENT_ANNOUNCEMENTS,
  JobOutcome,
  PublicListing,
  SkillManifest,
  decodeHubMessage,
  helloDigest,
  decodeEnsState,
  parsePrice,
  type EnsState,
  toPublicListing
} from "@arcade/core"
import { ensStatePath, readEnsState } from "./ens-state.ts"
import { execSkill } from "./exec.ts"
import { loadSkills } from "./skills.ts"
import { dispatchMap, gate } from "./publishable.ts"
import { privateKeyToAccount } from "viem/accounts"
import { resolveSellerKey } from "./wallet.ts"
import { startHireBroker } from "./hire-broker.ts"
import type { RunnerConfig } from "./config.ts"
import { makeEnsLiveness, viemEnsWriter, type EnsWriter } from "./ens.ts"
import { ensJournalPath } from "./ens-journal.ts"

/**
 * Seller daemon.
 *
 * Dials OUT to the hub over a websocket and pulls work. No inbound ports, so this runs from
 * a laptop behind NAT — and, critically, the hub never receives anything but the PUBLIC
 * projection of each manifest plus job outputs. Prompts, entry paths, secret names and the
 * code itself stay on this machine by construction.
 */

export interface DaemonArgs {
  readonly config: RunnerConfig
  readonly skillsDir: string
  /** Public IO seam for offline lifecycle tests; ordinary callers use ensTickerFor. */
  readonly ensTickerFactory?: typeof ensTickerFor
}

export interface EnsTicker { readonly tick: () => Promise<void>; readonly stop: () => void }
/** Missing state is normal. Malformed state is an explicit fixed diagnostic, not
 * evidence of expiry. No private key is inspected until a served namespace exists. */
export const ensTickerFor = async (a: {
  readonly skills: ReadonlyArray<{ readonly manifest: { readonly id: string; readonly price: string } }>
  readonly log?: (line: string) => void
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly expectedSeller?: string
  readonly isActive?: () => boolean
  readonly readState?: () => Promise<EnsState | undefined>
  readonly writerFor?: (key: string, state: EnsState) => EnsWriter
}): Promise<EnsTicker | undefined> => {
  const log = (line: string) => { try { (a.log ?? console.log)(line) } catch {} }
  const env = a.env ?? process.env
  let state: EnsState
  try {
    let timer: ReturnType<typeof setTimeout> | undefined
    let raw: EnsState | undefined
    try { raw = await Promise.race([Promise.resolve().then(a.readState ?? (() => readEnsState(ensStatePath(env)))), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(Error()), 2000) })]) }
    finally { if (timer !== undefined) clearTimeout(timer) }
    if (raw === undefined) return undefined
    state = decodeEnsState(raw)
  } catch { log("[ens] Namespace state is unavailable or invalid; no ENS writes are enabled. No expiry was inferred."); return undefined }
  const served = new Map(a.skills.map(s => [s.manifest.id, s.manifest.price]))
  if (!state.skills.some(s => served.has(s.skillId))) return undefined
  try {
    if (a.expectedSeller !== undefined && state.seller !== a.expectedSeller.toLowerCase()) throw Error()
    if (env.ARCADE_ENS_ROOT !== undefined && env.ARCADE_ENS_ROOT !== state.root) throw Error()
    const key = env.ARCADE_ENS_DAEMON_KEY
    if (key === undefined || key === "") { log("[ens] ARCADE_ENS_DAEMON_KEY is not set; this runner will not renew names. Exact expiry must be checked on Sepolia."); return undefined }
    if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw Error()
    const signer = privateKeyToAccount(key as `0x${string}`).address.toLowerCase()
    if (signer === state.seller || signer === state.owner || state.daemon !== undefined && signer !== state.daemon) throw Error()
    const prices = new Map([...served].map(([id, price]) => [id, parsePrice(price)]))
    const writer = a.writerFor ? a.writerFor(key, state) : viemEnsWriter(key, env.ARCADE_ENS_RPC, { state, journalPath: ensJournalPath(env), ...(a.isActive === undefined ? {} : { isActive: a.isActive }) })
    return makeEnsLiveness({ state, writer, priceAtomicFor: id => prices.get(id), log, ...(a.isActive === undefined ? {} : { isActive: a.isActive }) })
  } catch { log("[ens] Scoped daemon identity or namespace configuration is invalid; no ENS writes are enabled."); return undefined }
}

/** Only identities for currently serving listings, never the rest of local config. */
export const agentAnnouncementsFor = (agents: RunnerConfig["agents"] | undefined, listings: ReadonlyArray<Pick<PublicListing, "id">>) => {
  const announced = new Set(listings.map(listing => listing.id))
  return Object.entries(agents ?? {}).filter(([skillId]) => announced.has(skillId)).slice(0, MAX_AGENT_ANNOUNCEMENTS)
    .map(([skillId, identity]) => ({ skillId, agentId: identity.agentId, registrationTx: identity.registrationTx }))
}

export const startDaemon = (args: DaemonArgs) =>
  Effect.gen(function* () {
    const skills = yield* loadSkills(args.skillsDir)
    if (skills.length === 0) {
      return yield* Effect.fail(new Error(`no skills found in ${args.skillsDir}`))
    }

    // The gate, applied ONCE and used for everything downstream. `arcade publish` gates the
    // interactive route to the hub; this gates the automatic one. Critically, the dispatch
    // map is built from the same filtered set — a refused skill is unreachable, not merely
    // unadvertised, so no message from the hub can cause it to run.
    const gated = gate(skills)
    const byId = dispatchMap(gated)
    const listings: Array<PublicListing> = gated.sellable.map((s) => toPublicListing(s.manifest))

    for (const r of gated.refused) {
      console.error(`not serving ${r.skillId}: ${r.reason.split("\n")[0]}`)
    }

    if (gated.sellable.length === 0) {
      return yield* Effect.fail(
        new Error(`no sellable skills in ${args.skillsDir} (${gated.refused.length} refused)`)
      )
    }

    // Environment first, then the keychain `arcade init` wrote — never the config file. A
    // payout key on disk beside a seller's address is the one secret this project must not
    // encourage storing. `resolveSellerKey` also refuses a key that controls a *different*
    // address, so a misconfiguration fails here with a message about configuration rather
    // than later with one about signatures.
    const resolved = yield* resolveSellerKey(args.config.sellerAddress)
    const sellerKey = resolved.privateKey
    const sellerAccount = privateKeyToAccount(sellerKey as `0x${string}`)

    // A sub-purchase key goes INTO the sandbox; the payout key proves listing ownership and
    // must never. Reusing one for both would mean any skill that can hire could also
    // re-announce this seller's listings with payment redirected elsewhere.
    const subKey = process.env["ARCADE_SUBBUY_KEY"]
    if (subKey !== undefined && subKey === sellerKey) {
      return yield* Effect.fail(
        new Error(
          "ARCADE_SUBBUY_KEY must not be the same key as your payout address. That key is " +
            "handed to skills declaring `hire-skills`, and it also signs the handshake " +
            "proving these listings are yours — a skill holding it could redirect your " +
            "payments. Create a separate wallet and fund it with what you are willing to " +
            "let your skills spend."
        )
      )
    }
    // The broker holds the sub-purchase key and does the buying, so the key never enters a
    // sandbox. Started only when there is a key to hold; skills declaring `hire-skills` on
    // a runner without one simply fail to hire, with a message saying why.
    const hiring = gated.sellable.filter((s) =>
      s.manifest.engine.capabilities.includes("hire-skills")
    )
    const broker =
      subKey === undefined || hiring.length === 0
        ? undefined
        : startHireBroker({
            hubUrl: args.config.hubUrl,
            subBuyKey: subKey,
            socketPath: `${process.env["TMPDIR"] ?? "/tmp"}/arcade-hire-${args.config.runnerId}.sock`
          })

    if (broker !== undefined) {
      for (const s of hiring) {
        console.log(
          `  ${s.manifest.id} may hire other skills, up to ` +
            `$${s.manifest.bounds.maxSubSpendUsd ?? 0} per call`
        )
      }
    } else if (hiring.length > 0) {
      console.error(
        `${hiring.length} skill(s) declare hire-skills but ARCADE_SUBBUY_KEY is not set — ` +
          "they will run, and any attempt to hire will be refused."
      )
    }

    console.log(`[runner] ${args.config.runnerId}`)
    for (const s of gated.sellable) {
      console.log(`  ${s.manifest.id}@${s.manifest.version}  ${s.manifest.price}  (${s.manifest.engine.adapter})`)
    }

    yield* Effect.async<never, Error>((resume) => {
      let activeJobs = 0
      let heartbeat: ReturnType<typeof setInterval> | undefined
      let closed = false
      let connected = false
      let socket: WebSocket | undefined
      let reconnect: ReturnType<typeof setTimeout> | undefined
      let ensTimer: ReturnType<typeof setInterval> | undefined
      let ensTicker: EnsTicker | undefined
      const active = () => connected && !closed
      const runEns = () => { if (active()) void Promise.resolve().then(() => ensTicker?.tick()).catch(() => {}) }
      const startEns = () => {
        if (!active() || !ensTicker || ensTimer !== undefined) return
        runEns(); ensTimer = setInterval(runEns, HEARTBEAT_INTERVAL_MS)
      }
      // One lifetime ticker retains the renewal throttle across websocket reconnects.
      // Optional setup and every tick remain outside the job/settlement effect.
      void Promise.resolve().then(() => (args.ensTickerFactory ?? ensTickerFor)({ skills: gated.sellable, expectedSeller: args.config.sellerAddress, isActive: active })).then(ticker => {
        if (closed) { ticker?.stop(); return }
        ensTicker = ticker; startEns()
      }).catch(() => { console.error("[ens] Optional ticker initialization failed; ordinary serving remains available.") })

      const connect = () => {
        if (closed) return
        reconnect = undefined
        const ws = new WebSocket(args.config.hubWsUrl)
        socket = ws

        ws.addEventListener("open", () => {
          if (closed || socket !== ws) { ws.close(); return }
          connected = true
          startEns()
          console.log(`[runner] connected to ${args.config.hubWsUrl}`)
          void (async () => {
            // Prove control of the payout address. The hub cannot take `seller` on trust:
            // a self-asserted address let anyone re-announce an existing skill id and
            // redirect every subsequent buyer's payment to themselves.
            const nonce = `${Date.now()}-${crypto.randomUUID()}`
            // Per-seller, from this runner's own config. The hub must never substitute a
            // global one: `FeeSplitter.seller` is immutable, so one seller's contract
            // cannot pay another, and routing everyone through the first-deployed splitter
            // would make the rest of the revenue unrecoverable.
            const feeSplitter = process.env["ARCADE_FEE_SPLITTER"]
            const digest = helloDigest({
              runnerId: args.config.runnerId,
              seller: args.config.sellerAddress,
              nonce,
              skillIds: listings.map((l) => l.id),
              ...(feeSplitter === undefined ? {} : { feeSplitter })
            })
            const signature = await sellerAccount.signMessage({ message: digest })
            const agents = agentAnnouncementsFor(args.config.agents, listings)

            if (closed || socket !== ws || ws.readyState !== WebSocket.OPEN) return

            ws.send(
              JSON.stringify({
                _tag: "Hello",
                runnerId: args.config.runnerId,
                seller: args.config.sellerAddress,
                // ONLY the public projection crosses this wire. See packages/core/manifest.ts.
                listings: listings.map((l) => Schema.encodeSync(PublicListing)(l)),
                maxConcurrency: args.config.maxConcurrency,
                agentVersion: "0.1.0",
                nonce,
                ...(feeSplitter === undefined ? {} : { feeSplitter }),
                ...(agents.length === 0 ? {} : { agents }),
                signature
              })
            )
          })().catch(() => { if (!closed && socket === ws) ws.close() })
          heartbeat = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  _tag: "Heartbeat",
                  runnerId: args.config.runnerId,
                  atMs: Date.now(),
                  activeJobs
                })
              )
            }
          }, HEARTBEAT_INTERVAL_MS)
        })

        ws.addEventListener("message", (ev) => {
          if (closed || socket !== ws) return
          void Effect.runPromise(
            Effect.gen(function* () {
              const msg = yield* decodeHubMessage(JSON.parse(String(ev.data)))
              if (msg._tag !== "JobAssignment") return

              const skill = byId.get(msg.skillId)
              if (skill === undefined) {
                ws.send(
                  JSON.stringify({
                    _tag: "JobResult",
                    jobId: msg.jobId,
                    outcome: {
                      status: "failed",
                      startedAtMs: Date.now(),
                      finishedAtMs: Date.now(),
                      error: "unknown skill"
                    }
                  })
                )
                return
              }

              if (activeJobs >= args.config.maxConcurrency) {
                ws.send(
                  JSON.stringify({
                    _tag: "JobResult",
                    jobId: msg.jobId,
                    outcome: {
                      status: "failed",
                      startedAtMs: Date.now(),
                      finishedAtMs: Date.now(),
                      error: "runner at capacity"
                    }
                  })
                )
                return
              }

              activeJobs++
              console.log(`[runner] job ${msg.jobId} -> ${msg.skillId}`)
              // The job's ceiling is fixed before it starts and revoked when it ends, so a
              // token cannot outlive the work it was issued for.
              const canHire =
                broker !== undefined &&
                skill.manifest.engine.capabilities.includes("hire-skills")
              const hireGrant = canHire
                ? {
                    socketPath: broker!.socketPath,
                    jobId: msg.jobId,
                    token: broker!.openJob(
                      msg.jobId,
                      skill.manifest.bounds.maxSubSpendUsd,
                      msg.hireCapability
                    )
                  }
                : undefined

              const outcome = yield* execSkill({
                manifest: skill.manifest,
                skillDir: skill.dir,
                jobId: msg.jobId,
                input: msg.input,
                ...(hireGrant === undefined ? {} : { hire: hireGrant }),
                onLog: (line) =>
                  ws.send(JSON.stringify({ _tag: "JobLog", jobId: msg.jobId, line, atMs: Date.now() }))
              }).pipe(
                Effect.ensuring(Effect.sync(() => broker?.closeJob(msg.jobId))),
                Effect.catchAllCause(() =>
                  Effect.succeed(
                    JobOutcome.make({
                      status: "failed",
                      startedAtMs: Date.now(),
                      finishedAtMs: Date.now(),
                      error: "runner exception"
                    })
                  )
                )
              )
              activeJobs--
              console.log(`[runner] job ${msg.jobId} ${outcome.status}`)

              ws.send(
                JSON.stringify({
                  _tag: "JobResult",
                  jobId: msg.jobId,
                  outcome: Schema.encodeSync(JobOutcome)(outcome)
                })
              )
            }).pipe(Effect.catchAllCause(() => Effect.void))
          )
        })

        ws.addEventListener("close", () => {
          if (socket !== ws) return
          connected = false
          if (heartbeat !== undefined) clearInterval(heartbeat)
          heartbeat = undefined
          if (ensTimer !== undefined) clearInterval(ensTimer)
          ensTimer = undefined
          if (closed) return
          // Exponential-ish reconnect: a laptop seller sleeps, loses wifi, moves network.
          console.log("[runner] disconnected — reconnecting in 3s")
          reconnect = setTimeout(connect, 3000)
        })

        ws.addEventListener("error", () => {
          /* close handler drives reconnect */
        })
      }

      connect()

      return Effect.sync(() => {
        closed = true
        connected = false
        if (heartbeat !== undefined) clearInterval(heartbeat)
        if (ensTimer !== undefined) clearInterval(ensTimer)
        if (reconnect !== undefined) clearTimeout(reconnect)
        ensTicker?.stop()
        socket?.close()
        broker?.stop()
        resume(Effect.void as never)
      })
    })
  })

export { SkillManifest }
