/** J4 evidence contracts only. No CLI, credential, signer, network or live entry. */
import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { chmod, lstat, mkdtemp, open, realpath, type FileHandle } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, isAbsolute, join } from "node:path"
import { paymentChoices } from "../packages/buyer/src/accept-selection.ts"

export const CIRCLE_PROOF = Object.freeze({ network: "eip155:5042002", chainId: 5042002, chain: "ARC-TESTNET",
  usdc: "0x3600000000000000000000000000000000000000", wallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
  skillId: "usdc-flow-check", depositAtomic: "500000", paymentAtomic: "10000" })
export class CircleProofError extends Error { readonly _tag = "CircleProofError"; constructor() { super("Circle proof unavailable; reconcile before any new attempt") } }
const bad = (): never => { throw new CircleProofError() }
function check(v: unknown): asserts v { if (!v) bad() }
const record = (v: unknown): Record<string, unknown> => {
  check(v !== null && typeof v === "object" && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v)))
  const keys = Reflect.ownKeys(v); check(keys.length <= 32)
  const out: Record<string, unknown> = Object.create(null)
  for (const k of keys) { check(typeof k === "string"); const d = Object.getOwnPropertyDescriptor(v, k)
    check(d && "value" in d && d.enumerable); out[k] = d.value }
  return out
}
const exact = (v: unknown, keys: readonly string[]) => {
  const r = record(v); check(Object.keys(r).sort().join(",") === [...keys].sort().join(",")); return r
}
const list = (v: unknown, limit: number): unknown[] => {
  check(Array.isArray(v) && v.length <= limit && Reflect.ownKeys(v).length === v.length + 1)
  const result: unknown[] = []
  for (let i = 0; i < v.length; i++) { const d = Object.getOwnPropertyDescriptor(v, String(i)); check(d && "value" in d); result.push(d.value) }
  return result
}
const address = (v: unknown): v is string => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v) && !/^0x0{40}$/.test(v)
const same = (a: unknown, b: unknown) => address(a) && address(b) && a.toLowerCase() === b.toLowerCase()
const hash = (v: unknown): v is string => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v) && !/^0x0{64}$/.test(v)
const digest = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v)
const atomic = (v: unknown): v is string => typeof v === "string" && /^(0|[1-9][0-9]{0,77})$/.test(v) && BigInt(v) < 1n << 256n
const job = (v: unknown): v is string => typeof v === "string" && /^job_[a-zA-Z0-9]{16,128}$/.test(v)
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)
const boolean = (v: unknown): v is boolean => typeof v === "boolean"
const sha256 = (v: string | Uint8Array) => createHash("sha256").update(v).digest("hex")
const origin = (v: unknown): string => {
  check(typeof v === "string" && /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(v))
  const u = new URL(v); check(u.origin === v && Number(u.port) <= 65535); return v
}
export interface CircleProofContext {
  readonly buyer: string; readonly backingEOA: string; readonly seller: string; readonly facilitator: string
  readonly splitter: string; readonly origin: string; readonly endpoint: string
}
export function makeCircleProofContext(value: unknown): CircleProofContext {
  try {
    const r = exact(value, ["buyer", "backingEOA", "seller", "facilitator", "splitter", "origin"])
    const identities = ["buyer", "backingEOA", "seller", "facilitator", "splitter"].map(k => r[k])
    check(identities.every(address) && new Set(identities.map(a => a.toLowerCase())).size === identities.length)
    const [buyer, backingEOA, seller, facilitator, splitter] = identities as [string, string, string, string, string]
    const base = origin(r.origin)
    return Object.freeze({ buyer, backingEOA, seller, facilitator, splitter, origin: base, endpoint: `${base}/x/${seller}/${CIRCLE_PROOF.skillId}` })
  } catch { return bad() }
}
const context = (v: CircleProofContext) => {
  const r = exact(v, ["buyer", "backingEOA", "seller", "facilitator", "splitter", "origin", "endpoint"])
  const { endpoint, ...input } = r, c = makeCircleProofContext(input); check(c.endpoint === endpoint); return c
}
export function assertCircleProofChallenge(value: CircleProofContext, status: number, body: unknown): void {
  try {
    const c = context(value), r = record(body), raw = list(r.accepts, 2)
    check(status === 402 && r.x402Version === 2 && raw.length === 2)
    check(record(record(raw[0]).extra).name === "GatewayWalletBatched" && record(record(raw[1]).extra).name === "USDC")
    const choices = paymentChoices(raw, ["gateway", "eip3009"]); check(choices.length === 2)
    for (const { rail, requirements: q } of choices) {
      check(q.network === CIRCLE_PROOF.network && q.resource === c.endpoint && q.amount === CIRCLE_PROOF.paymentAtomic &&
        same(q.asset, CIRCLE_PROOF.usdc) && q.mimeType === "application/json")
      if (rail === "gateway") check(same(q.payTo, c.seller) && same(q.extra.verifyingContract, CIRCLE_PROOF.wallet))
      else check(same(q.payTo, c.splitter) && q.extra.name === "USDC" && q.extra.version === "2" &&
        same(q.extra.feeSplitter, c.splitter) && q.extra.feeSplitterVersion === 2)
    }
  } catch { bad() }
}
export function assertCircleInspection(value: CircleProofContext, envelope: unknown, localDiscovery = false) {
  try {
    const c = context(value), r = record(record(envelope).data), chains = list(r.chains, 1)
    check(r.status === "payable" && r.httpStatus === 402 && r.url === c.endpoint && record(r.price).amount === CIRCLE_PROOF.paymentAtomic &&
      chains.length === 1 && chains[0] === CIRCLE_PROOF.network && r.scheme === "GatewayWalletBatched" && same(r.seller, c.seller))
    const methodAdvertised = r.method !== undefined, inputAdvertised = r.input !== undefined
    if (methodAdvertised) check(r.method === "POST")
    if (inputAdvertised) {
      const input = record(r.input), schema = input.body === undefined ? input : record(input.body)
      check(schema.type === "object" && list(schema.required, 16).includes("address") && record(record(schema.properties).address).type === "string")
    }
    if (localDiscovery) check(methodAdvertised && inputAdvertised)
    return Object.freeze({ methodAdvertised, inputAdvertised })
  } catch { return bad() }
}
const displayPrice = (r: Record<string, unknown>, field: string, c: CircleProofContext) => {
  check(r[field] === "$0.01 USDC" && typeof r.chain === "string" && ["Arc Testnet", CIRCLE_PROOF.network].includes(r.chain) &&
    r.scheme === "GatewayWalletBatched" && same(r.seller, c.seller))
}
export function assertCircleEstimate(value: CircleProofContext, envelope: unknown): void {
  try { displayPrice(record(record(envelope).data), "price", context(value)) } catch { bad() }
}
/** Returned pollUrl stays private in caller memory; never put it in the journal. */
export function assertCircleAcceptance(value: CircleProofContext, httpStatus: number, envelope: unknown) {
  try {
    const c = context(value), r = record(record(envelope).data), body = record(r.response)
    displayPrice(record(r.payment), "amount", c)
    check(httpStatus === 202 && job(body.job_id) && typeof body.poll_url === "string" && body.poll_url.length < 512)
    const u = new URL(body.poll_url)
    check(u.origin === c.origin && !u.username && !u.password && !u.hash && u.pathname === `/jobs/${body.job_id}/result` &&
      /^\?token=[a-f0-9]{32}$/.test(u.search))
    return Object.freeze({ jobId: body.job_id, pollUrl: body.poll_url })
  } catch { return bad() }
}

