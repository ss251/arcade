import { describe, expect, it } from "bun:test"
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, keccak256 } from "viem"
import { ALL_ROLES, SELLER_SUBNAME_ROLES, VERIFIABLE_FACTORY_ABI, USER_REGISTRY_INIT_ABI, PERMISSIONED_RESOLVER_ABI, loadEnsDeployments, userRegistrySalt, ownedResolverSalt, labelId } from "@arcade/core"
import { deployUserRegistry, deployResolver, wireParent, registerSeller, type RegistryContext, type RegistryDriver, type SetupCall } from "./ens-setup.ts"

type Hex = `0x${string}`
const a = (c: string) => `0x${c.repeat(40)}` as Hex
const h = (c: string) => `0x${c.repeat(64)}` as Hex
const ZERO = a("0"), owner = a("1"), seller = a("2"), registry = a("3"), resolver = a("4"), skillRegistry = a("5")
const root = "arcade.eth", sellerLabel = "seller", sellerName = "seller.arcade.eth", expiry = 20000n
const outer = (salt: bigint) => keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [owner, salt]))
interface Proxy { implementation: Hex; salt: bigint; roles: bigint; code: Hex; factory: Hex }
const setup = () => {
  const deployment = loadEnsDeployments()[0]!, context: RegistryContext = { deployment, owner }
  const calls: SetupCall[] = [], checkpoints: { step: string; state: string; metadata?: Readonly<Record<string,string>> }[] = []
  const proxies = new Map<Hex, Proxy>(), parents = new Map<Hex, [Hex, string]>()
  const receipts = new Map<Hex, unknown>()
  const state = { rootOwner: owner, rootRegistry: ZERO, rootResolver: ZERO, sellerOwner: ZERO, sellerLatestOwner: ZERO,
    sellerStatus: 0, sellerExpiry: 0n, sellerRegistry: ZERO, sellerResolver: ZERO, sellerRoles: 0n }
  const addProxy = (proxy: Hex, implementation: Hex, salt: bigint) => proxies.set(proxy, { implementation, salt, roles: ALL_ROLES, code: "0x6000", factory: deployment.verifiableFactory })
  const driver: RegistryDriver = {
    chainId: async () => 11155111, nowSeconds: () => 1000, wait: async () => {}, checkpoint: async entry => { checkpoints.push(entry) },
    getCode: async address => proxies.get(address)?.code ?? "0x",
    simulate: async call => call.args[0] === deployment.permissionedResolverImpl ? resolver : call.args[1] === userRegistrySalt(root) ? registry : skillRegistry,
    readReceipt: async tx => receipts.get(tx),
    read: async call => {
      const p = proxies.get(call.address)
      switch (call.functionName) {
        case "verifyContract": return proxies.get(call.args[0] as Hex)?.implementation ?? ZERO
        case "getVerifiableProxyData": return p ? [outer(p.salt), p.implementation] : [h("0"), ZERO]
        case "verifiableProxyFactory": return p?.factory ?? ZERO
        case "roles": return call.args[0] === 0n ? p?.roles ?? 0n : state.sellerRoles
        case "getOwner": return call.address === deployment.ethRegistry ? state.rootOwner : state.sellerOwner
        case "getSubregistry": return call.address === deployment.ethRegistry ? state.rootRegistry : state.sellerRegistry
        case "getResolver": return call.address === deployment.ethRegistry ? state.rootResolver : state.sellerResolver
        case "getParent": return parents.get(call.address) ?? [ZERO, ""]
        case "getExpiry": return state.sellerExpiry
        case "getState": return { status: state.sellerStatus, expiry: state.sellerExpiry, latestOwner: state.sellerLatestOwner,
          tokenId: labelId(sellerLabel), resource: labelId(sellerLabel) }
        default: throw new Error("unexpected read")
      }
    },
    send: async (_step, call) => {
      calls.push(call)
      const tx = `0x${calls.length.toString(16).padStart(64, "0")}` as Hex
      if (call.functionName === "deployProxy") {
        const impl = call.args[0] as Hex, salt = call.args[1] as bigint
        const proxy = impl === deployment.permissionedResolverImpl ? resolver : salt === userRegistrySalt(root) ? registry : skillRegistry
        addProxy(proxy, impl, salt)
        receipts.set(tx, { transactionHash: tx, status: "success", from: owner, to: deployment.verifiableFactory, logs: [{ address: deployment.verifiableFactory,
          topics: encodeEventTopics({ abi: VERIFIABLE_FACTORY_ABI, eventName: "ProxyDeployed", args: { sender: owner, proxyAddress: proxy } }),
          data: encodeAbiParameters([{ type: "uint256" }, { type: "address" }], [salt, impl]) }] })
      }
      if (call.functionName === "setSubregistry") state.rootRegistry = call.args[1] as Hex
      if (call.functionName === "setResolver") state.rootResolver = call.args[1] as Hex
      if (call.functionName === "setParent") parents.set(call.address, [call.args[0] as Hex, call.args[1] as string])
      if (call.functionName === "register") {
        state.sellerOwner = seller; state.sellerLatestOwner = seller; state.sellerStatus = 2
        state.sellerExpiry = call.args[5] as bigint; state.sellerRegistry = call.args[2] as Hex; state.sellerResolver = call.args[3] as Hex
        state.sellerRoles = call.args[4] as bigint
      }
      return tx
    }
  }
  const seedParent = () => {
    addProxy(registry, deployment.userRegistryImpl, userRegistrySalt(root)); addProxy(resolver, deployment.permissionedResolverImpl, ownedResolverSalt(owner))
    state.rootRegistry = registry; state.rootResolver = resolver; parents.set(registry, [deployment.ethRegistry, "arcade"])
  }
  return { context, driver, calls, checkpoints, proxies, parents, receipts, state, seedParent, addProxy,
    parent: { root, rootLabel: "arcade", sellerRegistry: registry, resolver },
    request: { root, sellerLabel, seller, sellerRegistry: registry, resolver, expiry } }
}

