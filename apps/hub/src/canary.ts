import { Cause, Effect } from "effect"
import type { Account } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { formatPrice, parsePrice, type PublicListing } from "@arcade/core"
import { callSkill, type SkillResult } from "@arcade/buyer"
import { StoreTag, payTestKey, type ListingRecord, type PayTestState, type Store } from "./store.ts"
import { canaryInputFor } from "./canary-input.ts"

/** Hub-owned purchases use the ordinary SDK/payment path, never an in-process bypass. */
export interface CanaryTarget {
  readonly skillId: string
  readonly seller: string
  readonly listing?: PublicListing | undefined
  readonly lastAtMs: number | null
  readonly delisted: boolean
}

export type BuyResult = { readonly ok: boolean; readonly jobId: string; readonly settleTx?: string; readonly reason: string }
/** `null` is a hub limitation: skip without inventing a seller failure. */
export type BuyFn = (t: CanaryTarget) => Effect.Effect<BuyResult | null>

export interface CanaryConfig {
  readonly hubUrl: string
  readonly account: Account
  readonly intervalMs: number
  readonly tickMs: number
  readonly maxPriceAtomic: bigint
  readonly buy: BuyFn
  readonly now?: () => number
}

const MAX_TIMER_MS = 2_147_483_647
const UNITS: Record<string, number> = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }
const durationIsSafe = (ms: number): boolean => Number.isSafeInteger(ms) && ms > 0 && ms <= MAX_TIMER_MS
const configIsSafe = (cfg: Omit<CanaryConfig, "buy">): boolean =>
  durationIsSafe(cfg.intervalMs) && durationIsSafe(cfg.tickMs) && typeof cfg.maxPriceAtomic === "bigint" && cfg.maxPriceAtomic > 0n
const timestampIsSafe = (ms: number): boolean => Number.isSafeInteger(ms) && ms >= 0

/** Bare numbers are seconds. Reject zero/overflow rather than let timers become hot loops. */
export const parseInterval = (text: string): number => {
  const match = /^(\d+)(ms|s|m|h|d)?$/.exec(text.trim())
  const ms = match === null ? NaN : Number(match[1]) * UNITS[match[2] ?? "s"]!
  if (!durationIsSafe(ms)) throw new Error("canary duration must be a positive whole number of milliseconds at most 2147483647; use e.g. 24h, 10m, 45s")
  return ms
}

/** Include historical keys whose runner disappeared, until three failures delist them. */
export const mergeTargets = (
  live: ReadonlyArray<ListingRecord>,
  known: ReadonlyArray<{ readonly skillId: string; readonly seller: string; readonly state: PayTestState }>
): ReadonlyArray<CanaryTarget> => {
  const out = new Map<string, CanaryTarget>()
  for (const k of known) out.set(payTestKey(k.skillId, k.seller), {
    skillId: k.skillId, seller: k.seller, lastAtMs: k.state.last?.atMs ?? null, delisted: k.state.delisted
  })
  for (const rec of live) {
    const key = payTestKey(rec.listing.id, rec.seller)
    const previous = out.get(key)
    out.set(key, {
      skillId: rec.listing.id, seller: rec.seller, listing: rec.listing,
      lastAtMs: rec.payTested?.atMs ?? previous?.lastAtMs ?? null,
      delisted: rec.delisted ?? previous?.delisted ?? false
    })
  }
  return [...out.values()]
}

export const dueTargets = (
  nowMs: number,
  intervalMs: number,
  targets: ReadonlyArray<CanaryTarget>
): ReadonlyArray<CanaryTarget> => {
  if (!timestampIsSafe(nowMs) || !durationIsSafe(intervalMs)) return []
  return targets.filter(t => !(t.listing === undefined && t.delisted) &&
    (t.lastAtMs === null || (timestampIsSafe(t.lastAtMs) && nowMs - t.lastAtMs >= intervalMs)))
}

