#!/usr/bin/env bun
/** Compose two paid broker facts without ever receiving a spending key.
 * Importing this module performs no environment, stdin, stdout, timer or network IO. */
import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage } from "node:http"
import { assessAddressSchemaOk, copyPlainData, plainObject, uint } from "../counterparty-graph/validate-output.ts"
import type { Assessment } from "../counterparty-graph/synthesize.ts"

const INPUT_ERROR = "Wallet Risk Note input refused"
const GRANT_ERROR = "Wallet Risk Note hire grant unavailable"
const EVIDENCE_ERROR = "Wallet Risk Note could not establish paid evidence; settlement refused"
const BROKER_ERROR = "Wallet Risk Note broker unavailable"
const FLOW_SKILL = "usdc-flow-check", GRAPH_SKILL = "counterparty-graph"
const PARENT_BUDGET = 80_000n, FLOW_COST = 10_000n, GRAPH_COST = 50_000n
// G12 caps its compact output at 256 KiB, but the broker also includes a pretty-printed,
// JSON-escaped fence. Four MiB covers that bounded duplication without accepting an open stream.
const FLOW_TIMEOUT_MS = 32_000, GRAPH_TIMEOUT_MS = 92_000, RESPONSE_BYTES = 4_194_304
const SUBGRAPH = "43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb"
const ENDPOINT = `https://gateway.thegraph.com/api/x402/subgraphs/id/${SUBGRAPH}`
const MAX_UINT = (1n << 256n) - 1n

type FlowVerdict = "ok" | "caution" | "unfunded"
export interface CounterpartySummary {
  readonly verdict: "manual-review" | "refuse"
  readonly contradictions: ReadonlyArray<string>
  readonly attesterSettledCount: 0
}
export interface HireGrant { readonly socketPath: string; readonly jobId: string; readonly token: string }
export interface HireCall {
  readonly grant: HireGrant
  readonly skillId: typeof FLOW_SKILL | typeof GRAPH_SKILL
  readonly input: { readonly address: string }
  readonly maxAmountUsd: 0.01 | 0.05
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}
export interface WalletOutput {
  readonly address: string
  readonly verdict: FlowVerdict
  readonly findings: ReadonlyArray<string>
  readonly balanceUsdc: string
  readonly isContract: boolean
  readonly everTransacted: boolean
  readonly counterparty: CounterpartySummary | null
  readonly sourcedFrom: {
    readonly skillId: typeof FLOW_SKILL
    readonly paidUsdc: "$0.0100"
    readonly budgetLeftUsd: string
    readonly counterpartyGraph: null | {
      readonly skillId: typeof GRAPH_SKILL
      readonly paidUsdc: "$0.0500"
      readonly evidenceUsed: true
    }
  }
}
export type WalletEnvelope = { readonly stopReason: "refusal"; readonly error: string } |
  { readonly stopReason: "end_turn"; readonly output: WalletOutput }
interface WalletJobDependencies {
  readonly hire?: (call: HireCall) => Promise<unknown>
  readonly signal?: AbortSignal
  readonly now?: () => number
}
interface FlowCheck {
  readonly address: string; readonly balanceUsdc: string; readonly balanceAtomic: string
  readonly nonce: number; readonly isContract: boolean; readonly chainId: 5_042_002
  readonly blockNumber: string; readonly checkedAt: string
}
interface BrokerBody {
  readonly skillId: string; readonly jobId: string; readonly settled: boolean; readonly result: unknown
  readonly fenced: string; readonly costAtomic: bigint; readonly remainingAtomic: bigint
}
type TrustedAssessment = Assessment & { readonly verdict: "manual-review" | "refuse"; readonly attesterSettledCount: 0 }

const refusal = (error: string): WalletEnvelope => ({ stopReason: "refusal", error })
const closed = (v: unknown, keys: readonly string[]): v is Record<string, unknown> =>
  plainObject(v) && keys.every(key => Object.hasOwn(v, key)) && Object.keys(v).every(key => keys.includes(key))
const ownData = (value: unknown, keys: readonly string[]): Record<string, unknown> | null => {
  try {
    if (!plainObject(value)) return null
    const names = Reflect.ownKeys(value)
    if (names.length !== keys.length || names.some(name => typeof name !== "string" || !keys.includes(name))) return null
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
    for (const name of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, name)
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null
      result[name] = descriptor.value
    }
    return result
  } catch { return null }
}
const address = (v: unknown): v is string => typeof v === "string" && /^0x[a-f0-9]{40}$/.test(v)
const jobId = (v: unknown): v is string => typeof v === "string" && /^job_[a-zA-Z0-9]{16,}$/.test(v) && v.length <= 132
const boundedText = (v: unknown, maxBytes: number): v is string =>
  typeof v === "string" && new TextEncoder().encode(v).byteLength <= maxBytes
