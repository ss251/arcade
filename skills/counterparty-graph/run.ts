/** Two bounded Base fact queries, not verified counterparty service settlements.
 * Importing this module performs no key lookup, document read, stdin or network IO.
 * A protocol refusal deliberately has no output, even when the process exits zero. */
import { document, makePaidQuery, readPayerKey, AGENT0_BASE_SUBGRAPH_ID, GATEWAY_BASE,
  PAYMENT_CHAIN, type PaidQuery } from "./graph-client.ts"
import { synthesize, type Assessment, type Source } from "./synthesize.ts"
import { assessAddressSchemaOk, copyPlainData, plainObject, uint } from "./validate-output.ts"

const QUERY_ERROR = "Graph query unavailable; any uncertain payment requires reconciliation"
const invalid = () => new Error(QUERY_ERROR)
const inputAddress = (value: unknown): string => {
  try {
    const input = copyPlainData(value)
    if (!plainObject(input) || Object.keys(input).length !== 1 || !Object.hasOwn(input, "address") ||
      typeof input.address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(input.address)) throw new Error()
    return input.address.toLowerCase()
  } catch { throw new Error("Counterparty Graph input refused") }
}
const validKey = (v: unknown): v is string => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v) &&
  BigInt(v) > 0n && BigInt(v) < 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const hash = (v: unknown): v is string => typeof v === "string" && /^0x[a-fA-F0-9]{64}$/.test(v) && !/^0x0{64}$/.test(v)
const metadata = (data: Record<string, unknown>): { number: number; hash: string } | null => {
  const meta = data._meta
  if (!plainObject(meta) || !plainObject(meta.block) || typeof meta.block.number !== "number" ||
    !Number.isSafeInteger(meta.block.number) || meta.block.number < 0 || !hash(meta.block.hash) ||
    typeof meta.hasIndexingErrors !== "boolean") return null
  return { number: meta.block.number, hash: meta.block.hash.toLowerCase() }
}
const readResult = (raw: unknown, name: string): { data: Record<string, unknown>; source: Source } => {
  const result = copyPlainData(raw)
  if (!plainObject(result) || !plainObject(result.data) ||
    !((result.costAtomic === null && result.paymentTx === null) ||
      (result.costAtomic === "10000" && hash(result.paymentTx)))) throw invalid()
  const meta = metadata(result.data)
  return { data: result.data, source: { name, endpoint: `${GATEWAY_BASE}${AGENT0_BASE_SUBGRAPH_ID}`,
    subgraphId: AGENT0_BASE_SUBGRAPH_ID, chain: PAYMENT_CHAIN, block: meta?.number ?? null,
    blockHash: meta?.hash ?? null, costAtomic: result.costAtomic,
    paymentTx: result.paymentTx === null ? null : String(result.paymentTx).toLowerCase() } }
}
const queryIds = (data: Record<string, unknown>, address: string): string[] | null => {
  const meta = data._meta
  if (metadata(data) === null || !plainObject(meta) || meta.hasIndexingErrors !== false || Object.hasOwn(data, "errors")) return null
  const ids = new Set<string>()
  for (const alias of ["asWallet", "asOwner"] as const) {
    const rows = data[alias]
    if (!Array.isArray(rows) || rows.length >= 25) return null
    for (const row of rows) {
      if (!plainObject(row) || typeof row.id !== "string" || !row.id.startsWith("8453:") ||
        !uint(row.agentId) || row.id !== `8453:${row.agentId}` || row.chainId !== "8453" ||
        typeof row.owner !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(row.owner) ||
        !(row.agentWallet === null || (typeof row.agentWallet === "string" && /^0x[a-fA-F0-9]{40}$/.test(row.agentWallet)))) return null
      const relation = alias === "asOwner" ? row.owner : row.agentWallet
      if (typeof relation !== "string" || relation.toLowerCase() !== address) return null
      ids.add(row.id)
    }
  }
  return [...ids].sort()
}
export const assess = async (input: { readonly address: string }, deps: {
  readonly payerKey: string; readonly query: PaidQuery
}): Promise<Assessment> => {
  const address = inputAddress(input)
  if (!validKey(deps.payerKey)) throw new Error("Graph payer key unavailable")
  try {
    const first = readResult(await deps.query({ subgraphId: AGENT0_BASE_SUBGRAPH_ID,
      document: document("identities"), variables: { address } }), "agent0-identities")
    const sources: Source[] = [first.source], agentIds = queryIds(first.data, address)
    let attestations: Record<string, unknown> = {}
    if (agentIds !== null && agentIds.length > 0) {
      const second = readResult(await deps.query({ subgraphId: AGENT0_BASE_SUBGRAPH_ID,
        document: document("attestations"), variables: { agentIds, block: { hash: first.source.blockHash } } }), "agent0-attestations")
      attestations = second.data; sources.push(second.source)
    }
    // Deliberately no provider/input spread and no trustedValidators or verifiedProofs.
    const assessment = synthesize({ address, identities: first.data, attestations, sources })
    if (!assessAddressSchemaOk(assessment) || assessment.address !== address || assessment.verdict === "allow" ||
      assessment.attesterSettledCount !== 0) throw invalid()
    return assessment
  } catch { throw invalid() }
}

