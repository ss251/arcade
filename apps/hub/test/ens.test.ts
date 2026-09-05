import { afterEach, describe, expect, it, vi } from "vitest"
import type { EnsReader } from "@arcade/buyer"
import { handleNames, makeEnsWatch, parseEnsSellerLabels, type EnsListingSnapshot } from "../src/ens.ts"

const SELLER = "0x1111111111111111111111111111111111111111"
const OTHER = "0x2222222222222222222222222222222222222222"
const ROOT = "arcade.eth", NAME = "demo.s1111111111.arcade.eth"
const snapshot: EnsListingSnapshot = { id: "demo", seller: SELLER, runnerId: "runner-a", publishedAtMs: 1 }
const records: Record<string, string> = {
  "arcade.endpoint": `https://hub.example/x/${SELLER}/demo`,
  "arcade.payTo": OTHER, "arcade.chain": "eip155:5042002", "arcade.priceAtomic": "10000"
}
const reader = (changes: Record<string, string | null> = {}): EnsReader => ({ getEnsText: async ({ key }) => ({ ...records, ...changes })[key] ?? null })
const deferred = <A>() => { let resolve!: (value: A) => void; const promise = new Promise<A>(done => { resolve = done }); return { promise, resolve } }
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe("public seller label configuration", () => {
  it("bounds the number of explicit seller labels independently of JSON byte size", () => {
    const entries = Array.from({ length: 257 }, (_, i) => [`0x${(i + 1).toString(16).padStart(40, "0")}`, `seller-${i}`])
    expect(() => parseEnsSellerLabels(JSON.stringify(Object.fromEntries(entries)))).toThrow(/ARCADE_ENS_SELLER_LABELS/)
    const accepted = parseEnsSellerLabels(JSON.stringify(Object.fromEntries(entries.slice(0, 256))))
    expect(Object.keys(accepted)).toHaveLength(256)
  })
  it("is absent by default and accepts only an explicit canonical address-label mapping", () => {
    expect(parseEnsSellerLabels(undefined)).toEqual({})
    expect(parseEnsSellerLabels(" ")).toEqual({})
    const mapping = parseEnsSellerLabels(JSON.stringify({ [SELLER]: "ss251" }))
    expect(mapping).toEqual({ [SELLER]: "ss251" })
    expect(Object.isFrozen(mapping)).toBe(true)
    const w = makeEnsWatch({ root: ROOT, reader: reader(), sellerLabels: mapping })
    expect(w.nameFor(snapshot)).toBe("demo.ss251.arcade.eth")
    expect(w.nameFor({ ...snapshot, seller: OTHER })).toBe("demo.s2222222222.arcade.eth")
    expect(makeEnsWatch({ root: ROOT, reader: reader(), sellerLabels: { [SELLER]: "x" } }).nameFor(snapshot)).toBe("demo.x.arcade.eth")
  })
  it.each(["null", "[]", '{"privateKey":"PRIVATE"}', '{"__proto__":"owner"}',
    JSON.stringify({ [SELLER]: "PRIVATE bad label" }), JSON.stringify({ [SELLER]: "Uppercase" }),
    JSON.stringify({ [`0x${"00".repeat(20)}`]: "owner" }), JSON.stringify({ [SELLER]: "a".repeat(64) }),
    JSON.stringify({ [SELLER]: 1 }), "PRIVATE".repeat(30_000)])("refuses malformed mapping without reflecting its contents %#", raw => {
    expect(() => parseEnsSellerLabels(raw)).toThrow(/ARCADE_ENS_SELLER_LABELS/)
    try { parseEnsSellerLabels(raw) } catch (error) { expect(String(error)).not.toContain("PRIVATE") }
  })
})

