/** Bun/server-only funding evidence. An account claim is never a disposable lock. */
import { constants } from "node:fs"
import { lstat, mkdir, open, realpath, unlink, type FileHandle } from "node:fs/promises"
import { dirname, isAbsolute, join, normalize } from "node:path"
import { userInfo } from "node:os"
import { keccak256, toHex, type Hex } from "viem"
import { captureFundingAuthority, captureFundingPublicEvent, decodeFundingRequest,
  encodeFundingPublic, encodeFundingRequest, operationDigest as digestOperation,
  type FundingAuthority, type FundingPublicEvent, type FundingRequest } from "./gateway-funding.ts"
import { captureTransferSpec, hashTransferSpec } from "./gateway-withdrawal.ts"

const FORMAT = "arcade-gateway-funding-v1"
const ZERO = `0x${"00".repeat(32)}` as Hex
const MAX_FILE = 1_048_576, MAX_LINE = 16_384, MAX_EVENTS = 64
const hash = (text: string): Hex => keccak256(toHex(text))
export class FundingJournalError extends Error {
  readonly _tag = "FundingJournalError"
  readonly code = "journal_unavailable"
  constructor() { super("Funding journal unavailable"); this.name = "FundingJournalError" }
}
const fail = (): never => { throw new FundingJournalError() }
function insist(value: unknown): asserts value { if (!value) fail() }
function own(value: unknown): Record<string, unknown> {
  insist(value !== null && typeof value === "object" && !Array.isArray(value))
  const prototype = Object.getPrototypeOf(value)
  insist(prototype === Object.prototype || prototype === null)
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const key of Reflect.ownKeys(value)) {
    insist(typeof key === "string")
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    insist(descriptor && Object.hasOwn(descriptor, "value"))
    result[key] = descriptor.value
  }
  return result
}
const exact = (value: Record<string, unknown>, keys: readonly string[]) => {
  insist(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)))
}
const canonicalAuthority = (input: unknown): FundingAuthority => {
  const raw = own(input), authority = captureFundingAuthority(raw.account)
  exact(raw, Object.keys(authority))
  insist(Object.entries(authority).every(([key, value]) => raw[key] === value))
  return authority
}
const canonicalDigest = (input: unknown): Hex => {
  insist(typeof input === "string" && /^0x[0-9a-f]{64}$/.test(input) && input !== ZERO)
  return input as Hex
}
export interface FundingJournalHead { readonly sequence: number; readonly hash: Hex }
export interface FundingJournalSnapshot {
  readonly authority: FundingAuthority
  readonly operationId: string
  readonly operationDigest: Hex
  readonly request: FundingRequest
  readonly locatorDigest: Hex
  readonly head: FundingJournalHead
  readonly events: readonly FundingPublicEvent[]
}
export interface FundingJournalOpen {
  readonly authority: FundingAuthority
  readonly operationId: string
  readonly request: FundingRequest
  readonly operationDigest: Hex
  readonly journalPath: string
}
export interface FundingJournalRead { readonly authority: FundingAuthority; readonly journalPath: string }
export type FundingJournalCheckpoint = "claim_write" | "claim_sync" | "header_write" | "header_sync" |
  "append_write" | "append_sync" | "directory_sync" | "close" | "witness_write" | "witness_sync" | "witness_close" |
  "finalization_write" | "claim_retire"
/** Trusted test-only adapter. Production entry points never expose a root/fault override. */
export interface FundingJournalIO {
  readonly testRoot?: string
  readonly checkpoint?: (point: FundingJournalCheckpoint, file?: FileHandle) => Promise<void>
}
export interface FundingJournal {
  readHead(): FundingJournalHead
  snapshot(): FundingJournalSnapshot
  append(expectedHead: FundingJournalHead, event: FundingPublicEvent): Promise<FundingJournalHead>
  close(): Promise<void>
}

