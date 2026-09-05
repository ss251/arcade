import { Effect } from "effect"
import { arcadeSellerName, arcadeSkillName, labelId, sellerLabelFor } from "@arcade/core"
import { EnsNameExpired, parseArcadeEndpoint, resolveEnsListing, type EnsReader } from "@arcade/buyer"

/** Public identity captured before an asynchronous observation. Never a whole store row. */
export interface EnsListingSnapshot {
  readonly id: string
  readonly seller: string
  readonly runnerId?: string | undefined
  readonly publishedAtMs?: number | undefined
}
export interface EnsWatchArgs {
  readonly root?: string | undefined
  readonly reader: EnsReader
  readonly sellerLabels?: Readonly<Record<string, string>>
  readonly log?: (line: string) => void
  readonly isCurrent?: (snapshot: EnsListingSnapshot) => boolean | Promise<boolean>
  /** Recheck the current store row AND isActive immediately before a metadata write. */
  readonly onResolved?: (snapshot: EnsListingSnapshot, name: string, isActive: () => boolean) => void | Promise<void>
}
export interface EnsWatch {
  readonly sweep: (listings: ReadonlyArray<EnsListingSnapshot>) => Promise<void>
  readonly isExpired: (skillId: string, seller?: string) => boolean
  readonly nameFor: (listing: EnsListingSnapshot) => string | undefined
  readonly start: (intervalMs: number, listings: () => Promise<ReadonlyArray<EnsListingSnapshot>>) => () => void
}

const MAX_LISTINGS = 512
const MAX_LABELS = 256
const CYCLE_MS = 30_000
const LOOKUP_MS = 11_000 // The guarded buyer reader itself has a 10-second full-body deadline.
const HOOK_MS = 1_000
const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const address = (value: unknown): value is string => typeof value === "string" && value.length === 42 && ADDRESS.test(value) && !/^0x0{40}$/i.test(value)
const ownValue = (value: object, key: string): unknown => {
  const property = Object.getOwnPropertyDescriptor(value, key)
  return property && "value" in property ? property.value : undefined
}
const labelError = () => new Error("ARCADE_ENS_SELLER_LABELS must be a bounded public address-to-label map")
const checkedLabels = (value: unknown): Readonly<Record<string, string>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw labelError()
  const keys = Object.keys(value)
  if (keys.length > MAX_LABELS) throw labelError()
  const labels: Record<string, string> = Object.create(null)
  for (const key of keys) {
    const label = ownValue(value, key)
    if (!address(key) || key !== key.toLowerCase() || typeof label !== "string" || label !== label.toLowerCase()) throw labelError()
    // setup's label() uses this same helper (1–63 DNS-safe characters), not the
    // stricter minimum used when sellerLabelFor derives a handle automatically.
    try { labelId(label) } catch { throw labelError() }
    labels[key] = label
  }
  return Object.freeze(labels)
}
export const parseEnsSellerLabels = (raw: string | undefined): Readonly<Record<string, string>> => {
  if (raw === undefined || raw.trim() === "") return Object.freeze({})
  try {
    if (raw.length > 65_536 || new TextEncoder().encode(raw).byteLength > 65_536) throw labelError()
    return checkedLabels(JSON.parse(raw))
  } catch { throw labelError() }
}

const copySnapshot = (value: unknown): EnsListingSnapshot | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  const id = ownValue(value, "id"), seller = ownValue(value, "seller")
  const runnerId = ownValue(value, "runnerId"), publishedAtMs = ownValue(value, "publishedAtMs")
  if (typeof id !== "string" || id.length > 64 || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(id) || !address(seller) ||
    runnerId !== undefined && (typeof runnerId !== "string" || runnerId.length === 0 || runnerId.length > 256) ||
    publishedAtMs !== undefined && (typeof publishedAtMs !== "number" || !Number.isSafeInteger(publishedAtMs) || publishedAtMs < 0)) return undefined
  return Object.freeze({ id, seller, ...(runnerId === undefined ? {} : { runnerId }), ...(publishedAtMs === undefined ? {} : { publishedAtMs }) })
}
const identity = (snapshot: EnsListingSnapshot): string =>
  JSON.stringify([snapshot.seller.toLowerCase(), snapshot.runnerId ?? null, snapshot.publishedAtMs ?? null])

