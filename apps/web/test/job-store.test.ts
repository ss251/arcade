import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { KEY, forget, forgetAll, get, list, readState, remember, type StoredJob } from "../src/lib/job-store.ts"

const ORIGIN = "https://hub.example"
const scope = (hubOrigin = ORIGIN) => ({ hubOrigin, realm: "ordinary" as const })
const job = (over: Partial<StoredJob> = {}): StoredJob => ({
  jobId: "job_0000000000000001", token: "ab".repeat(16), skillId: "diff-triage",
  priceAtomic: "120000", createdAtMs: 1_700_000_000_000, ...scope(), ...over
})
const numbered = (i: number) => job({ jobId: `job_${String(i).padStart(16, "0")}` })
const memory = () => {
  const values = new Map<string, string>()
  return { values, getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    removeItem: vi.fn((key: string) => { values.delete(key) }), clear: vi.fn(() => values.clear()),
    key: (index: number) => [...values.keys()][index] ?? null, get length() { return values.size } }
}
let storage: ReturnType<typeof memory>
beforeEach(() => { storage = memory(); vi.stubGlobal("window", { localStorage: storage }) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe("H9 ordinary browser recovery records", () => {
  it("stores exactly the validated seven fields and returns independent copies", () => {
    const input = { ...job() }
    expect(KEY).toBe("arcade.jobs.v1")
    expect(remember(input)).toEqual({ status: "stored", recovered: false })
    input.token = "cd".repeat(16)
    const first = list(), second = readState(), found = get(input.jobId, scope())
    expect(first).toEqual([job()]); expect(second).toEqual({ status: "ready", jobs: [job()] })
    expect(found).toEqual(job()); expect(first).not.toBe(second.jobs); expect(first[0]).not.toBe(found)
    Reflect.set(first[0]!, "token", "ef".repeat(16))
    Reflect.set(found!, "skillId", "other-skill")
    expect(list()).toEqual([job()])
    expect(JSON.parse(storage.values.get(KEY)!)).toEqual([job()])
  })
  it("re-reads external storage changes without retaining a process cache", () => {
    expect(readState()).toEqual({ status: "ready", jobs: [] })
    storage.values.set(KEY, JSON.stringify([job()]))
    expect(list()).toEqual([job()])
    storage.values.delete(KEY)
    expect(list()).toEqual([])
    expect(storage.setItem).not.toHaveBeenCalled()
  })
  it("keeps equal IDs on separate issuers distinct and requires exact lookup scope", () => {
    const other = job({ hubOrigin: "https://other.example", token: "cd".repeat(16) })
    expect(remember(job()).status).toBe("stored"); expect(remember(other).status).toBe("stored")
    expect(get(job().jobId, scope())).toEqual(job())
    expect(get(job().jobId, scope(other.hubOrigin))).toEqual(other)
    for (const invalid of [undefined, {}, { hubOrigin: ORIGIN }, { ...scope(), realm: "session" },
      { ...scope(), extra: true }, scope(ORIGIN + "/")]) {
      expect(get(job().jobId, invalid)).toBeUndefined()
      expect(forget(job().jobId, invalid)).toEqual({ status: "invalid" })
    }
    expect(list()).toHaveLength(2)
    expect(forget(job().jobId, scope())).toEqual({ status: "removed" })
    expect(list()).toEqual([other])
  })
  it("orders newest first with deterministic origin and ID ties, without rewriting reads", () => {
    const rows = [numbered(3), job({ hubOrigin: "https://a.example" }), numbered(2),
      numbered(4), job({ jobId: numbered(5).jobId, createdAtMs: 1_700_000_000_001 })]
    storage.values.set(KEY, JSON.stringify(rows))
    expect(list().map(r => [r.hubOrigin, r.jobId])).toEqual([
      [ORIGIN, numbered(5).jobId], ["https://a.example", job().jobId],
      [ORIGIN, numbered(2).jobId], [ORIGIN, numbered(3).jobId], [ORIGIN, numbered(4).jobId]
    ])
    expect(storage.values.get(KEY)).toBe(JSON.stringify(rows)); expect(storage.setItem).not.toHaveBeenCalled()
  })
  it("accepts exact duplicates without a write but never changes existing authority or metadata", () => {
    remember(job()); const before = storage.values.get(KEY); storage.setItem.mockClear()
    expect(remember({ ...job() })).toEqual({ status: "already_stored" })
    for (const changed of [{ token: "cd".repeat(16) }, { skillId: "other-skill" },
      { priceAtomic: "0" }, { createdAtMs: 0 }]) {
      expect(remember(job(changed))).toEqual({ status: "conflict" })
      expect(storage.values.get(KEY)).toBe(before)
    }
    expect(storage.setItem).not.toHaveBeenCalled()
  })
  it("accepts actual canonical boundary values without treating price as spend", () => {
    for (const row of [job({ jobId: "job_" + "A".repeat(128), skillId: "a".repeat(64),
      priceAtomic: ((1n << 256n) - 1n).toString(), createdAtMs: Number.MAX_SAFE_INTEGER }),
      job({ jobId: "job_" + "b".repeat(16), skillId: "a0", token: "0".repeat(32), priceAtomic: "0", createdAtMs: 0 })]) {
      expect(remember(row).status).toBe("stored"); expect(get(row.jobId, scope())).toEqual(row)
    }
  })
  it.each([
    ["jobId", "job_" + "a".repeat(15)], ["jobId", "job_" + "a".repeat(129)], ["jobId", "job_" + "é".repeat(16)],
    ["token", "ab".repeat(15)], ["token", "AB".repeat(16)], ["token", "é".repeat(32)], ["token", 123],
    ["skillId", "a"], ["skillId", "a".repeat(65)], ["skillId", "skill/name"],
    ["priceAtomic", "01"], ["priceAtomic", "-1"], ["priceAtomic", "1.2"], ["priceAtomic", "1e2"],
    ["priceAtomic", (1n << 256n).toString()], ["priceAtomic", "1".repeat(1000)], ["priceAtomic", 12],
    ["createdAtMs", NaN], ["createdAtMs", Infinity], ["createdAtMs", -1], ["createdAtMs", 1.5],
    ["createdAtMs", Number.MAX_SAFE_INTEGER + 1], ["realm", "session"], ["realm", undefined]
  ])("rejects invalid %s scalar %s before reading storage", (field, value) => {
    expect(remember({ ...job(), [field]: value })).toEqual({ status: "invalid" })
    expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled()
  })
  it("does not execute getters, coercion or toJSON and rejects non-plain/excess data", () => {
    let calls = 0
    const getter = Object.defineProperty({ ...job() }, "token", { enumerable: true, get() { calls++; return "PRIVATE" } })
    const inherited = Object.create(job())
    const rows: unknown[] = [getter, inherited, { ...job(), sessionId: "ses_" + "a".repeat(32) },
      { ...job(), output: "PRIVATE" }, { ...job(), toJSON() { calls++; return job() } },
      { ...job(), token: { toString() { calls++; return job().token } } },
      { ...job(), [Symbol("private")]: true }, [], null,
      Object.defineProperty({ ...job() }, "token", { value: job().token, enumerable: false }),
      new Proxy({}, { ownKeys() { throw Error("PRIVATE_PROXY") } })]
    for (const row of rows) expect(remember(row)).toEqual({ status: "invalid" })
    expect(calls).toBe(0); expect(storage.getItem).not.toHaveBeenCalled()
  })
  it.each(["https://hub.example", "https://hub.example:8443", "http://127.0.0.1:8787", "http://[::1]:8787"])("accepts exact origin %s", hubOrigin => {
    expect(remember(job({ hubOrigin }))).toEqual({ status: "stored", recovered: false })
  })
  it.each(["http://localhost:8787", "http://127.1:8787", "http://2130706433:8787", "http://[0:0:0:0:0:0:0:1]:8787",
    "http://192.168.1.1", "https://HUB.example", "https://hub.example:443", "https://hub.example/",
    "https://user:pass@hub.example", "https://hub.example/path", "https://hub.example?x=1", "https://hub.example#x",
    "https://hub.example\\evil", " https://hub.example", "https://hub.example\n", "file:///tmp/jobs",
    "https://" + "a".repeat(2048)])("rejects noncanonical or unsupported origin %s", hubOrigin => {
    expect(remember(job({ hubOrigin }))).toEqual({ status: "invalid" })
    expect(storage.getItem).not.toHaveBeenCalled()
  })
})

describe("H9 whole-envelope and capacity policy", () => {
  it.each([["LF", "\n"], ["CR", "\r"], ["LS", "\u2028"], ["PS", "\u2029"]])("rejects trailing %s at every scalar/read identity boundary", (_label, tail) => {
    for (const field of ["jobId", "skillId", "priceAtomic"] as const) {
      const invalid = { ...job(), [field]: job()[field] + tail }
      expect(remember(invalid)).toEqual({ status: "invalid" })
      expect(storage.getItem).not.toHaveBeenCalled()
      storage.values.set(KEY, JSON.stringify([invalid]))
      expect(readState()).toEqual({ status: "invalid", jobs: [] })
      expect(storage.setItem).not.toHaveBeenCalled()
      storage.getItem.mockClear()
    }
    storage.values.set(KEY, JSON.stringify([job()]))
    expect(get(job().jobId + tail, scope())).toBeUndefined()
    expect(forget(job().jobId + tail, scope())).toEqual({ status: "invalid" })
    expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled()
  })
  it.each(["{broken", "null", "{}", "[null]", JSON.stringify([job(), { ...job(), token: "bad" }]),
    JSON.stringify([job(), job()]), JSON.stringify([{ ...job(), hubOrigin: undefined }]),
    JSON.stringify([{ ...job(), sessionId: "ses_" + "a".repeat(32) }])])("does not salvage or rewrite an invalid envelope", raw => {
    storage.values.set(KEY, raw)
    expect(readState()).toEqual({ status: "invalid", jobs: [] }); expect(list()).toEqual([])
    expect(get(job().jobId, scope())).toBeUndefined()
    expect(forget(job().jobId, scope())).toEqual({ status: "invalid" })
    expect(remember({ ...job(), token: "bad" })).toEqual({ status: "invalid" })
    expect(storage.values.get(KEY)).toBe(raw); expect(storage.setItem).not.toHaveBeenCalled()
    expect(remember(job())).toEqual({ status: "stored", recovered: true })
    expect(readState()).toEqual({ status: "ready", jobs: [job()] })
  })
  it("refuses the 201st row without eviction and permits an exact duplicate at capacity", () => {
    const rows = Array.from({ length: 200 }, (_, i) => numbered(i))
    storage.values.set(KEY, JSON.stringify(rows)); const original = storage.values.get(KEY)
    expect(list()).toHaveLength(200)
    expect(remember(numbered(199))).toEqual({ status: "already_stored" })
    expect(remember(numbered(201))).toEqual({ status: "capacity" })
    expect(storage.values.get(KEY)).toBe(original); expect(storage.setItem).not.toHaveBeenCalled()
    storage.values.set(KEY, JSON.stringify([...rows, numbered(201)]))
    expect(readState().status).toBe("invalid")
  })
  it("accepts the exact raw byte ceiling and rejects +1 before JSON parsing", () => {
    const raw = JSON.stringify([job()])
    storage.values.set(KEY, raw.padEnd(262144, " "))
    expect(readState().status).toBe("ready")
    storage.values.set(KEY, raw.padEnd(262145, " "))
    const parse = vi.spyOn(JSON, "parse")
    expect(readState()).toEqual({ status: "invalid", jobs: [] })
    expect(parse).not.toHaveBeenCalled()
  })
  it("enforces UTF-8 bytes before parse even when code units fit", () => {
    storage.values.set(KEY, JSON.stringify("🧪".repeat(70000)))
    const parse = vi.spyOn(JSON, "parse")
    expect(readState().status).toBe("invalid"); expect(parse).not.toHaveBeenCalled()
  })
  it("enforces the exact serialized write ceiling independently of the row ceiling", () => {
    for (const target of [262144, 262145]) {
      const rows = Array.from({ length: 150 }, (_, i) => numbered(i))
      let extra = target - JSON.stringify(rows).length
      for (let i = 0; i < rows.length && extra > 0; i++) {
        const added = Math.min(extra, 2048 - ORIGIN.length)
        rows[i] = { ...rows[i]!, hubOrigin: "https://" + "a".repeat(ORIGIN.length - 8 + added) }
        extra -= added
      }
      expect(extra).toBe(0)
      const encoded = JSON.stringify(rows)
      expect(new TextEncoder().encode(encoded).byteLength).toBe(target)
      // These synthetic long hosts test the accepted URL-origin shape only, not DNS reachability.
      expect(rows.every(row => new URL(row.hubOrigin).origin === row.hubOrigin)).toBe(true)
      const original = JSON.stringify(rows.slice(0, -1))
      storage.values.set(KEY, original); storage.setItem.mockClear()
      expect(readState().status).toBe("ready")
      expect(remember(rows.at(-1))).toEqual(target === 262144 ? { status: "stored", recovered: false } : { status: "capacity" })
      if (target === 262144) {
        expect(new TextEncoder().encode(storage.values.get(KEY)).byteLength).toBe(target)
        expect(list()).toHaveLength(150)
      } else {
        expect(storage.values.get(KEY)).toBe(original); expect(storage.setItem).not.toHaveBeenCalled()
      }
    }
  })
  it("never replaces invalid data when recovery cannot be persisted", () => {
    storage.values.set(KEY, "{broken")
    storage.setItem.mockImplementation(() => { throw Error("PRIVATE_QUOTA") })
    expect(remember(job())).toEqual({ status: "unavailable" })
    expect(storage.values.get(KEY)).toBe("{broken")
  })
})

describe("H9 browser-only storage and observable removal", () => {
  it.each(["remember", "get", "forget"] as const)("refuses a revoked Proxy at %s before storage access", entry => {
    const input = Proxy.revocable({}, {}); input.revoke()
    let accesses = 0
    vi.stubGlobal("window", Object.defineProperty({}, "localStorage", { get() { accesses++; return storage } }))
    let outcome: unknown
    try {
      outcome = entry === "remember" ? remember(input.proxy)
        : entry === "get" ? get(job().jobId, input.proxy) : forget(job().jobId, input.proxy)
    } finally {
      expect(accesses).toBe(0); expect(storage.getItem).not.toHaveBeenCalled()
      expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.removeItem).not.toHaveBeenCalled()
    }
    expect(outcome).toEqual(entry === "get" ? undefined : { status: "invalid" })
  })
  it("validates malformed input and scopes before accessing the browser storage getter", () => {
    let accesses = 0
    vi.stubGlobal("window", Object.defineProperty({}, "localStorage", { get() { accesses++; throw Error("PRIVATE") } }))
    expect(remember({ ...job(), extra: true })).toEqual({ status: "invalid" })
    expect(get("bad", scope())).toBeUndefined(); expect(forget("bad", scope())).toEqual({ status: "invalid" })
    expect(get(job().jobId, { ...scope(), extra: true })).toBeUndefined()
    expect(forget(job().jobId, { ...scope(), extra: true })).toEqual({ status: "invalid" })
    expect(accesses).toBe(0)
  })
  it("captures one Storage instance per operation and observes replacement on the next call", () => {
    const replacement = memory(); let accesses = 0
    vi.stubGlobal("window", Object.defineProperty({}, "localStorage", { get() { return accesses++ === 0 ? storage : replacement } }))
    expect(remember(job())).toEqual({ status: "stored", recovered: false })
    expect(accesses).toBe(1); expect(storage.setItem).toHaveBeenCalledOnce()
    expect(replacement.setItem).not.toHaveBeenCalled()
    expect(readState()).toEqual({ status: "ready", jobs: [] }); expect(accesses).toBe(2)
    vi.stubGlobal("window", { localStorage: storage })
    expect(readState()).toEqual({ status: "ready", jobs: [job()] })
  })
  it("does not let inherited serialization hooks observe or replace captured capabilities", () => {
    const oldObject = Object.getOwnPropertyDescriptor(Object.prototype, "toJSON")
    const oldArray = Object.getOwnPropertyDescriptor(Array.prototype, "toJSON")
    let calls = 0, outcome: ReturnType<typeof remember> | undefined
    try {
      for (const proto of [Object.prototype, Array.prototype]) Object.defineProperty(proto, "toJSON", {
        configurable: true, value() { calls++; return "PRIVATE" }
      })
      outcome = remember(Object.assign(Object.create(null), job()))
    } finally {
      if (oldObject === undefined) Reflect.deleteProperty(Object.prototype, "toJSON")
      else Object.defineProperty(Object.prototype, "toJSON", oldObject)
      if (oldArray === undefined) Reflect.deleteProperty(Array.prototype, "toJSON")
      else Object.defineProperty(Array.prototype, "toJSON", oldArray)
    }
    expect(outcome).toEqual({ status: "stored", recovered: false }); expect(calls).toBe(0)
    expect(readState()).toEqual({ status: "ready", jobs: [job()] })
  })
  it("is inert on import and in SSR even if server global storage exists", async () => {
    let getterCalls = 0
    vi.stubGlobal("window", Object.defineProperty({}, "localStorage", { get() { getterCalls++; throw Error("PRIVATE_ACCESS") } }))
    vi.resetModules(); await import("../src/lib/job-store.ts")
    expect(getterCalls).toBe(0)
    vi.stubGlobal("window", undefined); vi.stubGlobal("localStorage", storage)
    expect(readState()).toEqual({ status: "unavailable", jobs: [] })
    expect(list()).toEqual([]); expect(get(job().jobId, scope())).toBeUndefined()
    expect(remember(job())).toEqual({ status: "unavailable" })
    expect(forget(job().jobId, scope())).toEqual({ status: "unavailable" })
    expect(forgetAll()).toEqual({ status: "unavailable" })
    expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled()
  })
  it("returns fixed storage-access and read failure without reporting an empty ready store", () => {
    vi.stubGlobal("window", Object.defineProperty({}, "localStorage", { get() { throw Error("PRIVATE_ACCESS") } }))
    expect(readState()).toEqual({ status: "unavailable", jobs: [] })
    expect(remember(job())).toEqual({ status: "unavailable" })
    vi.stubGlobal("window", { localStorage: storage })
    storage.getItem.mockImplementation(() => { throw Error("PRIVATE_GET") })
    expect(readState()).toEqual({ status: "unavailable", jobs: [] })
    expect(remember(job())).toEqual({ status: "unavailable" }); expect(forgetAll()).toEqual({ status: "unavailable" })
    expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.removeItem).not.toHaveBeenCalled()
  })
  it("reports failed persistence without inventing an in-memory stored row", () => {
    storage.setItem.mockImplementation(() => { throw Error("PRIVATE_QUOTA") })
    expect(remember(job())).toEqual({ status: "unavailable" })
    expect(readState()).toEqual({ status: "ready", jobs: [] })
  })
  it("removes one scoped row, reports absence, and removes only this key when clearing", () => {
    storage.values.set("other-key", "KEEP")
    expect(forget(job().jobId, scope())).toEqual({ status: "not_found" })
    expect(forgetAll()).toEqual({ status: "not_found" })
    remember(job()); expect(forget(job().jobId, scope())).toEqual({ status: "removed" })
    expect(list()).toEqual([])
    storage.values.set(KEY, "{broken")
    expect(forgetAll()).toEqual({ status: "removed" })
    expect(storage.values.has(KEY)).toBe(false); expect(storage.values.get("other-key")).toBe("KEEP")
    expect(storage.clear).not.toHaveBeenCalled()
  })
  it("does not claim deletion when writing or removing fails", () => {
    remember(job()); const original = storage.values.get(KEY)
    storage.setItem.mockImplementation(() => { throw Error("PRIVATE_SET") })
    expect(forget(job().jobId, scope())).toEqual({ status: "unavailable" })
    storage.removeItem.mockImplementation(() => { throw Error("PRIVATE_REMOVE") })
    expect(forgetAll()).toEqual({ status: "unavailable" })
    expect(storage.values.get(KEY)).toBe(original)
  })
})
