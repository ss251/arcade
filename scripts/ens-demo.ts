/** Finite OWNER-gated ENS evidence. Importing or --help never reads state, keys, or RPC. */
import { BaseError, ContractFunctionRevertedError, decodeErrorResult, encodeErrorResult, encodeFunctionData, keccak256, stringToHex, parseAbi, type Account, type Hex } from "viem"
import { namehash } from "viem/ens"
import { ARC_CAIP2, USDC_ADDRESS, dnsNameOf, RpcFailure, decodeEnsState, PERMISSIONED_RESOLVER_ABI, PERMISSIONED_REGISTRY_ABI, VERIFIABLE_FACTORY_ABI, ENS_TEXT_KEYS, RegistryRoles, labelId, loadEnsDeployments, type EnsState } from "@arcade/core"
import { callSkillPromise, resolveEnsListingPromise, parseArcadeEndpoint, ensRefusal, EnsNameExpired, sepoliaEnsReader, type EnsReader } from "@arcade/buyer"
import { resolverResource, publicSetupJson } from "./ens-setup-skills.ts"
import { viemEnsWriter, type EnsWriter } from "../packages/runner/src/ens.ts"
import type { RegistryDriver, SetupCall } from "./ens-setup.ts"
import { setupPublicClient } from "./ens-setup-runtime.ts"
import { openSetupSession } from "./ens-setup-driver.ts"
import { readEnsState, ensStatePath } from "../packages/runner/src/ens-state.ts"
import { ensJournalPath } from "../packages/runner/src/ens-journal.ts"
import { privateKeyToAccount } from "viem/accounts"
import { resolve } from "node:path"

const fail = () => new Error("ENS demo refused or unavailable; inspect public state and reconcile any retained journal/hash before retrying. Private diagnostics withheld.")
function insist(value: unknown): asserts value { if (!value) throw fail() }
const same = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase()
const address = (v: unknown): v is Hex => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v) && !/^0x0{40}$/i.test(v)
const UINT = 1n << 256n
const READ_BUDGET_MS = 30_000
const hash = (v: unknown): v is Hex => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v) && !/^0x0{64}$/i.test(v)
const uint = (v: unknown, bits = 256): v is bigint => typeof v === "bigint" && v >= 0n && v < 1n << BigInt(bits)
const bounded = <T>(work: () => Promise<T>, ms = 10_000): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(fail()), ms)
  Promise.resolve().then(work).then(value => { clearTimeout(timer); resolve(value) }, () => { clearTimeout(timer); reject(fail()) })
})
const readBatch = async <A, B>(items: readonly A[], work: (item: A) => Promise<B>): Promise<B[]> => {
  insist(items.length <= 32)
  const results = new Array<B>(items.length); let next = 0
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    for (;;) { const i = next++; if (i >= items.length) return; results[i] = await work(items[i]!) }
  }))
  return results
}
export interface DemoArgs {
  readonly beat: "price-lock" | "tampered-402" | "expiry" | "all"
  readonly name: string; readonly confirmedName?: string
  readonly timeoutMs: number; readonly pollMs: number
}
export const parseDemoArgs = (argv: readonly string[]): DemoArgs => {
  insist(argv.length > 0 && argv.length <= 11)
  const beat = argv[0]; insist(beat === "price-lock" || beat === "tampered-402" || beat === "expiry" || beat === "all")
  const fields = new Map<string, string>()
  for (let i = 1; i < argv.length; i += 2) {
    const key = argv[i]!, value = argv[i + 1]
    insist(["--name", "--confirm-name", "--timeout-ms", "--poll-ms"].includes(key) && !fields.has(key) && typeof value === "string" && value.length <= 253)
    fields.set(key, value)
  }
  const name = fields.get("--name"); insist(typeof name === "string" && /^[a-z0-9.-]+\.eth$/.test(name)); dnsNameOf(name)
  const confirmedName = fields.get("--confirm-name")
  insist(confirmedName === undefined || confirmedName === name)
  if (beat === "price-lock" || beat === "all") insist(confirmedName === name)
  const milliseconds = (key: string, fallback: number, min: number, max: number) => {
    const raw = fields.get(key); insist(raw === undefined || /^[1-9][0-9]{0,7}$/.test(raw))
    const value = raw === undefined ? fallback : Number(raw); insist(Number.isSafeInteger(value) && value >= min && value <= max); return value
  }
  const timeoutMs = milliseconds("--timeout-ms", 1_500_000, 1000, 1_500_000), pollMs = milliseconds("--poll-ms", 5000, 1000, 30_000)
  insist(pollMs <= timeoutMs)
  return { beat, name, timeoutMs, pollMs, ...(confirmedName === undefined ? {} : { confirmedName }) }
}

