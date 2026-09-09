import { createPublicClient, createWalletClient, encodeFunctionData, http, type Abi, type Hex } from "viem"
import { namehash } from "viem/ens"
import { privateKeyToAccount } from "viem/accounts"
import { AsyncLocalStorage } from "node:async_hooks"
import { sepolia } from "viem/chains"
import { decodeEnsState, ENS_TEXT_KEYS, labelId, loadEnsDeployments, PERMISSIONED_REGISTRY_ABI,
  PERMISSIONED_RESOLVER_ABI, RegistryRoles, VERIFIABLE_FACTORY_ABI, type EnsState } from "@arcade/core"
import { ensJournalPath, withEnsJournal, type EnsJournal, type EnsJournalEntry } from "./ens-journal.ts"

export interface EnsWriter {
  readonly renew: (a: { readonly registry: string; readonly anyId: bigint; readonly expiry: bigint }) => Promise<string>
  readonly setText: (a: { readonly resolver: string; readonly node: string; readonly key: string; readonly value: string }) => Promise<string>
  readonly stop?: () => void
}
export const RENEW_FRACTION = 4
const UINT256 = 1n << 256n
const hash = (value: unknown): value is Hex => typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value)
const address = (value: unknown): value is Hex => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value)
const atomic = (value: unknown): value is string => typeof value === "string" && value.length <= 78 && /^(0|[1-9][0-9]*)$/.test(value) && BigInt(value) < UINT256
const trusted = new WeakSet<EnsWriteFailed>()
export class EnsWriteFailed extends Error {
  constructor(readonly code: "ens_write_unavailable" | "ens_write_uncertain" | "ens_owner_revival_needed", readonly retryable: boolean, readonly txHash?: string) {
    super(code === "ens_owner_revival_needed" ? "ENS name expired: owner revival is required; the scoped daemon cannot revive it. Nothing was broadcast." :
      code === "ens_write_uncertain" ? "ENS write outcome requires journal/hash reconciliation; no automatic resend." : "ENS write preflight or confirmation unavailable; inspect configuration and retained journal.")
    this.name = "EnsWriteFailed"
  }
}
const failed = (code: EnsWriteFailed["code"], retryable = false, txHash?: string) => {
  const failure = new EnsWriteFailed(code, retryable, txHash); trusted.add(failure); return failure
}
const bounded = <A>(work: () => Promise<A>, ms: number): Promise<A> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("ENS operation timed out")), ms)
  Promise.resolve().then(work).then(value => { clearTimeout(timer); resolve(value) }, () => { clearTimeout(timer); reject(new Error("ENS operation unavailable")) })
})
export interface EnsLivenessArgs {
  readonly state: EnsState; readonly writer: EnsWriter
  readonly priceAtomicFor: (skillId: string) => bigint | undefined
  readonly now?: () => number; readonly log?: (line: string) => void
  readonly isActive?: () => boolean
}
/** A 6h TTL means 16 renewals/day/skill. Missing manifests are not alive. Unknown
 * writes pause this ticker; the durable real writer additionally protects restarts. */
