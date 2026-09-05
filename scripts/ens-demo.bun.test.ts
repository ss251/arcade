import { describe, expect, it } from "bun:test"
import { encodeErrorResult, encodeFunctionData, parseAbi, type Hex } from "viem"
import { namehash } from "viem/ens"
import { parseDemoArgs, isPermissionDenial, tampered402, expiry, priceLock, verifyDemoTransaction, observeCatalog, demoPublicClient, demoObservation, runEnsDemo, type ExpiryContext, type RegistrationSnapshot, type PriceContext } from "./ens-demo.ts"
import { resolverResource } from "./ens-setup-skills.ts"
import { decodeEnsState, loadEnsDeployments, PERMISSIONED_RESOLVER_ABI } from "@arcade/core"
import type { SetupCall } from "./ens-setup.ts"
import { privateKeyToAccount } from "viem/accounts"
import type { SetupSession } from "./ens-setup-driver.ts"

const SELLER = `0x${"11".repeat(20)}` as Hex, OWNER = `0x${"44".repeat(20)}` as Hex
const ZERO = `0x${"00".repeat(20)}`, TX = `0x${"aa".repeat(32)}` as Hex
const state = decodeEnsState({ root: "arcade.eth", sellerLabel: "seller", seller: SELLER, owner: OWNER, daemon: `0x${"33".repeat(20)}`,
  deploymentSet: "A", universalResolver: loadEnsDeployments()[0]!.universalResolver, sellerRegistry: `0x${"55".repeat(20)}`,
  skillRegistry: `0x${"66".repeat(20)}`, resolver: `0x${"77".repeat(20)}`, ttlSeconds: 60,
  skills: [{ skillId: "flow", label: "flow", name: "flow.seller.arcade.eth", priceAtomic: "10000" }] })

const NAME = "flow.seller.arcade.eth", DAEMON = `0x${"33".repeat(20)}` as Hex
const DENIAL = parseAbi(["error EACUnauthorizedAccountRoles(uint256 resource,uint256 roleBitmap,address account)"])
describe("ENS demo consent and denial proof", () => {
  it("never defaults to a mutating all beat; exact-name consent is required for writes", () => {
    for (const argv of [[], ["all"], ["price-lock", "--name", NAME], ["all", "--name", NAME, "--confirm-name", "other.seller.arcade.eth"]]) expect(() => parseDemoArgs(argv)).toThrow()
    expect(parseDemoArgs(["tampered-402", "--name", NAME])).toMatchObject({ beat: "tampered-402", name: NAME })
    expect(parseDemoArgs(["price-lock", "--name", NAME, "--confirm-name", NAME])).toMatchObject({ confirmedName: NAME })
  })
  it("refuses invalid timing, duplicate selectors and unknown flags before work", () => {
    for (const tail of [["--timeout-ms", "0"], ["--timeout-ms", "1500001"], ["--poll-ms", "0"], ["--unknown"], ["--name", NAME]])
      expect(() => parseDemoArgs(["expiry", "--name", NAME, ...tail])).toThrow()
  })
  it("accepts only the pinned denial bytes for widest name resource, role16 and exact daemon", () => {
    const data = encodeErrorResult({ abi: DENIAL, errorName: "EACUnauthorizedAccountRoles", args: [resolverResource(namehash(NAME)), 16n, DAEMON] })
    expect(isPermissionDenial(data, NAME, DAEMON)).toBe(true)
    for (const args of [[resolverResource(namehash(NAME), "arcade.priceAtomic"), 16n, DAEMON], [resolverResource(namehash(NAME)), 1n, DAEMON], [resolverResource(namehash(NAME)), 16n, `0x${"44".repeat(20)}`]] as const)
      expect(isPermissionDenial(encodeErrorResult({ abi: DENIAL, errorName: "EACUnauthorizedAccountRoles", args }), NAME, DAEMON)).toBe(false)
    for (const bad of ["0x", "reverted PRIVATE_RPC", data + "00", null, { data }]) expect(isPermissionDenial(bad, NAME, DAEMON)).toBe(false)
  })
})