// contracts-v2 @97a57293f3b4279d94b571e678edb53ce62638f4:
// access-control/interfaces/IEnhancedAccessControl.sol + PermissionedResolver.onlyPartRoles.
// Denial uses the WIDEST name resource (part=0), not the particular denied text key.
const DENIAL_ABI = parseAbi(["error EACUnauthorizedAccountRoles(uint256 resource,uint256 roleBitmap,address account)"])
export const isPermissionDenial = (raw: unknown, name: string, daemon: string): boolean => {
  try {
    if (typeof raw !== "string" || !/^0x4b27a133[0-9a-fA-F]{192}$/.test(raw) || !address(daemon)) return false
    const decoded = decodeErrorResult({ abi: DENIAL_ABI, data: raw as Hex })
    return decoded.errorName === "EACUnauthorizedAccountRoles" && decoded.args[0] === resolverResource(namehash(name)) &&
      decoded.args[1] === 16n && same(decoded.args[2], daemon) &&
      encodeErrorResult({ abi: DENIAL_ABI, errorName: decoded.errorName, args: decoded.args }).toLowerCase() === raw.toLowerCase()
  } catch { return false }
}
export interface NameContext { readonly name: string; readonly seller: string; readonly skillId: string; readonly reader: EnsReader }
const resolvedName = async (c: NameContext) => {
  const listing = await resolveEnsListingPromise(c.reader, c.name), endpoint = parseArcadeEndpoint(listing.endpoint)
  insist(same(endpoint.seller, c.seller) && endpoint.skillId === c.skillId && listing.chainCaip2 === ARC_CAIP2)
  return listing
}
/** Actual SDK, deliberately synthetic challenges. No account key or external HTTP. */
export const tampered402 = async (c: NameContext) => {
  const listing = await resolvedName(c)
  insist(ensRefusal(listing, { payTo: listing.payTo, network: listing.chainCaip2 }) === null)
  let signatures = 0, probes = 0, paidRequests = 0
  const neverSign = async (): Promise<never> => { signatures++; throw fail() }
  const sentinel: Account = { address: "0x1111111111111111111111111111111111111111", type: "local", source: "custom",
    publicKey: "0x", signMessage: neverSign, signTransaction: neverSign, signTypedData: neverSign }
  const other = same(listing.payTo, "0x1111111111111111111111111111111111111111")
    ? "0x2222222222222222222222222222222222222222" : "0x1111111111111111111111111111111111111111"
  const refusals: string[] = []
  const snapshot: EnsReader = { getEnsText: async ({ name, key }) => {
    insist(name === listing.name)
    return ({ "arcade.endpoint": listing.endpoint, "arcade.payTo": listing.payTo, "arcade.chain": listing.chainCaip2,
      "arcade.priceAtomic": (listing.priceAtomic ?? 1n).toString() } as Record<string, string>)[key] ?? null
  } }
  for (const mutation of [{ payTo: other, network: listing.chainCaip2 }, { payTo: listing.payTo, network: "eip155:1" }]) {
    const fetcher = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(String(input), init)
      if (request.headers.has("payment-signature") || request.headers.has("x-payment")) paidRequests++
      insist(request.url === listing.endpoint && request.method === "POST" && paidRequests === 0)
      probes++
      return Response.json({ x402Version: 2, accepts: [{ scheme: "exact", amount: "1", asset: USDC_ADDRESS,
        resource: listing.endpoint, maxTimeoutSeconds: 604900, ...mutation }] }, { status: 402 })
    }, { preconnect: () => {} }) as typeof fetch
    let refused = false
    try { await callSkillPromise({ name: c.name, input: {}, account: sentinel, ensReader: snapshot, fetch: fetcher,
      maxAmountAtomic: 1n, pollIntervalMs: 1, maxWaitMs: 10 }) }
    catch (error) { refused = error instanceof RpcFailure && error.method === "beforeSign" && error.reason.startsWith("ens_payto_mismatch:") }
    insist(refused && signatures === 0 && paidRequests === 0); refusals.push("ens_payto_mismatch")
  }
  insist(probes === 2)
  return { beat: "tampered-402" as const, name: listing.name, syntheticChallenge: true, signatures, probes, paidRequests, refusals }
}

export interface RegistrationSnapshot {
  readonly blockNumber: bigint; readonly blockHash: Hex; readonly timestamp: bigint
  readonly expiry: bigint; readonly owner: string; readonly latestOwner: string
  readonly tokenId: bigint; readonly resource: bigint; readonly status: number
}
export interface ExpiryContext extends NameContext {
  readonly args: DemoArgs
  readonly snapshot: () => Promise<RegistrationSnapshot>
  readonly catalog: () => Promise<{ readonly present: boolean; readonly watcherConfirmed: boolean }>
  readonly now: () => number; readonly sleep: (ms: number) => Promise<void>
  readonly signal?: AbortSignal
  readonly onBaseline?: (snapshot: RegistrationSnapshot) => void
}
const snapshotValid = (s: RegistrationSnapshot) => {
  insist(uint(s.blockNumber) && hash(s.blockHash) && uint(s.timestamp, 64) && uint(s.expiry, 64) &&
    uint(s.tokenId) && uint(s.resource) && address(s.latestOwner) && typeof s.owner === "string" && /^0x[0-9a-fA-F]{40}$/.test(s.owner) &&
    [0, 1, 2].includes(s.status))
  return s
}
/** Natural expiry requires the actual chain clock and registration identity. A
 * disappeared listing alone can be normal runner disconnect, not watcher evidence. */
