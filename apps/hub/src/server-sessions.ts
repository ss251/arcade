import { Cause, Data, Effect, Exit, Option } from "effect"
import { SessionCapacity, SessionClosed, SessionInvalid, SessionNotFound, SessionPending, SessionRailUnavailable,
  formatPrice, type RailName, type SessionError } from "@arcade/core"
import { createHmac, timingSafeEqual } from "node:crypto"
import type { Rails } from "./rails.ts"
import type { makeSessions } from "./sessions.ts"
import type { SessionStore } from "./session-ledger.ts"

const BODY_BYTES = 16_384, BODY_MS = 5000, ACTIVE_LIMIT = 32
const ID = /^ses_[0-9a-f]{32}$/, TOKEN = /^[0-9a-f]{32}$/
/** ASCII validation makes JS length and byte length agree before comparison. */
export const timingSafeTokenOk = (expected: string, presented: string | null): boolean =>
  typeof expected === "string" && TOKEN.test(expected) && typeof presented === "string" && TOKEN.test(presented) &&
  timingSafeEqual(Buffer.from(expected, "ascii"), Buffer.from(presented, "ascii"))
export const sessionToken = (secret: string, id: string): string => {
  if (!ID.test(id)) throw new SessionInvalid()
  return createHmac("sha256", secret).update(`arcade-session:${id}`).digest("hex").slice(0, 32)
}
/** Header-only capability; no Store access, query parsing or request reflection. */
export const sessionTokenOk = (secret: string, id: string, presented: string | null): boolean =>
  ID.test(id) && typeof presented === "string" && TOKEN.test(presented) && timingSafeTokenOk(sessionToken(secret, id), presented)

const json = (body: unknown, status = 200): Response => new Response(
  JSON.stringify(body, (_key, value) => typeof value === "bigint" ? value.toString() : value),
  { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" } })
const refusal = (error: string, status: number) => json({ error }, status)
class InvalidBody extends Data.TaggedError("InvalidSessionBody")<{}> {}
const invalid = (): never => { throw new InvalidBody() }
const discard = (req: Request) => { if (req.body !== null && !req.body.locked) void req.body.cancel().catch(() => {}) }

/** The deadline covers the entire body, not each chunk. Cancellation never admits a late write. */
const readBody = async (req: Request): Promise<string> => {
  if (req.signal.aborted) return invalid()
  const length = req.headers.get("content-length")
  if (length !== null && (!/^(0|[1-9][0-9]{0,4})$/.test(length) || Number(length) > BODY_BYTES)) return invalid()
  const reader = req.body?.getReader()
  if (reader === undefined) { if (length !== null && length !== "0") return invalid(); return "" }
  const deadline = performance.now() + BODY_MS
  let timer: ReturnType<typeof setTimeout> | undefined, stop: () => void = () => {}, finished = false
  const stopped = new Promise<never>((_resolve, reject) => {
    stop = () => { reject(new InvalidBody()); void reader.cancel().catch(() => {}) }
    timer = setTimeout(stop, BODY_MS)
    req.signal.addEventListener("abort", stop, { once: true })
  })
  const chunks: Uint8Array[] = []; let bytes = 0
  try {
    if (req.signal.aborted) stop()
    while (true) {
      if (req.signal.aborted || performance.now() >= deadline) return invalid()
      const next = await Promise.race([reader.read(), stopped])
      if (req.signal.aborted || performance.now() >= deadline) return invalid()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > BODY_BYTES) return invalid()
      // Empty chunks must neither grow retained metadata nor evade the elapsed
      // deadline by continually queueing microtasks ahead of the timer callback.
      if (next.value.byteLength !== 0) chunks.push(next.value.slice())
    }
    if (length !== null && Number(length) !== bytes) return invalid()
    if (bytes !== 0 && !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers.get("content-type") ?? "")) return invalid()
    const body = new Uint8Array(bytes); let offset = 0
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
    const result = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body)
    finished = true
    return result
  } catch { return invalid() }
  finally {
    if (timer !== undefined) clearTimeout(timer)
    req.signal.removeEventListener("abort", stop)
    if (!finished) void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
const object = (text: string): Record<string, unknown> => {
  let value: unknown
  try { value = JSON.parse(text) } catch { return invalid() }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}
const amount = (value: unknown): bigint => {
  if (typeof value !== "string" || value.length > 80 || !/^(0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(value)) return invalid()
  const [whole, fraction = ""] = value.split(".")
  const atomic = BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, "0"))
  if (atomic <= 0n || atomic >= 1n << 256n) return invalid()
  return atomic
}
const errorResponse = (error: unknown): Response => {
  if (error instanceof SessionInvalid || error instanceof InvalidBody) return refusal("input_invalid", 400)
  if (error instanceof SessionNotFound) return refusal("session_not_found", 404)
  if (error instanceof SessionRailUnavailable) return refusal("session_rail_unavailable", 409)
  if (error instanceof SessionClosed) return refusal("session_closed", 409)
  if (error instanceof SessionPending) return refusal("session_pending", 409)
  if (error instanceof SessionCapacity) return refusal("session_capacity", 429)
  return refusal("session_unavailable", 503)
}
export interface SessionRoutesOptions {
  readonly sessions: ReturnType<typeof makeSessions>
  readonly rails: Rails
  readonly sessionStorage: SessionStore["sessionStorage"]
  readonly hubSecret: string
  readonly configuredHubSecret?: string | undefined
  readonly now?: () => number
}