const usdAtomic = (value: unknown): bigint | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null
  const scaled = value * 1_000_000
  return Number.isSafeInteger(scaled) && scaled >= 0 ? BigInt(scaled) : null
}
const minAtomic = (value: unknown): bigint | null => {
  if (value === undefined) return 1_000_000n
  const atomic = usdAtomic(value)
  return atomic !== null && atomic <= MAX_UINT ? atomic : null
}
const amount6 = (atomic: bigint): string => `${atomic / 1_000_000n}.${(atomic % 1_000_000n).toString().padStart(6, "0")}`
const dollars4 = (atomic: bigint): string => {
  if (atomic % 100n !== 0n) throw new Error(EVIDENCE_ERROR)
  return `$${atomic / 1_000_000n}.${((atomic % 1_000_000n) / 100n).toString().padStart(4, "0")}`
}
const balanceAtomic = (value: unknown): bigint | null => {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,77})\.[0-9]{6}$/.test(value)) return null
  const [whole, fraction] = value.split(".") as [string, string]
  const result = BigInt(whole) * 1_000_000n + BigInt(fraction)
  return result <= MAX_UINT ? result : null
}
const safeTime = (value: unknown, now: number): value is string => {
  if (typeof value !== "string" || !Number.isSafeInteger(now) || now < 0) return false
  const parsed = Date.parse(value)
  return Number.isSafeInteger(parsed) && new Date(parsed).toISOString() === value && parsed >= now - 300_000 && parsed <= now + 60_000
}
const flowCheck = (value: unknown, expectedAddress: string, now: number): FlowCheck | null => {
  let copied: unknown
  try { copied = copyPlainData(value) } catch { return null }
  if (!closed(copied, ["address", "balanceUsdc", "balanceAtomic", "nonce", "isContract", "chainId", "blockNumber", "checkedAt"]) ||
    copied.address !== expectedAddress || !address(copied.address) || typeof copied.balanceUsdc !== "string" || !uint(copied.balanceAtomic) ||
    typeof copied.nonce !== "number" || !Number.isSafeInteger(copied.nonce) || copied.nonce < 0 || typeof copied.isContract !== "boolean" ||
    copied.chainId !== 5_042_002 || !uint(copied.blockNumber) || !safeTime(copied.checkedAt, now)) return null
  const parsed = balanceAtomic(copied.balanceUsdc)
  return parsed !== null && parsed.toString() === copied.balanceAtomic ? copied as unknown as FlowCheck : null
}
const sourceCoherent = (sources: Assessment["sources"], identities: Assessment["identities"]): boolean => {
  const expected = identities.length === 0 ? ["agent0-identities"] : ["agent0-identities", "agent0-attestations"]
  if (sources.length !== expected.length || sources.some((source, index) => source.name !== expected[index] || source.endpoint !== ENDPOINT ||
    source.subgraphId !== SUBGRAPH || source.chain !== "eip155:8453" || ((source.block === null) !== (source.blockHash === null)) ||
    !Object.hasOwn(source, "paymentTx") || !((source.costAtomic === null && source.paymentTx === null) ||
      (source.costAtomic === "10000" && typeof source.paymentTx === "string")))) return false
  return sources.length !== 2 || (sources[0]!.block === sources[1]!.block && sources[0]!.blockHash === sources[1]!.blockHash)
}
const graphAssessment = (value: unknown, expectedAddress: string): TrustedAssessment | null => {
  let copied: unknown
  try { copied = copyPlainData(value) } catch { return null }
  if (!assessAddressSchemaOk(copied) || copied.address !== expectedAddress || copied.verdict === "allow" ||
    copied.attesterSettledCount !== 0 || !sourceCoherent(copied.sources, copied.identities)) return null
  return copied as TrustedAssessment
}
const brokerBody = (value: unknown): BrokerBody | null => {
  const copied = ownData(value, ["skillId", "jobId", "settled", "result", "fenced", "costUsd", "remainingUsd"])
  if (copied === null ||
    typeof copied.skillId !== "string" || !jobId(copied.jobId) || typeof copied.settled !== "boolean" || !boundedText(copied.fenced, 3_670_016)) return null
  const cost = usdAtomic(copied.costUsd), remaining = usdAtomic(copied.remainingUsd)
  return cost === null || remaining === null || remaining > PARENT_BUDGET ? null : {
    skillId: copied.skillId, jobId: copied.jobId, settled: copied.settled, result: copied.result,
    fenced: copied.fenced, costAtomic: cost, remainingAtomic: remaining
  }
}