export const expiry = async (c: ExpiryContext) => {
  try {
    insist(c.args.name === c.name && Number.isSafeInteger(c.args.timeoutMs) && c.args.timeoutMs >= 1000 && c.args.timeoutMs <= 1_500_000 &&
      Number.isSafeInteger(c.args.pollMs) && c.args.pollMs >= 1000 && c.args.pollMs <= 30_000 && c.args.pollMs <= c.args.timeoutMs)
    const start = c.now(); insist(Number.isSafeInteger(start) && start >= 0)
    const deadline = start + c.args.timeoutMs
    let previousTime = start
    const remaining = () => {
      const now = c.now(); insist(Number.isSafeInteger(now) && now >= previousTime && !c.signal?.aborted); previousTime = now
      insist(now < deadline); return Math.min(READ_BUDGET_MS, deadline - now)
    }
    const first = snapshotValid(await bounded(c.snapshot, remaining()))
    insist(first.status === 2 && same(first.owner, c.seller) && same(first.latestOwner, c.seller) && first.expiry > first.timestamp)
    await bounded(() => resolvedName(c), remaining())
    insist((await bounded(c.catalog, remaining())).present === true)
    c.onBaseline?.(first)
    let last = first
    for (;;) {
      const duration = Math.min(c.args.pollMs, remaining())
      await bounded(() => c.sleep(duration), duration + 1000)
      const current = snapshotValid(await bounded(c.snapshot, remaining()))
      insist(current.blockNumber >= last.blockNumber && current.timestamp >= last.timestamp && current.expiry >= last.expiry &&
        current.tokenId === first.tokenId && same(current.latestOwner, first.latestOwner) &&
        (current.blockNumber !== last.blockNumber || same(current.blockHash, last.blockHash) && current.timestamp === last.timestamp))
      if (current.timestamp < current.expiry) {
        insist(current.status === 2 && same(current.owner, c.seller) && current.resource === first.resource)
        last = current; continue
      }
      // PermissionedRegistry._constructResource @97a5729 adds one to LOW32 eacVersion
      // on passive expiry; tokenId/latestOwner remain unchanged. Unregister changes them.
      const version = first.resource & 0xffffffffn
      insist(version < 0xffffffffn && current.resource === (first.resource & ~0xffffffffn | version + 1n) &&
        current.status === 0 && /^0x0{40}$/i.test(current.owner))
      let absent = false
      try { await bounded(() => resolveEnsListingPromise(c.reader, c.name).catch(error => {
        if (error instanceof EnsNameExpired) { absent = true; return undefined }
        throw error
      }), remaining()) } catch { throw fail() }
      insist(absent)
      const observed = await bounded(c.catalog, remaining())
      insist(typeof observed.present === "boolean" && typeof observed.watcherConfirmed === "boolean")
      if (!observed.present) return { beat: "expiry" as const, name: c.name, registrationExpired: true, listingAbsent: true,
        watcherConfirmed: observed.watcherConfirmed, cause: observed.watcherConfirmed ? "matching listing marked ensExpired" : "catalogue removal cause unproven",
        initialBlock: first.blockNumber.toString(), observedBlock: current.blockNumber.toString(), initialExpiry: first.expiry.toString(),
        expiredAt: current.expiry.toString(), observedChainTimestamp: current.timestamp.toString(), ownerRevivalRequired: true }
      last = current
    }
  } catch { throw fail() }
}

