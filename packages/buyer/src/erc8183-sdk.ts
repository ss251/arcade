/** Explicit escrow SDK authority. Browser-safe imports; private storage is caller-owned. */
import { Effect } from "effect"
import { docBytes, hashJson, loadChainConfig, parsePrice, RpcFailure } from "@arcade/core"
import type { Account } from "viem"
import { toHex } from "viem"
import type { PaymentRequirements } from "@arcade/payments"
import { createEscrowBuyerDriver } from "../../payments/src/erc8183-buyer-driver.ts"
import { createEscrowBuyerChain } from "../../payments/src/erc8183-buyer-chain.ts"
import type { openEscrowBuyerJournal } from "../../payments/src/erc8183-buyer-journal.ts"
import { captureEscrowIdentity } from "../../payments/src/erc8183-reader.ts"
import { captureEscrowCall, type EscrowCall } from "../../payments/src/erc8183-request.ts"
import { captureEscrowRequirements } from "../../payments/src/erc8183-wire.ts"
import { escrowAddress, escrowCheck, escrowRecord, escrowSeconds, escrowUint } from "../../payments/src/erc8183-codec.ts"
import { escrowBuyerUrl } from "../../payments/src/erc8183-buyer-http.ts"
import { boundEscrowIO } from "../../payments/src/erc8183-rpc.ts"
export interface EscrowPurchaseConfig {
  /** Independent local pins, never copied from the hub's health/402 response. */
  readonly identity: unknown; readonly gasBudgetWei: bigint; readonly expiresInSeconds: number; readonly operationTimeoutMs: number
  readonly journal: ReturnType<typeof openEscrowBuyerJournal>["journal"]
  /** Explicit transport/clock injection for owned offline fixtures; not config-file fields. */
  readonly rpcFetch?: typeof globalThis.fetch; readonly nowSeconds?: () => number
}
export interface EscrowFetchConfig extends EscrowPurchaseConfig { readonly call: EscrowCall }
export type EscrowPurchaseEvidence = Awaited<ReturnType<ReturnType<typeof createEscrowBuyerDriver>["execute"]>>["evidence"]
export function captureEscrowPurchaseConfig(input: EscrowPurchaseConfig): EscrowPurchaseConfig {
  const r = escrowRecord(input, ["identity", "gasBudgetWei", "expiresInSeconds", "operationTimeoutMs", "journal",
    ...["rpcFetch", "nowSeconds"].filter(key => Object.hasOwn(input, key))]),
    identity = captureEscrowIdentity(r.identity), gasBudgetWei = escrowUint(r.gasBudgetWei), expiresInSeconds = escrowSeconds(r.expiresInSeconds),
    timeout = r.operationTimeoutMs, journal = r.journal as EscrowPurchaseConfig["journal"]
  escrowCheck(gasBudgetWei > 0n && expiresInSeconds >= 601 && typeof timeout === "number" && Number.isSafeInteger(timeout) && timeout > 0 && timeout <= 300000 &&
    journal?.durability === "durable" && (r.rpcFetch === undefined || typeof r.rpcFetch === "function") &&
    (r.nowSeconds === undefined || typeof r.nowSeconds === "function"))
  return Object.freeze({ identity, gasBudgetWei, expiresInSeconds, operationTimeoutMs: timeout, journal: Object.freeze({ ...journal }),
    ...(r.rpcFetch === undefined ? {} : { rpcFetch: r.rpcFetch as typeof globalThis.fetch }),
    ...(r.nowSeconds === undefined ? {} : { nowSeconds: r.nowSeconds as () => number }) })
}
export function captureEscrowFetchConfig(input: EscrowFetchConfig): EscrowFetchConfig {
  const r = escrowRecord(input, ["identity", "gasBudgetWei", "expiresInSeconds", "operationTimeoutMs", "journal", "call",
    ...["rpcFetch", "nowSeconds"].filter(key => Object.hasOwn(input, key))]), { call, ...config } = r
  return Object.freeze({ ...captureEscrowPurchaseConfig({ ...config } as unknown as EscrowPurchaseConfig), call: captureEscrowCall(call) })
}
export function assertEscrowSdkRequest(config: EscrowFetchConfig, url: string, body: unknown) {
  escrowBuyerUrl(url)
  escrowCheck(url === config.call.resource && typeof body === "string" && Buffer.byteLength(body) <= 131072)
  const parsed: unknown = JSON.parse(body)
  escrowCheck(docBytes(parsed) === body && hashJson(parsed) === config.call.inputHash)
}
/** Bounded body read used only by the opt-in escrow probe/listing lane. */
export async function readEscrowSdkJson(response: Response, signal: AbortSignal, deadlineMs: number): Promise<unknown> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    return await boundEscrowIO(async active => {
      const length = response.headers.get("content-length"), encoding = response.headers.get("content-encoding")
      escrowCheck(!response.redirected && response.body !== null && response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() === "application/json" &&
        (length === null || /^(0|[1-9][0-9]{0,5})$/.test(length) && Number(length) <= 131072) && (encoding === null || encoding === "identity"))
      reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0, count = 0
      while (true) {
        escrowCheck(!active.aborted && ++count <= 4096)
        const part = await reader.read(); escrowCheck(!active.aborted); if (part.done) break
        escrowCheck(part.value instanceof Uint8Array); size += part.value.byteLength; escrowCheck(size <= 131072); chunks.push(part.value.slice())
      }
      escrowCheck(length === null || size === Number(length)); const bytes = new Uint8Array(size); let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown
    }, signal, deadlineMs)
  } catch { throw Error("escrow_sdk_refused") }
  finally { try { if (reader) void reader.cancel().catch(() => {}); else void response.body?.cancel().catch(() => {}) } catch { /* Fixed diagnostics only. */ } }
}
/** Fetch and consume while the same signal remains live. Returning the original
 * response after its bounded scope aborts would truncate the later body read. */