/** Evidence is one-way. With no production verifier, even a healthy flow never becomes clean allow. */
export const combineVerdict = (flow: FlowVerdict,
  _counterparty: { readonly verdict: string; readonly contradictions: ReadonlyArray<string>; readonly attesterSettledCount: number } | null): FlowVerdict =>
  flow === "ok" ? "caution" : flow

const fixedContradiction: Readonly<Record<string, string>> = {
  "no-erc8004-identity": "no ERC-8004 identity.", "validation-failed": "an ERC-8004 validation failed.",
  "registration-inactive": "the ERC-8004 registration is inactive.", "x402-unsupported": "the registration does not claim x402 support.",
  "wallet-differs-from-owner": "the agent wallet differs from its owner.", "feedback-revoked": "related feedback was revoked.",
  "self-attested": "only self-attestation was observed.", "unattested-no-proof-of-payment": "no verified settlement attestation was established."
}
const headerValues = (response: IncomingMessage, name: string): ReadonlyArray<string> => {
  const result: string[] = []
  for (let i = 0; i < response.rawHeaders.length; i += 2) if (response.rawHeaders[i]!.toLowerCase() === name) result.push(response.rawHeaders[i + 1]!)
  return result
}
const singleHeader = (response: IncomingMessage, headers: IncomingHttpHeaders, name: string): string | null | undefined => {
  const values = headerValues(response, name)
  if (values.length > 1) return null
  const value = headers[name]
  return typeof value === "string" ? value : value === undefined ? undefined : null
}

/** One bounded attempt. Any failure is payment-ambiguous to this process and is never retried. */
export const hireOverUnix = async (call: HireCall): Promise<unknown> => {
  if (!closed(call.grant, ["socketPath", "jobId", "token"]) || typeof call.grant.socketPath !== "string" ||
    !call.grant.socketPath.startsWith("/") || call.grant.socketPath.length > 1024 || call.grant.socketPath.includes("\0") || !jobId(call.grant.jobId) ||
    typeof call.grant.token !== "string" || !/^[a-f0-9]{64}$/.test(call.grant.token) || !address(call.input.address) ||
    !((call.skillId === FLOW_SKILL && call.maxAmountUsd === 0.01) || (call.skillId === GRAPH_SKILL && call.maxAmountUsd === 0.05)) ||
    !Number.isSafeInteger(call.timeoutMs ?? 0) || (call.timeoutMs ?? 0) <= 0) throw new Error(BROKER_ERROR)
  const body = JSON.stringify({ skillId: call.skillId, input: { address: call.input.address }, maxAmountUsd: call.maxAmountUsd })
  const timeoutMs = call.timeoutMs!
  return await new Promise<unknown>((resolve, reject) => {
    let response: IncomingMessage | undefined, done = false
    let request: ReturnType<typeof httpRequest>
    const finish = (error?: Error, value?: unknown) => {
      if (done) return
      done = true; clearTimeout(timer); call.signal?.removeEventListener("abort", abort)
      if (error) reject(error); else resolve(value)
    }
    const abort = () => { response?.destroy(); request.destroy(); finish(new Error(BROKER_ERROR)) }
    const timer = setTimeout(abort, timeoutMs)
    request = httpRequest({ socketPath: call.grant.socketPath, path: "/hire", method: "POST", agent: false, maxHeaderSize: 16_384,
      headers: { "content-type": "application/json", accept: "application/json", "accept-encoding": "identity", connection: "close",
        "content-length": String(Buffer.byteLength(body)), "x-job-id": call.grant.jobId, "x-job-token": call.grant.token } }, incoming => {
      response = incoming
      if (done) { incoming.destroy(); return }
      const type = singleHeader(incoming, incoming.headers, "content-type"), encoding = singleHeader(incoming, incoming.headers, "content-encoding")
      const length = singleHeader(incoming, incoming.headers, "content-length"), transfer = singleHeader(incoming, incoming.headers, "transfer-encoding")
      const declared = length !== undefined && length !== null && /^(0|[1-9][0-9]*)$/.test(length) ? Number(length) : undefined
      if (incoming.statusCode !== 200 || type === null || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type ?? "") ||
        encoding === null || (encoding !== undefined && encoding.toLowerCase() !== "identity") || length === null || transfer === null ||
        (length !== undefined && declared === undefined) || (declared !== undefined && (!Number.isSafeInteger(declared) || declared > RESPONSE_BYTES)) ||
        (declared !== undefined && transfer !== undefined) || (transfer !== undefined && transfer.toLowerCase() !== "chunked")) {
        incoming.destroy(); finish(new Error(BROKER_ERROR)); return
      }
      const chunks: Buffer[] = []; let size = 0
      incoming.on("data", chunk => {
        if (done) return
        const bytes = Buffer.from(chunk); size += bytes.byteLength
        if (size > RESPONSE_BYTES || (declared !== undefined && size > declared)) { incoming.destroy(); finish(new Error(BROKER_ERROR)); return }
        chunks.push(bytes)
      })
      incoming.once("aborted", () => finish(new Error(BROKER_ERROR)))
      incoming.once("error", () => finish(new Error(BROKER_ERROR)))
      incoming.once("end", () => {
        if (done || (declared !== undefined && declared !== size)) { finish(new Error(BROKER_ERROR)); return }
        try { finish(undefined, JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))) as unknown) }
        catch { finish(new Error(BROKER_ERROR)) }
      })
    })
    request.once("error", () => finish(new Error(BROKER_ERROR)))
    call.signal?.addEventListener("abort", abort, { once: true })
    if (call.signal?.aborted) abort(); else request.end(body)
  })
}