describe("hub ENS watch", () => {
  it("is inert without a root, including its scheduler and unused malformed mapping", async () => {
    vi.useFakeTimers()
    const read = vi.fn(async () => null), get = vi.fn(async () => [snapshot]), onResolved = vi.fn()
    const w = makeEnsWatch({ reader: { getEnsText: read }, sellerLabels: { PRIVATE: "INVALID" }, onResolved })
    const stop = w.start(0, get)
    await w.sweep([snapshot]); await vi.advanceTimersByTimeAsync(30_000); stop()
    expect(w.nameFor(snapshot)).toBeUndefined(); expect(w.isExpired("demo")).toBe(false)
    expect(read).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled(); expect(onResolved).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
  it("uses all guarded required records, associates only the exact route, and reverses missing observations", async () => {
    let missing = true
    const reads = vi.fn(async ({ key }: { name: string; key: string }) => missing ? null : records[key] ?? null)
    const onResolved = vi.fn()
    const w = makeEnsWatch({ root: ROOT, reader: { getEnsText: reads }, onResolved })
    await w.sweep([snapshot]); expect(w.isExpired("demo", SELLER)).toBe(true)
    expect(onResolved).not.toHaveBeenCalled()
    missing = false
    await w.sweep([snapshot]); expect(w.isExpired("demo", SELLER)).toBe(false)
    expect(onResolved).toHaveBeenCalledWith(snapshot, NAME, expect.any(Function))
    expect(new Set(reads.mock.calls.map(([a]) => a.key))).toEqual(new Set(Object.keys(records)))
    missing = true
    await w.sweep([snapshot]); expect(w.isExpired("demo")).toBe(true)
    await w.sweep([]); expect(w.isExpired("demo")).toBe(false)
  })
  it.each(["outage", "invalid", "foreign-seller", "foreign-skill"] as const)("preserves the previous observation on %s without annotating or leaking causes", async mode => {
    let initial = true
    const log = vi.fn(), onResolved = vi.fn()
    const w = makeEnsWatch({ root: ROOT, log, onResolved, reader: { getEnsText: async ({ key }) => {
      if (initial) return null
      if (mode === "outage") throw new Error("PRIVATE_RPC_CREDENTIAL")
      if (key === "arcade.endpoint") return mode === "invalid" ? "PRIVATE_INVALID_ENDPOINT" :
        mode === "foreign-seller" ? records[key]!.replace(SELLER, OTHER) : records[key]!.replace("/demo", "/other")
      return records[key] ?? null
    } } })
    await w.sweep([snapshot]); initial = false; await w.sweep([snapshot])
    expect(w.isExpired("demo", SELLER)).toBe(true); expect(onResolved).not.toHaveBeenCalled()
    expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE")
  })
  it("never carries an old seller's observation onto a same-ID replacement", async () => {
    const w = makeEnsWatch({ root: ROOT, reader: { getEnsText: async () => null } })
    await w.sweep([snapshot]); expect(w.isExpired("demo", SELLER)).toBe(true)
    expect(w.isExpired("demo", OTHER)).toBe(false)
    await w.sweep([{ ...snapshot, seller: OTHER }])
    expect(w.isExpired("demo", SELLER)).toBe(false); expect(w.isExpired("demo", OTHER)).toBe(true)
  })
  it("drops a late observation and metadata callback when the snapshot is no longer current", async () => {
    const release = deferred<void>(), onResolved = vi.fn()
    let current = true
    const w = makeEnsWatch({ root: ROOT, reader: { getEnsText: async ({ key }) => { await release.promise; return records[key] ?? null } },
      isCurrent: () => current, onResolved })
    const pending = w.sweep([snapshot]); current = false; release.resolve(); await pending
    expect(w.isExpired("demo", SELLER)).toBe(false); expect(onResolved).not.toHaveBeenCalled()
  })
})

describe("bounded background observation", () => {
  it("rotates past a stalled prefix so the fixed cycle deadline cannot starve later listings", async () => {
    vi.useFakeTimers()
    const onResolved = vi.fn()
    const w = makeEnsWatch({ root: ROOT, onResolved, reader: { getEnsText: ({ name, key }) =>
      name.startsWith("slow-") ? new Promise(() => {}) : Promise.resolve(records[key] ?? null) } })
    const listings = [...Array.from({ length: 3 }, (_, i) => ({ ...snapshot, id: `slow-${i}` })), snapshot]
    const first = w.sweep(listings); await vi.advanceTimersByTimeAsync(30_001); await first
    const second = w.sweep(listings); await vi.advanceTimersByTimeAsync(30_001); await second
    expect(onResolved).toHaveBeenCalledWith(snapshot, NAME, expect.any(Function))
    await vi.advanceTimersByTimeAsync(11_000)
  })

  it("requires explicit true from the current-snapshot guard", async () => {
    const onResolved = vi.fn()
    const w = makeEnsWatch({ root: ROOT, reader: reader(), onResolved,
      isCurrent: (() => "PRIVATE_TRUTHY") as unknown as () => boolean })
    await w.sweep([snapshot])
    expect(onResolved).not.toHaveBeenCalled()
  })

  it("rejects excessive snapshots before any read and prunes ambiguous identities", async () => {
    const read = vi.fn(async () => null)
    const w = makeEnsWatch({ root: ROOT, reader: { getEnsText: read } })
    await w.sweep([snapshot]); expect(w.isExpired("demo", SELLER)).toBe(true)
    read.mockClear()
    await w.sweep(Array.from({ length: 513 }, (_, i) => ({ ...snapshot, id: `skill-${i}` })))
    expect(read).not.toHaveBeenCalled(); expect(w.isExpired("demo", SELLER)).toBe(true)
    await w.sweep([snapshot, { ...snapshot, seller: OTHER }])
    expect(read).not.toHaveBeenCalled(); expect(w.isExpired("demo")).toBe(false)
  })

  it("shares one manual sweep and continues after a per-listing callback failure", async () => {
    const release = deferred<void>(), read = vi.fn(async ({ key, name }: { key: string; name: string }) => {
      await release.promise
      return key === "arcade.endpoint" && name.startsWith("next.") ? records[key]!.replace("/demo", "/next") : records[key] ?? null
    })
    const calls: string[] = []
    const w = makeEnsWatch({ root: ROOT, reader: { getEnsText: read }, onResolved: s => { calls.push(s.id); if (s.id === "demo") throw Error("PRIVATE") } })
    const snapshots = [snapshot, { ...snapshot, id: "next" }]
    const first = w.sweep(snapshots), second = w.sweep(snapshots)
    expect(first).toBe(second)
    release.resolve(); await Promise.all([first, second])
    expect(read).toHaveBeenCalledTimes(8); expect(calls).toEqual(["demo", "next"])
  })

  it("bounds a hung listing supplier, permits restart, and ignores the old cleanup", async () => {
    vi.useFakeTimers()
    const old = deferred<ReadonlyArray<EnsListingSnapshot>>(), onResolved = vi.fn()
    const w = makeEnsWatch({ root: ROOT, reader: reader(), onResolved })
    const stopOld = w.start(100, () => old.promise)
    await vi.advanceTimersByTimeAsync(5_001); stopOld()
    const stopNew = w.start(100, async () => [snapshot])
    stopOld(); old.resolve([{ ...snapshot, seller: OTHER }])
    await vi.advanceTimersByTimeAsync(0)
    expect(onResolved).toHaveBeenCalledTimes(1)
    expect(onResolved.mock.calls[0]?.[0]).toEqual(snapshot)
    stopNew(); await vi.advanceTimersByTimeAsync(30_000)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("caps one cycle even when many readers never settle", async () => {
    vi.useFakeTimers()
    const read = vi.fn(() => new Promise<string | null>(() => {})), log = vi.fn()
    const w = makeEnsWatch({ root: ROOT, reader: { getEnsText: read }, log })
    const pending = w.sweep(Array.from({ length: 512 }, (_, i) => ({ ...snapshot, id: `skill-${i}` })))
    await vi.advanceTimersByTimeAsync(30_001); await pending
    expect(read.mock.calls.length).toBeLessThanOrEqual(12)
    expect(w.isExpired("skill-0", SELLER)).toBe(false)
    await vi.advanceTimersByTimeAsync(11_000); expect(vi.getTimerCount()).toBe(0)
  })

  it.each([0, -1, NaN, Infinity, 0.5, 2_147_483_648])("rejects an unsafe active interval %s before scheduling", interval => {
    const w = makeEnsWatch({ root: ROOT, reader: reader() })
    expect(() => w.start(interval, async () => [snapshot])).toThrow(/interval/)
  })
  it("does not overlap sweeps or create multiple workers, and cancellation invalidates late results", async () => {
    vi.useFakeTimers()
    const release = deferred<string | null>(), read = vi.fn(() => release.promise), onResolved = vi.fn()
    const get = vi.fn(async () => [snapshot])
    const w = makeEnsWatch({ root: ROOT, reader: { getEnsText: read }, onResolved })
    const stop = w.start(100, get), stopAgain = w.start(100, get)
    await vi.advanceTimersByTimeAsync(500)
    expect(get).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledTimes(4)
    stop(); stopAgain(); release.resolve(null)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(w.isExpired("demo", SELLER)).toBe(false); expect(onResolved).not.toHaveBeenCalled()
    expect(get).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0)
  })
  it("invalidates a callback's final-write guard when stopped during awaited metadata work", async () => {
    vi.useFakeTimers()
    const release = deferred<void>(), entered = deferred<void>()
    let writes = 0
    const w = makeEnsWatch({ root: ROOT, reader: reader(), onResolved: async (_snapshot, _name, active) => {
      entered.resolve(); await release.promise; if (active()) writes++
    } })
    const stop = w.start(100, async () => [snapshot])
    await vi.advanceTimersByTimeAsync(0); await entered.promise
    stop(); release.resolve(); await vi.advanceTimersByTimeAsync(30_000)
    expect(writes).toBe(0); expect(vi.getTimerCount()).toBe(0)
  })
  it("bounds a stuck current-check and keeps the watch usable", async () => {
    vi.useFakeTimers()
    const w = makeEnsWatch({ root: ROOT, reader: reader(), isCurrent: () => new Promise(() => {}) })
    const pending = w.sweep([snapshot])
    await vi.advanceTimersByTimeAsync(30_001); await pending
    expect(w.isExpired("demo", SELLER)).toBe(false)
  })
})

describe("read-only name route", () => {
  it("returns only the normalized public projection with an exact bigint price", async () => {
    const response = await handleNames(reader({ "arcade.priceAtomic": "9007199254740993" }), NAME.toUpperCase())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ name: NAME, skillId: "demo", seller: SELLER, endpoint: records["arcade.endpoint"],
      payTo: OTHER, chain: "eip155:5042002", priceAtomic: "9007199254740993", expired: false })
  })
  it("reports a missing record differently from unavailable resolution", async () => {
    const missing = await handleNames(reader({ "arcade.endpoint": null }), NAME)
    expect(missing.status).toBe(404); expect(await missing.json()).toEqual({ error: "ens_name_expired" })
    const unavailable = await handleNames({ getEnsText: async () => { throw new Error("PRIVATE") } }, NAME)
    expect(unavailable.status).toBe(503); expect(await unavailable.json()).toEqual({ error: "ens_resolution_unavailable" })
  })
  it("rejects an invalid name without performing an ENS read", async () => {
    const read = vi.fn(async () => null)
    const response = await handleNames({ getEnsText: read }, "bad..eth")
    expect(response.status).toBe(503); expect(read).not.toHaveBeenCalled()
  })
})