const observationFixture = () => {
  const deployment = loadEnsDeployments()[0]!, calls: { call: SetupCall; block: bigint }[] = []
  let wrong = false
  const pub = { close: () => {}, block: async () => ({ number: 10n, hash: TX, timestamp: 1000n }), code: async () => "0x60" as Hex,
    deny: async () => "0x" as Hex, prove: async () => {}, read: async (call: SetupCall, block: bigint): Promise<unknown> => {
      calls.push({ call, block }); const a = call.address.toLowerCase(), fn = call.functionName
      if (fn === "ROOT_REGISTRY") return deployment.rootRegistry
      if (fn === "verifyContract") return sameTest(call.args[0], state.resolver) ? deployment.permissionedResolverImpl : deployment.userRegistryImpl
      if (fn === "getSubregistry") return a === deployment.rootRegistry.toLowerCase() ? deployment.ethRegistry : a === deployment.ethRegistry.toLowerCase() ? state.sellerRegistry : state.skillRegistry
      if (fn === "getParent") return a === state.sellerRegistry.toLowerCase() ? [deployment.ethRegistry, "arcade"] : [state.sellerRegistry, wrong ? "foreign" : "seller"]
      if (fn === "getOwner") return a === deployment.ethRegistry.toLowerCase() ? OWNER : SELLER
      if (fn === "getExpiry") return 1060n
      if (fn === "getState") return { status: 2, expiry: 1060n, latestOwner: SELLER, tokenId: 100n, resource: 0xabcdef00000005n }
      if (fn === "getResolver") return state.resolver
      if (fn === "getAlias") return "0x"
      if (fn === "text") return ({ "arcade.endpoint": `https://hub.example/x/${SELLER}/flow`, "arcade.payTo": OWNER, "arcade.chain": "eip155:5042002", "arcade.priceAtomic": "10000", "agent-context": "public context", "agent-endpoint[web]": "https://web.example/skill/flow", "agent-endpoint[mcp]": "" } as Record<string,string>)[String(call.args[1])]
      if (fn === "hasRoles") return call.args[0] === resolverResource(namehash(NAME), "arcade.priceAtomic")
      if (fn === "roles") return sameTest(call.address, state.resolver) && call.args[0] === resolverResource(namehash(NAME), "arcade.priceAtomic") ? 16n : 0n
      if (fn === "hasRootRoles") return false
      throw Error("unexpected fixture call")
    } }
  return { pub, calls, wrong: () => { wrong = true } }
}
const sameTest = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase()
describe("production registry observation and CLI boundary", () => {
  it("pins every hierarchy, registration and known-text read to the same successful block", async () => {
    const f = observationFixture(), o = demoObservation(state, NAME, f.pub)
    expect(await o.snapshot()).toMatchObject({ blockNumber: 10n, expiry: 1060n, owner: SELLER })
    expect(await o.inspect()).toMatchObject({ price: "10000", priceGranted: true, records: { "agent-endpoint[mcp]": "" } })
    expect(f.calls.length).toBeGreaterThan(20); expect(f.calls.every(c => c.block === 10n)).toBe(true)
    f.wrong(); await expect(o.snapshot()).rejects.toThrow()
  })
  it("rejects bad consent and unknown state names before keys, RPC or journals", async () => {
    let touched = 0
    const env = new Proxy({ ARCADE_ENS_STATE: "/tmp/offline-demo-state.json" }, { get(target, key) { if (key.toString().includes("KEY")) throw Error("KEY_ACCESS"); return target[key as keyof typeof target] } })
    const { confirmedName: _consent, ...unconsented } = parseDemoArgs(["price-lock", "--name", NAME, "--confirm-name", NAME])
    await expect(runEnsDemo(unconsented, env, { fetch: async () => { touched++; throw Error() }, readState: async () => state })).rejects.toThrow()
    await expect(runEnsDemo(parseDemoArgs(["tampered-402", "--name", "other.seller.arcade.eth"]), env, { fetch: async () => { touched++; throw Error() }, readState: async () => state })).rejects.toThrow()
    expect(touched).toBe(0)
  })
  it("rejects zero/overflow baseline prices before RPC, keys or journal creation", async () => {
    for (const priceAtomic of ["0", ((1n << 256n) - 1n).toString()]) {
      let touched = 0
      const s = decodeEnsState({ ...state, skills: [{ ...state.skills[0], priceAtomic }] })
      await expect(runEnsDemo(parseDemoArgs(["price-lock", "--name", NAME, "--confirm-name", NAME]), { ARCADE_ENS_STATE: "/tmp/offline-demo-state.json" }, {
        readState: async () => s, fetch: async () => { touched++; throw Error("must not reach RPC") },
      })).rejects.toThrow()
      expect(touched).toBe(0)
    }
  })
  it("tests the actual root RENEW bitmap and refuses that extra daemon authority", async () => {
    const f = observationFixture(), read = f.pub.read
    f.pub.read = async (call, block) => call.functionName === "hasRootRoles" && call.args[0] === 65536n ? true : read(call, block)
    await expect(demoObservation(state, NAME, f.pub).inspect()).rejects.toThrow()
  })
  it("refuses admin bits and unrelated known-key grants, not just directly effective SET_TEXT", async () => {
    for (const resource of [0n, resolverResource(namehash(NAME)), resolverResource(namehash(NAME), "agent-context"), resolverResource(`0x${"00".repeat(32)}`, "arcade.priceAtomic")]) {
      const f = observationFixture(), read = f.pub.read
      f.pub.read = (call, block) => call.functionName === "roles" && sameTest(call.address, state.resolver) && call.args[0] === resource ? Promise.resolve(16n << 128n) : read(call, block)
      await expect(demoObservation(state, NAME, f.pub).inspect()).rejects.toThrow()
    }
  })
  it("runs the synthetic beat with no key access and closes its public observer", async () => {
    const f = observationFixture(); let closed = 0, keys = 0
    f.pub.close = () => { closed++ }
    const env = new Proxy({ ARCADE_ENS_STATE: "/tmp/offline-demo-state.json" }, { get(target, key) {
      if (String(key).includes("KEY")) { keys++; throw Error("KEY_ACCESS") }; return target[key as keyof typeof target]
    } })
    const out = await runEnsDemo(parseDemoArgs(["tampered-402", "--name", NAME]), env, { chain: f.pub, readState: async () => state,
      reader: { getEnsText: ({ key }) => f.pub.read({ address: state.resolver as Hex, abi: PERMISSIONED_RESOLVER_ABI, functionName: "text", args: [namehash(NAME), key] }, 10n) as Promise<string> } })
    expect(out.results).toHaveLength(1); expect(out.results[0]).toMatchObject({ syntheticChallenge: true, signatures: 0 }); expect(keys).toBe(0); expect(closed).toBe(1)
  })
  it("refuses overlap with the daemon's actual default journal before reading keys", async () => {
    const f = observationFixture(); let keys = 0
    const env = new Proxy({ ARCADE_ENS_STATE: "/tmp/offline-demo-state.json", ARCADE_ENS_DEMO_JOURNAL: "/tmp/ens-pending.json" }, { get(target, key) {
      if (String(key).includes("KEY")) { keys++; throw Error("KEY_ACCESS") }; return target[key as keyof typeof target]
    } })
    await expect(runEnsDemo(parseDemoArgs(["price-lock", "--name", NAME, "--confirm-name", NAME]), env, { chain: f.pub, readState: async () => state,
      reader: { getEnsText: ({ key }) => f.pub.read({ address: state.resolver as Hex, abi: PERMISSIONED_RESOLVER_ABI, functionName: "text", args: [namehash(NAME), key] }, 10n) as Promise<string> } })).rejects.toThrow()
    expect(keys).toBe(0)
  })
  it("closes a late-opened session on cancellation without creating a writer or sending", async () => {
    const f = observationFixture(), ownerKey = `0x${"01".repeat(32)}` as Hex, daemonKey = `0x${"02".repeat(32)}` as Hex
    const s = decodeEnsState({ ...state, owner: privateKeyToAccount(ownerKey).address, daemon: privateKeyToAccount(daemonKey).address }), controller = new AbortController()
    const read = f.pub.read; f.pub.read = (call, block) => call.functionName === "getOwner" && sameTest(call.address, loadEnsDeployments()[0]!.ethRegistry) ? Promise.resolve(s.owner) : read(call, block)
    let closed = 0, writers = 0
    const session = { close: async () => { closed++ } } as SetupSession
    await expect(runEnsDemo(parseDemoArgs(["price-lock", "--name", NAME, "--confirm-name", NAME]), {
      ARCADE_ENS_STATE: "/tmp/offline-demo-state.json", ARCADE_ENS_OWNER_KEY: ownerKey, ARCADE_ENS_DAEMON_KEY: daemonKey,
    }, { chain: f.pub, readState: async () => s, signal: controller.signal,
      reader: { getEnsText: ({ key }) => read({ address: state.resolver as Hex, abi: PERMISSIONED_RESOLVER_ABI, functionName: "text", args: [namehash(NAME), key] }, 10n) as Promise<string> },
      openSession: async () => { controller.abort(); return session }, writer: () => { writers++; throw Error("must not construct") } })).rejects.toThrow()
    expect(closed).toBe(1); expect(writers).toBe(0)
  })
  it("runs a finite natural-expiry observation with no keys or mutating driver", async () => {
    const f = observationFixture(); let gone = false, now = 0, keys = 0, closed = 0
    f.pub.block = async () => ({ number: gone ? 11n : 10n, hash: TX, timestamp: gone ? 1060n : 1000n })
    f.pub.close = () => { closed++ }
    const read = f.pub.read; f.pub.read = async (call, block) => {
      if (call.functionName === "getExpiry" && !sameTest(call.address, state.skillRegistry)) return 5000n
      if (gone && sameTest(call.address, state.skillRegistry)) {
        if (call.functionName === "getOwner") return ZERO
        if (call.functionName === "getState") return { status: 0, expiry: 1060n, latestOwner: SELLER, tokenId: 100n, resource: 0xabcdef00000006n }
      }
      return read(call, block)
    }
    const env = new Proxy({ ARCADE_ENS_STATE: "/tmp/offline-demo-state.json" }, { get(target, key) {
      if (String(key).includes("KEY")) { keys++; throw Error("KEY_ACCESS") }; return target[key as keyof typeof target]
    } })
    const out = await runEnsDemo(parseDemoArgs(["expiry", "--name", NAME, "--timeout-ms", "2000", "--poll-ms", "1000"]), env, {
      chain: f.pub, readState: async () => state, now: () => now, sleep: async ms => { now += ms; gone = true },
      reader: { getEnsText: ({ key }) => gone ? Promise.resolve(null) : read({ address: state.resolver as Hex, abi: PERMISSIONED_RESOLVER_ABI, functionName: "text", args: [namehash(NAME), key] }, 10n) as Promise<string> },
      fetch: async req => Response.json(req.url.endsWith("/listings") ? gone ? [] : [{ id: "flow", seller: SELLER }] : { id: "flow", seller: SELLER, ensName: NAME, ensExpired: gone }),
      openSession: async () => { throw Error("no session allowed") }, writer: () => { throw Error("no writer allowed") },
    })
    expect(out.results[0]).toMatchObject({ registrationExpired: true, watcherConfirmed: true, observedChainTimestamp: "1060" })
    expect(keys).toBe(0); expect(closed).toBe(1)
  })
  it("retains uncertainty after one daemon send, closes owned drivers and never attempts revocation", async () => {
    const f = observationFixture(), ownerKey = `0x${"01".repeat(32)}` as Hex, daemonKey = `0x${"02".repeat(32)}` as Hex
    const s = decodeEnsState({ ...state, owner: privateKeyToAccount(ownerKey).address, daemon: privateKeyToAccount(daemonKey).address })
    const read = f.pub.read; f.pub.read = (call, block) => call.functionName === "getOwner" && sameTest(call.address, loadEnsDeployments()[0]!.ethRegistry) ? Promise.resolve(s.owner) : read(call, block)
    f.pub.deny = async () => encodeErrorResult({ abi: DENIAL, errorName: "EACUnauthorizedAccountRoles", args: [resolverResource(namehash(NAME)), 16n, s.daemon as Hex] })
    let sent = 0, stopped = 0, closed = 0, revokes = 0
    const session = { driver: { send: async () => { revokes++; return TX } }, close: async () => { closed++ } } as unknown as SetupSession
    await expect(runEnsDemo(parseDemoArgs(["price-lock", "--name", NAME, "--confirm-name", NAME]), {
      ARCADE_ENS_STATE: "/tmp/offline-demo-state.json", ARCADE_ENS_OWNER_KEY: ownerKey, ARCADE_ENS_DAEMON_KEY: daemonKey,
    }, { chain: f.pub, readState: async () => s,
      reader: { getEnsText: ({ key }) => read({ address: state.resolver as Hex, abi: PERMISSIONED_RESOLVER_ABI, functionName: "text", args: [namehash(NAME), key] }, 10n) as Promise<string> },
      openSession: async () => session, writer: () => ({ renew: async () => { throw Error() }, stop: () => { stopped++ }, setText: async () => { sent++; throw Error("PRIVATE_RPC uncertain") } }),
    })).rejects.not.toThrow("PRIVATE_RPC")
    expect(sent).toBe(1); expect(revokes).toBe(0); expect(stopped).toBe(1); expect(closed).toBe(1)
  })
  it("awaits the same in-flight owner cleanup when cancellation and finally overlap", async () => {
    const f = observationFixture(), ownerKey = `0x${"01".repeat(32)}` as Hex, daemonKey = `0x${"02".repeat(32)}` as Hex
    const s = decodeEnsState({ ...state, owner: privateKeyToAccount(ownerKey).address, daemon: privateKeyToAccount(daemonKey).address })
    const read = f.pub.read; f.pub.read = (call, block) => call.functionName === "getOwner" && sameTest(call.address, loadEnsDeployments()[0]!.ethRegistry) ? Promise.resolve(s.owner) : read(call, block)
    f.pub.deny = async () => encodeErrorResult({ abi: DENIAL, errorName: "EACUnauthorizedAccountRoles", args: [resolverResource(namehash(NAME)), 16n, s.daemon as Hex] })
    const controller = new AbortController(); let closed = false, settled = false, release = () => {}
    const session = { driver: {}, close: () => { if (closed) return Promise.resolve(); closed = true; return new Promise<void>(r => { release = r }) } } as SetupSession
    const run = runEnsDemo(parseDemoArgs(["price-lock", "--name", NAME, "--confirm-name", NAME]), {
      ARCADE_ENS_STATE: "/tmp/offline-demo-state.json", ARCADE_ENS_OWNER_KEY: ownerKey, ARCADE_ENS_DAEMON_KEY: daemonKey,
    }, { chain: f.pub, readState: async () => s, signal: controller.signal,
      reader: { getEnsText: ({ key }) => read({ address: state.resolver as Hex, abi: PERMISSIONED_RESOLVER_ABI, functionName: "text", args: [namehash(NAME), key] }, 10n) as Promise<string> },
      openSession: async () => session, writer: () => ({ renew: async () => { throw Error() }, stop: () => {}, setText: async () => { controller.abort(); throw Error("uncertain") } }),
    }).finally(() => { settled = true })
    const caught = run.catch(() => {})
    try { await new Promise(r => setTimeout(r, 30)); expect(closed).toBe(true); expect(settled).toBe(false) }
    finally { release(); await caught }
  })
})
describe("synthetic malicious402 through the real SDK", () => {
  it("proves two exact pre-sign refusals with no key, signature, paid retry or external request", async () => {
    const endpoint = `https://hub.example/x/0x${"11".repeat(20)}/flow`
    const records: Record<string, string> = { "arcade.endpoint": endpoint, "arcade.payTo": `0x${"22".repeat(20)}`, "arcade.chain": "eip155:5042002", "arcade.priceAtomic": "10000" }
    const result = await tampered402({ name: NAME, seller: `0x${"11".repeat(20)}`, skillId: "flow",
      reader: { getEnsText: async ({ key }: { key: string }) => records[key] ?? null } })
    expect(result).toMatchObject({ beat: "tampered-402", syntheticChallenge: true, signatures: 0, probes: 2, paidRequests: 0,
      refusals: ["ens_payto_mismatch", "ens_payto_mismatch"] })
  })
})

