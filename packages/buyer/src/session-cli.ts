/** Thin, funding-independent adapter over the frozen F9 Promise API. */
import { Schema } from "effect"
import { SessionReceipt, loadChainConfig } from "@arcade/core"
import type { Account } from "viem"
import { openSessionPromise, type BuyerSessionPromise, type SessionReceiptJson } from "./session.ts"
import { captureFundingAuthority, parseFundingAmount, parseFundingUint } from "./gateway-funding.ts"
import { captureCliArgv, type FundingCliContext } from "./gateway-funding-cli.ts"

class SessionCliFailure extends Error { constructor() { super("session_input_invalid") } }
const invalid = (): never => { throw new SessionCliFailure() }
const jsonData = (input: unknown): unknown => {
  let count = 0, bytes = 0; const seen = new Set<object>(), encoder = new TextEncoder()
  const copy = (v: unknown, depth: number): unknown => {
    if (++count > 65536 || depth > 32) return invalid()
    if (v === null || typeof v === "boolean" || typeof v === "number" && Number.isFinite(v)) return v
    if (typeof v === "string") { if (v.length > 1048576 || (bytes += encoder.encode(v).byteLength) > 1048576) return invalid(); return v }
    if (!v || typeof v !== "object" || seen.has(v)) return invalid()
    const array = Array.isArray(v)
    if (!array && ![null, Object.prototype].includes(Object.getPrototypeOf(v))) return invalid()
    const keys = Reflect.ownKeys(v); if (keys.length > 65536 || array && keys.length !== v.length + 1) return invalid()
    seen.add(v); const out: Record<string, unknown> = array ? [] as unknown as Record<string, unknown> : Object.create(null)
    for (const key of keys) {
      if (array && key === "length") continue
      if (typeof key !== "string" || key === "__proto__" || key === "__bigint" || array && !/^(0|[1-9][0-9]*)$/.test(key)) return invalid()
      const d = Object.getOwnPropertyDescriptor(v, key)
      if (!d || !d.enumerable || !("value" in d)) return invalid()
      copy(key, depth + 1); out[key] = copy(d.value, depth + 1)
    }
    seen.delete(v); return Object.freeze(out)
  }
  const out = copy(input, 0)
  if (encoder.encode(JSON.stringify(out)).byteLength > 1048576) return invalid()
  return out
}
export interface SessionCliCommand {
  readonly hubUrl: string; readonly address: `0x${string}`; readonly budgetUsd: string; readonly budgetAtomic: bigint
  readonly calls: number; readonly seller: string; readonly skillId: string; readonly rail: "gateway" | "eip3009" | "test"
  readonly input: Readonly<Record<string, unknown>>
}
export const parseSessionCommand = (raw: readonly string[]): SessionCliCommand => {
  try {
    if (!Array.isArray(raw) || raw.length !== 17 || Reflect.ownKeys(raw).length !== raw.length + 1) return invalid()
    const args: string[] = []
    for (let i = 0; i < raw.length; i++) { const d = Object.getOwnPropertyDescriptor(raw, String(i)); if (!d || !("value" in d) || typeof d.value !== "string" || d.value.length > 1048576) return invalid(); args.push(d.value) }
    if (args[0] !== "session") return invalid()
    const flags: Record<string, string> = Object.create(null), allowed = ["--hub", "--address", "--budget", "--calls", "--seller", "--skill", "--rail", "--input"]
    // Eight mandatory pairs, plus no implicit flag or destination defaults.
    for (let i = 1; i < args.length; i += 2) {
      const key = args[i]!, value = args[i + 1]!
      if (!allowed.includes(key) || Object.hasOwn(flags, key) || typeof value !== "string" || value === "" || value.startsWith("--")) return invalid()
      flags[key] = value
    }
    if (Object.keys(flags).length !== allowed.length) return invalid()
    const url = new URL(flags["--hub"]!), hubUrl = flags["--hub"]!
    if (hubUrl.length > 2048 || hubUrl !== url.origin || /[\s\\%?#]/.test(hubUrl) || url.username || url.password ||
      url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname))) return invalid()
    const address = captureFundingAuthority(flags["--address"]).account, budgetUsd = flags["--budget"]!, budgetAtomic = parseFundingAmount(budgetUsd), count = parseFundingUint(flags["--calls"])
    const seller = flags["--seller"]!, skillId = flags["--skill"]!, rail = flags["--rail"]!
    if (budgetAtomic === 0n || count < 1n || count > 100n || !/^[a-z0-9-]{1,32}$/.test(seller) || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(skillId) || !["gateway", "eip3009", "test"].includes(rail)) return invalid()
    const input = jsonData(JSON.parse(flags["--input"]!))
    if (!input || typeof input !== "object" || Array.isArray(input)) return invalid()
    return Object.freeze({ hubUrl, address, budgetUsd, budgetAtomic, calls: Number(count), seller, skillId, rail: rail as SessionCliCommand["rail"], input: input as Readonly<Record<string, unknown>> })
  } catch { return invalid() }
}
export interface SessionCliPublic { readonly status: "closed" | "uncertain" | "refused" | "observed"; readonly completedCalls: number;
  readonly sessionId?: string; readonly receipt?: SessionReceiptJson; readonly closed?: boolean }
