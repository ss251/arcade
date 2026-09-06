/** Browser-held ordinary recovery capabilities; never import into server/model data.
 * These rows record accepted authority, not proven spend, a balance or a receipt.
 * Clearing site data, changing origin or rotating the hub secret can lose recovery.
 * localStorage is not an XSS boundary, cross-tab lock, backup or payment retry guard.
 */
export const KEY = "arcade.jobs.v1"
const MAX_ROWS = 200, MAX_BYTES = 262_144
const fields = ["jobId", "token", "skillId", "priceAtomic", "createdAtMs", "hubOrigin", "realm"] as const

export interface JobScope { readonly hubOrigin: string; readonly realm: "ordinary" }
export interface StoredJob extends JobScope {
  readonly jobId: string
  readonly token: string
  readonly skillId: string
  readonly priceAtomic: string
  readonly createdAtMs: number
}
export interface JobReadState {
  readonly status: "ready" | "invalid" | "unavailable"
  readonly jobs: readonly StoredJob[]
}
export type RememberOutcome = { readonly status: "stored"; readonly recovered: boolean }
  | { readonly status: "already_stored" | "invalid" | "unavailable" | "capacity" | "conflict" }
export type ForgetOutcome = { readonly status: "removed" | "not_found" | "invalid" | "unavailable" }

/** Closed own scalars only. Reflection exceptions refuse; this is not a Proxy sandbox. */
const own = (input: unknown, keys: readonly string[]): Record<string, unknown> | undefined => {
  if (input === null || typeof input !== "object") return undefined
  try {
    if (Array.isArray(input)) return undefined
    if (![Object.prototype, null].includes(Object.getPrototypeOf(input))) return undefined
    const actual = Reflect.ownKeys(input)
    if (actual.length !== keys.length || actual.some(k => typeof k !== "string" || !keys.includes(k))) return undefined
    const copy: Record<string, unknown> = Object.create(null)
    for (const key of keys) {
      const d = Object.getOwnPropertyDescriptor(input, key)
      if (d === undefined || !d.enumerable || !("value" in d)) return undefined
      copy[key] = d.value
    }
    return copy
  } catch { return undefined }
}
const jobIdOk = (v: unknown): v is string => typeof v === "string" && v.length >= 20 && v.length <= 132 && /^job_[A-Za-z0-9]{16,128}$/.test(v)
const originOk = (v: unknown): v is string => {
  if (typeof v !== "string" || v.length > 2048 || /[\s\\?#]/.test(v)) return false
  try {
    const u = new URL(v)
    return u.origin === v && !u.username && !u.password &&
      (u.protocol === "https:" || u.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(u.hostname))
  } catch { return false }
}
const captureScope = (input: unknown): JobScope | undefined => {
  const v = own(input, ["hubOrigin", "realm"])
  return v !== undefined && originOk(v.hubOrigin) && v.realm === "ordinary"
    ? { hubOrigin: v.hubOrigin, realm: v.realm } : undefined
}
const captureJob = (input: unknown): StoredJob | undefined => {
  const v = own(input, fields)
  if (v === undefined || !jobIdOk(v.jobId) || typeof v.token !== "string" || v.token.length !== 32 || !/^[a-f0-9]{32}$/.test(v.token) ||
    typeof v.skillId !== "string" || v.skillId.length < 2 || v.skillId.length > 64 || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(v.skillId) ||
    typeof v.priceAtomic !== "string" || v.priceAtomic.length > 78 || !/^(0|[1-9][0-9]{0,77})$/.test(v.priceAtomic) ||
    BigInt(v.priceAtomic) >= 1n << 256n || typeof v.createdAtMs !== "number" || !Number.isSafeInteger(v.createdAtMs) || v.createdAtMs < 0 ||
    !originOk(v.hubOrigin) || v.realm !== "ordinary") return undefined
  return { jobId: v.jobId, token: v.token, skillId: v.skillId, priceAtomic: v.priceAtomic,
    createdAtMs: v.createdAtMs, hubOrigin: v.hubOrigin, realm: v.realm }
}
const identity = (a: StoredJob, b: JobScope, jobId: string) => a.jobId === jobId && a.hubOrigin === b.hubOrigin && a.realm === b.realm
const lex = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const sorted = (rows: StoredJob[]) => rows.sort((a, b) => b.createdAtMs - a.createdAtMs ||
  lex(a.hubOrigin, b.hubOrigin) || lex(a.realm, b.realm) || lex(a.jobId, b.jobId))
const withinBytes = (raw: string) => raw.length <= MAX_BYTES && new TextEncoder().encode(raw).byteLength <= MAX_BYTES

/** No import-time or server-global localStorage access; capture one browser instance per operation. */
const browserStorage = (): Storage | undefined => {
  try { return typeof window === "undefined" ? undefined : window.localStorage ?? undefined }
  catch { return undefined }
}
type Snapshot = { readonly status: "unavailable"; readonly jobs: StoredJob[] }
  | { readonly status: "ready" | "invalid"; readonly jobs: StoredJob[]; readonly storage: Storage }
const read = (): Snapshot => {
  const storage = browserStorage()
  if (storage === undefined) return { status: "unavailable", jobs: [] }
  let raw: string | null
  try { raw = storage.getItem(KEY) } catch { return { status: "unavailable", jobs: [] } }
  if (raw === null) return { status: "ready", jobs: [], storage }
  try {
    if (typeof raw !== "string" || !withinBytes(raw)) throw 0
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value) || value.length > MAX_ROWS) throw 0
    const rows: StoredJob[] = []
    for (const input of value) {
      const row = captureJob(input)
      if (row === undefined || rows.some(r => identity(r, row, row.jobId))) throw 0
      rows.push(row)
    }
    return { status: "ready", jobs: sorted(rows), storage }
  } catch { return { status: "invalid", jobs: [], storage } }
}