type Rule = (v: unknown) => boolean
const stages = ["setup", "preflight", "challenge", "inspection", "estimate", "deposit", "payment", "result", "cleanup", "journal"]
const rules: Readonly<Record<string, Readonly<Record<string, Rule>>>> = {
  preflight: { buyer: address, backingEOA: address, seller: address, facilitator: address, splitter: address,
    network: v => v === CIRCLE_PROOF.network, cliSha256: digest, manifestSha256: digest, sourceSha256: digest, walletAtomic: atomic, gatewayAtomic: atomic },
  challenge: { sha256: digest, accepts: v => v === 2 },
  inspect: { sha256: digest, methodAdvertised: boolean, inputAdvertised: boolean, discovery: v => v === "public-registry" || v === "local-hub" },
  estimate: { sha256: digest, amountAtomic: v => v === CIRCLE_PROOF.paymentAtomic },
  "deposit-intent": { amountAtomic: v => v === CIRCLE_PROOF.depositAtomic },
  "deposit-confirmed": { approveTxHash: hash, depositTxHash: hash, gatewayAtomicBefore: atomic, gatewayAtomicAfter: atomic },
  "payment-intent": { amountAtomic: v => v === CIRCLE_PROOF.paymentAtomic },
  "payment-accepted": { jobId: job, authorizationNonce: hash },
  result: { jobId: job, receiptSha256: digest, transferId: uuid, authorizationNonce: hash, gatewayAtomicBefore: atomic, gatewayAtomicAfter: atomic },
  cleanup: { hubStopped: v => v === true, runnerStopped: v => v === true, listening: v => v === false },
  uncertain: { stage: v => typeof v === "string" && stages.includes(v) }
}
function facts(event: unknown, input: unknown): Record<string, unknown> {
  check(typeof event === "string" && Object.hasOwn(rules, event))
  const rule = rules[event]!, r = exact(input, Object.keys(rule))
  for (const [key, test] of Object.entries(rule)) check(test(r[key]))
  return r
}
export interface CircleProofJournal {
  readonly directory: string; readonly path: string
  readonly append: (event: string, facts: unknown) => Promise<void>
  readonly close: () => Promise<string>
}
/** Fresh exclusive private journal; no auto-resume or arbitrary file overwrite. */
export async function createCircleProofJournal(): Promise<CircleProofJournal> {
  let handle: FileHandle | undefined
  try {
    const directory = await realpath(await mkdtemp(join(tmpdir(), "arcade-circle-proof-"))); await chmod(directory, 0o700)
    const parent = await lstat(directory)
    check(parent.isDirectory() && parent.uid === process.getuid?.() && (parent.mode & 0o777) === 0o700)
    const path = join(directory, "evidence.jsonl")
    handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    await handle.sync()
    const folder = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    try { await folder.sync() } finally { await folder.close() }
    const owned = handle, claims = new Set<string>()
    let head = "0".repeat(64), seq = 0, poisoned = false, closed = false, tail = Promise.resolve(), closing: Promise<string> | undefined
    return Object.freeze({ directory, path,
      append(event: string, input: unknown) {
        let safe: Record<string, unknown>
        try { check(!closed && !poisoned && seq < 64); safe = facts(event, input) }
        catch { poisoned = true; return Promise.reject(new CircleProofError()) }
        if (event === "deposit-intent" || event === "payment-intent") {
          if (claims.has(event)) return Promise.reject(new CircleProofError())
          claims.add(event) // Reserve once before any await or caller's action.
        }
        const bytes = JSON.stringify({ version: 1, seq: ++seq, previous: head, at: new Date().toISOString(), event, facts: safe })
        if (Buffer.byteLength(bytes) > 4096) { poisoned = true; return Promise.reject(new CircleProofError()) }
        head = sha256(bytes)
        const write = tail.then(async () => {
          try { check(!poisoned); const data = Buffer.from(bytes + "\n"), result = await owned.write(data)
            check(result.bytesWritten === data.length); await owned.sync() }
          catch { poisoned = true; bad() }
        })
        tail = write; void tail.catch(() => {}); return write
      },
      close() {
        return closing ??= (async () => {
          closed = true
          try { await tail; check(!poisoned); await owned.sync(); return head }
          catch { return bad() } finally { try { await owned.close() } catch { bad() } }
        })()
      }
    })
  } catch { await handle?.close().catch(() => {}); return bad() }
}
export async function runCircleProofAction<T>(journal: CircleProofJournal, stage: "deposit" | "payment", work: () => Promise<T>): Promise<T> {
  check(stage === "deposit" || stage === "payment")
  await journal.append(`${stage}-intent`, { amountAtomic: stage === "deposit" ? CIRCLE_PROOF.depositAtomic : CIRCLE_PROOF.paymentAtomic })
  try { return await work() }
  catch { await journal.append("uncertain", { stage }).catch(() => {}); return bad() }
}
/** Closed-journal integrity is not chain settlement proof; runtime checks are separate. */
export async function verifyCircleProofJournal(path: string, expectedHead: string): Promise<{ readonly events: readonly string[]; readonly head: string }> {
  let file: FileHandle | undefined
  try {
    check(isAbsolute(path) && digest(expectedHead))
    const parent = await lstat(dirname(path)); check(parent.isDirectory() && !parent.isSymbolicLink() && parent.uid === process.getuid?.() && (parent.mode & 0o777) === 0o700)
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const s = await file.stat(); check(s.isFile() && s.nlink === 1 && s.uid === process.getuid?.() && (s.mode & 0o777) === 0o600 && s.size <= 262144)
    const raw = await file.readFile(); check(raw.length === s.size)
    const text = new TextDecoder("utf-8", { fatal: true }).decode(raw); check(text.endsWith("\n"))
    const lines = text.slice(0, -1).split("\n"); check(lines.length <= 64)
    const events: string[] = [], claims = new Set<string>(); let previous = "0".repeat(64)
    for (const [i, line] of lines.entries()) {
      check(Buffer.byteLength(line) <= 4096)
      const r = exact(JSON.parse(line), ["version", "seq", "previous", "at", "event", "facts"])
      check(r.version === 1 && r.seq === i + 1 && r.previous === previous && typeof r.at === "string" &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.at) && !Number.isNaN(Date.parse(r.at)))
      const safe = facts(r.event, r.facts); check(JSON.stringify({ version: r.version, seq: r.seq, previous: r.previous, at: r.at, event: r.event, facts: safe }) === line)
      const event = r.event as string
      if (event === "deposit-intent" || event === "payment-intent") { check(!claims.has(event)); claims.add(event) }
      events.push(event); previous = sha256(line)
    }
    check(previous === expectedHead); return Object.freeze({ events: Object.freeze(events), head: previous })
  } catch { return bad() } finally { try { await file?.close() } catch { bad() } }
}
