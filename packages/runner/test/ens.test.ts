import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { namehash } from "viem/ens"
import { encodeFunctionData } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { decodeEnsState, labelId, loadEnsDeployments, PERMISSIONED_REGISTRY_ABI, PERMISSIONED_RESOLVER_ABI } from "@arcade/core"
import { makeEnsLiveness, makeEnsWriter, viemEnsWriter, type EnsCall, type EnsWriter, type EnsWriteClient } from "../src/ens.ts"
import { withEnsJournal, type EnsJournalEntry } from "../src/ens-journal.ts"

const d = loadEnsDeployments()[0]!
const seller = `0x${"11".repeat(20)}`, daemon = `0x${"22".repeat(20)}`, registry = `0x${"33".repeat(20)}`, resolver = `0x${"44".repeat(20)}`, tx = `0x${"aa".repeat(32)}`
const state = decodeEnsState({ root: "arcade-hub.eth", sellerLabel: "ss251", seller, daemon, deploymentSet: "A", universalResolver: d.universalResolver, sellerRegistry: `0x${"55".repeat(20)}`, skillRegistry: registry, resolver, ttlSeconds: 3600, skills: [{ skillId: "usdc-flow-check", label: "usdc-flow-check", name: "usdc-flow-check.ss251.arcade-hub.eth", priceAtomic: "50000" }] })
let directory: string, journalPath: string
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "arcade-ens-writer-")); journalPath = join(directory, "pending.json") })
afterEach(async () => { vi.useRealTimers(); await rm(directory, { recursive: true, force: true }) })
const recorder = () => {
  const renew = vi.fn(async () => tx), setText = vi.fn(async () => tx)
  return { renew, setText, writer: { renew, setText } satisfies EnsWriter }
}
describe("scoped ENS liveness", () => {
  it("renews first then no more than once per quarter TTL, and publishes only a changed price", async () => {
    const r = recorder(); let now = 1_000_000, price = 50_000n
    const live = makeEnsLiveness({ state, writer: r.writer, now: () => now, priceAtomicFor: () => price, log: () => {} })
    await live.tick()
    expect(r.renew).toHaveBeenCalledWith({ registry, anyId: labelId("usdc-flow-check"), expiry: 4600n })
    expect(live.lastRenewAtMs("usdc-flow-check")).toBe(now)
    now += 15_000; price = 70_000n; await live.tick()
    expect(r.renew).toHaveBeenCalledTimes(1)
    expect(r.setText).toHaveBeenCalledWith({ resolver, node: namehash(state.skills[0]!.name), key: "arcade.priceAtomic", value: "70000" })
    now += 900_000; await live.tick()
    expect(r.renew).toHaveBeenCalledTimes(2); expect(r.setText).toHaveBeenCalledTimes(1)
  })
  it("does not renew or change records for a skill no longer served", async () => {
    const r = recorder()
    await makeEnsLiveness({ state, writer: r.writer, priceAtomicFor: () => undefined }).tick()
    expect(r.renew).not.toHaveBeenCalled(); expect(r.setText).not.toHaveBeenCalled()
  })
  it("coalesces overlapping ticks and stops all subsequent writes during an active renewal", async () => {
    let finish!: (tx: string) => void
    const renew = vi.fn(() => new Promise<string>(resolve => { finish = resolve })), setText = vi.fn(async () => tx)
    const live = makeEnsLiveness({ state, writer: { renew, setText }, priceAtomicFor: () => 70000n, log: () => {} })
    const first = live.tick(), second = live.tick()
    await Promise.resolve()
    expect(renew).toHaveBeenCalledTimes(1)
    live.stop(); finish(tx)
    await Promise.all([first, second]); await live.tick()
    expect(renew).toHaveBeenCalledTimes(1); expect(setText).not.toHaveBeenCalled()
  })
  it("does not retry an unknown writer outcome on the next heartbeat or reflect raw errors", async () => {
    const renew = vi.fn(async () => { throw new Error("SECRET provider") }), lines: string[] = []
    const live = makeEnsLiveness({ state, writer: { renew, setText: async () => tx }, priceAtomicFor: () => 50000n, log: line => lines.push(line) })
    await live.tick(); await live.tick()
    expect(renew).toHaveBeenCalledTimes(1); expect(lines.join()).not.toContain("SECRET")
    expect(live.lastRenewAtMs("usdc-flow-check")).toBeUndefined()
  })
  it("bounds a never-finishing writer and never overlaps a retry", async () => {
    vi.useFakeTimers()
    const renew = vi.fn(() => new Promise<string>(() => {}))
    const live = makeEnsLiveness({ state, writer: { renew, setText: async () => tx }, priceAtomicFor: () => 50000n, log: () => {} })
    const pending = live.tick(); await vi.advanceTimersByTimeAsync(60_001); await pending; await live.tick()
    expect(renew).toHaveBeenCalledTimes(1)
  })
  it("never throws for invalid prices, clocks, or logging callbacks", async () => {
    const r = recorder()
    for (const now of [NaN, -1, Infinity]) await expect(makeEnsLiveness({ state, writer: r.writer, now: () => now, priceAtomicFor: () => -1n, log: () => { throw Error() } }).tick()).resolves.toBeUndefined()
    expect(r.renew).not.toHaveBeenCalled()
  })
})