const withDeadline = async (hire: (call: HireCall) => Promise<unknown>, call: Omit<HireCall, "signal" | "timeoutMs">,
  parent: AbortSignal | undefined, timeoutMs: number): Promise<unknown> => {
  const controller = new AbortController(), abort = () => controller.abort()
  parent?.addEventListener("abort", abort, { once: true })
  const timer = setTimeout(abort, timeoutMs)
  try {
    if (parent?.aborted) controller.abort()
    controller.signal.throwIfAborted()
    const work = Promise.resolve().then(() => hire({ ...call, signal: controller.signal, timeoutMs }))
    const cancelled = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error(BROKER_ERROR)), { once: true }))
    return await Promise.race([work, cancelled])
  } finally { clearTimeout(timer); parent?.removeEventListener("abort", abort); controller.abort() }
}

export const runWalletRiskJob = async (job: unknown, env: Record<string, string | undefined>, deps: WalletJobDependencies = {}): Promise<WalletEnvelope> => {
  let subject: string, minimum: bigint, grant: HireGrant
  try {
    const copied = copyPlainData(job)
    if (!plainObject(copied)) throw new Error()
    const idDescriptor = Object.getOwnPropertyDescriptor(copied, "jobId"), inputDescriptor = Object.getOwnPropertyDescriptor(copied, "input")
    if (!idDescriptor || !("value" in idDescriptor) || !jobId(idDescriptor.value) || !inputDescriptor || !("value" in inputDescriptor) ||
      !plainObject(inputDescriptor.value) || !Object.hasOwn(inputDescriptor.value, "address") ||
      Object.keys(inputDescriptor.value).some(key => key !== "address" && key !== "minUsdc")) throw new Error()
    const input = inputDescriptor.value
    if (typeof input.address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(input.address)) throw new Error()
    subject = input.address.toLowerCase()
    const parsedMinimum = minAtomic(input.minUsdc)
    if (parsedMinimum === null) throw new Error()
    minimum = parsedMinimum
    const socketPath = env["ARCADE_HIRE_SOCKET"], environmentJob = env["ARCADE_JOB_ID"], token = env["ARCADE_JOB_TOKEN"]
    if (typeof socketPath !== "string" || !socketPath.startsWith("/") || socketPath.length > 1024 || socketPath.includes("\0") ||
      environmentJob !== idDescriptor.value || !jobId(environmentJob) || typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) throw new Error(GRANT_ERROR)
    grant = { socketPath, jobId: environmentJob, token }
  } catch (error) { return refusal(error instanceof Error && error.message === GRANT_ERROR ? GRANT_ERROR : INPUT_ERROR) }

  const hire = deps.hire ?? hireOverUnix
  try {
    const rawFlow = await withDeadline(hire, { grant, skillId: FLOW_SKILL, input: { address: subject }, maxAmountUsd: 0.01 }, deps.signal, FLOW_TIMEOUT_MS)
    const flowBroker = brokerBody(rawFlow)
    if (flowBroker === null || flowBroker.skillId !== FLOW_SKILL || flowBroker.jobId === grant.jobId ||
      !flowBroker.settled || flowBroker.costAtomic !== FLOW_COST ||
      flowBroker.remainingAtomic + flowBroker.costAtomic !== PARENT_BUDGET) throw new Error()
    const flow = flowCheck(flowBroker.result, subject, deps.now?.() ?? Date.now())
    if (flow === null) throw new Error()
    const rawGraph = await withDeadline(hire, { grant, skillId: GRAPH_SKILL, input: { address: subject }, maxAmountUsd: 0.05 }, deps.signal, GRAPH_TIMEOUT_MS)
    const graphBroker = brokerBody(rawGraph)
    if (graphBroker === null || graphBroker.skillId !== GRAPH_SKILL || graphBroker.jobId === grant.jobId ||
      graphBroker.jobId === flowBroker.jobId) throw new Error()
    let assessment: TrustedAssessment | null, finalRemaining: bigint
    if (!graphBroker.settled) {
      if (graphBroker.result !== null || graphBroker.costAtomic !== 0n || graphBroker.remainingAtomic !== flowBroker.remainingAtomic) throw new Error()
      assessment = null; finalRemaining = graphBroker.remainingAtomic
    } else {
      if (graphBroker.costAtomic !== GRAPH_COST || graphBroker.remainingAtomic + graphBroker.costAtomic !== flowBroker.remainingAtomic) throw new Error()
      assessment = graphAssessment(graphBroker.result, subject)
      if (assessment === null) throw new Error()
      finalRemaining = graphBroker.remainingAtomic
    }
    const balance = balanceAtomic(flow.balanceUsdc)
    if (balance === null) throw new Error()
    const findings: string[] = [
      flow.isContract ? "Address is a contract, not an externally owned account." : "Externally owned account — no contract code at this address.",
      flow.nonce > 0 ? `Has sent ${flow.nonce} transaction(s); the key is in use.` : "Has never sent a transaction — no signing history at all.",
      balance >= minimum ? `Holds ${flow.balanceUsdc} USDC, at or above the ${amount6(minimum)} required to settle.` :
        `Holds only ${flow.balanceUsdc} USDC, below the ${amount6(minimum)} required to settle.`
    ]
    if (assessment === null) findings.push("Counterparty evidence unavailable; clean allow withheld.")
    else for (const code of assessment.contradictions) findings.push(`Counterparty evidence: ${fixedContradiction[code]}`)
    const flowVerdict: FlowVerdict = balance < minimum ? "unfunded" : flow.nonce > 0 ? "ok" : "caution"
    const counterparty: CounterpartySummary | null = assessment === null ? null : {
      verdict: assessment.verdict, contradictions: [...assessment.contradictions], attesterSettledCount: 0
    }
    return { stopReason: "end_turn", output: { address: subject, verdict: combineVerdict(flowVerdict, counterparty), findings,
      balanceUsdc: flow.balanceUsdc, isContract: flow.isContract, everTransacted: flow.nonce > 0, counterparty,
      sourcedFrom: { skillId: FLOW_SKILL, paidUsdc: "$0.0100", budgetLeftUsd: dollars4(finalRemaining),
        counterpartyGraph: assessment === null ? null : { skillId: GRAPH_SKILL, paidUsdc: "$0.0500", evidenceUsed: true } } } }
  } catch { return refusal(EVIDENCE_ERROR) }
}

