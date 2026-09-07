/** Bounded escrow HTTP only. Caller must journal an attempt BEFORE either POST.
 * Responses are data, not on-chain proof; capability and result tokens stay private. */
import { docBytes, formatPrice, hashJson } from "@arcade/core"
import { escrowRequestDescription } from "./erc8183-request.ts"
import { captureOriginalEscrowBuyerIntent, type EscrowBuyerIntent } from "./erc8183-buyer-intent.ts"
import { captureEscrowIdentity } from "./erc8183-reader.ts"
import { captureEscrowPayment, encodeEscrowHeader } from "./erc8183-wire.ts"
import { escrowBytes32, escrowCheck, escrowRecord, escrowUint } from "./erc8183-codec.ts"
import { boundEscrowIO } from "./erc8183-rpc.ts"
export interface EscrowBuyerHttpOptions {
  readonly fetch?: typeof globalThis.fetch; readonly signal: AbortSignal; readonly deadlineMs: number
}
export function escrowBuyerUrl(resource: string) {
  const url = new URL(resource)
  escrowCheck(url.href === resource && !url.username && !url.password && !url.search && !url.hash &&
    /^\/x\/0x[0-9a-f]{40}\/[a-z0-9-]+$/.test(url.pathname) && (url.protocol === "https:" ||
      url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))
  return url
}
export function createEscrowBuyerHttp(options: EscrowBuyerHttpOptions) {
  const fetch = options.fetch ?? globalThis.fetch, parent = options.signal, deadline = options.deadlineMs
  let budgetAttempted = false, rootAttempted = false
  async function read(url: string, init: RequestInit, status: number, signal: AbortSignal): Promise<unknown> {
    let response: Response | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined, stopped = false
    try {
      return await boundEscrowIO(async active => {
        const result = await fetch(url, { ...init, credentials: "omit", redirect: "error", signal: active,
          headers: { accept: "application/json", "content-type": "application/json", "accept-encoding": "identity", ...init.headers } })
        response = result
        if (stopped || active.aborted) { void result.body?.cancel().catch(() => {}); throw Error("stopped") }
        escrowCheck(result.status === status && !result.redirected && (!result.url || result.url === url) &&
          result.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() === "application/json" && result.body !== null)
        const length = result.headers.get("content-length"), encoding = result.headers.get("content-encoding")
        escrowCheck(length === null || /^(0|[1-9][0-9]{0,4})$/.test(length) && Number(length) <= 16384)
        escrowCheck(encoding === null || encoding === "identity")
        reader = result.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0, count = 0
        while (true) {
          escrowCheck(!stopped && !active.aborted && ++count <= 4096)
          const part = await reader.read(); escrowCheck(!stopped && !active.aborted)
          if (part.done) break
          escrowCheck(part.value instanceof Uint8Array); bytes += part.value.byteLength; escrowCheck(bytes <= 16384)
          chunks.push(part.value.slice())
        }
        escrowCheck(length === null || bytes === Number(length))
        const joined = new Uint8Array(bytes); let at = 0
        for (const chunk of chunks) { joined.set(chunk, at); at += chunk.byteLength }
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined)) as unknown
      }, AbortSignal.any([parent, signal]), deadline)
    } catch { throw Error("escrow_buyer_http_refused") }
    finally {
      stopped = true
      try { if (reader) void reader.cancel().catch(() => {}); else void response?.body?.cancel().catch(() => {}) } catch { /* Private response cleanup only. */ }
    }
  }
  const captured = (input: EscrowBuyerIntent, jobId: bigint, capability: unknown, body: string) => {
    const i = captureOriginalEscrowBuyerIntent(input); escrowBuyerUrl(i.call.resource)
    escrowCheck(escrowUint(jobId) > 0n)
    escrowCheck(typeof body === "string" && Buffer.byteLength(body) <= 131072)
    const parsed: unknown = JSON.parse(body), secret = escrowBytes32(capability, false)
    escrowCheck(docBytes(parsed) === body && hashJson(parsed) === i.call.inputHash &&
      escrowRequestDescription(i.call, i.client, i.expiredAt, secret) === i.description)
    return captureEscrowPayment({ x402Version: 2, accepted: i.requirements,
      payload: { jobId: jobId.toString(), capability: secret } })
  }
  return Object.freeze({
    /** Same-hub metadata is checked against LOCAL independent pins, never learned as trust. */
    async health(input: EscrowBuyerIntent, signal: AbortSignal) {
      try {
        const i = captureOriginalEscrowBuyerIntent(input), url = escrowBuyerUrl(i.call.resource)
        const raw = await read(`${url.origin}/healthz`, { method: "GET" }, 200, signal)
        const r = escrowRecord(raw, ["ok", "rail", "rails", "network", "erc8183"])
        escrowCheck(r.ok === true && r.network === "eip155:5042002" && (r.rail === "gateway" || r.rail === "eip3009") &&
          Array.isArray(r.rails) && r.rails.length <= 3 && new Set(r.rails).size === r.rails.length &&
          r.rails.every(rail => ["gateway", "eip3009", "erc8183"].includes(rail)) &&
          r.rails.includes(r.rail) && r.rails.includes("erc8183") &&
          JSON.stringify(captureEscrowIdentity(r.erc8183)) === JSON.stringify(i.identity))
      } catch { throw Error("escrow_buyer_http_refused") }
    },
    async budget(input: EscrowBuyerIntent, jobId: bigint, capability: unknown, body: string, signal: AbortSignal) {
      try {
        escrowCheck(!budgetAttempted); budgetAttempted = true
        const i = captureOriginalEscrowBuyerIntent(input), payment = captured(i, jobId, capability, body),
          payload = JSON.stringify({ input: JSON.parse(body), payment })
        escrowCheck(Buffer.byteLength(payload) <= 131072)
        const r = escrowRecord(await read(i.call.resource + "/escrow", { method: "POST", body: payload }, 200, signal),
          ["status", "jobId", "budget", "token", "escrow", "budgetTx", "fundBy"])
        escrowCheck(r.status === "budget_set" && r.jobId === jobId.toString() && r.budget === i.call.amount.toString() &&
          r.token === i.call.token && r.escrow === i.call.escrow && r.fundBy === i.fundBy)
        return Object.freeze({ budgetTx: escrowBytes32(r.budgetTx, false), fundBy: i.fundBy })
      } catch { throw Error("escrow_buyer_http_refused") }
    },
    async root(input: EscrowBuyerIntent, jobId: bigint, capability: unknown, body: string, signal: AbortSignal) {
      try {
        escrowCheck(!rootAttempted); rootAttempted = true
        const i = captureOriginalEscrowBuyerIntent(input), payment = captured(i, jobId, capability, body)
        escrowCheck(Buffer.byteLength(body) <= 131072)
        const r = escrowRecord(await read(i.call.resource, { method: "POST", body,
          headers: { "payment-signature": encodeEscrowHeader(payment) } }, 202, signal),
        ["job_id", "status", "job_token", "price", "poll_url"])
        escrowCheck(typeof r.job_id === "string" && /^job_[a-f0-9]{32}$/.test(r.job_id) && r.status === "queued" &&
          typeof r.job_token === "string" && /^[a-f0-9]{32}$/.test(r.job_token) && r.price === formatPrice(i.call.amount) &&
          r.poll_url === `${new URL(i.call.resource).origin}/jobs/${r.job_id}/result?token=${r.job_token}`)
        const accepted = Object.freeze({ jobId: r.job_id, token: r.job_token, pollUrl: r.poll_url as string })
        return Object.freeze({ accepted, response: () => Response.json({ job_id: accepted.jobId, status: "queued",
          job_token: accepted.token, price: r.price, poll_url: accepted.pollUrl }, { status: 202, headers: { "cache-control": "private, no-store" } }) })
      } catch { throw Error("escrow_buyer_http_refused") }
    }
  })
}