export interface SessionCliDependencies {
  readonly signal: AbortSignal; readonly deadlineMs: number
  readonly acquireAccount: (signal: AbortSignal) => Promise<Account>
  readonly open?: typeof openSessionPromise
}
const captureCommand = (command: SessionCliCommand): SessionCliCommand => {
  if (!command || typeof command !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(command))) return invalid()
  const names = ["hubUrl", "address", "budgetUsd", "budgetAtomic", "calls", "seller", "skillId", "rail", "input"]
  const values: Record<string, unknown> = Object.create(null), keys = Reflect.ownKeys(command)
  if (keys.length !== names.length) return invalid()
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(command, key)
    if (typeof key !== "string" || !names.includes(key) || !d || !d.enumerable || !("value" in d)) return invalid()
    values[key] = d.value
  }
  for (const key of ["hubUrl", "address", "budgetUsd", "seller", "skillId", "rail"]) if (typeof values[key] !== "string") return invalid()
  if (typeof values.calls !== "number" || !Number.isSafeInteger(values.calls) || values.calls < 1 || values.calls > 100 || typeof values.budgetAtomic !== "bigint") return invalid()
  const input = jsonData(values.input)
  const captured = parseSessionCommand(["session", "--hub", values.hubUrl as string, "--address", values.address as string, "--budget", values.budgetUsd as string,
    "--calls", String(values.calls), "--seller", values.seller as string, "--skill", values.skillId as string, "--rail", values.rail as string, "--input", JSON.stringify(input)])
  if (captured.budgetAtomic !== values.budgetAtomic) return invalid()
  return captured
}
const readyChain = () => {
  const chain = loadChainConfig()
  if (chain.status !== "ready" || chain.id !== "arc-testnet" || chain.chainId !== 5042002 || chain.caip2 !== "eip155:5042002") return invalid()
  return chain
}
/** No transport, key or funding work at construction; retained capability is closure-only. */
export const createSessionCliController = (command: SessionCliCommand, dependencies: SessionCliDependencies) => {
  const { signal: parentSignal, deadlineMs, acquireAccount } = dependencies, open = dependencies.open ?? openSessionPromise
  const stop = new AbortController(), signal = stop.signal
  const c = captureCommand(command), chain = readyChain()
  if (c.rail === "gateway" && chain.gateway === null) return invalid()
  let used = false, openingAttempted = false, completedCalls = 0, handle: BuyerSessionPromise | undefined, publishedId: string | undefined, closeUnknown = false, closed: SessionReceiptJson | undefined
  const jobs = new Map<string, bigint>()
  const active = () => { if (parentSignal.aborted || signal.aborted || !Number.isFinite(deadlineMs) || performance.now() >= deadlineMs) { stop.abort(); throw new SessionCliFailure() } }
  const bounded = async <T>(work: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined, abort: (() => void) | undefined
    try { return await Promise.race([work, new Promise<never>((_, reject) => {
      abort = () => { stop.abort(); reject(new SessionCliFailure()) }; parentSignal.addEventListener("abort", abort, { once: true })
      timer = setTimeout(abort, Math.max(1, deadlineMs - performance.now())); if (parentSignal.aborted || signal.aborted) abort()
    })]) } finally { if (timer !== undefined) clearTimeout(timer); if (abort) parentSignal.removeEventListener("abort", abort) }
  }
  const result = (status: SessionCliPublic["status"], receipt?: SessionReceiptJson): SessionCliPublic => Object.freeze({ status, completedCalls,
    ...(publishedId ? { sessionId: publishedId } : {}), ...(receipt ? { receipt } : {}) })
  const receipt = (raw: SessionReceiptJson): SessionReceiptJson => {
    const r = jsonData(raw) as SessionReceiptJson
    const issued = [...jobs.entries()]
    if (!handle || !r || r.sessionId !== publishedId || r.buyer !== c.address || r.rail !== c.rail || r.network !== chain.caip2 || parseFundingUint(r.budgetAtomic) !== c.budgetAtomic ||
      !Array.isArray(r.calls) || r.calls.length !== jobs.size || r.settledCalls !== jobs.size ||
      r.calls.some((call, i) => call.jobId !== issued[i]?.[0] || call.skillId !== c.skillId || call.state !== "settled" || !call.settled || parseFundingUint(call.priceAtomic) !== issued[i]?.[1]) ||
      parseFundingUint(r.spentAtomic) !== issued.reduce((sum, [, amount]) => sum + amount, 0n)) return invalid()
    Schema.decodeUnknownSync(SessionReceipt)({ ...r, budgetAtomic: parseFundingUint(r.budgetAtomic), spentAtomic: parseFundingUint(r.spentAtomic), heldAtomic: parseFundingUint(r.heldAtomic),
      calls: r.calls.map(call => ({ ...call, priceAtomic: parseFundingUint(call.priceAtomic) })) }, { onExcessProperty: "error" })
    return r
  }
  const run = async (): Promise<SessionCliPublic> => {
    if (used) return result("refused"); used = true
    try {
      active(); const account = await bounded(acquireAccount(signal)); active()
      if (typeof account.address !== "string" || account.address.toLowerCase() !== c.address) return result("refused")
      openingAttempted = true
      handle = await bounded(open({ hubUrl: c.hubUrl, account, budgetUsd: c.budgetUsd, rail: c.rail }, { signal })); active()
      if (typeof handle.id !== "string" || handle.id.length !== 36 || !/^ses_[a-f0-9]{32}$/.test(handle.id) || handle.buyer !== c.address || handle.rail !== c.rail || handle.network !== chain.caip2 || handle.budgetAtomic !== c.budgetAtomic) return result("uncertain")
      publishedId = handle.id
      for (let i = 0; i < c.calls; i++) {
        active()
        const out = await bounded(handle.call({ seller: c.seller, skillId: c.skillId, input: c.input, maxAmountAtomic: c.budgetAtomic,
          maxWaitMs: Math.min(300000, Math.max(1, Math.floor(deadlineMs - performance.now()))) }, { signal })); active()
        if (typeof out.jobId !== "string" || out.jobId.length < 20 || out.jobId.length > 132 || !/^job_[A-Za-z0-9]{16,128}$/.test(out.jobId) || jobs.has(out.jobId) || typeof out.authorizedAmountAtomic !== "bigint" || out.authorizedAmountAtomic <= 0n || out.authorizedAmountAtomic > c.budgetAtomic) return result("uncertain")
        jobs.set(out.jobId, out.authorizedAmountAtomic); completedCalls++
        if (out.status !== "succeeded" || out.receipt.settled !== true) return result("uncertain")
      }
      active(); closeUnknown = true
      closed = receipt(await bounded(handle.close({ signal }))); active(); closeUnknown = false
      return result("closed", closed)
    } catch { return result(openingAttempted ? "uncertain" : "refused") }
  }
  const status = async (): Promise<SessionCliPublic> => {
    if (!handle) return result("refused")
    try { active(); const observed = await bounded(handle.status({ signal })); active()
      if (typeof observed.closed !== "boolean") return result("uncertain")
      return Object.freeze({ ...result("observed"), closed: observed.closed })
    } catch { return result("uncertain") }
  }
  const recoverClosed = async (): Promise<SessionCliPublic> => {
    if (closed) return result("closed", closed)
    if (!closeUnknown || !handle) return result("refused")
    try { active(); const observed = await bounded(handle.status({ signal })); active()
      if (!observed.closed || !observed.closedReceipt) return result("uncertain")
      closed = receipt(observed.closedReceipt); closeUnknown = false; return result("closed", closed)
    } catch { return result("uncertain") }
  }
  return Object.freeze({ run, status, recoverClosed })
}