// C2 deliberately distinguishes proven mismatch from an unsupported/unsafe validator.
// Only this exact reason is a seller failure; a conservative validation limit is a skip.
const DECLARED_MISMATCH = "the declared canaryInput does not satisfy this listing's own inputSchema"
const failedBuy = (): BuyResult => ({ ok: false, jobId: "", reason: "pay-test failed" })
const verdictOf = (out: SkillResult): BuyResult => {
  const receipt = out.receipt
  const tx = typeof receipt?.["settleTx"] === "string" && receipt["settleTx"].length > 0 ? receipt["settleTx"] : undefined
  const ok = receipt?.["settled"] === true && tx !== undefined
  return {
    ok, jobId: typeof out.jobId === "string" ? out.jobId : "",
    ...(ok ? { settleTx: tx } : {}), reason: ok ? "ok" : "not settled"
  }
}

/** Error causes can contain RPC URLs, headers or provider text. Never print or store them. */
const diagnostic = (message: string): Effect.Effect<void> => Effect.sync(() => {
  try { console.error(message) } catch { /* A broken logger must not kill the buyer fiber. */ }
})

/** The ordinary buyer SDK performs the real probe, offline signature, retry and polling. */
export const buyViaCallSkill = (cfg: Omit<CanaryConfig, "buy">): BuyFn => (t) => Effect.gen(function* () {
  if (!configIsSafe(cfg)) return null
  if (t.listing !== undefined) {
    let amount: bigint
    try { amount = parsePrice(t.listing.price) } catch { return null }
    if (amount > cfg.maxPriceAtomic) return null
    const input = canaryInputFor(t.listing)
    if (!input.ok) return input.why === DECLARED_MISMATCH ? { ok: false, jobId: "", reason: DECLARED_MISMATCH } : null
    const maxWaitMs = (t.listing.bounds.timeoutSec + 30) * 1_000
    if (!durationIsSafe(maxWaitMs)) return null
    const out = yield* callSkill({
      hubUrl: cfg.hubUrl, seller: t.seller, skillId: t.skillId, input: input.value, account: cfg.account,
      maxAmountAtomic: amount, pollIntervalMs: 1_000, maxWaitMs
    })
    return verdictOf(out)
  }

  // A missing runner has no usable schema. Ask the hub and let its actual 404 be evidence.
  const out = yield* callSkill({
    hubUrl: cfg.hubUrl, seller: t.seller, skillId: t.skillId, input: {}, account: cfg.account,
    maxAmountAtomic: cfg.maxPriceAtomic, pollIntervalMs: 1_000, maxWaitMs: 30_000
  })
  // A runner can reconnect after the target snapshot. If this ordinary paid call
  // actually settled, preserve its passing evidence instead of inventing an offline failure.
  return verdictOf(out)
}).pipe(Effect.catchAllCause(cause => Cause.isInterrupted(cause) ? Effect.interrupt : Effect.succeed(failedBuy())))

// If persistence fails after a paid call, durable history cannot throttle the next tick.
// Retain an attempt timestamp for this store's lifetime, never a fabricated public verdict.
const attemptedAt = new WeakMap<Store, Map<string, number>>()