const expiryFixture = () => {
  let now = 0, index = 0
  const live: RegistrationSnapshot = { blockNumber: 1n, blockHash: TX, timestamp: 1000n, expiry: 1060n,
    owner: SELLER, latestOwner: SELLER, tokenId: 100n, resource: 0xabcdef00000005n, status: 2 }
  const gone: RegistrationSnapshot = { ...live, blockNumber: 2n, timestamp: 1060n, owner: ZERO, status: 0, resource: live.resource + 1n }
  const samples = [live, gone]
  const records: Record<string, string> = { "arcade.endpoint": `https://hub.example/x/${SELLER}/flow`, "arcade.payTo": OWNER, "arcade.chain": "eip155:5042002" }
  const context: { -readonly [K in keyof ExpiryContext]: ExpiryContext[K] } = { name: NAME, seller: SELLER, skillId: "flow", args: parseDemoArgs(["expiry", "--name", NAME, "--timeout-ms", "2000", "--poll-ms", "1000"]),
    reader: { getEnsText: async ({ key }) => index > 1 ? null : records[key] ?? null },
    snapshot: async () => samples[Math.min(index++, samples.length - 1)]!,
    catalog: async () => ({ present: index <= 1, watcherConfirmed: false }), now: () => now, sleep: async ms => { now += ms } }
  return { context, live, gone, samples }
}
describe("actual registration expiry, not absence or an RPC outage", () => {
  it("emits an owner cue only after a live chain/ENS/catalogue baseline and before polling", async () => {
    const f = expiryFixture(), order: string[] = [], sleep = f.context.sleep
    f.context.onBaseline = snap => { expect(snap.expiry).toBe(1060n); order.push("baseline") }
    f.context.sleep = async ms => { order.push("poll"); await sleep(ms) }
    await expiry(f.context); expect(order).toEqual(["baseline", "poll"])
    const g = expiryFixture(); g.context.catalog = async () => ({ present: false, watcherConfirmed: false })
    g.context.onBaseline = () => { throw Error("must not cue absent baseline") }
    await expect(expiry(g.context)).rejects.not.toThrow("must not cue")
  })
  it("rejects a same-height replacement hash rather than combining two histories", async () => {
    const f = expiryFixture(); f.samples[1] = { ...f.gone, blockNumber: f.live.blockNumber, blockHash: `0x${"bb".repeat(32)}` }
    await expect(expiry(f.context)).rejects.toThrow()
  })
  it("proves the passive resource-version transition, keeping catalogue causality honest", async () => {
    const f = expiryFixture(), out = await expiry(f.context)
    expect(out).toMatchObject({ beat: "expiry", registrationExpired: true, listingAbsent: true, watcherConfirmed: false,
      cause: "catalogue removal cause unproven", expiredAt: "1060", observedChainTimestamp: "1060" })
  })
  it("reports stronger watcher proof only when the matching listing detail confirms it", async () => {
    const f = expiryFixture(); let n = 0
    f.context.catalog = async () => ({ present: n++ === 0, watcherConfirmed: n > 1 })
    expect(await expiry(f.context)).toMatchObject({ watcherConfirmed: true, cause: "matching listing marked ensExpired" })
  })
  it("refuses already absent baseline, earlier unregister, changed registration and unchanged resource on expiry", async () => {
    for (const patch of [{ expiry: 1050n }, { tokenId: 101n }, { latestOwner: OWNER }, { resource: 0xabcdef00000005n }]) {
      const f = expiryFixture(); f.samples[1] = { ...f.gone, ...patch }
      await expect(expiry(f.context)).rejects.toThrow()
    }
    const f = expiryFixture(); f.samples[0] = f.gone
    await expect(expiry(f.context)).rejects.toThrow()
  })
  it("never promotes unavailable ENS or RPC/local-time-only observations to expiry", async () => {
    const f = expiryFixture(); f.context.reader = { getEnsText: async () => { throw Error("PRIVATE_RPC") } }
    await expect(expiry(f.context)).rejects.not.toThrow("PRIVATE_RPC")
    const g = expiryFixture(); g.samples[1] = g.live
    await expect(expiry(g.context)).rejects.toThrow()
  })
})