export const sessionMain = async (raw: readonly string[], context: FundingCliContext): Promise<number> => {
  const write = context.write ?? ((line: string, error: boolean): Promise<void> => new Promise((resolve, reject) => {
    ;(error ? process.stderr : process.stdout).write(`${line}\n`, failure => failure ? reject(failure) : resolve())
  }))
  let timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined, abort: (() => void) | undefined
  try {
    const args = captureCliArgv(raw)
    if (args.length === 2 && args[0] === "session" && args[1] === "--help") {
      await write("session --hub ORIGIN --address ADDRESS --budget USDC --calls COUNT --skill ID --seller SERVICE_NAME --rail gateway|eip3009|test --input JSON\nNo implicit funding. Uncertainty stops the batch without close or retry. Process exit loses the private capability.", false); return 0
    }
    const command = parseSessionCommand(args), timeout = context.timeoutMs ?? 300000
    if (context.role !== "buyer" || context.env["ARCADE_NETWORK"] !== undefined && context.env["ARCADE_NETWORK"] !== "arc-testnet" || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300000) return invalid()
    readyChain()
    controller = new AbortController(); const signal = controller.signal, deadlineMs = performance.now() + timeout
    abort = () => controller!.abort(); context.signal?.addEventListener("abort", abort, { once: true }); if (context.signal?.aborted) abort(); timer = setTimeout(abort, timeout)
    const session = createSessionCliController(command, { signal, deadlineMs, acquireAccount: async () => {
      if (signal.aborted) return invalid()
      const key = context.env["ARCADE_BUYER_KEY"]
      if (typeof key !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(key)) return invalid()
      const { privateKeyToAccount } = await import("viem/accounts"); if (signal.aborted) return invalid()
      return privateKeyToAccount(key as `0x${string}`)
    } })
    const outcome = await session.run(); await write(JSON.stringify(outcome), false)
    return outcome.status === "closed" ? 0 : 1
  } catch { await write("session_input_invalid: no automatic retry or funding", true); return 2 }
  finally { controller?.abort(); if (timer !== undefined) clearTimeout(timer); if (abort) context.signal?.removeEventListener("abort", abort) }
}