const bounded = async <T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> => {
  signal.throwIfAborted()
  let stop: (() => void) | undefined
  const cancelled = new Promise<never>((_, reject) => { stop = () => reject(new Error()); signal.addEventListener("abort", stop, { once: true }) })
  try { return await Promise.race([Promise.resolve().then(work), cancelled]) } finally { if (stop) signal.removeEventListener("abort", stop) }
}
const main = async () => {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 129_000)
  const hard = setTimeout(() => process.exit(1), 133_000), reader = Bun.stdin.stream().getReader()
  let envelope: WalletEnvelope
  try {
    const inputSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(3_000)])
    const chunks: Uint8Array[] = []; let size = 0
    for (;;) {
      const part = await bounded(() => reader.read(), inputSignal)
      if (part.done) break
      size += part.value.byteLength
      if (size > 65_536) throw new Error()
      chunks.push(part.value)
    }
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)))
    envelope = await runWalletRiskJob(parsed, process.env, { signal: controller.signal })
  } catch { envelope = refusal(INPUT_ERROR) }
  try {
    await bounded(() => new Promise<void>((resolve, reject) => {
      process.stdout.write(JSON.stringify(envelope), error => error ? reject(error) : resolve())
    }), AbortSignal.timeout(1_000))
  } catch { process.exitCode = 1 }
  finally {
    controller.abort()
    try { await bounded(() => reader.cancel(), AbortSignal.timeout(1_000)) } catch { process.exit(1) }
    clearTimeout(timeout); clearTimeout(hard)
  }
}
if (import.meta.main) await main()