export interface PriceInspection { readonly price: string; readonly priceGranted: boolean; readonly records: Readonly<Record<string, string>> }
export interface PriceContext extends NameContext {
  readonly state: EnsState; readonly args: DemoArgs; readonly inspect: () => Promise<PriceInspection>
  readonly deny: (key: string, value: string) => Promise<Hex>
  readonly writer: EnsWriter; readonly owner: RegistryDriver
  readonly prove: (tx: Hex, call: SetupCall, signer: Hex) => Promise<void>
}
const inspection = (value: PriceInspection): PriceInspection => {
  insist(typeof value.price === "string" && /^(0|[1-9][0-9]{0,77})$/.test(value.price) && BigInt(value.price) < UINT && typeof value.priceGranted === "boolean")
  const entries = Object.entries(value.records); insist(entries.length >= 3 && entries.length <= 12)
  const records: Record<string, string> = {}
  for (const [key, text] of entries) { insist(key.length <= 256 && typeof text === "string" && new TextEncoder().encode(text).byteLength <= 4096); records[key] = text }
  return { price: value.price, priceGranted: value.priceGranted, records: Object.freeze(records) }
}
export const priceLock = async (c: PriceContext) => {
  try {
    const state = decodeEnsState(c.state), skill = state.skills.find(s => s.name === c.name)
    insist(skill && skill.skillId === c.skillId && same(c.seller, state.seller) && c.args.name === c.name && c.args.confirmedName === c.name &&
      address(state.owner) && address(state.daemon) && new Set([state.owner, state.seller, state.daemon]).size === 3)
    const before = BigInt(skill.priceAtomic); insist(before > 0n && before + 1000n < UINT)
    const after = (before + 1000n).toString(), node = namehash(c.name)
    const initial = inspection(await bounded(c.inspect, READ_BUDGET_MS)); insist(initial.price === skill.priceAtomic && initial.priceGranted)
    const resolved = await resolvedName(c)
    insist(resolved.priceAtomic === before && resolved.endpoint === initial.records["arcade.endpoint"] && same(resolved.payTo, initial.records["arcade.payTo"]) && resolved.chainCaip2 === initial.records["arcade.chain"])
    const denied = async (key: string, value: string) => insist(isPermissionDenial(await bounded(() => c.deny(key, value)), c.name, state.daemon!))
    const check = async (granted: boolean) => {
      const current = inspection(await bounded(c.inspect, READ_BUDGET_MS)), actual = await resolvedName(c)
      insist(current.price === after && current.priceGranted === granted && actual.priceAtomic?.toString() === after &&
        actual.endpoint === resolved.endpoint && same(actual.payTo, resolved.payTo) && actual.chainCaip2 === resolved.chainCaip2 &&
        Object.keys(current.records).length === Object.keys(initial.records).length && Object.entries(initial.records).every(([key, value]) => current.records[key] === value))
    }
    await denied("arcade.payTo", state.daemon)
    const priceCall = { address: state.resolver as Hex, abi: PERMISSIONED_RESOLVER_ABI, functionName: "setText", args: [node, "arcade.priceAtomic", after] }
    const priceTx = await c.writer.setText({ resolver: state.resolver, node, key: "arcade.priceAtomic", value: after }); insist(hash(priceTx))
    await bounded(() => c.prove(priceTx, priceCall, state.daemon as Hex)); await check(true)
    const step = `demo-price-revoke:${c.name}`, metadata = { name: c.name, resolver: state.resolver, daemon: state.daemon, before: skill.priceAtomic, after }
    const revokeCall = { address: state.resolver as Hex, abi: PERMISSIONED_RESOLVER_ABI, functionName: "authorizeTextRoles", args: [dnsNameOf(c.name), "arcade.priceAtomic", state.daemon, false] }
    insist(await bounded(c.owner.chainId) === 11155111)
    await bounded(() => c.owner.simulate(revokeCall))
    await c.owner.checkpoint({ step, state: "intent", metadata })
    const revokeTx = await c.owner.send(step, revokeCall); insist(hash(revokeTx))
    await bounded(() => c.prove(revokeTx, revokeCall, state.owner as Hex))
    await c.owner.checkpoint({ step, state: "confirmed", txHash: revokeTx, metadata })
    await check(false); await denied("arcade.priceAtomic", skill.priceAtomic); await denied("arcade.payTo", state.daemon)
    return { beat: "price-lock" as const, name: c.name, before: skill.priceAtomic, after, priceTx, revokeTx,
      denial: "EACUnauthorizedAccountRoles", selector: "0x4b27a133", records: "known routing/context records unchanged",
      restoration: "Explicit owner price restoration and separate scoped regrant required; do not rerun setup blindly or automatically resend." }
  } catch { throw fail() }
}

type Fetcher = (request: Request) => Promise<Response>
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
/** A receipt alone is not proof of the intended call. Re-read its transaction and
 * correlate all mined coordinates, including each log's provenance. Never resend. */
export const verifyDemoTransaction = (tx: Hex, call: SetupCall, signer: Hex, transaction: unknown, receipt: unknown): void => {
  insist(hash(tx) && address(signer) && object(transaction) && object(receipt))
  insist(same(transaction.hash, tx) && same(receipt.transactionHash, tx) && receipt.status === "success" &&
    same(transaction.from, signer) && same(receipt.from, signer) && same(transaction.to, call.address) && same(receipt.to, call.address) &&
    same(transaction.input, encodeFunctionData(call)) && transaction.value === 0n && transaction.chainId === 11155111 &&
    hash(transaction.blockHash) && same(transaction.blockHash, receipt.blockHash) && uint(transaction.blockNumber) && transaction.blockNumber === receipt.blockNumber &&
    Number.isSafeInteger(transaction.transactionIndex) && (transaction.transactionIndex as number) >= 0 && transaction.transactionIndex === receipt.transactionIndex &&
    Array.isArray(receipt.logs) && receipt.logs.length <= 128)
  for (const log of receipt.logs) insist(object(log) && (log.removed === undefined || log.removed === false) && same(log.transactionHash, tx) && same(log.blockHash, receipt.blockHash) &&
    log.blockNumber === receipt.blockNumber && (log.transactionIndex === undefined || log.transactionIndex === receipt.transactionIndex) &&
    Number.isSafeInteger(log.logIndex) && (log.logIndex as number) >= 0 && address(log.address) &&
    typeof log.data === "string" && /^0x(?:[0-9a-fA-F]{2})*$/.test(log.data) && log.data.length <= 131074 &&
    Array.isArray(log.topics) && log.topics.length <= 4 && log.topics.every(t => typeof t === "string" && /^0x[0-9a-fA-F]{64}$/.test(t)))
}

export const observeCatalog = async (origin: string, name: string, seller: string, skillId: string, fetcher: Fetcher = fetch) => {
  const url = new URL(origin)
  insist(url.origin === origin && !url.username && !url.password &&
    (url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) &&
    address(seller) && /^[a-z0-9][a-z0-9-]{0,62}$/.test(skillId))
  const list = await publicSetupJson(new Request(`${origin}/listings`), fetcher)
  insist(list.status === 200 && Array.isArray(list.value) && list.value.length <= 4096)
  let present = false
  for (const row of list.value) { insist(object(row) && typeof row.id === "string" && address(row.seller)); if (row.id === skillId && same(row.seller, seller)) present = true }
  const detail = await publicSetupJson(new Request(`${origin}/listings/${encodeURIComponent(skillId)}`), fetcher)
  if (detail.status === 404) { insist(!present); return { present: false, watcherConfirmed: false } }
  insist(detail.status === 200 && object(detail.value) && detail.value.id === skillId && same(detail.value.seller, seller))
  if (present) { insist(detail.value.ensExpired !== true); return { present: true, watcherConfirmed: false } }
  return { present: false, watcherConfirmed: detail.value.ensName === name && detail.value.ensExpired === true }
}

