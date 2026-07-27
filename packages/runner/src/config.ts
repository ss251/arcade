import { Effect, Schema } from "effect"
import { TreeFormatter } from "effect/ParseResult"

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

/** What is actually on disk. */
const StoredConfig = Schema.Struct({
  runnerId: Schema.String.pipe(Schema.minLength(1)),
  sellerAddress: Schema.String.pipe(Schema.pattern(/^0x[0-9a-fA-F]{40}$/)),
  hubUrl: Schema.String.pipe(Schema.pattern(/^https?:\/\//)),
  maxConcurrency: Schema.Int.pipe(Schema.between(1, 64)),
  /** Accepted from older configs so an upgrade does not error. Ignored. */
  hubWsUrl: Schema.optional(Schema.String)
})

export type StoredConfig = Schema.Schema.Type<typeof StoredConfig>

/** What the rest of the runner uses. `hubWsUrl` is computed, so it cannot drift. */
export interface RunnerConfig {
  readonly runnerId: string
  readonly sellerAddress: string
  readonly hubUrl: string
  readonly hubWsUrl: string
  readonly maxConcurrency: number
}

/** `https` → `wss`, `http` → `ws`. The single definition of where the runner announces. */
export const wsUrlFor = (hubUrl: string): string => `${hubUrl.replace(/^http/, "ws")}/ws`

export const configPath = (): string => `${process.env["HOME"] ?? "."}/.arcade/config.json`

const hydrate = (stored: StoredConfig): RunnerConfig => ({
  runnerId: stored.runnerId,
  sellerAddress: stored.sellerAddress,
  hubUrl: stored.hubUrl,
  hubWsUrl: wsUrlFor(stored.hubUrl),
  maxConcurrency: stored.maxConcurrency
})

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

export const writeConfig = (cfg: RunnerConfig) =>
  Effect.tryPromise({
    try: async () => {
      // Only the stored shape is persisted — writing `hubWsUrl` back would recreate the
      // field this design removed.
      const stored: StoredConfig = {
        runnerId: cfg.runnerId,
        sellerAddress: cfg.sellerAddress,
        hubUrl: cfg.hubUrl,
        maxConcurrency: cfg.maxConcurrency
      }
      await Bun.write(configPath(), `${JSON.stringify(stored, null, 2)}\n`)
      return cfg
    },
    catch: (e) => new Error(String((e as Error)?.message ?? e))
  })

export const defaultConfig = (over: Partial<RunnerConfig> = {}): RunnerConfig => {
  const hubUrl = over.hubUrl ?? process.env["ARCADE_HUB"] ?? "http://localhost:8787"
  return {
    runnerId: over.runnerId ?? `rnr_${crypto.randomUUID().slice(0, 8)}`,
    sellerAddress: over.sellerAddress ?? process.env["ARCADE_SELLER"] ?? "",
    hubUrl,
    hubWsUrl: wsUrlFor(hubUrl),
    maxConcurrency: over.maxConcurrency ?? 2
  }
}
