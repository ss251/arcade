import { describe, expect, it } from "vitest"
import { encodeAbiParameters, keccak256, parseAbiParameters, toHex, type Hex, type PublicClient } from "viem"
import { createEscrowReader, type EscrowReadClient } from "../src/erc8183-reader.ts"
import { ERC8183_ZERO, ERC8183_ZERO_HASH } from "../src/erc8183-codec.ts"
const addr = (n: number) => ("0x" + n.toString(16).padStart(40, "0")) as Hex
const hash = (n: number) => ("0x" + n.toString(16).padStart(64, "0")) as Hex
// Compile-time structural compatibility with an actual viem public client, without IO.
const acceptsViem: (client: PublicClient) => EscrowReadClient = client => client
void acceptsViem
const identity = { chainId: 5042002, escrow: addr(10), implementation: addr(11), hook: addr(12),
  evaluator: addr(3), treasury: addr(4), token: "0x3600000000000000000000000000000000000000",
  proxyCodeHash: keccak256("0x01"), implementationCodeHash: keccak256("0x02"), hookCodeHash: keccak256("0x03") }
function fixture() {
  const calls: { method: string; args: unknown }[] = []
  const controller = new AbortController()
  const block = { number: 50n, hash: hash(50), timestamp: 1000n }
  const job = { client: addr(1), status: 1, provider: addr(2), expiredAt: 2000, evaluator: addr(3),
    submittedAt: 0, budget: 300000n, hook: addr(12), paymentToken: identity.token, providerAgentId: 8n,
    description: "binding", settledAmount: 0n, payoutReceiver: ERC8183_ZERO }
  const getters: Record<string, unknown> = { paused: false, platformFeeBP: 500n, evaluatorFeeBP: 0n,
    platformTreasury: addr(4), allowedPaymentTokens: true, whitelistedHooks: true, escrow: addr(10), evaluator: addr(3),
    DOMAIN_SEPARATOR: keccak256(encodeAbiParameters(parseAbiParameters("bytes32,bytes32,bytes32,uint256,address"),
      [keccak256(toHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")),
        keccak256(toHex("ERC8183")), keccak256(toHex("1")), 5042002n, addr(10)])),
    getJob: job, pendingClaimHash: ERC8183_ZERO_HASH }
  let now = 1000
  const client: EscrowReadClient = {
    async getChainId() { calls.push({ method: "getChainId", args: {} }); return 5042002 },
    async getBlock(args) { calls.push({ method: "getBlock", args }); return { ...block } },
    async getCode(args) {
      calls.push({ method: "getCode", args })
      return args.address === addr(10) ? "0x01" : args.address === addr(11) ? "0x02" : "0x03"
    },
    async getStorageAt(args) { calls.push({ method: "getStorageAt", args }); return ("0x" + "00".repeat(12) + addr(11).slice(2)) as Hex },
    async readContract(args) { calls.push({ method: args.functionName, args }); return getters[args.functionName] }
  }
  return { client, calls, block, job, getters, controller, setNow: (value: number) => { now = value },
    options: { signal: controller.signal, nowSeconds: () => now } }
}
describe("identity-bound escrow finalized reader (fake RPC, no sends)", () => {
  it("checks the full deployment before a job exists, without getJob or jobCounter", async () => {
    const f = fixture(), reader = createEscrowReader(f.client, identity, f.options)
    delete f.getters.getJob; delete f.getters.pendingClaimHash
    const result = await reader.readDeployment()
    expect(result).toEqual({ identity: reader.identity, chainId: 5042002, escrow: addr(10),
      blockNumber: 50n, blockHash: hash(50), timestamp: 1000 })
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.identity)).toBe(true)
    expect(f.calls.filter(c => c.method === "getBlock").map(c => c.args))
      .toEqual([{ blockTag: "finalized" }, { blockNumber: 50n }])
    expect(f.calls.some(c => ["getJob", "pendingClaimHash", "jobCounter"].includes(c.method))).toBe(false)
    expect(f.calls.filter(c => !["getChainId", "getBlock"].includes(c.method)).map(c => c.method)).toEqual([
      "getCode", "getCode", "getCode", "getStorageAt", "paused", "platformFeeBP", "evaluatorFeeBP", "platformTreasury",
      "allowedPaymentTokens", "whitelistedHooks", "escrow", "evaluator", "DOMAIN_SEPARATOR"
    ])
    expect(f.calls.filter(c => !["getChainId", "getBlock"].includes(c.method))
      .every(c => (c.args as { blockNumber: bigint }).blockNumber === 50n)).toBe(true)
    const count = f.calls.length
    await expect(reader.readJob(0n)).rejects.toThrow("escrow_facts_refused")
    expect(f.calls).toHaveLength(count)
  })
  it.each(["fee", "chain", "code", "slot", "stale", "reorg", "abort"])("deployment-only read preserves %s refusal", async problem => {
    const f = fixture()
    if (problem === "fee") f.getters.platformFeeBP = 499n
    if (problem === "chain") f.client.getChainId = async () => 1
    if (problem === "code") f.client.getCode = async () => "0x04"
    if (problem === "slot") f.client.getStorageAt = async () => hash(99)
    if (problem === "stale") f.block.timestamp = 969n
    if (problem === "reorg") { let n = 0; f.client.getBlock = async () => ({ ...f.block, hash: hash(++n) }) }
    if (problem === "abort") f.controller.abort()
    await expect(createEscrowReader(f.client, identity, f.options).readDeployment()).rejects.toThrow(/^escrow_facts_refused$/)
    expect(f.calls.some(c => ["getJob", "pendingClaimHash", "jobCounter"].includes(c.method))).toBe(false)
  })
  it("reconciles an older canonical receipt block under a fresh finalized head, never an unfinalized or mismatched block", async () => {
    const f = fixture()
    f.client.getBlock = async args => "blockTag" in args ? f.block : { number: args.blockNumber, hash: hash(40), timestamp: 100n }
    const reader = createEscrowReader(f.client, identity, f.options)
    await expect(reader.readJobAt(7n, { blockNumber: 40n, blockHash: hash(40) }))
      .resolves.toMatchObject({ blockNumber: 40n, blockHash: hash(40), timestamp: 100 })
    await expect(reader.readJobAt(7n, { blockNumber: 51n, blockHash: hash(40) })).rejects.toThrow("escrow_facts_refused")
    await expect(reader.readJobAt(7n, { blockNumber: 40n, blockHash: hash(41) })).rejects.toThrow("escrow_facts_refused")
    expect(f.calls.filter(c => !["getChainId", "getBlock"].includes(c.method))
      .every(c => (c.args as { blockNumber: bigint }).blockNumber === 40n)).toBe(true)
    const target = { blockNumber: 40n, blockHash: hash(40) }
    f.client.getChainId = async () => { target.blockNumber = 49n; return 5042002 }
    await expect(reader.readJobAt(7n, target)).resolves.toMatchObject({ blockNumber: 40n })
  })
  it("reads every state fact at the same finalized height and rechecks canonical hash", async () => {
    const f = fixture(), reader = createEscrowReader(f.client, identity, f.options)
    const result = await reader.readJob(7n)
    expect(result).toMatchObject({ jobId: 7n, blockHash: hash(50), timestamp: 1000, job: f.job })
    expect(Object.isFrozen(result)).toBe(true)
    for (const c of f.calls.filter(c => !["getChainId", "getBlock"].includes(c.method))) {
      expect(c.args).toMatchObject({ blockNumber: 50n })
    }
    expect(f.calls.filter(c => c.method === "getBlock").map(c => c.args))
      .toEqual([{ blockTag: "finalized" }, { blockNumber: 50n }])
    expect(f.calls.filter(c => c.method === "getChainId")).toHaveLength(2)
    expect(f.calls.find(c => c.method === "getJob")?.args).toMatchObject({ args: [7n] })
    expect(f.calls.find(c => c.method === "pendingClaimHash")?.args).toMatchObject({ args: [7n] })
  })
  it.each([
    ["paused", true], ["platformFeeBP", 0n], ["evaluatorFeeBP", 1n], ["platformTreasury", addr(9)],
    ["allowedPaymentTokens", false], ["whitelistedHooks", false], ["escrow", addr(9)],
    ["evaluator", addr(9)], ["DOMAIN_SEPARATOR", hash(9)]
  ])("refuses unexpected deployment getter %s", async (name, value) => {
    const f = fixture(); f.getters[name as string] = value
    await expect(createEscrowReader(f.client, identity, f.options).readJob(7n)).rejects.toThrow("escrow_facts_refused")
    expect(f.calls.some(c => c.method === "getJob")).toBe(false)
  })
  it("refuses all three code mismatches and a replaced/dirty implementation slot", async () => {
    for (const field of ["proxyCodeHash", "implementationCodeHash", "hookCodeHash"]) {
      const f = fixture()
      await expect(createEscrowReader(f.client, { ...identity, [field]: hash(7) }, f.options).readJob(7n))
        .rejects.toThrow("escrow_facts_refused")
      expect(f.calls.some(c => c.method === "getJob")).toBe(false)
    }
    for (const slot of [hash(9), "0x" + "01".repeat(32), "0x", undefined]) {
      const f = fixture(); f.client.getStorageAt = async () => slot as Hex | undefined
      await expect(createEscrowReader(f.client, identity, f.options).readJob(7n)).rejects.toThrow("escrow_facts_refused")
    }
  })
  it("refuses wrong chain, stale/future/pending blocks and reorgs", async () => {
    for (const timestamp of [969n, 1006n]) {
      const f = fixture(); f.block.timestamp = timestamp
      await expect(createEscrowReader(f.client, identity, f.options).readJob(7n)).rejects.toThrow("escrow_facts_refused")
    }
    const f = fixture(); f.client.getChainId = async () => 1
    await expect(createEscrowReader(f.client, identity, f.options).readJob(7n)).rejects.toThrow("escrow_facts_refused")
    const g = fixture(); let n = 0
    g.client.getBlock = async () => ({ ...g.block, hash: ++n === 1 ? hash(50) : hash(51) })
    await expect(createEscrowReader(g.client, identity, g.options).readJob(7n)).rejects.toThrow("escrow_facts_refused")
    const h = fixture(); h.client.getBlock = async () => ({ ...h.block, number: null })
    await expect(createEscrowReader(h.client, identity, h.options).readJob(7n)).rejects.toThrow("escrow_facts_refused")
  })
  it("stops before another read after cancellation, clock regression or snapshot aging", async () => {
    for (const stop of ["abort", "regress", "stale"]) {
      const f = fixture()
      f.client.getCode = async () => {
        if (stop === "abort") f.controller.abort()
        else f.setNow(stop === "regress" ? 999 : 1031)
        return "0x01"
      }
      await expect(createEscrowReader(f.client, identity, f.options).readJob(7n)).rejects.toThrow("escrow_facts_refused")
      expect(f.calls.some(c => c.method === "getStorageAt")).toBe(false)
    }
  })
  it("captures immutable configuration, refuses getters and never leaks provider error text", async () => {
    const f = fixture(), config = { ...identity }, reader = createEscrowReader(f.client, config, f.options)
    config.hook = addr(99)
    await expect(reader.readJob(7n)).resolves.toMatchObject({ escrow: addr(10) })
    let reads = 0
    const hostile = Object.defineProperty({ ...identity }, "escrow", { get() { reads++; return addr(10) } })
    expect(() => createEscrowReader(f.client, hostile, f.options)).toThrow("escrow_facts_refused")
    expect(reads).toBe(0)
    f.client.readContract = async () => { throw Error("private upstream secret") }
    await expect(reader.readJob(7n)).rejects.toThrow(/^escrow_facts_refused$/)
  })
})