/** The only raw contract-error boundary. Plain provider error text/data is never
 * treated as proof: viem must have decoded the exact pinned ABI error. */
export interface DemoChain {
  readonly close: () => void
  readonly block: (number?: bigint) => Promise<{ readonly number: bigint; readonly hash: Hex; readonly timestamp: bigint }>
  readonly read: (call: SetupCall, blockNumber: bigint) => Promise<unknown>
  readonly code: (target: Hex, blockNumber: bigint) => Promise<Hex | undefined>
  readonly deny: (call: SetupCall, daemon: Hex, name: string) => Promise<Hex>
  readonly prove: (tx: Hex, call: SetupCall, signer: Hex) => Promise<void>
}
export const demoPublicClient = (rpc: string, fetcher: Fetcher = fetch): DemoChain => {
  const controller = new AbortController()
  const pub = setupPublicClient(rpc, request => {
    insist(!controller.signal.aborted)
    return fetcher(new Request(request, { signal: AbortSignal.any([request.signal, controller.signal]) }))
  })
  const chain = async () => insist(!controller.signal.aborted && await pub.getChainId() === 11155111)
  return {
    close: () => controller.abort(),
    block: async number => { await chain(); return pub.getBlock(number === undefined ? { blockTag: "latest" } : { blockNumber: number }) },
    // These read methods are used only inside a block snapshot: block() checks
    // the actual chain both before and after. Avoid doubling every pinned RPC.
    read: async (call: SetupCall, blockNumber: bigint) => { insist(!controller.signal.aborted); return pub.readContract({ ...call, blockNumber }) },
    code: async (target: Hex, blockNumber: bigint) => { insist(!controller.signal.aborted); return pub.getCode({ address: target, blockNumber }) },
    deny: async (call: SetupCall, daemon: Hex, name: string): Promise<Hex> => {
      try {
        await chain()
        await pub.simulateContract({ ...call, abi: [...call.abi, ...DENIAL_ABI], account: daemon })
      } catch (error) {
        if (error instanceof BaseError) {
          const revert = error.walk(cause => cause instanceof ContractFunctionRevertedError)
          if (revert instanceof ContractFunctionRevertedError && revert.data?.errorName === "EACUnauthorizedAccountRoles" && isPermissionDenial(revert.raw, name, daemon)) return revert.raw!
        }
        throw fail()
      }
      throw fail()
    },
    prove: async (tx: Hex, call: SetupCall, signer: Hex) => {
      await chain()
      const receipt = await pub.getTransactionReceipt({ hash: tx }), transaction = await pub.getTransaction({ hash: tx })
      verifyDemoTransaction(tx, call, signer, transaction, receipt)
    },
  }
}

const VIEWS = parseAbi(["function ROOT_REGISTRY() view returns(address)", "function getResolver(string label) view returns(address)",
  "function getParent() view returns(address parent,string label)", "function getAlias(bytes fromName) view returns(bytes)",
  "function roles(uint256 resource,address account) view returns(uint256)"])
/** Every snapshot is pinned to a successful block, then that block is re-read to
 * refuse a reorg during its registry/text reads. No wildcard or CCIP authority. */
