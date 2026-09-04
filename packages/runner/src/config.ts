import { Effect, Schema } from "effect"
import { TreeFormatter } from "effect/ParseResult"
import { mkdir, open, rename, rmdir, unlink } from "node:fs/promises"
import { dirname } from "node:path"

/**
 * Runner config lives at ~/.arcade/config.json — outside the repo, so a seller's identity
 * and hub token are never at risk of being committed.
 *
 * ## `hubWsUrl` is DERIVED, never stored
 *
 * It used to be a persisted field alongside `hubUrl`, derived only when absent. The
 * derivation was correct — `replace(/^http/, "ws")` turns `https` into `wss`, not `ws` —
 * but nothing reconciled the two afterwards, so repointing the runner was two edits
 * wearing the shape of one.
 *
 * Change `hubUrl` to a public origin, leave `hubWsUrl` on localhost, and the runner fetches
 * listings from production while announcing over the local socket. Every surface then
 * reports health: `checkHub(cfg.hubUrl)` pings production and says up, the daemon logs
 * "connected to ws://localhost…" and genuinely is connected, and the public catalogue
 * stays empty for a reason visible from neither end. The runbook step that fixes the
 * empty-catalogue trap is the step that opens this one.
 *
 * So the field no longer exists on disk. Two values that must agree cannot disagree when
 * only one of them is written down — the boundary, rather than a check that they match.
 * A `hubWsUrl` left in an older config is accepted, ignored, and reported if it disagreed,
 * because silently changing where a runner announces itself is the failure this prevents.
 */

const Address = Schema.String.pipe(Schema.pattern(/^0x[0-9a-fA-F]{40}$/))
const TxHash = Schema.String.pipe(Schema.pattern(/^0x[0-9a-fA-F]{64}$/))
const SkillKey = Schema.String.pipe(Schema.filter(s => /^[a-z0-9][a-z0-9-]{0,127}$/.test(s) && s !== "constructor"))
const AgentId = Schema.String.pipe(Schema.filter(s => /^(0|[1-9][0-9]{0,77})$/.test(s) && BigInt(s) < 2n ** 256n))
const Timestamp = Schema.Int.pipe(Schema.nonNegative())
const AgentIdentitySchema = Schema.Struct({
  agentId: AgentId,
  agentURI: Schema.String.pipe(Schema.minLength(1)),
  registrationTx: TxHash,
  registeredAtMs: Timestamp,
  operator: Schema.optional(Address),
  approvalTx: Schema.optional(TxHash),
  /** Optional for old records; new CLI registrations save their chain provenance. */
  registry: Schema.optional(Address),
  chainId: Schema.optional(Schema.Int.pipe(Schema.positive()))
})
export type AgentIdentity = Schema.Schema.Type<typeof AgentIdentitySchema>
const PendingAgentSchema = Schema.Struct({
  /** Missing hash means an attempt began but its broadcast outcome must be reconciled. */
  txHash: Schema.optional(TxHash), agentURI: Schema.String.pipe(Schema.minLength(1)), registry: Address,
  chainId: Schema.Int.pipe(Schema.positive()), submittedAtMs: Timestamp
})
export type PendingAgentRegistration = Schema.Schema.Type<typeof PendingAgentSchema>