/** Diagnose empty versus unreadable storage; reads never repair or persist anything. */
export const readState = (): JobReadState => {
  const snapshot = read()
  return { status: snapshot.status, jobs: snapshot.jobs }
}
export const list = (): readonly StoredJob[] => readState().jobs
export const get = (jobId: unknown, scope: unknown): StoredJob | undefined => {
  const captured = captureScope(scope)
  if (!jobIdOk(jobId) || captured === undefined) return undefined
  return read().jobs.find(row => identity(row, captured, jobId))
}

// Stringify only known primitive values, never an input object or inherited toJSON hook.
const encode = (rows: readonly StoredJob[]): string => `[${rows.map(row =>
  `{${fields.map(key => `${JSON.stringify(key)}:${JSON.stringify(row[key])}`).join(",")}}`).join(",")}]`

export const remember = (input: unknown): RememberOutcome => {
  const row = captureJob(input)
  if (row === undefined) return { status: "invalid" }
  const snapshot = read()
  if (snapshot.status === "unavailable") return { status: "unavailable" }
  const existing = snapshot.jobs.find(r => identity(r, row, row.jobId))
  if (existing !== undefined) return { status: fields.every(k => existing[k] === row[k]) ? "already_stored" : "conflict" }
  if (snapshot.jobs.length >= MAX_ROWS) return { status: "capacity" }
  const encoded = encode(sorted([...snapshot.jobs, row]))
  if (!withinBytes(encoded)) return { status: "capacity" }
  try {
    snapshot.storage.setItem(KEY, encoded)
    return { status: "stored", recovered: snapshot.status === "invalid" }
  } catch { return { status: "unavailable" } }
}

export const forget = (jobId: unknown, scope: unknown): ForgetOutcome => {
  const captured = captureScope(scope)
  if (!jobIdOk(jobId) || captured === undefined) return { status: "invalid" }
  const snapshot = read()
  if (snapshot.status !== "ready") return { status: snapshot.status }
  const remaining = snapshot.jobs.filter(row => !identity(row, captured, jobId))
  if (remaining.length === snapshot.jobs.length) return { status: "not_found" }
  try { snapshot.storage.setItem(KEY, encode(remaining)); return { status: "removed" } }
  catch { return { status: "unavailable" } }
}

/** Explicitly remove only our key, including malformed data. No parse, repair or clear(). */
export const forgetAll = (): ForgetOutcome => {
  const storage = browserStorage()
  if (storage === undefined) return { status: "unavailable" }
  try {
    if (storage.getItem(KEY) === null) return { status: "not_found" }
    storage.removeItem(KEY)
    return { status: "removed" }
  } catch { return { status: "unavailable" } }
}