describe("independent production proof boundaries", () => {
  const call = { address: state.resolver as Hex, abi: PERMISSIONED_RESOLVER_ABI, functionName: "setText", args: [namehash(NAME), "arcade.priceAtomic", "11000"] } as const
  const transaction = { hash: TX, from: DAEMON, to: state.resolver, input: encodeFunctionData(call), value: 0n, chainId: 11155111, blockHash: TX, blockNumber: 1n, transactionIndex: 0 }
  const receipt = { transactionHash: TX, status: "success", from: DAEMON, to: state.resolver, blockHash: TX, blockNumber: 1n, transactionIndex: 0, logs: [] }
  it("correlates exact successful transaction, calldata, signer, block and nonremoved logs", () => {
    expect(() => verifyDemoTransaction(TX, call, DAEMON, transaction, receipt)).not.toThrow()
    for (const patch of [{ transactionHash: `0x${"bb".repeat(32)}` }, { status: "reverted" }, { from: OWNER }, { blockNumber: 2n }, { logs: [{ removed: true }] }])
      expect(() => verifyDemoTransaction(TX, call, DAEMON, transaction, { ...receipt, ...patch })).toThrow()
    for (const patch of [{ input: "0x" }, { from: OWNER }, { value: 1n }, { chainId: 1 }, { to: OWNER }])
      expect(() => verifyDemoTransaction(TX, call, DAEMON, { ...transaction, ...patch }, receipt)).toThrow()
  })
  it("refuses malformed removed markers and inconsistent transaction indexes", () => {
    const log = { transactionHash: TX, blockHash: TX, blockNumber: 1n, transactionIndex: 0, logIndex: 0, address: state.resolver, data: "0x", topics: [] }
    for (const removed of ["true", null, 0]) expect(() => verifyDemoTransaction(TX, call, DAEMON, transaction, { ...receipt, logs: [{ ...log, removed }] })).toThrow()
    expect(() => verifyDemoTransaction(TX, call, DAEMON, transaction, { ...receipt, transactionIndex: 1 })).toThrow()
    expect(() => verifyDemoTransaction(TX, call, DAEMON, transaction, { ...receipt, logs: [{ ...log, transactionIndex: 1 }] })).toThrow()
  })
  it("rejects unsafe catalogue origins before calling even an injected fetch", async () => {
    let calls = 0
    for (const origin of ["ftp://hub.example", "http://hub.example", "https://hub.example/path", "https://u:p@hub.example"])
      await expect(observeCatalog(origin, NAME, SELLER, "flow", async () => { calls++; return Response.json([]) })).rejects.toThrow()
    expect(calls).toBe(0)
  })
  it("accepts watcher causality only for exact seller/name detail, never a 404 or outage", async () => {
    let detail: unknown = { id: "flow", seller: SELLER, ensName: NAME, ensExpired: true }, code = 200
    const fetcher = async (req: Request) => req.url.endsWith("/listings") ? Response.json([]) : Response.json(detail, { status: code })
    expect(await observeCatalog("https://hub.example", NAME, SELLER, "flow", fetcher)).toEqual({ present: false, watcherConfirmed: true })
    code = 404; expect(await observeCatalog("https://hub.example", NAME, SELLER, "flow", fetcher)).toEqual({ present: false, watcherConfirmed: false })
    code = 503; await expect(observeCatalog("https://hub.example", NAME, SELLER, "flow", fetcher)).rejects.toThrow()
    code = 200; detail = { id: "flow", seller: OWNER, ensName: NAME, ensExpired: true }
    await expect(observeCatalog("https://hub.example", NAME, SELLER, "flow", fetcher)).rejects.toThrow()
  })
  it("uses actual viem decoded contract reverts, not a provider's prose or arbitrary nested data", async () => {
    const data = encodeErrorResult({ abi: DENIAL, errorName: "EACUnauthorizedAccountRoles", args: [resolverResource(namehash(NAME)), 16n, DAEMON] })
    let error: unknown = { code: 3, message: "execution reverted", data }
    const client = demoPublicClient("https://rpc.example", async req => {
      const sent = await req.json() as { id: number; method: string }
      return Response.json({ jsonrpc: "2.0", id: sent.id, ...(sent.method === "eth_chainId" ? { result: "0xaa36a7" } : { error }) })
    })
    expect(await client.deny(call, DAEMON, NAME)).toBe(data)
    error = { code: -32000, message: `PRIVATE_RPC ${data}` }
    await expect(client.deny(call, DAEMON, NAME)).rejects.not.toThrow("PRIVATE_RPC")
    error = { code: -32000, message: "unavailable", data: { arbitrary: data } }
    await expect(client.deny(call, DAEMON, NAME)).rejects.toThrow()
    client.close()
  })
})