/** Transport only. F6/F5 remain the sole session/accounting authority. */
export const makeSessionRoutes = ({ sessions, rails, sessionStorage, hubSecret, configuredHubSecret, now = Date.now }: SessionRoutesOptions) => {
  const realAdmission = sessionStorage === "durable" && typeof configuredHubSecret === "string" &&
    configuredHubSecret.length > 0 && configuredHubSecret.length <= 4096 && Buffer.byteLength(configuredHubSecret, "utf8") <= 4096 && configuredHubSecret === hubSecret
  let active = 0
  return async function handleSessionRoute(req: Request): Promise<Response | undefined> {
    const path = new URL(req.url).pathname
    if (path !== "/sessions" && !path.startsWith("/sessions/")) return undefined
    const openRoute = path === "/sessions" && req.method === "POST"
    const match = /^\/sessions\/(ses_[0-9a-f]{32})(\/close)?$/.exec(path)
    // Bad capabilities remain indistinguishable even while authenticated bodies
    // occupy every slot. They neither read a body nor consume handler capacity.
    if (!openRoute && (match === null || (match[2] === undefined ? req.method !== "GET" : req.method !== "POST") ||
      !sessionTokenOk(hubSecret, match[1]!, req.headers.get("x-session-token")))) {
      discard(req); return refusal("session_not_found", 404)
    }
    if (active >= ACTIVE_LIMIT) { discard(req); return refusal("session_capacity", 429) }
    active++
    try {
      const execute = async <A>(operation: () => Effect.Effect<A, SessionError>): Promise<A> => {
        if (req.signal.aborted) return invalid()
        const result = await Effect.runPromiseExit(Effect.suspend(operation), { signal: req.signal })
        if (Exit.isSuccess(result)) return result.value
        const failure = Cause.failureOption(result.cause)
        throw Option.isSome(failure) ? failure.value : new Error("Session operation unavailable")
      }
      if (openRoute) {
        const body = object(await readBody(req))
        if (Object.keys(body).some(key => !["buyer", "budgetUsd", "rail"].includes(key)) ||
          typeof body.buyer !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(body.buyer) || /^0x0{40}$/i.test(body.buyer)) return invalid()
        const budgetAtomic = amount(body.budgetUsd)
        const name = Object.hasOwn(body, "rail") ? body.rail : rails.default.name
        if (typeof name !== "string" || !["test", "gateway", "eip3009"].includes(name)) return invalid()
        const built = rails.get(name)
        if (built === undefined || built.name !== name) return refusal("session_rail_unavailable", 409)
        if (name !== "test" && !realAdmission) return refusal("session_unavailable", 503)
        const opened = await execute(() => sessions.openSession({ buyer: (body.buyer as string).toLowerCase(), budgetAtomic, rail: name as RailName, openedAtMs: now() }))
        return json({ session_id: opened.id, session_token: sessionToken(hubSecret, opened.id), rail: opened.rail,
          network: opened.network, budget: formatPrice(opened.budgetAtomic), note: opened.rail === "gateway"
            ? "Local budget only; requires an independently funded Gateway balance. Accepted transfer references are not mined batches or withdrawable credit."
            : opened.rail === "test" ? "Local budget only; test payments are simulated and move no funds."
            : "Local budget only; each accepted EIP-3009 call settles separately." }, 201)
      }
      const id = match![1]!
      if (match![2] !== undefined) {
        const body = await readBody(req)
        if (body !== "" && Object.keys(object(body)).length !== 0) return invalid()
        return json(await execute(() => sessions.closeSession(id, now())))
      }
      const snapshot = await execute(() => sessions.snapshot(id)), s = snapshot.session
      return json({ session_id: s.id, rail: s.rail, network: s.network, budget: formatPrice(s.budgetAtomic),
        spent: formatPrice(s.spentAtomic), held: formatPrice(snapshot.heldAtomic), remaining: formatPrice(snapshot.remainingAtomic),
        calls: snapshot.calls, complete: snapshot.complete, closed: s.closedAtMs !== undefined,
        ...(s.closedAtMs === undefined || !snapshot.complete ? {} : { closed_receipt: sessions.sessionReceipt(snapshot) }) })
    } catch (error) { return errorResponse(error) }
    finally { active--; discard(req) }
  }
}