export const makeEnsLiveness = (a: EnsLivenessArgs) => {
  const state = decodeEnsState(a.state), now = a.now ?? Date.now
  const renewed = new Map<string, number>(), prices = new Map(state.skills.map(s => [s.skillId, s.priceAtomic]))
  const reported = new Set<string>()
  let closed = false, uncertain = false, running: Promise<void> | undefined
  const log = (message: string) => { if (!reported.has(message)) { reported.add(message); try { (a.log ?? console.log)(message) } catch {} } }
  const run = async () => {
    for (const skill of state.skills) {
      if (closed || uncertain || a.isActive?.() === false) return
      try {
        const price = a.priceAtomicFor(skill.skillId), at = now()
        if (price === undefined) continue
        if (typeof price !== "bigint" || price < 0n || price >= UINT256 || !Number.isSafeInteger(at) || at < 0 || at > 8_640_000_000_000_000) throw failed("ens_write_unavailable", true)
        const last = renewed.get(skill.skillId)
        if (last === undefined || at - last >= state.ttlSeconds * 1000 / RENEW_FRACTION) {
          let known: EnsWriteFailed | undefined
          const tx = await bounded(() => a.writer.renew({ registry: state.skillRegistry, anyId: labelId(skill.label), expiry: BigInt(Math.floor(at / 1000)) + BigInt(state.ttlSeconds) }).catch(cause => {
            if (cause instanceof EnsWriteFailed && trusted.has(cause)) known = cause
            throw Error()
          }), 60_000).catch(() => { throw known ?? failed("ens_write_uncertain") })
          if (!hash(tx)) throw failed("ens_write_uncertain")
          if (closed || a.isActive?.() === false) return
          renewed.set(skill.skillId, at)
          log(`[ens] confirmed renewal of ${skill.name} (${tx})`)
        }
        if (closed || a.isActive?.() === false) return
        if (prices.get(skill.skillId) !== price.toString()) {
          let known: EnsWriteFailed | undefined
          const tx = await bounded(() => a.writer.setText({ resolver: state.resolver, node: namehash(skill.name), key: ENS_TEXT_KEYS.priceAtomic, value: price.toString() }).catch(cause => {
            if (cause instanceof EnsWriteFailed && trusted.has(cause)) known = cause
            throw Error()
          }), 60_000).catch(() => { throw known ?? failed("ens_write_uncertain") })
          if (!hash(tx)) throw failed("ens_write_uncertain")
          if (closed || a.isActive?.() === false) return
          prices.set(skill.skillId, price.toString())
          log(`[ens] confirmed price record for ${skill.name} (${tx})`)
        }
      } catch (cause) {
        const safe = cause instanceof EnsWriteFailed && trusted.has(cause) ? cause : failed("ens_write_unavailable", true)
        if (!safe.retryable && safe.code !== "ens_owner_revival_needed") {
          uncertain = true
          // In particular, a stalled intent fsync may finish after the ticker deadline.
          // Stop the writer before it can continue from that await into a late send.
          try { a.writer.stop?.() } catch {}
        }
        log(`[ens] ${skill.name}: ${safe.message}`)
      }
    }
  }
  return {
    tick: (): Promise<void> => closed || uncertain ? Promise.resolve() : running ??= run().finally(() => { running = undefined }),
    stop: () => { closed = true; a.writer.stop?.() },
    lastRenewAtMs: (skillId: string) => renewed.get(skillId)
  }
}

export interface EnsCall { readonly address: Hex; readonly abi: Abi; readonly functionName: string; readonly args: readonly unknown[] }
export interface EnsWriteClient {
  readonly address: string
  readonly chainId: () => Promise<number>
  readonly timestamp: () => Promise<bigint>
  readonly read: (a: EnsCall) => Promise<unknown>
  readonly simulate: (a: EnsCall) => Promise<void>
  /** Exactly one broadcast attempt. This boundary never retries a send. */
  readonly send: (a: EnsCall) => Promise<string>
  readonly receipt: (hash: string) => Promise<{ readonly transactionHash: string; readonly status: string; readonly from: string; readonly to: string | null }>
  readonly transaction: (hash: string) => Promise<{ readonly hash: string; readonly from: string; readonly to: string | null; readonly input: string }>
  readonly stop?: () => void
}
export interface EnsWriterOptions {
  readonly state: EnsState; readonly journalPath: string; readonly client: EnsWriteClient
  readonly pollDelaysMs?: ReadonlyArray<number>
  readonly journal?: <T>(path: string, work: (journal: EnsJournal) => Promise<T>) => Promise<T>
  readonly isActive?: () => boolean
}
/** Checkpoints are public transaction intent, never wallet material. Known pending
 * hashes are reconciled first; no-hash intent is deliberately an owner intervention. */