const fixture = () => {
  const calls: string[] = []
  let expiry = 2000n, price = "50000", timestamp = 1000n
  let target = registry, input = encodeFunctionData({ abi: PERMISSIONED_REGISTRY_ABI, functionName: "renew", args: [labelId("usdc-flow-check"), 4600n] })
  const client: EnsWriteClient = {
    address: daemon, chainId: async () => 11155111, timestamp: async () => timestamp,
    read: async a => {
      calls.push(a.functionName)
      if (a.functionName === "getExpiry") return expiry
      if (a.functionName === "getOwner") return seller
      if (a.functionName === "hasRoles") return true
      if (a.functionName === "hasRootRoles") return false
      if (a.functionName === "verifyContract") return a.args[0] === registry ? d.userRegistryImpl : d.permissionedResolverImpl
      if (a.functionName === "text") return price
      throw Error("unexpected read")
    },
    simulate: async () => { calls.push("simulate") },
    send: async a => { calls.push("send"); target = a.address; input = encodeFunctionData(a); if (a.functionName === "renew") expiry = BigInt(String(a.args[1])); else price = String(a.args[2]); return tx },
    receipt: async hash => { calls.push(`receipt:${hash}`); return { transactionHash: hash, status: "success", from: daemon, to: target } },
    transaction: async hash => ({ hash, from: daemon, to: target, input })
  }
  return { client, calls, expire: () => { timestamp = 2000n }, setExpiry: (value: bigint) => { expiry = value } }
}
const renewal = { registry, anyId: labelId("usdc-flow-check"), expiry: 4600n }
describe("verified Sepolia writer with durable uncertainty", () => {
  it("persists intent before send, hash before confirmation and verified readback before completion", async () => {
    const f = fixture(), send = f.client.send, receipt = f.client.receipt
    const writer = makeEnsWriter({ state, journalPath, client: { ...f.client,
      send: async a => { expect(JSON.parse(await readFile(journalPath, "utf8")).entries[0].stage).toBe("intent"); return send(a) },
      receipt: async hash => { expect(JSON.parse(await readFile(journalPath, "utf8")).entries[0]).toMatchObject({ stage: "submitted", txHash: tx }); return receipt(hash) }
    } })
    expect(await writer.renew(renewal)).toBe(tx)
    expect(JSON.parse(await readFile(journalPath, "utf8")).entries[0].stage).toBe("confirmed")
    expect(f.calls.filter(c => c === "send")).toHaveLength(1)
  })
  it("refuses wrong chain, wrong key, wrong target, or an expired name without any send", async () => {
    for (const change of [{ chainId: async () => 1 }, { address: seller }, { timestamp: async () => 2000n }, { read: async () => false }]) {
      const f = fixture()
      await expect(makeEnsWriter({ state, journalPath, client: { ...f.client, ...change } }).renew(renewal)).rejects.toThrow()
      expect(f.calls).not.toContain("send")
    }
    const f = fixture()
    await expect(makeEnsWriter({ state, journalPath, client: f.client }).renew({ ...renewal, registry: seller })).rejects.toThrow()
    expect(f.calls).not.toContain("send")
  })
  it("explains owner revival without granting root RENEW or re-registering", async () => {
    const f = fixture(); f.expire()
    await expect(makeEnsWriter({ state, journalPath, client: f.client }).renew(renewal)).rejects.toMatchObject({ code: "ens_owner_revival_needed" })
    expect(f.calls).not.toContain("send")
  })
  it("refuses a root-wide renewal authority even if its address was named as the daemon", async () => {
    const f = fixture(), read = f.client.read
    await expect(makeEnsWriter({ state, journalPath, client: { ...f.client, read: a => a.functionName === "hasRootRoles" ? Promise.resolve(true) : read(a) } }).renew(renewal)).rejects.toThrow()
    expect(f.calls).not.toContain("send")
  })
  it("consults the live connection guard again after a pending preflight before sending", async () => {
    const f = fixture(); let active = true
    const writer = makeEnsWriter({ state, journalPath, isActive: () => active, client: { ...f.client, simulate: async () => { active = false } } })
    await expect(writer.renew(renewal)).rejects.toThrow()
    expect(f.calls).not.toContain("send")
  })
  it("only allows the scoped price key for a name in this state", async () => {
    const f = fixture(), writer = makeEnsWriter({ state, journalPath, client: f.client })
    for (const change of [{ key: "arcade.payTo" }, { value: "-1" }, { node: `0x${"00".repeat(32)}` }, { resolver: seller }]) {
      await expect(writer.setText({ resolver, node: namehash(state.skills[0]!.name), key: "arcade.priceAtomic", value: "70000", ...change })).rejects.toThrow()
    }
    expect(f.calls).not.toContain("send")
    expect(await writer.setText({ resolver, node: namehash(state.skills[0]!.name), key: "arcade.priceAtomic", value: "70000" })).toBe(tx)
  })
  it("keeps an unknown no-hash intent across writer restart, without any second send", async () => {
    const f = fixture()
    const failing = { ...f.client, send: async () => { f.calls.push("send"); throw Error("SECRET") } }
    await expect(makeEnsWriter({ state, journalPath, client: failing }).renew(renewal)).rejects.not.toThrow("SECRET")
    await expect(makeEnsWriter({ state, journalPath, client: f.client }).renew(renewal)).rejects.toMatchObject({ code: "ens_write_uncertain" })
    expect(f.calls.filter(c => c === "send")).toHaveLength(1)
    expect(JSON.parse(await readFile(journalPath, "utf8")).entries[0].stage).toBe("intent")
  })
  it("reconciles the known pending hash after restart and never remints a transaction", async () => {
    const f = fixture(); f.setExpiry(4600n)
    await withEnsJournal(journalPath, async j => {
      const e = { chainId: 11155111 as const, signer: daemon, op: "renew" as const, target: registry, resource: renewal.anyId.toString(), value: "4600", stage: "intent" as const }
      await j.set(e); await j.set({ ...e, stage: "submitted", txHash: tx })
    })
    expect(await makeEnsWriter({ state, journalPath, client: f.client }).renew(renewal)).toBe(tx)
    expect(f.calls).toContain(`receipt:${tx}`); expect(f.calls).not.toContain("send")
  })
  it.each(["price", "later renewal"] as const)("reconciles a pending %s before the first restarted ticker request without resending it", async mode => {
    const second = { skillId: "counterparty-graph", label: "counterparty-graph", name: "counterparty-graph.ss251.arcade-hub.eth", priceAtomic: "50000" }
    const configured = mode === "price" ? state : decodeEnsState({ ...state, skills: [...state.skills, second] })
    const pending: EnsJournalEntry = mode === "price"
      ? { chainId: 11155111, signer: daemon, op: "price", target: resolver, resource: namehash(state.skills[0]!.name), value: "70000", stage: "submitted", txHash: tx }
      : { chainId: 11155111, signer: daemon, op: "renew", target: registry, resource: labelId(second.label).toString(), value: "4600", stage: "submitted", txHash: tx }
    await withEnsJournal(journalPath, async journal => {
      const { txHash: _hash, ...entry } = pending
      await journal.set({ ...entry, stage: "intent" }); await journal.set(pending)
    })
    const oldInput = pending.op === "price"
      ? encodeFunctionData({ abi: PERMISSIONED_RESOLVER_ABI, functionName: "setText", args: [pending.resource as `0x${string}`, "arcade.priceAtomic", pending.value] })
      : encodeFunctionData({ abi: PERMISSIONED_REGISTRY_ABI, functionName: "renew", args: [BigInt(pending.resource), BigInt(pending.value)] })
    const f = fixture(), sent: EnsCall[] = [], receipts: string[] = [], stop = vi.fn()
    f.setExpiry(4600n)
    const client: EnsWriteClient = { ...f.client, stop,
      read: call => call.functionName === "text" && mode === "price" ? Promise.resolve("70000") : f.client.read(call),
      send: async call => { sent.push(call); await f.client.send(call); return `0x${"bb".repeat(32)}` },
      receipt: async hash => { receipts.push(hash); return hash === tx ? { transactionHash: tx, status: "success", from: daemon, to: pending.target } : f.client.receipt(hash) },
      transaction: hash => hash === tx ? Promise.resolve({ hash, from: daemon, to: pending.target, input: oldInput }) : f.client.transaction(hash)
    }
    const writer = makeEnsWriter({ state: configured, journalPath, client })
    const live = makeEnsLiveness({ state: configured, writer, now: () => 1_000_000, priceAtomicFor: () => mode === "price" ? 70000n : 50000n, log: () => {} })
    await live.tick(); await live.tick()
    expect(receipts).toContain(tx)
    expect(stop).not.toHaveBeenCalled()
    // The only new operation is the first skill's renewal: the retained price/later
    // renewal has its own exact receipt and is not broadcast again by this ticker.
    expect(sent.map(call => [call.functionName, call.args])).toEqual([["renew", [renewal.anyId, renewal.expiry]]])
    for (const skill of configured.skills) expect(live.lastRenewAtMs(skill.skillId)).toBe(1_000_000)
    expect(JSON.parse(await readFile(journalPath, "utf8")).entries.every((entry: EnsJournalEntry) => entry.stage === "confirmed")).toBe(true)
  })
  it("does not reuse a confirmed operation as current liveness after ownership changed", async () => {
    const f = fixture()
    await makeEnsWriter({ state, journalPath, client: f.client }).renew(renewal)
    const writer = makeEnsWriter({ state, journalPath, client: { ...f.client, read: call => call.functionName === "getOwner" ? Promise.resolve(daemon) : f.client.read(call) } })
    await expect(writer.renew(renewal)).rejects.toMatchObject({ code: "ens_write_unavailable" })
    expect(f.calls.filter(call => call === "send")).toHaveLength(1)
  })
  it("refuses foreign pending authority before reading its transaction or sending anything", async () => {
    const base: EnsJournalEntry = { chainId: 11155111, signer: daemon, op: "renew", target: registry, resource: renewal.anyId.toString(), value: "4600", stage: "submitted", txHash: tx }
    for (const mutation of [{ signer: seller }, { target: resolver }, { resource: labelId("unconfigured").toString() }]) {
      const f = fixture(), path = join(directory, `${crypto.randomUUID()}.json`), pending = { ...base, ...mutation }
      await withEnsJournal(path, async journal => {
        const { txHash: _hash, ...entry } = pending
        await journal.set({ ...entry, stage: "intent" }); await journal.set(pending)
      })
      await expect(makeEnsWriter({ state, journalPath: path, client: f.client }).renew(renewal)).rejects.toMatchObject({ code: "ens_write_uncertain" })
      expect(f.calls).not.toContain(`receipt:${tx}`); expect(f.calls).not.toContain("send")
      expect(JSON.parse(await readFile(path, "utf8")).entries[0].stage).toBe("submitted")
    }
  })
  it("does not reconcile a pending different operation from a forged transaction even when its record matches", async () => {
    const pending: EnsJournalEntry = { chainId: 11155111, signer: daemon, op: "price", target: resolver, resource: namehash(state.skills[0]!.name), value: "70000", stage: "submitted", txHash: tx }
    const input = encodeFunctionData({ abi: PERMISSIONED_RESOLVER_ABI, functionName: "setText", args: [pending.resource as `0x${string}`, "arcade.priceAtomic", pending.value] })
    for (const mutation of [{ from: seller }, { to: seller }, { input: "0x1234" }]) {
      const f = fixture(), path = join(directory, `${crypto.randomUUID()}.json`)
      await withEnsJournal(path, async journal => {
        const { txHash: _hash, ...entry } = pending
        await journal.set({ ...entry, stage: "intent" }); await journal.set(pending)
      })
      const client: EnsWriteClient = { ...f.client,
        read: call => call.functionName === "text" ? Promise.resolve("70000") : f.client.read(call),
        receipt: async hash => ({ transactionHash: hash, status: "success", from: daemon, to: resolver }),
        transaction: async hash => ({ hash, from: daemon, to: resolver, input, ...mutation })
      }
      await expect(makeEnsWriter({ state, journalPath: path, client }).renew(renewal)).rejects.toMatchObject({ code: "ens_write_uncertain" })
      expect(f.calls).not.toContain("send")
      expect(JSON.parse(await readFile(path, "utf8")).entries[0].stage).toBe("submitted")
    }
  })
  it("does not mark success for a mismatched receipt hash, reverted status or wrong readback", async () => {
    for (const change of [
      { receipt: async () => ({ status: "success", transactionHash: `0x${"bb".repeat(32)}`, from: daemon, to: registry }) },
      { receipt: async () => ({ status: "reverted", transactionHash: tx, from: daemon, to: registry }) },
      { send: async () => tx }
    ]) {
      const f = fixture(), file = join(directory, `${crypto.randomUUID()}.json`)
      await expect(makeEnsWriter({ state, journalPath: file, client: { ...f.client, ...change }, pollDelaysMs: [] }).renew(renewal)).rejects.toThrow()
      expect(JSON.parse(await readFile(file, "utf8")).entries[0].stage).toBe("submitted")
    }
  })
  it("does not broadcast after stop wins a pending preflight", async () => {
    const f = fixture(); let release!: () => void
    const writer = makeEnsWriter({ state, journalPath, client: { ...f.client, simulate: () => new Promise<void>(resolve => { release = resolve }) } })
    const promise = writer.renew(renewal)
    while (!release) await new Promise(resolve => setTimeout(resolve, 1))
    writer.stop(); release()
    await expect(promise).rejects.toThrow()
    expect(f.calls).not.toContain("send")
  })
  it("prevents a late broadcast when the ticker deadline wins a stalled intent checkpoint", async () => {
    vi.useFakeTimers()
    const f = fixture(); let release!: () => void, first = true
    const writer = makeEnsWriter({ state, journalPath, client: f.client, journal: async (_path, work) => work({ entries: [], set: async () => {
      if (first) { first = false; await new Promise<void>(resolve => { release = resolve }) }
    } }) })
    const live = makeEnsLiveness({ state, writer, now: () => 1_000_000, priceAtomicFor: () => 50000n, log: () => {} })
    const tick = live.tick()
    await vi.advanceTimersByTimeAsync(60_001); await tick
    expect(release).toBeTypeOf("function")
    release(); await vi.advanceTimersByTimeAsync(1)
    expect(f.calls).not.toContain("send")
  })
  it.each([{ from: seller }, { to: seller }, { input: "0x1234" }])("does not accept an unrelated transaction with matching receipt hash and state: %j", async mutation => {
    const f = fixture(), transaction = f.client.transaction
    await expect(makeEnsWriter({ state, journalPath, client: { ...f.client, transaction: async h => ({ ...await transaction(h), ...mutation }) } }).renew(renewal)).rejects.toThrow()
    expect(JSON.parse(await readFile(journalPath, "utf8")).entries[0].stage).toBe("submitted")
  })
  it("aborts the real viem full response body on stop, not only the outer waiting promise", async () => {
    vi.useFakeTimers()
    // Fixed public fixture only; no key is read from environment/Keychain and no network exists.
    const fixtureKey = `0x${"01".repeat(32)}` as const
    const configured = { ...state, daemon: privateKeyToAccount(fixtureKey).address.toLowerCase() }
    let signal: AbortSignal | undefined, cancelled = false
    const writer = viemEnsWriter(fixtureKey, "https://rpc.example", { state: configured, journalPath, fetch: async request => {
      signal = request.signal
      return new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true } }), { headers: { "content-type": "application/json" } })
    } })
    const result = writer.renew(renewal).catch(error => error)
    await vi.advanceTimersByTimeAsync(1)
    writer.stop?.()
    await vi.advanceTimersByTimeAsync(10001)
    expect(await result).toBeInstanceOf(Error)
    expect(signal?.aborted).toBe(true)
    expect(cancelled).toBe(true)
  })
})