export const demoObservation = (rawState: EnsState, name: string, pub: DemoChain) => {
  const state = decodeEnsState(rawState), skill = state.skills.find(s => s.name === name), d = loadEnsDeployments().find(d => d.set === state.deploymentSet)
  insist(skill && d && same(d.universalResolver, state.universalResolver))
  const at = async <T>(work: (read: (call: SetupCall) => Promise<unknown>, snap: RegistrationSnapshot) => Promise<T>): Promise<T> => {
    const block = await pub.block(); insist(uint(block.number) && hash(block.hash) && uint(block.timestamp, 64))
    const read = (call: SetupCall) => pub.read(call, block.number)
    const registry = (address: Hex, functionName: string, args: readonly unknown[] = []) => read({ address, abi: PERMISSIONED_REGISTRY_ABI, functionName, args })
    const view = (address: Hex, functionName: string, args: readonly unknown[] = []) => read({ address, abi: VIEWS, functionName, args })
    insist(same(await view(d.universalResolver, "ROOT_REGISTRY"), d.rootRegistry) &&
      same(await registry(d.rootRegistry, "getSubregistry", ["eth"]), d.ethRegistry))
    await readBatch([[state.sellerRegistry, d.userRegistryImpl], [state.skillRegistry, d.userRegistryImpl], [state.resolver, d.permissionedResolverImpl]] as const, async ([proxy, implementation]) => {
      const code = await pub.code(proxy as Hex, block.number)
      insist(typeof code === "string" && /^0x(?:[0-9a-fA-F]{2})+$/.test(code) && code.length <= 262146 &&
        same(await read({ address: d.verifiableFactory, abi: VERIFIABLE_FACTORY_ABI, functionName: "verifyContract", args: [proxy] }), implementation))
    })
    const rootLabel = state.root.slice(0, -4)
    for (const [parent, label, child, owner] of [[d.ethRegistry, rootLabel, state.sellerRegistry, state.owner], [state.sellerRegistry, state.sellerLabel, state.skillRegistry, state.seller]] as const) {
      const parentId = labelId(label), [expiry, currentOwner, subregistry, reverse] = await Promise.all([
        registry(parent as Hex, "getExpiry", [parentId]), registry(parent as Hex, "getOwner", [parentId]),
        registry(parent as Hex, "getSubregistry", [label]), view(child as Hex, "getParent")])
      insist(address(owner) && uint(expiry, 64) && expiry > block.timestamp && same(currentOwner, owner) && same(subregistry, child))
      insist(Array.isArray(reverse) && reverse.length === 2 && same(reverse[0], parent) && reverse[1] === label)
    }
    const id = labelId(skill.label), info = await registry(state.skillRegistry as Hex, "getState", [id])
    insist(object(info))
    const expiry = await registry(state.skillRegistry as Hex, "getExpiry", [id]), owner = await registry(state.skillRegistry as Hex, "getOwner", [id])
    insist(uint(expiry, 64) && info.expiry === expiry && typeof owner === "string" && typeof info.latestOwner === "string" &&
      uint(info.tokenId) && uint(info.resource) && typeof info.status === "number")
    const snap = snapshotValid({ blockNumber: block.number, blockHash: block.hash, timestamp: block.timestamp, expiry,
      owner, latestOwner: info.latestOwner, tokenId: info.tokenId, resource: info.resource, status: info.status })
    if (expiry > block.timestamp) insist(snap.status === 2 && same(owner, state.seller) && same(info.latestOwner, state.seller) &&
      same(await view(state.skillRegistry as Hex, "getResolver", [skill.label]), state.resolver))
    const result = await work(read, snap), confirmed = await pub.block(block.number)
    insist(confirmed.number === block.number && same(confirmed.hash, block.hash) && confirmed.timestamp === block.timestamp)
    return result
  }
  return {
    snapshot: () => at(async (_read, snap) => snap),
    inspect: () => at(async (read, snap): Promise<PriceInspection> => {
      insist(snap.status === 2 && snap.expiry > snap.timestamp && address(state.daemon) && address(state.owner) &&
        new Set([state.owner, state.seller, state.daemon].map(v => v.toLowerCase())).size === 3)
      const node = namehash(name), text = async (key: string) => {
        const value = await read({ address: state.resolver as Hex, abi: PERMISSIONED_RESOLVER_ABI, functionName: "text", args: [node, key] })
        insist(typeof value === "string" && new TextEncoder().encode(value).byteLength <= 4096); return value
      }
      insist(await read({ address: state.resolver as Hex, abi: VIEWS, functionName: "getAlias", args: [dnsNameOf(name)] }) === "0x")
      const zeroNode = `0x${"00".repeat(32)}` as Hex
      const roleRead = (target: string, resource: bigint) => read({ address: target as Hex, abi: VIEWS, functionName: "roles", args: [resource, state.daemon] })
      insist(await roleRead(state.skillRegistry, 0n) === 0n)
      const renewRoles = await roleRead(state.skillRegistry, labelId(skill.label)); insist(renewRoles === 0n || renewRoles === RegistryRoles.RENEW)
      // Match setup's exact raw role policy, including ADMIN bits: a bitmap which
      // does not currently execute setText could still grant itself that power.
      for (const resource of [0n, resolverResource(node)]) insist(await roleRead(state.resolver, resource) === 0n)
      insist(await read({ address: state.skillRegistry as Hex, abi: PERMISSIONED_REGISTRY_ABI, functionName: "hasRootRoles", args: [RegistryRoles.RENEW, state.daemon] }) === false)
      const keys = Object.values(ENS_TEXT_KEYS), roles = await readBatch(keys.flatMap(key => [
        { key, wildcard: true, resource: resolverResource(zeroNode, key) }, { key, wildcard: false, resource: resolverResource(node, key) },
      ]), async ({ key, wildcard, resource }) => {
        const bitmap = await roleRead(state.resolver, resource)
        insist(!wildcard && key === ENS_TEXT_KEYS.priceAtomic ? bitmap === 0n || bitmap === 16n : bitmap === 0n)
        return { key, wildcard, bitmap }
      })
      const records: Record<string, string> = {}
      // These are the six known non-price records only. State has no arbitrary
      // agent-registration key inventory, so do not pretend it was independently read.
      for (const [key, value] of await readBatch(keys.filter(key => key !== ENS_TEXT_KEYS.priceAtomic), async key => [key, await text(key)] as const)) records[key] = value
      return inspection({ price: await text(ENS_TEXT_KEYS.priceAtomic), priceGranted: roles.find(v => !v.wildcard && v.key === ENS_TEXT_KEYS.priceAtomic)?.bitmap === 16n, records })
    }),
    deny: (key: string, value: string) => { insist(address(state.daemon)); return pub.deny({ address: state.resolver as Hex, abi: PERMISSIONED_RESOLVER_ABI, functionName: "setText", args: [namehash(name), key, value] }, state.daemon, name) },
    prove: pub.prove,
  }
}