const priceFixture = () => {
  const events: string[] = []
  let price = "10000", granted = true, changed = false
  const records = { "arcade.endpoint": `https://hub.example/x/${SELLER}/flow`, "arcade.payTo": OWNER,
    "arcade.chain": "eip155:5042002", "agent-endpoint[web]": "https://web.example/skill/flow", "agent-context": "public context", "agent-endpoint[mcp]": "" }
  const context: { -readonly [K in keyof PriceContext]: PriceContext[K] } = { name: NAME, seller: SELLER, skillId: "flow", state,
    args: parseDemoArgs(["price-lock", "--name", NAME, "--confirm-name", NAME]),
    reader: { getEnsText: async ({ key }) => key === "arcade.priceAtomic" ? price : records[key as keyof typeof records] ?? null },
    inspect: async () => ({ price, priceGranted: granted, records: { ...records, ...(changed ? { "agent-context": "changed" } : {}) } }),
    deny: async () => encodeErrorResult({ abi: DENIAL, errorName: "EACUnauthorizedAccountRoles", args: [resolverResource(namehash(NAME)), 16n, DAEMON] }),
    writer: { renew: async () => { throw Error("renew forbidden") }, setText: async a => { events.push("price"); price = a.value; return TX } },
    owner: { chainId: async () => 11155111, nowSeconds: () => 1000, wait: async () => {}, read: async () => undefined,
      simulate: async () => true, getCode: async () => "0x60", readReceipt: async () => ({}), checkpoint: async e => { events.push(e.state) },
      send: async (_step, call) => { expect(call.functionName).toBe("authorizeTextRoles"); expect(call.args.at(-1)).toBe(false); events.push("revoke"); granted = false; return TX } },
    prove: async () => { events.push("proof") } }
  return { context, events, change: () => { changed = true } }
}
describe("one price write and one narrowly scoped revocation", () => {
  it("checks both readbacks, checkpoints before revocation and never broadens any grant", async () => {
    const f = priceFixture(), out = await priceLock(f.context)
    expect(out).toMatchObject({ beat: "price-lock", before: "10000", after: "11000", priceTx: TX, revokeTx: TX, denial: "EACUnauthorizedAccountRoles" })
    expect(f.events).toEqual(["price", "proof", "intent", "revoke", "proof", "confirmed"])
    await expect(priceLock(f.context)).rejects.toThrow(); expect(f.events.filter(x => x === "price")).toHaveLength(1)
  })
  it("refuses generic simulation failures before any write and rejects changes to non-price records", async () => {
    const f = priceFixture(); f.context.deny = async () => { throw Error("PRIVATE_RPC reverted") }
    await expect(priceLock(f.context)).rejects.not.toThrow("PRIVATE_RPC"); expect(f.events).toHaveLength(0)
    const g = priceFixture(), prove = g.context.prove
    g.context.prove = async (...args) => { await prove(...args); g.change() }
    await expect(priceLock(g.context)).rejects.toThrow(); expect(g.events).not.toContain("revoke")
  })
})