export async function fetchEscrowSdkProbe(url: string, init: RequestInit, fetch: typeof globalThis.fetch, signal: AbortSignal) {
  const deadline = performance.now() + 5000; let response: Response | undefined, stopped = false
  try {
    return await boundEscrowIO(async active => {
      const r = await fetch(url, { ...init, signal: active }); response = r
      if (stopped || active.aborted) { void r.body?.cancel().catch(() => {}); throw Error() }
      escrowCheck(!r.url || r.url === url)
      const body = await readEscrowSdkJson(r, active, deadline)
      return Response.json(body, { status: r.status, headers: { "cache-control": "private, no-store" } })
    }, signal, deadline)
  } catch { throw Error("escrow_sdk_refused") }
  finally { stopped = true; try { void response?.body?.cancel().catch(() => {}) } catch { /* Fixed diagnostics only. */ } }
}
const own = (raw: unknown, key: string): unknown => {
  escrowCheck(raw && typeof raw === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(raw)))
  const d = Object.getOwnPropertyDescriptor(raw, key); escrowCheck(d && d.enumerable && "value" in d); return d.value
}
/** Public listing fields are independent of the echoed402, but remain hub assertions.
 * Identity pins and registry/chain selection come from local configuration. */
export function captureEscrowListingCall(raw: unknown, resource: string, body: string, config: EscrowPurchaseConfig): EscrowCall {
  const url = escrowBuyerUrl(resource), identity = captureEscrowIdentity(config.identity), local = loadChainConfig(),
    id = own(raw, "id"), version = own(raw, "version"), seller = escrowAddress(own(raw, "seller")), price = own(raw, "price"),
    rails = own(raw, "rails"), evidence = own(raw, "erc8004"), agentId = own(evidence, "agentId")
  escrowCheck(typeof id === "string" && url.pathname === `/x/${seller}/${id}` && typeof price === "string" && price.length <= 88 &&
    /^\$?(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(price) && own(raw, "delisted") === false &&
    Array.isArray(rails) && rails.length <= 3 && new Set(rails).size === rails.length && rails.includes("erc8183") &&
    rails.every(r => ["gateway", "eip3009", "erc8183"].includes(r)) && local.status === "ready" && local.chainId === 5042002 &&
    local.erc8004 !== undefined && own(evidence, "chain") === local.caip2 && own(evidence, "verified") === true &&
    escrowAddress(own(evidence, "registry")) === local.erc8004.identity.toLowerCase() && typeof agentId === "string" && /^[1-9][0-9]{0,77}$/.test(agentId))
  escrowCheck(typeof body === "string" && Buffer.byteLength(body) <= 131072)
  const input: unknown = JSON.parse(body); escrowCheck(docBytes(input) === body)
  return captureEscrowCall({ chainId: 5042002, escrow: identity.escrow, hook: identity.hook, evaluator: identity.evaluator, token: identity.token,
    resource, method: "POST", provider: seller, providerAgentId: escrowUint(BigInt(agentId)), amount: parsePrice(price), skillId: id,
    skillVersion: version, timeoutSeconds: own(own(raw, "bounds"), "timeoutSec"), inputHash: hashJson(input) })
}
export async function readEscrowListingCall(resource: string, body: string, config: EscrowPurchaseConfig, fetch: typeof globalThis.fetch, signal: AbortSignal) {
  const pinned = captureEscrowPurchaseConfig(config), url = escrowBuyerUrl(resource), target = `${url.origin}/listings/${url.pathname.split("/")[3]}`,
    deadline = performance.now() + 30000
  let response: Response | undefined, stopped = false
  try {
    // The existing detail endpoint may spend5s on ownerOf and16s on reputation.
    // This bounds unsigned public discovery, not payment validity or an RPC retry.
    const raw = await boundEscrowIO(async active => {
      const r = await fetch(target, { redirect: "error", credentials: "omit", signal: active,
        headers: { accept: "application/json", "accept-encoding": "identity" } }); response = r
      if (stopped || active.aborted) { void r.body?.cancel().catch(() => {}); throw Error() }
      escrowCheck(r.status === 200 && (!r.url || r.url === target))
      return readEscrowSdkJson(r, active, deadline)
    }, signal, deadline, 30000)
    return captureEscrowListingCall(raw, resource, body, pinned)
  } catch { throw Error("escrow_sdk_refused") }
  finally { stopped = true; try { void response?.body?.cancel().catch(() => {}) } catch { /* Private cleanup only. */ } }
}
export function escrowSdkPurchase(args: {
  readonly config: EscrowFetchConfig; readonly requirements: PaymentRequirements; readonly account: Account; readonly body: string
  readonly maxAmountAtomic: bigint; readonly fetch: typeof globalThis.fetch; readonly signal?: AbortSignal | null
  readonly beforeSign?: (requirements: PaymentRequirements) => string | null
}) {
  return Effect.async<{ response: Response; evidence: EscrowPurchaseEvidence }, RpcFailure>((resume, interrupted) => {
    const signal = args.signal ? AbortSignal.any([args.signal, interrupted]) : interrupted
    const task = (async () => {
      const config = captureEscrowFetchConfig(args.config), call = config.call,
        requirements = captureEscrowRequirements(args.requirements).requirements, nowSeconds = config.nowSeconds ?? (() => Math.floor(Date.now() / 1000)),
        deadlineMs = performance.now() + config.operationTimeoutMs, account = args.account, signTransaction = account.signTransaction,
        client = account.address, body = args.body, maxAmountAtomic = escrowUint(args.maxAmountAtomic), fetch = args.fetch, beforeSign = args.beforeSign
      escrowCheck(signTransaction !== undefined && !signal.aborted)
      const status = await boundEscrowIO(() => config.journal.inspect(), signal, deadlineMs)
      escrowCheck(status.state === "empty") // Never generate a new capability for a used logical-purchase file.
      const capability = toHex(crypto.getRandomValues(new Uint8Array(32))), source = {
        identity: config.identity, call, requirements, client, issuedAt: escrowSeconds(nowSeconds()),
        expiresInSeconds: config.expiresInSeconds, capability, maxAmountAtomic, gasBudgetWei: config.gasBudgetWei
      }
      const driver = createEscrowBuyerDriver({ signal, deadlineMs, nowSeconds, journal: config.journal, fetch,
        beforeSign: () => beforeSign === undefined ? null : beforeSign(requirements),
        chain: (kind, intent) => createEscrowBuyerChain({ kind, intent, signal, deadlineMs, nowSeconds,
          ...(config.rpcFetch === undefined ? {} : { fetch: config.rpcFetch }), acquireSigner: async active => {
            escrowCheck(!active.aborted)
            return { address: client, signTransaction: transaction => signTransaction.call(account, transaction) }
          } }) })
      return driver.execute(source, body)
    })()
    task.then(result => resume(Effect.succeed(result)), () => resume(Effect.fail(new RpcFailure({ method: "escrow",
      reason: "Escrow purchase refused or uncertain; gas or funds may have moved. Retain the private journal and reconcile before retrying." }))))
    // Effect interruption aborts the signal, then JOINS bounded driver cleanup.
    // Closing caller-owned SQLite before this finishes would lose reconciliation state.
    return Effect.promise(async () => { await task.catch(() => {}) })
  })
}