/** One finite, sequential cycle. One bad target or persistence call cannot stop the rest. */
export const canaryTick = (cfg: CanaryConfig): Effect.Effect<void, never, StoreTag> => Effect.gen(function* () {
  if (!configIsSafe(cfg)) { yield* diagnostic("[canary] invalid timing or price configuration; no purchases attempted"); return }
  const store = yield* StoreTag
  const now = cfg.now ?? Date.now
  const startedAt = now()
  if (!timestampIsSafe(startedAt)) { yield* diagnostic("[canary] invalid clock; no purchases attempted"); return }
  const targets = dueTargets(startedAt, cfg.intervalMs, mergeTargets(yield* store.allListings, yield* store.allPayTested))
  let attempts = attemptedAt.get(store)
  if (attempts === undefined) { attempts = new Map(); attemptedAt.set(store, attempts) }
  const keys = new Set(targets.map(t => payTestKey(t.skillId, t.seller)))
  for (const [key, at] of attempts) if (!keys.has(key) && startedAt - at >= cfg.intervalMs) attempts.delete(key)
  for (const t of targets) {
    const key = payTestKey(t.skillId, t.seller)
    const attemptAt = now()
    if (!timestampIsSafe(attemptAt)) { yield* diagnostic("[canary] invalid clock; no further purchases attempted"); return }
    const lastAttempt = attempts.get(key)
    if (lastAttempt !== undefined && attemptAt - lastAttempt < cfg.intervalMs) continue
    attempts.set(key, attemptAt)
    const result = yield* Effect.suspend(() => cfg.buy(t)).pipe(
      Effect.catchAllCause(cause => Cause.isInterrupted(cause) ? Effect.interrupt : Effect.succeed(failedBuy()))
    )
    if (result === null) continue
    yield* Effect.gen(function* () {
      const atMs = now()
      if (!timestampIsSafe(atMs)) { yield* diagnostic("[canary] invalid clock; verdict not recorded"); return }
      yield* Effect.suspend(() => store.recordPayTest({
        skillId: t.skillId, seller: t.seller, atMs, jobId: result.jobId, ok: result.ok, reason: result.reason,
        ...(result.settleTx === undefined ? {} : { settleTx: result.settleTx })
      }))
      // A verdict is announced only after persistence. Reasons and identifiers need not
      // enter console output; operator history retains the bounded default-buy diagnostic.
      yield* Effect.sync(() => { try { console.log(`[canary] ${result.ok ? "pass" : "FAIL"}`) } catch { /* best effort */ } })
    }).pipe(Effect.catchAllCause(cause => Cause.isInterrupted(cause) ? Effect.interrupt : diagnostic("[canary] verdict could not be recorded")))
  }
}).pipe(Effect.catchAllCause(cause => Cause.isInterrupted(cause) ? Effect.interrupt : diagnostic("[canary] tick could not run")))

/** Scoped interruption is preserved, including while a buy or sleep is pending. */
export const canaryLoop = (cfg: CanaryConfig): Effect.Effect<never, never, StoreTag> => Effect.suspend(() =>
  configIsSafe(cfg)
    ? Effect.forever(canaryTick(cfg).pipe(Effect.zipRight(Effect.sleep(cfg.tickMs))))
    : diagnostic("[canary] invalid timing or price configuration; buyer disabled").pipe(Effect.zipRight(Effect.never))
)

/** Opt-in only. Configuration failures reveal the field name, never its contents. */
export const canaryFromEnv = (hubUrl: string): CanaryConfig | undefined => {
  const key = process.env["ARCADE_CANARY_KEY"]
  if (key === undefined || key === "") return undefined
  let account: Account
  try { account = privateKeyToAccount(key as `0x${string}`) } catch { throw new Error("ARCADE_CANARY_KEY must be a valid private key") }
  const readInterval = (name: string, fallback: string): number => {
    try { return parseInterval(process.env[name] ?? fallback) } catch { throw new Error(`${name} must be a positive bounded duration`) }
  }
  const intervalMs = readInterval("ARCADE_CANARY_INTERVAL", "24h")
  const tickMs = Math.min(intervalMs, Math.max(1_000, readInterval("ARCADE_CANARY_TICK", "30s")))
  let maxPriceAtomic: bigint
  try { maxPriceAtomic = parsePrice(process.env["ARCADE_CANARY_MAX_PRICE"] ?? "$0.25") } catch {
    throw new Error("ARCADE_CANARY_MAX_PRICE must be a valid positive USDC price")
  }
  const base = { hubUrl, account, intervalMs, tickMs, maxPriceAtomic }
  try { console.log(`[canary] on — buyer ${account.address}, every ${intervalMs}ms per listing, cap ${formatPrice(maxPriceAtomic)}`) } catch { /* best effort */ }
  return { ...base, buy: buyViaCallSkill(base) }
}