/** What is actually on disk. No key, provider config or derived socket field is written. */
const StoredConfig = Schema.Struct({
  runnerId: Schema.String.pipe(Schema.minLength(1)),
  sellerAddress: Schema.String.pipe(Schema.pattern(/^0x[0-9a-fA-F]{40}$/)),
  hubUrl: Schema.String.pipe(Schema.pattern(/^https?:\/\//)),
  maxConcurrency: Schema.Int.pipe(Schema.between(1, 64)),
  /** Accepted from older configs so an upgrade does not error. Ignored. */
  hubWsUrl: Schema.optional(Schema.String),
  agents: Schema.optional(Schema.Record({ key: SkillKey, value: AgentIdentitySchema })),
  pendingAgents: Schema.optional(Schema.Record({ key: SkillKey, value: PendingAgentSchema }))
})

export type StoredConfig = Schema.Schema.Type<typeof StoredConfig>

/** What the rest of the runner uses. `hubWsUrl` is computed, so it cannot drift. */
export interface RunnerConfig {
  readonly runnerId: string
  readonly sellerAddress: string
  readonly hubUrl: string
  readonly hubWsUrl: string
  readonly maxConcurrency: number
  readonly agents: Readonly<Record<string, AgentIdentity>>
  readonly pendingAgents?: Readonly<Record<string, PendingAgentRegistration>>
}

/** `https` → `wss`, `http` → `ws`. The single definition of where the runner announces. */
export const wsUrlFor = (hubUrl: string): string => `${hubUrl.replace(/^http/, "ws")}/ws`

/** Explicit override supports isolated CLI jobs/tests without changing the user's home. */
export const configPath = (): string => process.env["ARCADE_CONFIG_PATH"] ?? `${process.env["HOME"] ?? "."}/.arcade/config.json`

const hydrate = (stored: StoredConfig): RunnerConfig => ({
  runnerId: stored.runnerId,
  sellerAddress: stored.sellerAddress,
  hubUrl: stored.hubUrl,
  hubWsUrl: wsUrlFor(stored.hubUrl),
  maxConcurrency: stored.maxConcurrency,
  agents: stored.agents ?? {},
  pendingAgents: stored.pendingAgents ?? {}
})

/**
 * Whether this machine already has a runner identity.
 *
 * Separate from `readConfig` on purpose: the caller that needs this — `arcade init` —
 * needs to know a config EXISTS even if it is unreadable or from an older shape. A
 * malformed config is still an identity someone may have earnings against, and replacing
 * it because it failed to decode would be the worst possible reading of the situation.
 */
export const configExists = Effect.promise(async () => await Bun.file(configPath()).exists())

export const readConfig = Effect.tryPromise({
  try: async (): Promise<RunnerConfig> => {
    const file = Bun.file(configPath())
    if (!(await file.exists())) {
      throw new Error(`no config at ${configPath()} — run: arcade runner init`)
    }
    // Decoded, not cast. Everywhere else this repo reads persisted state it decodes —
    // the sqlite store decodes rows so an older build's row fails loudly at boot rather
    // than becoming a malformed receipt — and this is the file that decides which hub is
    // announced to and which address gets paid.
    const decoded = Schema.decodeUnknownEither(StoredConfig)(await file.json())
    if (decoded._tag === "Left") {
      throw new Error(
        `config at ${configPath()} is not valid:\n${TreeFormatter.formatErrorSync(decoded.left)}`
      )
    }
    const stored = decoded.right
    const derived = wsUrlFor(stored.hubUrl)
    if (stored.hubWsUrl !== undefined && stored.hubWsUrl !== derived) {
      // Do not fail: the derived value is authoritative and correct. But a runner that
      // silently starts announcing somewhere else is exactly what this design prevents,
      // so the change is stated rather than performed quietly.
      console.warn(
        `[runner] ignoring stale hubWsUrl in ${configPath()}: it said ${stored.hubWsUrl}, ` +
          `but hubUrl is ${stored.hubUrl}, so the socket is ${derived}. ` +
          `hubWsUrl is no longer stored — it is derived from hubUrl, so repointing is one edit. ` +
          `Run \`arcade runner init\` or delete the field to silence this.`
      )
    }
    return hydrate(stored)
  },
  catch: (e) => new Error(String((e as Error)?.message ?? e))
})

/** A per-file exclusive directory also serializes separate CLI processes. Never steal a
 * stale lock: if its owner died, refuse clearly so an operator can inspect it first. */
const locked = <A>(action: (path: string) => Promise<A>): Effect.Effect<A, Error> => Effect.tryPromise({
  try: async () => {
    const path = configPath(), lock = `${path}.lock`
    await mkdir(dirname(path), { recursive: true })
    const deadline = Date.now() + 5000
    for (;;) {
      try { await mkdir(lock); break } catch (error) {
        if ((error as { code?: string }).code !== "EEXIST") throw error
        if (Date.now() >= deadline) throw new Error("runner config is locked by another writer; inspect its .lock directory before retrying")
        await new Promise(resolve => setTimeout(resolve, 20))
      }
    }
    try { return await action(path) } finally { await rmdir(lock) }
  },
  catch: () => new Error("could not update runner config; check its validity, permissions and .lock directory")
})
const writeAt = async (path: string, cfg: RunnerConfig): Promise<RunnerConfig> => {
  const stored = Schema.decodeUnknownSync(StoredConfig)({
    runnerId: cfg.runnerId, sellerAddress: cfg.sellerAddress, hubUrl: cfg.hubUrl, maxConcurrency: cfg.maxConcurrency,
    ...(Object.keys(cfg.agents ?? {}).length === 0 ? {} : { agents: cfg.agents }),
    ...(Object.keys(cfg.pendingAgents ?? {}).length === 0 ? {} : { pendingAgents: cfg.pendingAgents })
  })
  const temporary = `${path}.${crypto.randomUUID()}.tmp`
  try {
    const file = await open(temporary, "wx", 0o600)
    try {
      await file.writeFile(`${JSON.stringify(stored, null, 2)}\n`)
      await file.sync()
    } finally { await file.close() }
    await rename(temporary, path)
    // Rename is atomic visibility, not durability. A broadcast may begin only after
    // both the checkpoint bytes and their directory entry have reached storage.
    const directory = await open(dirname(path), "r")
    try { await directory.sync() } finally { await directory.close() }
  } finally { await unlink(temporary).catch(error => { if ((error as { code?: string }).code !== "ENOENT") throw error }) }
  return hydrate(stored)
}
export const writeConfig = (cfg: RunnerConfig): Effect.Effect<RunnerConfig, Error> => locked(path => writeAt(path, cfg))

/** Read current state under the same lock used for the atomic replacement. */
export const recordAgent = (skillId: string, identity: AgentIdentity): Effect.Effect<RunnerConfig, Error> => locked(async path => {
  Schema.decodeUnknownSync(SkillKey)(skillId)
  const decoded = Schema.decodeUnknownSync(AgentIdentitySchema)(identity)
  const current = await Effect.runPromise(readConfig)
  const sameHex = (a: string | undefined, b: string | undefined) => a?.toLowerCase() === b?.toLowerCase()
  const pending = current.pendingAgents?.[skillId]
  if (pending && (!pending.txHash || !sameHex(pending.txHash, decoded.registrationTx) ||
    pending.agentURI !== decoded.agentURI || !sameHex(pending.registry, decoded.registry) || pending.chainId !== decoded.chainId)) {
    throw new Error("confirmation does not match the journaled registration")
  }
  const existing = current.agents[skillId]
  if (existing && (existing.agentId !== decoded.agentId || !sameHex(existing.registrationTx, decoded.registrationTx) ||
    existing.agentURI !== decoded.agentURI || existing.registeredAtMs !== decoded.registeredAtMs ||
    !sameHex(existing.registry, decoded.registry) || existing.chainId !== decoded.chainId)) {
    throw new Error("a confirmed identity cannot be replaced")
  }
  const pendingAgents = { ...current.pendingAgents }
  delete pendingAgents[skillId]
  return writeAt(path, { ...current, agents: { ...current.agents, [skillId]: decoded }, pendingAgents })
})

/** A known broadcast hash is saved before receipt polling, so a rerun can resume it. */
export const recordPendingAgent = (skillId: string, pending: PendingAgentRegistration): Effect.Effect<RunnerConfig, Error> => locked(async path => {
  Schema.decodeUnknownSync(SkillKey)(skillId)
  const decoded = Schema.decodeUnknownSync(PendingAgentSchema)(pending)
  const current = await Effect.runPromise(readConfig)
  const existing = current.pendingAgents?.[skillId]
  if (!decoded.txHash || current.agents[skillId] || (existing && (existing.agentURI !== decoded.agentURI ||
    existing.chainId !== decoded.chainId || existing.registry.toLowerCase() !== decoded.registry.toLowerCase() ||
    (existing.txHash && existing.txHash.toLowerCase() !== decoded.txHash.toLowerCase())))) throw new Error("registration already recorded or provenance changed")
  return writeAt(path, { ...current, pendingAgents: { ...current.pendingAgents, [skillId]: decoded } })
})

/** Reserve the attempt BEFORE the send. An unknown broadcast leaves this checkpoint in
 * place and prevents a later process from silently minting another identity. */
export const beginAgentRegistration = (skillId: string, intent: Omit<PendingAgentRegistration, "txHash">): Effect.Effect<RunnerConfig, Error> => locked(async path => {
  Schema.decodeUnknownSync(SkillKey)(skillId)
  const decoded = Schema.decodeUnknownSync(PendingAgentSchema)({ ...intent, txHash: undefined })
  const current = await Effect.runPromise(readConfig)
  if (current.agents[skillId] || current.pendingAgents?.[skillId]) throw new Error("registration already recorded or pending")
  return writeAt(path, { ...current, pendingAgents: { ...current.pendingAgents, [skillId]: decoded } })
})

export const defaultConfig = (over: Partial<RunnerConfig> = {}): RunnerConfig => {
  const hubUrl = over.hubUrl ?? process.env["ARCADE_HUB"] ?? "http://localhost:8787"
  return {
    runnerId: over.runnerId ?? `rnr_${crypto.randomUUID().slice(0, 8)}`,
    sellerAddress: over.sellerAddress ?? process.env["ARCADE_SELLER"] ?? "",
    hubUrl,
    hubWsUrl: wsUrlFor(hubUrl),
    maxConcurrency: over.maxConcurrency ?? 2,
    agents: over.agents ?? {},
    pendingAgents: over.pendingAgents ?? {}
  }
}