export const makeEnsWriter = (a: EnsWriterOptions): EnsWriter & { stop: () => void } => {
  const state = decodeEnsState(a.state), client = a.client, deployment = loadEnsDeployments().find(d => d.set === state.deploymentSet)!
  // One end-to-end operation (including preflight, wallet preparation, confirmation
  // and durable readback) must finish before the ticker's unchanged 60s boundary.
  // Poll normal Sepolia block inclusion; a 3.5s four-read window was too short.
  const operationMs = 55_000, delays = a.pollDelaysMs, stopped = new AbortController()
  let closed = false
  const stop = () => { if (closed) return; closed = true; stopped.abort(); try { client.stop?.() } catch {} }
  const checkOpen = () => { if (closed || a.isActive?.() === false) throw failed("ens_write_unavailable", true) }
  const read = async (address: string, abi: Abi, functionName: string, args: readonly unknown[]) => {
    checkOpen(); const result = await bounded(() => client.read({ address: address as Hex, abi, functionName, args }), 5000); checkOpen(); return result
  }
  const pause = (ms: number) => new Promise<void>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); stopped.signal.removeEventListener("abort", abort) }
    const abort = () => { cleanup(); reject(failed("ens_write_uncertain")) }
    const timer = setTimeout(() => { cleanup(); resolve() }, ms)
    stopped.signal.addEventListener("abort", abort, { once: true }); if (stopped.signal.aborted) abort()
  })
  const chain = async () => {
    checkOpen()
    if (await bounded(client.chainId, 5000) !== 11155111) throw failed("ens_write_unavailable", true)
    checkOpen()
  }
  const postcondition = async (entry: EnsJournalEntry) => {
    const actual = entry.op === "renew" ? await read(entry.target, PERMISSIONED_REGISTRY_ABI, "getExpiry", [BigInt(entry.resource)]) :
      await read(entry.target, PERMISSIONED_RESOLVER_ABI, "text", [entry.resource, ENS_TEXT_KEYS.priceAtomic])
    if (entry.op === "renew" ? typeof actual !== "bigint" || actual < BigInt(entry.value) : actual !== entry.value) throw failed("ens_write_uncertain", false, entry.txHash)
  }
  const confirm = async (entry: EnsJournalEntry, journal: EnsJournal) => {
    const txHash = entry.txHash!
    for (let attempt = 0; ; attempt++) {
      checkOpen()
      let receipt: Awaited<ReturnType<EnsWriteClient["receipt"]>> | undefined
      try { receipt = await bounded(() => client.receipt(txHash), 5000) } catch {}
      checkOpen()
      if (receipt !== undefined) {
        if (!hash(receipt.transactionHash) || receipt.transactionHash.toLowerCase() !== txHash || receipt.status !== "success" ||
          !address(receipt.from) || receipt.from.toLowerCase() !== entry.signer || !address(receipt.to) || receipt.to.toLowerCase() !== entry.target) throw failed("ens_write_uncertain", false, txHash)
        const transaction = await bounded(() => client.transaction(txHash), 5000)
        checkOpen()
        const expectedInput = entry.op === "renew" ? encodeFunctionData({ abi: PERMISSIONED_REGISTRY_ABI, functionName: "renew", args: [BigInt(entry.resource), BigInt(entry.value)] }) :
          encodeFunctionData({ abi: PERMISSIONED_RESOLVER_ABI, functionName: "setText", args: [entry.resource as Hex, ENS_TEXT_KEYS.priceAtomic, entry.value] })
        if (!hash(transaction.hash) || transaction.hash.toLowerCase() !== txHash || !address(transaction.from) || transaction.from.toLowerCase() !== entry.signer ||
          !address(transaction.to) || transaction.to.toLowerCase() !== entry.target || typeof transaction.input !== "string" || transaction.input.toLowerCase() !== expectedInput) throw failed("ens_write_uncertain", false, txHash)
        await postcondition(entry)
        checkOpen()
        await journal.set({ ...entry, stage: "confirmed" })
        checkOpen()
        return txHash
      }
      const delay = delays === undefined ? 2000 : delays[attempt]
      if (delay === undefined) throw failed("ens_write_uncertain", false, txHash)
      await pause(delay)
    }
  }
  const execute = async (op: "renew" | "price", target: string, resource: string, value: string): Promise<string> => {
    let enteredSend = false, knownHash: string | undefined
    let onStop: (() => void) | undefined
    const canceled = new Promise<never>((_resolve, reject) => {
      onStop = () => reject(failed(enteredSend || knownHash ? "ens_write_uncertain" : "ens_write_unavailable", !enteredSend && !knownHash, knownHash))
      stopped.signal.addEventListener("abort", onStop, { once: true }); if (stopped.signal.aborted) onStop()
    })
    const timer = setTimeout(stop, operationMs)
    const work = async () => {
    try {
      checkOpen()
      if (!address(client.address) || client.address.toLowerCase() === state.seller || client.address.toLowerCase() === state.owner ||
        state.daemon !== undefined && client.address.toLowerCase() !== state.daemon || delays !== undefined && (delays.length > 4 || delays.some(n => !Number.isSafeInteger(n) || n < 0 || n > 2000))) throw failed("ens_write_unavailable", true)
      const skill = state.skills.find(s => op === "renew" ? labelId(s.label).toString() === resource : namehash(s.name) === resource)
      if (!skill || target.toLowerCase() !== (op === "renew" ? state.skillRegistry : state.resolver) || !atomic(value) || op === "renew" && BigInt(value) >= 1n << 64n) throw failed("ens_write_unavailable", true)
      await chain()
      return await (a.journal ?? withEnsJournal)(a.journalPath, async journal => {
        checkOpen()
        const entry: EnsJournalEntry = { chainId: 11155111, signer: client.address.toLowerCase(), op, target: target.toLowerCase(), resource, value, stage: "intent" }
        const pending = journal.entries.filter(e => e.stage !== "confirmed")
        const matches = (e: EnsJournalEntry) => e.chainId === 11155111 && e.signer === entry.signer && e.op === op && e.target === entry.target && e.resource === resource && e.value === value
        const verifyTarget = async (e: EnsJournalEntry) => {
          const implementation = await read(deployment.verifiableFactory, VERIFIABLE_FACTORY_ABI, "verifyContract", [e.target])
          if (typeof implementation !== "string" || implementation.toLowerCase() !== (e.op === "renew" ? deployment.userRegistryImpl : deployment.permissionedResolverImpl)) throw failed("ens_write_uncertain", false, e.txHash)
        }
        // A restart always begins with the first skill's renewal, but the retained
        // operation can be a price update or any later skill. Validate every pending
        // intent against this state's exact authority before confirming any of them.
        for (const old of pending) {
          if (!hash(old.txHash) || old.chainId !== 11155111 || old.signer !== entry.signer || !atomic(old.value) ||
            !(old.op === "renew" ? old.target === state.skillRegistry && BigInt(old.value) < 1n << 64n && state.skills.some(s => labelId(s.label).toString() === old.resource) :
              old.op === "price" && old.target === state.resolver && state.skills.some(s => namehash(s.name) === old.resource))) throw failed("ens_write_uncertain", false, old.txHash)
        }
        for (const old of pending) {
          knownHash = old.txHash
          await verifyTarget(old)
          await confirm(old, journal)
        }
        knownHash = undefined // Any following operation is new, not an uncertain old send.
        checkOpen()
        const implementation = await read(deployment.verifiableFactory, VERIFIABLE_FACTORY_ABI, "verifyContract", [target])
        if (typeof implementation !== "string" || implementation.toLowerCase() !== (op === "renew" ? deployment.userRegistryImpl : deployment.permissionedResolverImpl)) throw failed("ens_write_unavailable", true)
        const [expiry, owner, stamp] = await Promise.all([
          read(state.skillRegistry, PERMISSIONED_REGISTRY_ABI, "getExpiry", [labelId(skill.label)]),
          read(state.skillRegistry, PERMISSIONED_REGISTRY_ABI, "getOwner", [labelId(skill.label)]), bounded(client.timestamp, 5000)
        ])
        checkOpen()
        if (typeof expiry !== "bigint" || expiry < 0n || expiry >= 1n << 64n || typeof stamp !== "bigint" || stamp < 0n || stamp >= 1n << 64n) throw failed("ens_write_unavailable", true)
        if (expiry <= stamp) throw failed("ens_owner_revival_needed")
        if (typeof owner !== "string" || owner.toLowerCase() !== state.seller) throw failed("ens_write_unavailable", true)
        // A daemon must remain scoped even when an old state omitted owner provenance.
        if (await read(state.skillRegistry, PERMISSIONED_REGISTRY_ABI, "hasRootRoles", [RegistryRoles.RENEW, client.address]) !== false) throw failed("ens_write_unavailable", true)
        if (op === "renew") {
          if (BigInt(value) <= stamp || BigInt(value) > stamp + BigInt(state.ttlSeconds) + 60n || await read(state.skillRegistry, PERMISSIONED_REGISTRY_ABI, "hasRoles", [labelId(skill.label), RegistryRoles.RENEW, client.address]) !== true) throw failed("ens_write_unavailable", true)
        }
        // The ticker will reach the reconciled skill/price later. Fresh ownership,
        // expiry and scope still apply; then re-prove the stored transaction and
        // current readback instead of broadcasting the exact operation again.
        const reusable = journal.entries.find(e => e.stage === "confirmed" && matches(e))
        if (reusable) {
          knownHash = reusable.txHash
          return confirm(reusable, journal)
        }
        const call: EnsCall = op === "renew" ? { address: target as Hex, abi: PERMISSIONED_REGISTRY_ABI, functionName: "renew", args: [BigInt(resource), BigInt(value)] } :
          { address: target as Hex, abi: PERMISSIONED_RESOLVER_ABI, functionName: "setText", args: [resource, ENS_TEXT_KEYS.priceAtomic, value] }
        checkOpen()
        await bounded(() => { checkOpen(); return client.simulate(call) }, 5000)
        await chain()
        await journal.set(entry)
        checkOpen()
        const tx = await bounded(() => { checkOpen(); enteredSend = true; return client.send(call) }, 10_000)
        if (!hash(tx)) throw failed("ens_write_uncertain")
        knownHash = tx.toLowerCase()
        const submitted = { ...entry, stage: "submitted" as const, txHash: knownHash }
        await journal.set(submitted)
        return confirm(submitted, journal)
      })
    } catch (cause) {
      if (cause instanceof EnsWriteFailed && trusted.has(cause) && !(cause.retryable && (enteredSend || knownHash))) throw cause
      throw failed(enteredSend || knownHash ? "ens_write_uncertain" : "ens_write_unavailable", !enteredSend && !knownHash, knownHash)
    }
    }
    try { return await Promise.race([work(), canceled]) }
    finally { clearTimeout(timer); if (onStop) stopped.signal.removeEventListener("abort", onStop) }
  }
  return {
    renew: x => execute("renew", x.registry, x.anyId.toString(), x.expiry.toString()),
    setText: x => x.key !== ENS_TEXT_KEYS.priceAtomic ? Promise.reject(failed("ens_write_unavailable", true)) : execute("price", x.resolver, x.node.toLowerCase(), x.value),
    stop
  }
}