type Env = Readonly<Record<string, string | undefined>>
export interface DemoRuntimeOptions {
  readonly fetch?: Fetcher; readonly readState?: typeof readEnsState
  readonly chain?: DemoChain; readonly reader?: EnsReader
  readonly openSession?: typeof openSetupSession; readonly writer?: typeof viemEnsWriter
  readonly now?: () => number; readonly sleep?: (ms: number) => Promise<void>; readonly signal?: AbortSignal
  readonly onProgress?: (event: { readonly kind: "expiry-baseline"; readonly name: string; readonly block: string; readonly expiry: string; readonly message: string }) => void
}
export const runEnsDemo = async (input: DemoArgs, env: Env = process.env, options: DemoRuntimeOptions = {}) => {
  let pub: DemoChain | undefined, session: Awaited<ReturnType<typeof openSetupSession>> | undefined, writer: EnsWriter | undefined
  let opening: Promise<Awaited<ReturnType<typeof openSetupSession>>> | undefined
  let closingSession: Awaited<ReturnType<typeof openSetupSession>> | undefined, closing: Promise<void> | undefined
  const closeSession = (owned = session): Promise<void> => {
    if (!owned) return Promise.resolve()
    if (closingSession === owned && closing) return closing
    closingSession = owned; closing = Promise.resolve().then(() => owned.close()); return closing
  }
  const controller = new AbortController(), cancel = () => { controller.abort(); pub?.close(); writer?.stop?.(); void closeSession().catch(() => {}) }
  let timer: ReturnType<typeof setTimeout> | undefined
  const active = () => insist(!controller.signal.aborted)
  const interruptible = <T>(work: () => Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const aborted = () => { controller.signal.removeEventListener("abort", aborted); reject(fail()) }
    controller.signal.addEventListener("abort", aborted, { once: true })
    if (controller.signal.aborted) { aborted(); return }
    Promise.resolve().then(() => { active(); return work() }).then(value => {
      controller.signal.removeEventListener("abort", aborted)
      if (controller.signal.aborted) reject(fail()); else resolve(value)
    }, () => { controller.signal.removeEventListener("abort", aborted); reject(fail()) })
  })
  try {
    const args = parseDemoArgs([input.beat, "--name", input.name, ...(input.confirmedName === undefined ? [] : ["--confirm-name", input.confirmedName]),
      "--timeout-ms", String(input.timeoutMs), "--poll-ms", String(input.pollMs)])
    options.signal?.addEventListener("abort", cancel, { once: true }); if (options.signal?.aborted) cancel(); active()
    timer = setTimeout(cancel, args.timeoutMs)
    const path = ensStatePath(env), raw = await interruptible(() => (options.readState ?? readEnsState)(path)); insist(raw)
    const state = decodeEnsState(raw), skill = state.skills.find(s => s.name === args.name); insist(skill)
    if (args.beat === "price-lock" || args.beat === "all") insist(BigInt(skill.priceAtomic) > 0n && BigInt(skill.priceAtomic) + 1000n < UINT &&
      address(state.owner) && address(state.daemon) && new Set([state.owner, state.seller, state.daemon].map(v => v.toLowerCase())).size === 3)
    const rpc = env["ARCADE_ENS_RPC"] ?? "https://ethereum-sepolia-rpc.publicnode.com"
    const fetcher: Fetcher = req => { active(); return (options.fetch ?? fetch)(new Request(req, { signal: AbortSignal.any([req.signal, controller.signal]) })) }
    pub = options.chain ?? demoPublicClient(rpc, fetcher)
    const reader = options.reader ?? sepoliaEnsReader({ env: { ARCADE_ENS_ROOT: state.root, ARCADE_ENS_UNIVERSAL_RESOLVER: state.universalResolver,
      ARCADE_ENS_RPC: rpc, ARCADE_ENS_CCIP_ORIGINS: env["ARCADE_ENS_CCIP_ORIGINS"] }, fetch: fetcher })
    const c: NameContext = { name: args.name, seller: state.seller, skillId: skill.skillId, reader }, observation = demoObservation(state, args.name, pub)
    const initial = await interruptible(() => bounded(observation.snapshot, READ_BUDGET_MS))
    insist(initial.status === 2 && initial.expiry > initial.timestamp && same(initial.owner, state.seller))
    const listing = await interruptible(() => resolvedName(c)), origin = new URL(listing.endpoint).origin
    if (env["ARCADE_HUB"] !== undefined) insist(env["ARCADE_HUB"] === origin)
    const results: unknown[] = []
    if (args.beat === "price-lock" || args.beat === "all") {
      const inspect = await interruptible(() => bounded(observation.inspect, READ_BUDGET_MS))
      insist(inspect.price === skill.priceAtomic && inspect.priceGranted && address(state.owner) && address(state.daemon))
      const owner = state.owner, daemon = state.daemon
      const ownerPath = resolve(env["ARCADE_ENS_DEMO_JOURNAL"] ?? `${path}.demo.json`), daemonPath = resolve(env["ARCADE_ENS_DEMO_DAEMON_JOURNAL"] ?? `${path}.demo-daemon.json`)
      const protectedPaths = [path, env["ARCADE_ENS_SETUP_JOURNAL"] ?? `${path}.setup.json`, ensJournalPath(env), env["ARCADE_CONFIG_PATH"], `${env["HOME"] ?? "."}/.arcade/config.json`]
        .filter((p): p is string => p !== undefined).map(p => resolve(p))
      insist(ownerPath !== daemonPath && !protectedPaths.includes(ownerPath) && !protectedPaths.includes(daemonPath))
      // Last possible moment, only this explicitly consented beat. No keychain,
      // default account, owner config writes, or environment in diagnostics.
      active(); const ownerKey = env["ARCADE_ENS_OWNER_KEY"], daemonKey = env["ARCADE_ENS_DAEMON_KEY"]
      insist(typeof ownerKey === "string" && /^0x[0-9a-fA-F]{64}$/.test(ownerKey) && typeof daemonKey === "string" && /^0x[0-9a-fA-F]{64}$/.test(daemonKey) &&
        same(privateKeyToAccount(ownerKey as Hex).address, state.owner) && same(privateKeyToAccount(daemonKey as Hex).address, state.daemon))
      const binding = keccak256(stringToHex(JSON.stringify({ format: "ens-demo-price-v1", name: args.name, state, after: (BigInt(skill.priceAtomic) + 1000n).toString() })))
      opening = (async () => {
        const opened = await (options.openSession ?? openSetupSession)({ path: ownerPath, privateKey: ownerKey as Hex, rpcUrl: rpc, binding,
          root: state.root, owner, seller: state.seller as Hex, daemon, ttlSeconds: state.ttlSeconds, sellerTtlSeconds: state.ttlSeconds, fetch: fetcher })
        // An opener resolving after the caller's cancellation must not strand its
        // exclusive journal lease. No writer can be constructed from that session.
        if (controller.signal.aborted) { await closeSession(opened); throw fail() }
        return opened
      })()
      session = await interruptible(() => opening!)
      active()
      writer = (options.writer ?? viemEnsWriter)(daemonKey, rpc, { state, journalPath: daemonPath, fetch: fetcher, isActive: () => !controller.signal.aborted })
      const priceContext = { ...c, ...observation, args, state, owner: session.driver, writer }
      results.push(await interruptible(() => priceLock(priceContext)))
    }
    active()
    if (args.beat === "tampered-402" || args.beat === "all") results.push(await interruptible(() => tampered402(c)))
    if (args.beat === "expiry" || args.beat === "all") results.push(await interruptible(() => expiry({ ...c, args, snapshot: observation.snapshot,
      catalog: () => observeCatalog(origin, args.name, state.seller, skill.skillId, fetcher), signal: controller.signal,
      onBaseline: snap => options.onProgress?.({ kind: "expiry-baseline", name: args.name, block: snap.blockNumber.toString(), expiry: snap.expiry.toString(),
        message: "Live chain, name and matching catalogue baseline captured. You may now stop only your own runner/renewal process; this script never stops it. Catalogue removal cause may remain unproven." }),
      now: options.now ?? Date.now, sleep: options.sleep ?? (ms => new Promise<void>((resolve, reject) => {
        const done = () => { clearTimeout(timeout); controller.signal.removeEventListener("abort", aborted) }
        const aborted = () => { done(); reject(fail()) }, timeout = setTimeout(() => { done(); resolve() }, ms)
        controller.signal.addEventListener("abort", aborted, { once: true }); if (controller.signal.aborted) aborted()
      })) })))
    active()
    return { name: args.name, results, links: { resolver: `https://sepolia.etherscan.io/address/${state.resolver}`, seller: `https://testnet.arcscan.app/address/${state.seller}` } }
  } catch { throw fail() } finally {
    if (timer) clearTimeout(timer); options.signal?.removeEventListener("abort", cancel); controller.abort()
    try {
      pub?.close(); writer?.stop?.()
      // Await the same close promise started by cancellation, not a second
      // idempotent close that could return before the exclusive lock is released.
      if (opening && !session) await bounded(() => opening!.then(opened => closeSession(opened), () => undefined), 10_000)
      await bounded(() => closeSession(), 10_000)
    } catch { throw fail() }
  }
}