describe("canonical verified proxy deployment", () => {
  it("deploys fresh registry and resolver with canonical salts/initializers and records intent before each broadcast", async () => {
    const s = setup()
    expect(await deployUserRegistry(s.context, root, s.driver)).toBe(registry)
    expect(await deployResolver(s.context, s.driver)).toBe(resolver)
    expect(s.calls.map(c => c.functionName)).toEqual(["deployProxy", "deployProxy"])
    expect(s.calls.map(c => c.args[1])).toEqual([userRegistrySalt(root), ownedResolverSalt(owner)])
    expect(decodeFunctionData({ abi: USER_REGISTRY_INIT_ABI, data: s.calls[0]!.args[2] as Hex }).args).toEqual([owner, ALL_ROLES])
    expect(decodeFunctionData({ abi: PERMISSIONED_RESOLVER_ABI, data: s.calls[1]!.args[2] as Hex }).args).toEqual([owner, ALL_ROLES, []])
    expect(s.checkpoints.map(c => c.state)).toEqual(["intent", "confirmed", "intent", "confirmed"])
    expect(s.checkpoints[0]?.metadata).toMatchObject({ proxy: registry, owner })
  })
  it("reuses only a known canonical proxy with code, factory, implementation, outer salt and exact owner roles", async () => {
    const s = setup(); s.seedParent()
    const driver = { ...s.driver, simulate: async () => { throw new Error("existing proxy must not be simulated") } }
    expect(await deployUserRegistry(s.context, root, driver, registry)).toBe(registry)
    expect(await deployResolver(s.context, driver, resolver)).toBe(resolver)
    expect(s.calls).toHaveLength(0)
    for (const change of [{ implementation: seller }, { salt: userRegistrySalt("wrong.eth") }, { factory: seller }, { roles: 1n }, { code: "0x" as Hex }]) {
      const broken = setup(); broken.seedParent(); Object.assign(broken.proxies.get(registry)!, change)
      await expect(deployUserRegistry(broken.context, root, broken.driver, registry)).rejects.toThrow()
      expect(broken.calls).toHaveLength(0)
    }
  })
  it("never treats an arbitrary nonzero pointer or failed simulation as reuse", async () => {
    const s = setup()
    await expect(deployUserRegistry(s.context, root, s.driver, seller)).rejects.toThrow()
    await expect(deployUserRegistry(s.context, root, { ...s.driver, simulate: async () => { throw new Error("PRIVATE-RPC") } })).rejects.not.toThrow("PRIVATE-RPC")
    expect(s.calls).toHaveLength(0)
  })
  it("rejects a mismatched factory event, removed/wrong receipt hash, or missing post-deploy code", async () => {
    for (const change of ["hash", "removed", "event", "code"] as const) {
      const s = setup(), readReceipt = s.driver.readReceipt
      const driver: RegistryDriver = { ...s.driver, ...(change === "code" ? { getCode: async () => "0x" as Hex } : {}), readReceipt: async tx => {
        const r = await readReceipt(tx) as Record<string, unknown>
        if (change === "hash") return { ...r, transactionHash: h("9") }
        if (change === "removed" || change === "event") return { ...r, logs: (r.logs as Record<string,unknown>[]).map(log => ({ ...log,
          ...(change === "removed" ? { removed: true } : { address: seller }) })) }
        return r
      } }
      await expect(deployUserRegistry(s.context, root, driver)).rejects.toThrow()
      expect(s.calls).toHaveLength(1)
    }
  })
  it("requires Sepolia and a durable checkpoint before every send and never retries uncertainty", async () => {
    for (const failure of ["chain", "checkpoint", "send"] as const) {
      const s = setup(); let sends = 0
      const driver: RegistryDriver = { ...s.driver, ...(failure === "chain" ? { chainId: async () => 1 } : {}),
        ...(failure === "checkpoint" ? { checkpoint: async () => { throw new Error("disk") } } : {}),
        send: async () => { sends++; throw new Error("PRIVATE-KEY") } }
      await expect(deployUserRegistry(s.context, root, driver)).rejects.not.toThrow("PRIVATE-KEY")
      expect(sends).toBe(failure === "send" ? 1 : 0)
    }
    const s = setup(); let checks = 0
    await expect(deployUserRegistry(s.context, root, { ...s.driver, chainId: async () => ++checks === 1 ? 11155111 : 1 })).rejects.toThrow("Sepolia")
    expect(checks).toBe(2); expect(s.calls).toHaveLength(0); expect(s.checkpoints).toHaveLength(0)
  })
  it("refuses malformed removed markers and each mismatched factory event binding", async () => {
    for (const override of [{ removed: "true" }, { removed: null }, { sender: seller }, { proxyAddress: seller }, { salt: 1n }, { implementation: seller }]) {
      const s = setup(), original = s.driver.readReceipt
      await expect(deployUserRegistry(s.context, root, { ...s.driver, readReceipt: async tx => {
        const r = await original(tx) as Record<string,unknown>
        const args = { sender: owner, proxyAddress: registry, salt: userRegistrySalt(root), implementation: s.context.deployment.userRegistryImpl, ...override }
        return { ...r, logs: [{ address: s.context.deployment.verifiableFactory, ...("removed" in override ? { removed: override.removed } : {}),
          topics: encodeEventTopics({ abi: VERIFIABLE_FACTORY_ABI, eventName: "ProxyDeployed", args: { sender: args.sender, proxyAddress: args.proxyAddress } }),
          data: encodeAbiParameters([{ type: "uint256" }, { type: "address" }], [args.salt, args.implementation]) }] }
      } })).rejects.toThrow()
      expect(s.calls).toHaveLength(1)
    }
  })
  it("rejects a contradictory second factory deployment event even alongside an exact matching event", async () => {
    const s = setup(), original = s.driver.readReceipt
    await expect(deployUserRegistry(s.context, root, { ...s.driver, readReceipt: async tx => {
      const receipt = await original(tx) as Record<string, unknown>
      const logs = receipt.logs as Record<string, unknown>[]
      return { ...receipt, logs: [...logs, { ...logs[0],
        topics: encodeEventTopics({ abi: VERIFIABLE_FACTORY_ABI, eventName: "ProxyDeployed", args: { sender: owner, proxyAddress: seller } }) }] }
    } })).rejects.toThrow()
    expect(s.calls).toHaveLength(1)
  })
})
describe("owned bidirectional parent wiring", () => {
  it("wires only the owned root, verifies all readbacks and does not write again on an exact rerun", async () => {
    const s = setup(); s.seedParent(); s.state.rootRegistry = ZERO; s.state.rootResolver = ZERO; s.parents.delete(registry)
    await wireParent(s.context, s.parent, s.driver)
    expect(s.calls.map(c => c.functionName)).toEqual(["setSubregistry", "setResolver", "setParent"])
    await wireParent(s.context, s.parent, s.driver)
    expect(s.calls).toHaveLength(3)
    expect(s.calls.some(c => c.functionName === "revokeRootRoles")).toBe(false)
  })
  it("uses distinct durable checkpoint steps for the parent and seller registry reverse mounts", async () => {
    const s = setup(); s.seedParent(); s.parents.delete(registry)
    await wireParent(s.context, s.parent, s.driver)
    await registerSeller(s.context, s.request, s.driver)
    const mounts = s.checkpoints.filter(c => c.state === "intent" && c.metadata?.child !== undefined)
    expect(mounts).toHaveLength(2)
    expect(new Set(mounts.map(c => c.step)).size).toBe(2)
    expect(mounts.map(c => c.step)).toEqual([`set-parent:${registry}`, `set-parent:${skillRegistry}`])
  })
  it("refuses another root owner, an existing conflicting mount, or nominal writes without matching readback", async () => {
    for (const change of ["owner", "pointer", "reverse", "readback"] as const) {
      const s = setup(); s.seedParent()
      if (change === "owner") s.state.rootOwner = seller
      if (change === "pointer") s.state.rootRegistry = skillRegistry
      if (change === "reverse") s.parents.set(registry, [seller, "other"])
      if (change === "readback") s.state.rootRegistry = ZERO
      const driver = change === "readback" ? { ...s.driver, send: async () => h("9") } : s.driver
      await expect(wireParent(s.context, s.parent, driver)).rejects.toThrow()
      expect(s.calls).toHaveLength(0)
    }
  })
})
describe("seller identity exact registration and recovery", () => {
  it("registers one seller with fixed expiry/nontransfer roles, wires its canonical skill registry and safely resumes", async () => {
    const s = setup(); s.seedParent()
    expect(await registerSeller(s.context, s.request, s.driver)).toBe(skillRegistry)
    expect(s.calls.map(c => c.functionName)).toEqual(["deployProxy", "register", "setParent"])
    expect(s.calls[1]!.args).toEqual([sellerLabel, seller, skillRegistry, resolver, SELLER_SUBNAME_ROLES, expiry])
    expect(await registerSeller(s.context, s.request, s.driver)).toBe(skillRegistry)
    expect(s.calls).toHaveLength(3)
  })
  it("rejects reserved, somebody else's or expired historical seller names before deploying or writing", async () => {
    for (const change of ["reserved", "other", "expired"] as const) {
      const s = setup(); s.seedParent()
      if (change === "reserved") s.state.sellerStatus = 1
      if (change === "other") { s.state.sellerStatus = 2; s.state.sellerOwner = owner; s.state.sellerLatestOwner = owner; s.state.sellerExpiry = expiry }
      if (change === "expired") { s.state.sellerLatestOwner = seller; s.state.sellerExpiry = 900n }
      await expect(registerSeller(s.context, s.request, s.driver)).rejects.toThrow()
      expect(s.calls).toHaveLength(0)
    }
  })
  it("rejects changed expiry, roles, resolver, registry provenance or reverse mount on existing seller", async () => {
    for (const change of ["expiry", "roles", "resolver", "registry", "reverse"] as const) {
      const s = setup(); s.seedParent(); await registerSeller(s.context, s.request, s.driver); const writes = s.calls.length
      if (change === "expiry") s.state.sellerExpiry += 1n
      if (change === "roles") s.state.sellerRoles = ALL_ROLES
      if (change === "resolver") s.state.sellerResolver = owner
      if (change === "registry") s.proxies.get(skillRegistry)!.salt = userRegistrySalt("wrong.eth")
      if (change === "reverse") s.parents.set(skillRegistry, [owner, "wrong"])
      await expect(registerSeller(s.context, s.request, s.driver)).rejects.toThrow()
      expect(s.calls).toHaveLength(writes)
    }
  })
  it("resumes a verified known skill proxy after deployment but before seller registration without re-simulating", async () => {
    const s = setup(); s.seedParent(); s.addProxy(skillRegistry, s.context.deployment.userRegistryImpl, userRegistrySalt(sellerName))
    const driver = { ...s.driver, simulate: async () => { throw new Error("must reuse") } }
    expect(await registerSeller(s.context, { ...s.request, knownSkillRegistry: skillRegistry }, driver)).toBe(skillRegistry)
    expect(s.calls.map(c => c.functionName)).toEqual(["register", "setParent"])
  })
  it("rejects expired/overflow expiry and a falsely confirmed registration before setting parent", async () => {
    const s = setup(); s.seedParent()
    for (const bad of [1000n, 2n ** 64n]) await expect(registerSeller(s.context, { ...s.request, expiry: bad }, s.driver)).rejects.toThrow()
    expect(s.calls).toHaveLength(0)
    const send = s.driver.send
    await expect(registerSeller(s.context, s.request, { ...s.driver, send: async (step, call) => call.functionName === "register" ? h("8") : send(step, call) })).rejects.toThrow()
    expect(s.calls.some(c => c.functionName === "setParent")).toBe(false)
  })
})