/** Real adapter has no defaults for target authority. The configured public state is
 * mandatory; supplying a key alone cannot authorize writes to arbitrary contracts. */
export const viemEnsWriter = (privateKey: string, rpcUrl?: string, options?: { readonly state: EnsState; readonly journalPath?: string; readonly fetch?: (request: Request) => Promise<Response>; readonly isActive?: () => boolean }): EnsWriter => {
  try {
    if (!options || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw Error()
    const state = decodeEnsState(options.state)
    const url = new URL(rpcUrl ?? process.env.ARCADE_ENS_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com")
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw Error()
    const account = privateKeyToAccount(privateKey as Hex)
    // Bind all RPCs in a wallet preparation/send sequence to one cancellation scope.
    // A timed-out nonce/fee read must not resume later and broadcast a transaction.
    const context = new AsyncLocalStorage<AbortSignal>(), controllers = new Set<AbortController>()
    let stopped = false
    const operation = async <T>(work: () => Promise<T>, ms = 4500): Promise<T> => {
      if (stopped || options.isActive?.() === false) throw Error("ENS writer stopped")
      const controller = new AbortController(); controllers.add(controller)
      const timer = setTimeout(() => controller.abort(), ms)
      let onAbort: (() => void) | undefined
      try {
        return await context.run(controller.signal, () => Promise.race([work(), new Promise<never>((_resolve, reject) => {
          onAbort = () => reject(Error("ENS operation canceled"))
          controller.signal.addEventListener("abort", onAbort, { once: true })
          if (controller.signal.aborted) onAbort()
        })]))
      } finally {
        if (onAbort) controller.signal.removeEventListener("abort", onAbort)
        clearTimeout(timer); controller.abort(); controllers.delete(controller)
      }
    }
    const transport = http(url.href, { retryCount: 0, timeout: 5000, maxResponseBodySize: 131_072, fetchOptions: { redirect: "error", credentials: "omit" },
      fetchFn: async (input, init) => {
        const signal = context.getStore()
        if (!signal || signal.aborted || stopped || options.isActive?.() === false) throw Error("ENS request canceled")
        const request = new Request(input, { ...init, signal, redirect: "error", credentials: "omit" })
        const sent = await request.clone().json() as { id?: unknown }
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, onAbort: (() => void) | undefined
        const download = async () => {
          const response = await (options.fetch ?? (r => fetch(r)))(request)
          if (signal.aborted || stopped) { void response.body?.cancel().catch(() => {}); throw Error("ENS request canceled") }
          if (!response.ok || response.redirected || !response.body || Number(response.headers.get("content-length")) > 131_072) throw Error("ENS response refused")
          reader = response.body.getReader()
          const decoder = new TextDecoder("utf-8", { fatal: true })
          let size = 0, body = ""
          for (;;) {
            const next = await reader.read(); if (next.done) break
            size += next.value.byteLength; if (size > 131_072) throw Error("ENS response too large")
            body += decoder.decode(next.value, { stream: true })
          }
          body += decoder.decode()
          const received: unknown = JSON.parse(body)
          if (typeof received !== "object" || received === null || Array.isArray(received) || !("id" in received) || received.id !== sent.id ||
            !("jsonrpc" in received) || received.jsonrpc !== "2.0" || ("result" in received) === ("error" in received)) throw Error("ENS RPC response invalid")
          return new Response(body, { headers: { "content-type": "application/json" } })
        }
        try {
          return await Promise.race([download(), new Promise<never>((_resolve, reject) => {
            onAbort = () => reject(Error("ENS request canceled")); signal.addEventListener("abort", onAbort, { once: true }); if (signal.aborted) onAbort()
          })])
        } finally { if (onAbort) signal.removeEventListener("abort", onAbort); void reader?.cancel().catch(() => {}) }
      } })
    const pub = createPublicClient({ chain: sepolia, transport, ccipRead: false }), wallet = createWalletClient({ account, chain: sepolia, transport, ccipRead: false })
    const client: EnsWriteClient = {
      address: account.address, chainId: () => operation(() => pub.getChainId()), timestamp: () => operation(async () => (await pub.getBlock({ blockTag: "latest" })).timestamp),
      read: call => operation(() => pub.readContract(call)),
      simulate: call => operation(async () => { await pub.simulateContract({ ...call, account }) }),
      send: call => operation(() => wallet.writeContract({ ...call, account, chain: sepolia }), 9000),
      receipt: hash => operation(async () => { const receipt = await pub.getTransactionReceipt({ hash: hash as Hex }); return { transactionHash: receipt.transactionHash, status: receipt.status, from: receipt.from, to: receipt.to } }),
      transaction: hash => operation(async () => { const tx = await pub.getTransaction({ hash: hash as Hex }); return { hash: tx.hash, from: tx.from, to: tx.to ?? null, input: tx.input } }),
      stop: () => { stopped = true; for (const controller of controllers) controller.abort() }
    }
    return makeEnsWriter({ state, client, journalPath: options.journalPath ?? ensJournalPath(), ...(options.isActive === undefined ? {} : { isActive: options.isActive }) })
  } catch { throw failed("ens_write_unavailable", true) }
}