if (import.meta.main) {
  if (process.argv.length === 3 && process.argv[2] === "--help") {
    console.log("Usage: bun run scripts/ens-demo.ts <price-lock|tampered-402|expiry|all> --name <exact ENS name> [--confirm-name <same name>] [--timeout-ms 1000..1500000] [--poll-ms 1000..30000]\nprice-lock/all: two Sepolia writes, explicit exact-name consent required. Leaves bumped price and revoked scoped grant; owner restoration is separate.\ntampered-402: synthetic challenge through real SDK, zero signatures. expiry: read-only finite observations; never kills runners.\nState: ARCADE_ENS_STATE. Optional public ARCADE_ENS_RPC, ARCADE_HUB. Price only: ARCADE_ENS_OWNER_KEY, ARCADE_ENS_DAEMON_KEY; separate ARCADE_ENS_DEMO_JOURNAL and ARCADE_ENS_DEMO_DAEMON_JOURNAL.")
  } else {
    const controller = new AbortController(), cancel = () => controller.abort()
    process.once("SIGINT", cancel); process.once("SIGTERM", cancel)
    try { console.log(JSON.stringify(await runEnsDemo(parseDemoArgs(process.argv.slice(2)), process.env, { signal: controller.signal, onProgress: event => console.error(JSON.stringify(event)) }))) }
    catch { console.error(fail().message); process.exitCode = 1 }
    finally { process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel) }
  }
}
