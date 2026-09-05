import { describe, expect, it, vi } from "vitest"
import { createPublicClient, custom, encodeFunctionData, getAbiItem } from "viem"
import { sepolia } from "viem/chains"
import { ETH_REGISTRAR_ABI, PERMISSIONED_REGISTRY_ABI, PERMISSIONED_RESOLVER_ABI,
  VERIFIABLE_FACTORY_ABI, USER_REGISTRY_INIT_ABI, MOCK_USDC_ABI,
  ensDeploymentReader, loadEnsDeployments, resolveEnsDeployment, type EnsChainReader } from "../src/ens.ts"

describe("verified ENSv2 deployment manifest", () => {
  it("carries frozen validated A/B data, never a mutable process-global choice", () => {
    const sets = loadEnsDeployments()
    expect(sets.map(s => s.set)).toEqual(["A", "B"])
    expect(sets[0]?.rootRegistry).toBe("0x8115186e8f2e0b0281e86ab91f0f48ba90364354")
    expect(sets[1]?.rootRegistry).toBe("0x11b5bfbe9078d826b1edbdd1cfc12f5828d9f50c")
    expect(Object.isFrozen(sets)).toBe(true)
    for (const set of sets) expect(Object.isFrozen(set)).toBe(true)
  })
  it("chooses A when its own root agrees; preserves caller ordering for explicit B", async () => {
    const sets = loadEnsDeployments(), [a, b] = sets
    const reader: EnsChainReader = { readContract: async args => {
      expect(args.functionName).toBe("getSubregistry")
      expect(args.args).toEqual(["eth"])
      return args.address === a!.rootRegistry ? a!.ethRegistry.toUpperCase().replace("0X", "0x") : b!.ethRegistry
    } }
    expect((await resolveEnsDeployment(reader)).set).toBe("A")
    expect((await resolveEnsDeployment(reader, [b!, a!])).set).toBe("B")
  })
  it("falls back only to another internally consistent candidate", async () => {
    const [a, b] = loadEnsDeployments()
    const reader: EnsChainReader = { readContract: async args => {
      if (args.address === a!.rootRegistry) throw new Error("private RPC credential")
      return b!.ethRegistry
    } }
    expect((await resolveEnsDeployment(reader)).set).toBe("B")
  })
  it("reports both fixed findings without reflecting arbitrary RPC secrets or objects", async () => {
    await expect(resolveEnsDeployment({ readContract: async () => { throw new Error("PRIVATE_SECRET") } })).rejects.toThrow(/set A.*set B/s)
    await expect(resolveEnsDeployment({ readContract: async () => { throw new Error("PRIVATE_SECRET") } })).rejects.not.toThrow("PRIVATE_SECRET")
    await expect(resolveEnsDeployment({ readContract: async () => ({ toString: () => { throw new Error("getter ran") } }) })).rejects.toThrow(/inconsistent/)
  })
  it("bounds hung reads and handles synchronous provider throws", async () => {
    vi.useFakeTimers()
    try {
      const result = resolveEnsDeployment({ readContract: () => new Promise(() => {}) }).catch(e => e)
      await vi.advanceTimersByTimeAsync(10_100)
      expect(await result).toBeInstanceOf(Error)
    } finally { vi.useRealTimers() }
    await expect(resolveEnsDeployment({ readContract: () => { throw new Error("PRIVATE_SECRET") } })).rejects.toThrow(/set A.*set B/s)
  })
  it("rejects invalid configuration before any RPC", async () => {
    let calls = 0
    const reader: EnsChainReader = { readContract: async () => { calls++; return null } }
    for (const sets of [[], Array.from({ length: 5 }, () => loadEnsDeployments()[0]!),
      [{ ...loadEnsDeployments()[0]!, ethRegistry: "0x00" as `0x${string}` }]]) {
      await expect(resolveEnsDeployment(reader, sets)).rejects.toThrow()
    }
    expect(calls).toBe(0)
  })
  it("checks an available RPC chain identity before walking deployment roots", async () => {
    let reads = 0
    await expect(resolveEnsDeployment({ getChainId: async () => 1, readContract: async () => { reads++; return null } })).rejects.toThrow(/Sepolia/)
    expect(reads).toBe(0)
  })
  it("adapts a real typed viem client without casts or exposing a broad arbitrary-call surface", async () => {
    const a = loadEnsDeployments()[0]!
    const calls: string[] = []
    const client = createPublicClient({ chain: sepolia, transport: custom({ request: async ({ method }) => {
      calls.push(method)
      if (method === "eth_chainId") return "0xaa36a7"
      if (method === "eth_call") return `0x${a.ethRegistry.slice(2).padStart(64, "0")}`
      throw new Error("unexpected RPC")
    } }) })
    const reader: EnsChainReader = ensDeploymentReader(client)
    expect((await resolveEnsDeployment(reader)).set).toBe("A")
    expect(calls).toEqual(["eth_chainId", "eth_call"])
    await expect(reader.readContract({ address:a.rootRegistry, abi:[], functionName:"notRootDiscovery", args:[] })).rejects.toThrow()
    expect(calls).toHaveLength(2)
  })
})

describe("ABIs pinned to deployed ENSv2 sources", () => {
  it("uses isAvailable, not the stale available selector, and exact registrar parameters", () => {
    expect(getAbiItem({ abi: ETH_REGISTRAR_ABI, name: "isAvailable" })).toMatchObject({ inputs: [{ type:"string" }], outputs: [{ type:"bool" }] })
    expect(encodeFunctionData({ abi: ETH_REGISTRAR_ABI, functionName:"isAvailable", args:["arcade"] }).slice(0,10)).not.toBe("0xaeb8ce9b")
    expect(getAbiItem({ abi: ETH_REGISTRAR_ABI, name:"makeCommitment" }).inputs.map(i=>i.type)).toEqual(["string","address","bytes32","address","address","uint64","bytes32"])
    expect(getAbiItem({ abi: ETH_REGISTRAR_ABI, name:"getRegisterPrice" }).outputs.map(i=>i.type)).toEqual(["uint256","uint256"])
  })
  it("pins bool-returning grants and proxy/registry/resolver initialization surfaces", () => {
    expect(getAbiItem({abi:PERMISSIONED_REGISTRY_ABI,name:"grantRoles"}).outputs).toMatchObject([{type:"bool"}])
    expect(getAbiItem({abi:PERMISSIONED_REGISTRY_ABI,name:"getState"}).outputs[0]).toMatchObject({type:"tuple",components:[{type:"uint8"},{type:"uint64"},{type:"address"},{type:"uint256"},{type:"uint256"}]})
    expect(getAbiItem({abi:PERMISSIONED_RESOLVER_ABI,name:"authorizeTextRoles"}).outputs).toMatchObject([{type:"bool"}])
    expect(getAbiItem({abi:PERMISSIONED_RESOLVER_ABI,name:"initialize"}).inputs.map(i=>i.type)).toEqual(["address","uint256","bytes[]"])
    expect(getAbiItem({abi:USER_REGISTRY_INIT_ABI,name:"initialize"}).inputs.map(i=>i.type)).toEqual(["address","uint256"])
    expect(getAbiItem({abi:VERIFIABLE_FACTORY_ABI,name:"deployProxy"}).inputs.map(i=>i.type)).toEqual(["address","uint256","bytes"])
    expect(getAbiItem({abi:MOCK_USDC_ABI,name:"mint"}).inputs.map(i=>i.type)).toEqual(["address","uint256"])
  })
})
