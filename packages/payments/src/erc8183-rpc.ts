/** Fixed Arc testnet JSON-RPC transport; private signed request bodies are never logged. */
import type { Hex } from "viem"
import { escrowCheck, escrowRecord } from "./erc8183-codec.ts"
export const ESCROW_RPC_URL = "https://rpc.testnet.arc.network"
const READ = new Set(["eth_chainId", "eth_getBlockByNumber", "eth_getCode", "eth_getStorageAt", "eth_call",
  "eth_getBalance", "eth_getTransactionReceipt", "eth_getTransactionByHash", "eth_getTransactionCount", "eth_estimateGas", "eth_gasPrice"])
export interface EscrowRpcOptions {
  readonly signal: AbortSignal; readonly deadlineMs: number; readonly fetch?: typeof fetch
}
/** A timeout also races uncooperative injected IO. Its late result has no authority. */
export async function boundEscrowIO<T>(work: (signal: AbortSignal) => Promise<T>, signal: AbortSignal,
  deadlineMs: number, maximumMs = 5000): Promise<T> {
  const controller = new AbortController(), active = AbortSignal.any([signal, controller.signal])
  const end = Math.min(deadlineMs, performance.now() + maximumMs)
  let timer: ReturnType<typeof setTimeout> | undefined, stopped: (() => void) | undefined
  try {
    escrowCheck(!active.aborted && Number.isFinite(end) && end > performance.now())
    const abort = new Promise<never>((_, reject) => {
      stopped = () => reject(Error("escrow_chain_refused"))
      active.addEventListener("abort", stopped, { once: true })
      timer = setTimeout(() => controller.abort(), Math.max(0, end - performance.now()))
    })
    const value = await Promise.race([Promise.resolve().then(() => {
      escrowCheck(!active.aborted && performance.now() < end); return work(active)
    }), abort])
    escrowCheck(!active.aborted && performance.now() < end); return value
  } catch { throw Error("escrow_chain_refused") }
  finally { if (timer !== undefined) clearTimeout(timer); if (stopped) active.removeEventListener("abort", stopped); controller.abort() }
}
export function createEscrowRpc(options: EscrowRpcOptions) {
  const fetch = options.fetch ?? globalThis.fetch, deadlineMs = options.deadlineMs, parent = options.signal
  escrowCheck(Number.isFinite(deadlineMs) && deadlineMs > performance.now() && deadlineMs <= performance.now() + 300000)
  let count = 0, sent = false
  async function wire(method: string, params: readonly unknown[], signal: AbortSignal, send: boolean) {
    let response: Response | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined, finished = false
    try {
      escrowCheck(++count <= 400 && (send ? method === "eth_sendRawTransaction" : READ.has(method)))
      const id = count, body = JSON.stringify({ jsonrpc: "2.0", id, method, params })
      escrowCheck(Buffer.byteLength(body) <= 131072)
      const json = await boundEscrowIO(async active => {
        const result = await fetch(ESCROW_RPC_URL, { method: "POST", body, credentials: "omit", redirect: "error", signal: active,
          headers: { accept: "application/json", "content-type": "application/json", "accept-encoding": "identity" } })
        response = result
        if (finished || active.aborted) {
          try { void result.body?.cancel().catch(() => {}) } catch { /* Late response cleanup only. */ }
          throw Error("escrow_chain_refused")
        }
        escrowCheck(result.ok && !result.redirected && (!result.url || result.url === new URL(ESCROW_RPC_URL).href) &&
          result.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() === "application/json")
        const length = result.headers.get("content-length"), encoding = result.headers.get("content-encoding")
        escrowCheck(length === null || /^(0|[1-9][0-9]{0,6})$/.test(length) && Number(length) <= 262144)
        escrowCheck((encoding === null || encoding === "identity") && result.body !== null)
        reader = result.body.getReader()
        const chunks: Uint8Array[] = []; let bytes = 0, empty = 0
        while (true) {
          escrowCheck(!finished && !active.aborted && performance.now() < deadlineMs)
          const chunk = await reader.read()
          escrowCheck(!finished && !active.aborted && performance.now() < deadlineMs)
          if (chunk.done) break
          escrowCheck(chunk.value instanceof Uint8Array)
          if (chunk.value.byteLength === 0) { escrowCheck(++empty <= 1024); continue }
          empty = 0; bytes += chunk.value.byteLength; escrowCheck(bytes <= 262144); chunks.push(chunk.value.slice())
        }
        escrowCheck(length === null || bytes === Number(length))
        const combined = new Uint8Array(bytes); let at = 0
        for (const chunk of chunks) { combined.set(chunk, at); at += chunk.byteLength }
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(combined)) as unknown
      }, AbortSignal.any([parent, signal]), deadlineMs)
      const envelope = escrowRecord(json, ["jsonrpc", "id", "result"])
      escrowCheck(envelope.jsonrpc === "2.0" && envelope.id === id)
      const result = envelope.result
      if (["eth_chainId", "eth_getBalance", "eth_getTransactionCount", "eth_estimateGas", "eth_gasPrice"].includes(method)) {
        escrowCheck(typeof result === "string" && /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/.test(result))
      } else if (method === "eth_getCode" || method === "eth_call") {
        escrowCheck(typeof result === "string" && /^0x(?:[0-9a-fA-F]{2}){0,65535}$/.test(result))
      } else if (method === "eth_getStorageAt" || send) {
        escrowCheck(typeof result === "string" && /^0x[0-9a-fA-F]{64}$/.test(result))
      }
      return result
    } catch { throw Error("escrow_chain_refused") }
    finally {
      finished = true
      try { if (reader) void reader.cancel().catch(() => {}); else void response?.body?.cancel().catch(() => {}) } catch { /* Fixed diagnostics only. */ }
    }
  }
  return Object.freeze({
    read: (method: string, params: readonly unknown[], signal: AbortSignal) => wire(method, params, signal, false),
    async send(raw: Hex, signal: AbortSignal) {
      if (sent || !/^0x02(?:[0-9a-fA-F]{2}){1,65500}$/.test(raw)) throw Error("escrow_chain_refused")
      sent = true // Fence before dispatch, including canceled or unknown outcomes.
      return wire("eth_sendRawTransaction", [raw], signal, true)
    }
  })
}