const uid = () => { insist(typeof process.getuid === "function"); return process.getuid() }
const privateDir = async (path: string) => {
  const st = await lstat(path)
  insist(st.isDirectory() && !st.isSymbolicLink() && st.uid === uid() && (st.mode & 0o777) === 0o700)
  insist(await realpath(path) === path)
}
const privateFile = async (file: FileHandle) => {
  const st = await file.stat()
  insist(st.isFile() && st.uid === uid() && (st.mode & 0o777) === 0o600 && st.nlink === 1 && st.size <= MAX_FILE)
}
const syncDir = async (path: string, io: FundingJournalIO) => {
  const directory = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const st = await directory.stat()
    insist(st.isDirectory() && st.uid === uid())
    await io.checkpoint?.("directory_sync", directory)
    await directory.sync()
  } finally { await directory.close() }
}
async function locations(input: FundingJournalRead, io: FundingJournalIO) {
  const authority = canonicalAuthority(input.authority), path = input.journalPath
  insist(typeof path === "string" && path.length <= 2048 && isAbsolute(path) && normalize(path) === path &&
    path.endsWith(".jsonl") && !/[\u0000-\u001f\u007f]/.test(path))
  const parent = dirname(path)
  await privateDir(parent)
  let home: string
  if (io.testRoot !== undefined) {
    insist(typeof io.testRoot === "string" && isAbsolute(io.testRoot) && normalize(io.testRoot) === io.testRoot)
    home = io.testRoot; await privateDir(home)
  } else {
    // Capture OS identity, never HOME, cwd or a command-line namespace.
    const identity = userInfo()
    insist(identity.uid === uid() && isAbsolute(identity.homedir))
    home = await realpath(identity.homedir)
    const st = await lstat(home)
    insist(st.isDirectory() && !st.isSymbolicLink() && st.uid === identity.uid)
  }
  const parts = [".arcade-gateway-funding", "v1", "eip155-5042002", authority.account]
  let accountDir = home
  for (const part of parts) accountDir = join(accountDir, part)
  return { authority, path, parent, home, parts, accountDir, claimPath: join(accountDir, "active.claim"), locatorDigest: hash(path) }
}
async function ensureNamespace(location: Awaited<ReturnType<typeof locations>>, io: FundingJournalIO) {
  let current = location.home
  for (const part of location.parts) {
    const parent = current; current = join(current, part)
    try { await mkdir(current, { mode: 0o700 }) }
    catch (error) { if (!(error instanceof Error) || !Object.hasOwn(error, "code") || (error as NodeJS.ErrnoException).code !== "EEXIST") throw error }
    await privateDir(current); await syncDir(parent, io)
  }
}
const boundRead = async (file: FileHandle): Promise<string> => {
  await privateFile(file)
  const st = await file.stat(), size = st.size
  insist(size > 0 && size <= MAX_FILE)
  const buffer = Buffer.alloc(size + 1)
  let offset = 0
  while (offset <= size) {
    const read = await file.read(buffer, offset, size + 1 - offset, offset)
    if (read.bytesRead === 0) break
    offset += read.bytesRead
  }
  insist(offset === size && (await file.stat()).size === size)
  return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, size))
}
const readOwned = async (path: string) => {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try { return await boundRead(file) } finally { await file.close() }
}
const absent = async (path: string) => {
  try { await lstat(path); fail() }
  catch (error) { if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
}
const marker = (directory: string, digest: Hex, name: string) => join(directory, `${digest.slice(2)}.${name}`)
async function poison(directory: string, digest: Hex) {
  // Best effort only. Arbitrary storage faults and hostile same-user rewrites are
  // outside this cooperative journal's guarantees; the active claim is retained.
  let file: FileHandle | undefined
  try {
    file = await open(join(directory, "poison"), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    await file.writeFile(JSON.stringify({ format: FORMAT, operationDigest: digest, poisoned: true }) + "\n")
    await file.sync(); await file.close(); file = undefined; await syncDir(directory, {})
  } catch { if (file) await file.close().catch(() => {}) }
}
const claimBytes = (authority: FundingAuthority, operationId: string, operationDigest: Hex, locatorDigest: Hex) =>
  JSON.stringify({ format: FORMAT, account: authority.account, network: authority.network, operationId, operationDigest, locatorDigest }) + "\n"
const headEqual = (left: FundingJournalHead, right: FundingJournalHead) => left.sequence === right.sequence && left.hash === right.hash

const nextEvents: Readonly<Record<string, readonly string[]>> = Object.freeze({
  claimed: ["planned", "refused"], planned: ["approval_intent", "deposit_intent", "burn_authorization_prepared", "noop", "refused"],
  approval_intent: ["approval_prepared"], approval_prepared: ["approval_submitted"], approval_submitted: ["approval_confirmed"],
  approval_confirmed: ["deposit_intent"], deposit_intent: ["deposit_prepared"], deposit_prepared: ["deposit_submitted"],
  deposit_submitted: ["deposit_confirmed"], deposit_confirmed: ["credit_pending", "credit_observed"],
  burn_authorization_prepared: ["normal_transfer_requested"], normal_transfer_requested: ["attestation_validated"],
  attestation_validated: ["mint_intent"], mint_intent: ["mint_prepared"], mint_prepared: ["mint_submitted"],
  mint_submitted: ["delivery_confirmed"], delivery_confirmed: ["source_debit_reconciled"]
})
const terminalEvents = new Set(["noop", "credit_pending", "credit_observed", "source_debit_reconciled", "refused", "uncertain", "finalized"])
function validateTransition(events: readonly FundingPublicEvent[], event: FundingPublicEvent, authority: FundingAuthority, request: FundingRequest, operationId: string) {
  const previous = events.at(-1)?.event ?? "claimed"
  if (event.event === "finalized") {
    insist(previous !== "claimed" && previous !== "finalized" && event.facts.terminalKind !== undefined)
  } else {
    insist(!terminalEvents.has(previous))
    insist(event.event === "uncertain" || nextEvents[previous]?.includes(event.event))
  }
  insist(event.facts.account === undefined || event.facts.account === authority.account)
  insist(event.facts.operationId === undefined || event.facts.operationId === operationId)
  insist(event.facts.kind === undefined || event.facts.kind === request.kind)
  insist(event.facts.gasCapWei === undefined || event.facts.gasCapWei === request.gasCapWei)
  if (request.kind === "withdrawal") {
    insist(event.facts.maxFee === undefined || event.facts.maxFee === request.maxFee)
    insist(event.facts.maxBurnBlockDelta === undefined || event.facts.maxBurnBlockDelta === request.maxBurnBlockDelta)
  } else if (request.mode === "target") {
    insist(event.facts.minimumAvailable === undefined || event.facts.minimumAvailable === request.minimumAvailable)
    insist(event.facts.maxDeposit === undefined || event.facts.maxDeposit === request.maxDeposit)
  }
  const frozenKeys = ["planDigest", "amount", "approvalAmount", "minimumAvailable", "maxDeposit", "maxFee", "maxBurnBlockDelta", "gasCapWei", "maxBlockHeight", "specHash"] as const
  for (const key of frozenKeys) {
    const original = events.find(row => row.facts[key] !== undefined)?.facts[key]
    insist(original === undefined || event.facts[key] === undefined || original === event.facts[key])
  }
  if (event.event === "planned") {
    insist(event.facts.amount !== undefined)
    if (request.kind === "deposit" && request.mode === "target") {
      insist(event.facts.availableBefore !== undefined)
      const expected = request.minimumAvailable > event.facts.availableBefore ? request.minimumAvailable - event.facts.availableBefore : 0n
      insist(event.facts.amount === expected && expected <= request.maxDeposit)
    } else insist(event.facts.amount === request.amount)
  }
  if (event.event === "refused" || event.event === "noop") insist(![...events, event].some(row =>
    row.event.endsWith("_intent") || row.event.endsWith("_prepared") || row.event.endsWith("_submitted") || row.facts.signerEntered || row.facts.submitted))
  if (event.event === "noop") insist(event.facts.amount === 0n)
  const stage = event.event.startsWith("approval_") ? "approval" : event.event.startsWith("deposit_") ? "deposit" : event.event.startsWith("mint_") ? "mint" : undefined
  if (stage) {
    insist((stage === "mint") === (request.kind === "withdrawal"))
    const keys = ["nonce", "calldataHash", "gas", "maxFeePerGas", "maxPriorityFeePerGas", "txHash"] as const
    for (const key of keys) {
      const prior = events.find(row => row.event.startsWith(`${stage}_`) && row.facts[key] !== undefined)?.facts[key]
      insist(prior === undefined || event.facts[key] === undefined || prior === event.facts[key])
    }
    if (event.event.endsWith("_intent") || event.event.endsWith("_prepared")) {
      insist(event.facts.amount !== undefined && keys.slice(0, 5).every(key => event.facts[key] !== undefined))
      insist(event.facts.gas! > 0n && event.facts.maxFeePerGas! > 0n && event.facts.maxPriorityFeePerGas! <= event.facts.maxFeePerGas!)
    }
    if (event.event.endsWith("_prepared") || event.event.endsWith("_submitted") || event.event.endsWith("_confirmed")) canonicalDigest(event.facts.txHash)
    if (event.event.endsWith("_confirmed")) { canonicalDigest(event.facts.blockHash); insist(event.facts.blockNumber !== undefined) }
  }
  if (["burn_authorization_prepared", "normal_transfer_requested", "attestation_validated", "delivery_confirmed", "source_debit_reconciled"].includes(event.event))
    insist(request.kind === "withdrawal")
  if (event.event === "burn_authorization_prepared") {
    insist(request.kind === "withdrawal")
    const planned = events.find(row => row.event === "planned")
    insist(planned?.facts.blockNumber !== undefined && event.facts.amount === request.amount && event.facts.maxFee === request.maxFee &&
      event.facts.maxBlockHeight === planned.facts.blockNumber + request.maxBurnBlockDelta && event.facts.maxBlockHeight < (1n << 256n) - 1n)
    const spec = captureTransferSpec({ version: 1, sourceDomain: 26, destinationDomain: 26, sourceContract: authority.wallet,
      destinationContract: authority.minter, sourceToken: authority.token, destinationToken: authority.token,
      sourceDepositor: authority.account, destinationRecipient: authority.account, sourceSigner: authority.account,
      destinationCaller: "0x0000000000000000000000000000000000000000", value: request.amount,
      salt: hash(`arcade-funding-withdrawal:${event.facts.operationDigest}`), hookData: "0x" }, authority)
    insist(event.facts.specHash === hashTransferSpec(spec))
  }
}

function decodeJournal(bytes: string, location: Awaited<ReturnType<typeof locations>>): FundingJournalSnapshot {
  insist(bytes.endsWith("\n") && Buffer.byteLength(bytes) <= MAX_FILE)
  const lines = bytes.slice(0, -1).split("\n")
  insist(lines.length >= 1 && lines.length <= MAX_EVENTS + 1 && lines.every(line => Buffer.byteLength(line) <= MAX_LINE))
  const header = own(JSON.parse(lines[0]!))
  exact(header, ["format", "authority", "operationId", "request", "operationDigest", "locatorDigest"])
  insist(header.format === FORMAT && header.locatorDigest === location.locatorDigest)
  const authority = canonicalAuthority(header.authority), request = decodeFundingRequest(header.request)
  insist(JSON.stringify(authority) === JSON.stringify(location.authority))
  insist(typeof header.operationId === "string" && /^op_[0-9a-f]{32}$/.test(header.operationId))
  const digest = canonicalDigest(header.operationDigest)
  insist(digestOperation(authority, request, header.operationId) === digest)
  let head: FundingJournalHead = Object.freeze({ sequence: 0, hash: hash(lines[0]!) })
  const events: FundingPublicEvent[] = []
  for (const line of lines.slice(1)) {
    const row = own(JSON.parse(line)); exact(row, ["sequence", "previousHash", "event", "hash"])
    insist(row.sequence === head.sequence + 1 && row.previousHash === head.hash)
    const event = captureFundingPublicEvent(row.event)
    insist(event.facts.operationDigest === digest)
    const payload = JSON.stringify({ sequence: row.sequence, previousHash: row.previousHash, event: JSON.parse(encodeFundingPublic(event)) })
    insist(row.hash === hash(payload))
    validateTransition(events, event, authority, request, header.operationId)
    events.push(event); head = Object.freeze({ sequence: Number(row.sequence), hash: canonicalDigest(row.hash) })
  }
  return Object.freeze({ authority, request, operationId: header.operationId, operationDigest: digest,
    locatorDigest: location.locatorDigest, head, events: Object.freeze(events) })
}

export async function readFundingJournal(input: FundingJournalRead, trustedIO: FundingJournalIO = {}): Promise<FundingJournalSnapshot> {
  try {
    const io = Object.freeze({ ...trustedIO }), location = await locations(input, io)
    await privateDir(location.accountDir)
    const snapshot = decodeJournal(await readOwned(location.path), location)
    insist(await readOwned(location.claimPath) === claimBytes(snapshot.authority, snapshot.operationId, snapshot.operationDigest, snapshot.locatorDigest))
    return snapshot
  } catch { return fail() }
}

export async function openFundingJournal(input: FundingJournalOpen, trustedIO: FundingJournalIO = {}): Promise<FundingJournal> {
  let file: FileHandle | undefined
  let ownedLocation: { readonly directory: string; readonly digest: Hex } | undefined
  try {
    const raw = own(input); exact(raw, ["authority", "operationId", "request", "operationDigest", "journalPath"])
    const authority = canonicalAuthority(raw.authority), request = decodeFundingRequest(raw.request)
    insist(typeof raw.operationId === "string" && /^op_[0-9a-f]{32}$/.test(raw.operationId))
    const operationId = raw.operationId, digest = canonicalDigest(raw.operationDigest)
    insist(digestOperation(authority, request, operationId) === digest)
    const io = Object.freeze({ ...trustedIO }), location = await locations({ authority, journalPath: raw.journalPath as string }, io)
    await ensureNamespace(location, io)
    await absent(join(location.accountDir, "poison"))
    // O_EXCL is the cross-process gate. Never erase it on any later failure.
    const claim = await open(location.claimPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    ownedLocation = { directory: location.accountDir, digest }
    try {
      await privateFile(claim)
      await io.checkpoint?.("claim_write", claim)
      await claim.writeFile(claimBytes(authority, operationId, digest, location.locatorDigest))
      await io.checkpoint?.("claim_sync", claim); await claim.sync()
    } finally { await claim.close() }
    await syncDir(location.accountDir, io)
    file = await open(location.path, constants.O_RDWR | constants.O_APPEND | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    await privateFile(file)
    const header = JSON.stringify({ format: FORMAT, authority, operationId, request: JSON.parse(encodeFundingRequest(request)), operationDigest: digest, locatorDigest: location.locatorDigest })
    insist(Buffer.byteLength(header) <= MAX_LINE)
    await io.checkpoint?.("header_write", file); await file.writeFile(header + "\n")
    await io.checkpoint?.("header_sync", file); await file.sync(); await syncDir(location.parent, io)
    let snapshot = decodeJournal(header + "\n", location)
    const owned = file
    let closing = false, closed = false, poisoned = false, closePromise: Promise<void> | undefined
    let tail: Promise<void> = Promise.resolve()
    const journal: FundingJournal = Object.freeze({
      readHead: () => snapshot.head,
      snapshot: () => snapshot,
      append(expectedHead: FundingJournalHead, inputEvent: FundingPublicEvent) {
        let event: FundingPublicEvent
        let expected: FundingJournalHead
        try {
          insist(!closing && !closed && !poisoned)
          event = captureFundingPublicEvent(inputEvent)
          insist(event.facts.operationDigest === digest && event.event !== "finalized")
          const rawHead = own(expectedHead); exact(rawHead, ["sequence", "hash"])
          insist(typeof rawHead.sequence === "number" && Number.isSafeInteger(rawHead.sequence) && rawHead.sequence >= 0)
          expected = Object.freeze({ sequence: rawHead.sequence, hash: canonicalDigest(rawHead.hash) })
        } catch { return Promise.reject(new FundingJournalError()) }
        const operation = tail.then(async () => {
          insist(!closed && !poisoned && headEqual(expected, snapshot.head) && snapshot.events.length < MAX_EVENTS)
          validateTransition(snapshot.events, event, authority, request, operationId)
          const current = decodeJournal(await boundRead(owned), location)
          insist(headEqual(current.head, snapshot.head))
          const payload = JSON.stringify({ sequence: snapshot.head.sequence + 1, previousHash: snapshot.head.hash,
            event: JSON.parse(encodeFundingPublic(event)) })
          const rowHash = hash(payload), row = payload.slice(0, -1) + `,"hash":"${rowHash}"}\n`
          insist(Buffer.byteLength(row) <= MAX_LINE && (await owned.stat()).size + Buffer.byteLength(row) <= MAX_FILE)
          try {
            await io.checkpoint?.("append_write", owned); await owned.writeFile(row)
            await io.checkpoint?.("append_sync", owned); await owned.sync(); await syncDir(location.parent, io)
          } catch { poisoned = true; await poison(location.accountDir, digest); fail() }
          snapshot = Object.freeze({ ...snapshot, head: Object.freeze({ sequence: snapshot.head.sequence + 1, hash: rowHash }),
            events: Object.freeze([...snapshot.events, event]) })
          return snapshot.head
        }).catch(() => { throw new FundingJournalError() })
        tail = operation.then(() => {}, () => {})
        return operation
      },
      close() {
        if (closePromise) return closePromise
        closing = true
        closePromise = (async () => {
          await tail
          let witness: FileHandle | undefined
          try {
            await io.checkpoint?.("close", owned); await owned.close(); closed = true; insist(!poisoned)
            // This records that the MAIN journal handle's close already returned.
            // It does not claim that every later marker/finalizer close succeeds.
            witness = await open(marker(location.accountDir, digest, "clean-close"),
              constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
            await io.checkpoint?.("witness_write", witness)
            await witness.writeFile(JSON.stringify({ format: FORMAT, operationDigest: digest, locatorDigest: location.locatorDigest,
              mainClosed: true, head: snapshot.head }) + "\n")
            await io.checkpoint?.("witness_sync", witness); await witness.sync()
            await syncDir(location.accountDir, io)
            await io.checkpoint?.("witness_close", witness); await witness.close(); witness = undefined
          } catch {
            poisoned = true; closed = true
            if (witness) await witness.close().catch(() => {})
            await owned.close().catch(() => {})
            await poison(location.accountDir, digest)
            throw new FundingJournalError()
          }
        })()
        return closePromise
      }
    })
    return journal
  } catch {
    if (file) await file.close().catch(() => {})
    if (ownedLocation) await poison(ownedLocation.directory, ownedLocation.digest)
    return fail()
  }
}

/** Internal trusted-runtime seam. The verifier must independently derive complete
 * terminal facts from bounded wire evidence; accepting caller-supplied success is
 * not a production adapter. This function never signs or performs chain IO. */
export async function finalizeFundingJournal(input: FundingJournalRead,
  verify: (snapshot: FundingJournalSnapshot) => Promise<FundingPublicEvent>, trustedIO: FundingJournalIO = {}): Promise<FundingJournalSnapshot> {
  let file: FileHandle | undefined
  let ownedLocation: { readonly directory: string; readonly digest: Hex } | undefined
  try {
    insist(typeof verify === "function")
    const io = Object.freeze({ ...trustedIO }), location = await locations(input, io)
    await privateDir(location.accountDir)
    const snapshot = await readFundingJournal(input, io)
    await absent(join(location.accountDir, "poison"))
    let cleanClose = false
    try {
      const witness = own(JSON.parse(await readOwned(marker(location.accountDir, snapshot.operationDigest, "clean-close"))))
      exact(witness, ["format", "operationDigest", "locatorDigest", "mainClosed", "head"])
      insist(witness.format === FORMAT && witness.operationDigest === snapshot.operationDigest && witness.locatorDigest === snapshot.locatorDigest && witness.mainClosed === true)
      const witnessHead = own(witness.head); exact(witnessHead, ["sequence", "hash"])
      insist(witnessHead.sequence === snapshot.head.sequence && witnessHead.hash === snapshot.head.hash)
      cleanClose = true
    } catch (error) { if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
    const previous = snapshot.events.at(-1)
    const unsigned = previous?.event === "refused" || previous?.event === "noop"
    let prepared: FundingPublicEvent | undefined
    if (unsigned) {
      insist(cleanClose)
      insist(!snapshot.events.some(row => /_(intent|prepared|submitted)$/.test(row.event) || row.facts.signerEntered || row.facts.submitted))
    } else {
      const stage = snapshot.request.kind === "deposit" ? "deposit" : "mint"
      insist(snapshot.events.some(row => row.event === "planned") && snapshot.events.some(row => row.event === `${stage}_intent`))
      prepared = snapshot.events.find(row => row.event === `${stage}_prepared`)
      insist(prepared !== undefined && prepared.facts.amount !== undefined && prepared.facts.nonce !== undefined && prepared.facts.gas !== undefined &&
        prepared.facts.maxFeePerGas !== undefined && prepared.facts.maxPriorityFeePerGas !== undefined)
      canonicalDigest(prepared.facts.txHash); canonicalDigest(prepared.facts.calldataHash)
      // A submitted ACK may have been lost. Exact prepared bytes/hash plus the
      // independent complete effects verifier below are required, never a replay.
    }
    const event = captureFundingPublicEvent(await verify(snapshot))
    insist(event.event === "finalized" && event.facts.operationDigest === snapshot.operationDigest)
    if (unsigned) insist(event.facts.terminalKind === (previous?.event === "noop" ? "noop" : "unsigned_refusal"))
    else {
      insist(event.facts.terminalKind === (snapshot.request.kind === "deposit" ? "credited" : "withdrawal_complete") &&
        event.facts.txHash === prepared!.facts.txHash && event.facts.amount === prepared!.facts.amount)
      if (snapshot.request.kind === "withdrawal") {
        canonicalDigest(event.facts.sourceTxHash); canonicalDigest(event.facts.sourceBlockHash)
        insist(event.facts.actualFee !== undefined && event.facts.actualFee <= snapshot.request.maxFee)
      }
    }
    validateTransition(snapshot.events, event, snapshot.authority, snapshot.request, snapshot.operationId)
    // A distinct persistent finalizer claim serializes explicit retirement. Its
    // presence is never a reason to retry/repair a prior ambiguous finalization.
    const lease = await open(marker(location.accountDir, snapshot.operationDigest, "finalizer"),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    ownedLocation = { directory: location.accountDir, digest: snapshot.operationDigest }
    try { await lease.writeFile(JSON.stringify({ format: FORMAT, operationDigest: snapshot.operationDigest }) + "\n"); await lease.sync() }
    finally { await lease.close() }
    await syncDir(location.accountDir, io)
    file = await open(location.path, constants.O_RDWR | constants.O_APPEND | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const before = await boundRead(file), current = decodeJournal(before, location)
    insist(headEqual(current.head, snapshot.head))
    insist(await readOwned(location.claimPath) === claimBytes(snapshot.authority, snapshot.operationId, snapshot.operationDigest, snapshot.locatorDigest))
    await absent(join(location.accountDir, "poison"))
    const payload = JSON.stringify({ sequence: snapshot.head.sequence + 1, previousHash: snapshot.head.hash, event: JSON.parse(encodeFundingPublic(event)) })
    const row = payload.slice(0, -1) + `,"hash":"${hash(payload)}"}\n`
    insist(Buffer.byteLength(row) <= MAX_LINE && Buffer.byteLength(before + row) <= MAX_FILE)
    const finalized = decodeJournal(before + row, location)
    await io.checkpoint?.("finalization_write", file); await file.writeFile(row); await file.sync(); await syncDir(location.parent, io)
    await file.close(); file = undefined
    // Durable finalization precedes retirement of only this exact matching claim.
    insist(await readOwned(location.claimPath) === claimBytes(snapshot.authority, snapshot.operationId, snapshot.operationDigest, snapshot.locatorDigest))
    await io.checkpoint?.("claim_retire")
    await unlink(location.claimPath); await syncDir(location.accountDir, io)
    return finalized
  } catch {
    if (file) await file.close().catch(() => {})
    if (ownedLocation) await poison(ownedLocation.directory, ownedLocation.digest)
    return fail()
  }
}