export type GraphEnvelope = { readonly stopReason: "refusal"; readonly error: string } |
  { readonly stopReason: "end_turn"; readonly output: Assessment }
interface JobDependencies {
  readonly readKey?: typeof readPayerKey
  readonly makeQuery?: typeof makePaidQuery
  readonly signal?: AbortSignal
}
const refusal = (error: string): GraphEnvelope => ({ stopReason: "refusal", error })
const bounded = async <T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> => {
  signal.throwIfAborted()
  let stop: (() => void) | undefined
  const cancelled = new Promise<never>((_, reject) => {
    stop = () => reject(invalid()); signal.addEventListener("abort", stop, { once: true })
  })
  try { return await Promise.race([Promise.resolve().then(() => { signal.throwIfAborted(); return work() }), cancelled]) }
  finally { if (stop) signal.removeEventListener("abort", stop) }
}
export const runGraphJob = async (job: unknown, env: Record<string, string | undefined>, deps: JobDependencies = {}): Promise<GraphEnvelope> => {
  let address: string
  try {
    if (!plainObject(job)) throw new Error()
    const input = Object.getOwnPropertyDescriptor(job, "input")
    if (!input || !("value" in input)) throw new Error()
    address = inputAddress(input.value)
  } catch { return refusal("Counterparty Graph input refused") }
  const signal = deps.signal ?? AbortSignal.timeout(80000)
  let key: string
  try {
    key = await bounded(() => (deps.readKey ?? readPayerKey)(env), signal)
    if (!validKey(key)) throw new Error()
  } catch { return refusal("Graph payer key unavailable") }
  try {
    signal.throwIfAborted()
    const query = (deps.makeQuery ?? makePaidQuery)(key, { signal })
    const output = await bounded(() => assess({ address }, { payerKey: key,
      query: args => bounded(() => query(args), signal) }), signal)
    signal.throwIfAborted()
    return { stopReason: "end_turn", output }
  } catch { return refusal(QUERY_ERROR) }
}
const main = async () => {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 80000)
  // Owning process only: a noncooperative key subprocess/stdin/cleanup cannot outlive the 90s manifest.
  const hard = setTimeout(() => process.exit(1), 88000)
  const reader = Bun.stdin.stream().getReader()
  let envelope: GraphEnvelope
  try {
    const inputSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(10000)])
    const chunks: Uint8Array[] = []; let size = 0
    for (;;) {
      const part = await bounded(() => reader.read(), inputSignal)
      if (part.done) break
      size += part.value.byteLength
      if (size > 65536) throw new Error()
      chunks.push(part.value)
    }
    const job: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)))
    envelope = await runGraphJob(job, process.env, { signal: controller.signal })
  } catch { envelope = refusal("Counterparty Graph input refused") }
  try {
    // One envelope only. A broken/blocked output pipe must not trigger a second JSON value.
    await bounded(() => new Promise<void>((resolve, reject) => {
      process.stdout.write(JSON.stringify(envelope), error => error ? reject(error) : resolve())
    }), AbortSignal.timeout(1000))
  } catch { process.exitCode = 1 }
  finally {
    controller.abort()
    try { await bounded(() => reader.cancel(), AbortSignal.timeout(1000)) }
    catch { process.exit(1) }
    clearTimeout(timeout); clearTimeout(hard)
  }
}
if (import.meta.main) await main()