/** Bounds uncooperative injected callbacks too; late fulfillment cannot restart work. */
const bounded = <A>(work: () => Promise<A> | A, signal: AbortSignal, timeoutMs: number): Promise<A> => new Promise((resolve, reject) => {
  if (signal.aborted) { reject(new Error("ENS observation cancelled")); return }
  let done = false
  const finish = (ok: boolean, value: A | undefined) => {
    if (done) return
    done = true; clearTimeout(timer); signal.removeEventListener("abort", abort)
    if (ok) resolve(value as A); else reject(new Error("ENS observation unavailable"))
  }
  const abort = () => finish(false, undefined)
  const timer = setTimeout(abort, timeoutMs)
  signal.addEventListener("abort", abort, { once: true })
  Promise.resolve().then(() => { if (signal.aborted) throw new Error(); return work() })
    .then(value => finish(!signal.aborted, value), abort)
})

/** Best-effort missing-name observations, not proof of the reason a name disappeared. */
export const makeEnsWatch = (args: EnsWatchArgs): EnsWatch => {
  const disabled = args.root === undefined || args.root.trim() === ""
  let root: string | undefined
  if (!disabled) {
    try { root = arcadeSellerName({ root: args.root!, sellerLabel: "reader" }).slice("reader.".length) }
    catch { throw new Error("ARCADE_ENS_ROOT must be a valid .eth parent") }
  }
  const labels = disabled ? {} : checkedLabels(args.sellerLabels ?? {})
  const states = new Map<string, { identity: string; seller: string; expired: boolean }>()
  let generation = 0, active: Promise<void> | undefined, cancelCycle: (() => void) | undefined
  let cursor = 0
  let stopWorker: (() => void) | undefined
  const log = (line: string) => { try { args.log?.(line) } catch { /* observations never depend on a logger */ } }
  const nameFor = (value: EnsListingSnapshot): string | undefined => {
    if (root === undefined) return undefined
    try {
      const snapshot = copySnapshot(value)
      if (!snapshot) return undefined
      return arcadeSkillName({ root, sellerLabel: labels[snapshot.seller.toLowerCase()] ?? sellerLabelFor(snapshot.seller), skillId: snapshot.id })
    } catch { return undefined }
  }
  const sweep = (listings: ReadonlyArray<EnsListingSnapshot>): Promise<void> => {
    if (disabled) return Promise.resolve()
    if (active) return active
    const controller = new AbortController(), mine = generation
    const isActive = () => mine === generation && !controller.signal.aborted
    const timer = setTimeout(() => controller.abort(), CYCLE_MS)
    cancelCycle = () => controller.abort()
    const work = async () => {
      if (!Array.isArray(listings) || listings.length > MAX_LISTINGS) { log("[ens] listing bounds exceeded; observations unchanged"); return }
      const snapshots = new Map<string, EnsListingSnapshot>(), ambiguous = new Set<string>()
      for (const value of listings) {
        const snapshot = copySnapshot(value)
        if (!snapshot || nameFor(snapshot) === undefined) continue
        if (snapshots.has(snapshot.id)) ambiguous.add(snapshot.id)
        snapshots.set(snapshot.id, snapshot)
      }
      for (const id of ambiguous) snapshots.delete(id)
      for (const [id, state] of states) {
        const snapshot = snapshots.get(id)
        if (!snapshot || state.identity !== identity(snapshot)) states.delete(id)
      }
      // Sequential names keep one four-record session below the reader's RPC budget.
      // Advance before awaiting, including a timeout: a slow prefix cannot monopolize
      // every bounded cycle and permanently starve a later, healthy listing.
      const batch = [...snapshots.values()], offset = cursor % (batch.length || 1)
      for (let count = 0; count < batch.length; count++) {
        if (!isActive()) break
        const index = (offset + count) % batch.length, snapshot = batch[index]!
        cursor = (index + 1) % batch.length
        const name = nameFor(snapshot)!
        try {
          const resolved = await bounded(() => Effect.runPromise(Effect.either(resolveEnsListing(args.reader, name))), controller.signal, LOOKUP_MS)
          if (!isActive()) break
          if (args.isCurrent && await bounded(() => args.isCurrent!(snapshot), controller.signal, HOOK_MS) !== true) continue
          if (!isActive()) break
          let gone: boolean
          if (resolved._tag === "Left") {
            if (!(resolved.left instanceof EnsNameExpired)) { log("[ens] resolution unavailable; observation unchanged"); continue }
            gone = true
          } else {
            const endpoint = parseArcadeEndpoint(resolved.right.endpoint)
            if (endpoint.seller.toLowerCase() !== snapshot.seller.toLowerCase() || endpoint.skillId !== snapshot.id) {
              log("[ens] resolved endpoint does not match listing; observation unchanged"); continue
            }
            gone = false
          }
          const previous = states.get(snapshot.id)
          states.set(snapshot.id, { identity: identity(snapshot), seller: snapshot.seller.toLowerCase(), expired: gone })
          if (previous?.expired !== gone) log(`[ens] ${name}: ${gone ? "required record absent; name may be expired or misconfigured" : "name resolves to this listing"}`)
          if (!gone && args.onResolved) {
            let hookActive = true
            try { await bounded(() => args.onResolved!(snapshot, name, () => hookActive && isActive()), controller.signal, HOOK_MS) }
            finally { hookActive = false }
          }
        } catch { if (isActive()) log("[ens] observation unavailable; no metadata update confirmed") }
      }
    }
    const running = work().catch(() => { log("[ens] observation unavailable; no metadata update confirmed") }).finally(() => {
      clearTimeout(timer); controller.abort()
      if (active === running) { active = undefined; cancelCycle = undefined }
    })
    active = running
    return running
  }
  return {
    sweep, nameFor,
    isExpired: (id, seller) => {
      const state = states.get(id)
      return state?.expired === true && (seller === undefined || address(seller) && seller.toLowerCase() === state.seller)
    },
    start: (intervalMs, listings) => {
      if (disabled) return () => {}
      if (!Number.isSafeInteger(intervalMs) || intervalMs < 1 || intervalMs > 2_147_483_647) throw new Error("ENS check interval must be a positive bounded integer")
      if (stopWorker) return stopWorker
      const controller = new AbortController(), mine = ++generation
      cancelCycle?.()
      let timer: ReturnType<typeof setTimeout> | undefined
      const current = () => generation === mine && !controller.signal.aborted
      const tick = async () => {
        try {
          const all = await bounded(listings, controller.signal, 5_000)
          if (current()) await sweep(all)
        } catch { if (current()) log("[ens] listings unavailable; observations unchanged") }
        finally { if (current()) timer = setTimeout(() => { void tick() }, intervalMs) }
      }
      const stop = () => {
        if (!current()) return
        generation++; controller.abort(); if (timer !== undefined) clearTimeout(timer)
        cancelCycle?.(); stopWorker = undefined
      }
      stopWorker = stop
      timer = setTimeout(() => { void tick() }, 0)
      return stop
    }
  }
}

/** This projection signs nothing. Unavailable RPC/configuration is never called expiry. */
export const handleNames = async (reader: EnsReader, name: string): Promise<Response> => {
  try {
    const resolved = await Effect.runPromise(Effect.either(resolveEnsListing(reader, name)))
    if (resolved._tag === "Left") return Response.json({ error: resolved.left instanceof EnsNameExpired ? "ens_name_expired" : "ens_resolution_unavailable" },
      { status: resolved.left instanceof EnsNameExpired ? 404 : 503 })
    const listing = resolved.right, endpoint = parseArcadeEndpoint(listing.endpoint)
    return Response.json({ name: listing.name, skillId: endpoint.skillId, seller: endpoint.seller, endpoint: listing.endpoint,
      payTo: listing.payTo, chain: listing.chainCaip2, priceAtomic: listing.priceAtomic?.toString() ?? null, expired: false })
  } catch { return Response.json({ error: "ens_resolution_unavailable" }, { status: 503 }) }
}
