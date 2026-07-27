import { Effect, Schema } from "effect"
import {
  HEARTBEAT_INTERVAL_MS,
  JobOutcome,
  PublicListing,
  SkillManifest,
  decodeHubMessage,
  helloDigest,
  toPublicListing
} from "@arcade/core"
import { execSkill } from "./exec.ts"
import { loadSkills } from "./skills.ts"
import { dispatchMap, gate } from "./publishable.ts"
import { privateKeyToAccount } from "viem/accounts"
import { resolveSellerKey } from "./wallet.ts"
import type { RunnerConfig } from "./config.ts"

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
    if (subKey !== undefined) {
      const hiring = gated.sellable.filter((s) => s.manifest.engine.capabilities.includes("hire-skills"))
      for (const s of hiring) {
        console.log(
          `  ${s.manifest.id} may hire other skills, up to ` +
            `$${s.manifest.bounds.maxSubSpendUsd ?? 0} per call`
        )
      }
    }

    console.log(`[runner] ${args.config.runnerId}`)
    for (const s of gated.sellable) {
      console.log(`  ${s.manifest.id}@${s.manifest.version}  ${s.manifest.price}  (${s.manifest.engine.adapter})`)
    }

    yield* Effect.async<never, Error>((resume) => {
      let activeJobs = 0
      let heartbeat: ReturnType<typeof setInterval> | undefined
      let closed = false

      const connect = () => {
        const ws = new WebSocket(args.config.hubWsUrl)

        ws.addEventListener("open", () => {
          console.log(`[runner] connected to ${args.config.hubWsUrl}`)
          void (async () => {
            // Prove control of the payout address. The hub cannot take `seller` on trust:
            // a self-asserted address let anyone re-announce an existing skill id and
            // redirect every subsequent buyer's payment to themselves.
            const nonce = `${Date.now()}-${crypto.randomUUID()}`
            const digest = helloDigest({
              runnerId: args.config.runnerId,
              seller: args.config.sellerAddress,
              nonce,
              skillIds: listings.map((l) => l.id)
            })
            const signature = await sellerAccount.signMessage({ message: digest })

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
                signature
              })
            )
          })()
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
              const outcome = yield* execSkill({
                manifest: skill.manifest,
                skillDir: skill.dir,
                jobId: msg.jobId,
                input: msg.input,
                onLog: (line) =>
                  ws.send(JSON.stringify({ _tag: "JobLog", jobId: msg.jobId, line, atMs: Date.now() }))
              }).pipe(
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
          if (heartbeat !== undefined) clearInterval(heartbeat)
          if (closed) return
          // Exponential-ish reconnect: a laptop seller sleeps, loses wifi, moves network.
          console.log("[runner] disconnected — reconnecting in 3s")
          setTimeout(connect, 3000)
        })

        ws.addEventListener("error", () => {
          /* close handler drives reconnect */
        })
      }

      connect()

      return Effect.sync(() => {
        closed = true
        if (heartbeat !== undefined) clearInterval(heartbeat)
        resume(Effect.void as never)
      })
    })
  })

export { SkillManifest }
