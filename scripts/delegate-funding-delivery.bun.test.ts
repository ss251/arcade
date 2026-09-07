import { describe, expect, test } from "bun:test"
import { encodeAbiParameters, encodeEventTopics, padHex, parseAbi, type Hex } from "viem"
import { delegateActualFee, assertDelegateSourceLog, inspectDelegateSource, createDelegateDelivery } from "./delegate-funding-delivery.ts"
import { DELEGATE_PROOF as P } from "./delegate-funding-proof.ts"
import type { DelegateProofChain } from "./delegate-funding-chain.ts"

const HASH = ("0x" + "11".repeat(32)) as Hex, BLOCK = ("0x" + "22".repeat(32)) as Hex
const fee = () => ({ token: "USDC", total: "0.00385", perIntent: [{ transferSpecHash: HASH, domain: 26, baseFee: "0.00385" }], forwardingFee: "0" })
const ABI = parseAbi(["event GatewayBurned(address indexed token,address indexed depositor,bytes32 indexed transferSpecHash,uint32 destinationDomain,bytes32 destinationRecipient,address signer,uint256 value,uint256 fee,uint256 fromAvailable,uint256 fromWithdrawing)"])
const source = () => ({ address: P.wallet, topics: encodeEventTopics({ abi: ABI, eventName: "GatewayBurned", args: { token: P.token, depositor: P.owner, transferSpecHash: HASH } }) as Hex[],
  data: encodeAbiParameters([{ type: "uint32" }, { type: "bytes32" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
    [26, padHex(P.delegate, { size: 32 }), P.delegate, 250000n, 3850n, 253850n, 0n]),
  removed: false, transactionHash: HASH, blockHash: BLOCK, blockNumber: "0x64", logIndex: "0x1" })
describe("owned delegated delivery evidence", () => {
  test("actual fees bind one transfer spec and remain distinct from the signed maximum", () => {
    expect(delegateActualFee(fee(), HASH, 50000n)).toBe(3850n)
    expect(delegateActualFee({ token: "USDC", total: "0.00385", perIntent: [{ ...fee().perIntent[0], baseFee: "0.003", transferFee: "0.00085" }] }, HASH, 50000n)).toBe(3850n)
    for (const changed of [{ ...fee(), token: "EURC" }, { ...fee(), total: "0.00384" }, { ...fee(), forwardingFee: "0.01" },
      { ...fee(), perIntent: [...fee().perIntent, ...fee().perIntent] }, { ...fee(), extra: 1 },
      { ...fee(), perIntent: [{ ...fee().perIntent[0], domain: 6 }] }, { ...fee(), perIntent: [{ ...fee().perIntent[0], transferSpecHash: BLOCK }] }])
      expect(() => delegateActualFee(changed, HASH, 50000n)).toThrow()
    expect(() => delegateActualFee(fee(), HASH, 3849n)).toThrow()
    let invoked = false
    expect(() => delegateActualFee({ ...fee(), get total() { invoked = true; return "0.00385" } }, HASH, 50000n)).toThrow()
    expect(invoked).toBe(false)
  })
  test("source burn binds owner custody to delegate, exact value and fee", () => {
    expect(() => assertDelegateSourceLog(source(), HASH, 3850n)).not.toThrow()
    for (const changed of [{ ...source(), address: P.minter }, { ...source(), data: "0x" as Hex },
      { ...source(), topics: [source().topics[0]!, padHex(P.token, { size: 32 }), padHex(P.delegate, { size: 32 }), HASH] }])
      expect(() => assertDelegateSourceLog(changed, HASH, 3850n)).toThrow()
    expect(() => assertDelegateSourceLog(source(), HASH, 3851n)).toThrow()
    expect(() => assertDelegateSourceLog(source(), BLOCK, 3850n)).toThrow()
  })
  function chainFixture(logs: unknown[]) {
    const calls: string[] = []
    const row = source()
    const chain = { finalized: async () => ({ blockNumber: 100n, blockHash: BLOCK }),
      read: async (method: string) => { calls.push(method); return logs },
      client: { getTransaction: async () => { calls.push("transaction"); return { value: 0n, to: P.wallet, from: P.seller } } },
      confirmed: async () => { calls.push("confirmed"); return { blockNumber: 100n, blockHash: BLOCK,
        receipt: { logs: [{ ...row, logIndex: 1 }] } } },
      identity: async () => { calls.push("identity") }, canonical: async () => { calls.push("canonical") } } as unknown as DelegateProofChain
    return { chain, calls }
  }
  test("absent source batch is pending, without a transaction, signer or resubmission", async () => {
    const { chain, calls } = chainFixture([])
    expect(await inspectDelegateSource(chain, HASH, 3850n, 90n)).toEqual({ sourceDebit: "pending" })
    expect(calls).toEqual(["eth_getLogs"])
  })
  test("one source batch needs receipt correlation and reviewed identity", async () => {
    const { chain, calls } = chainFixture([source()])
    expect(await inspectDelegateSource(chain, HASH, 3850n, 90n)).toEqual({ sourceDebit: "confirmed", sourceTxHash: HASH, blockNumber: 100n, blockHash: BLOCK })
    expect(calls).toEqual(["eth_getLogs", "transaction", "confirmed", "identity", "canonical"])
    for (const logs of [[source(), source()], [{ ...source(), removed: true }], [{ ...source(), blockNumber: "0x50" }]]) {
      await expect(inspectDelegateSource(chainFixture(logs).chain, HASH, 3850n, 90n)).rejects.toThrow()
    }
    await expect(inspectDelegateSource(chainFixture([]).chain, HASH, 3850n, 101n)).rejects.toThrow()
  })
  test("missing readiness poisons delivery before keys or SDK IO", async () => {
    let keys = 0, network = 0, reads = 0
    const chain = { snapshot: async () => { reads++; return { authorized: false } } } as unknown as DelegateProofChain
    const d = createDelegateDelivery({ chain, journal: { append: async () => { throw Error("unexpected") }, close: async () => {} },
      fundJournalPath: "/private/tmp/unused-proof-test/fund.jsonl", maxBurnBlockDelta: 1382400n,
      signal: new AbortController().signal, deadlineMs: performance.now() + 10000,
      acquireDelegate: async () => { keys++; throw Error("unexpected") },
      fetch: (async () => { network++; throw Error("unexpected") }) as unknown as typeof fetch })
    await expect(d.deliver(90n)).rejects.toThrow()
    await expect(d.deliver(90n)).rejects.toThrow()
    expect({ keys, network, reads }).toEqual({ keys: 0, network: 0, reads: 1 })
    expect(d.counts()).toEqual({ attempted: true, signatureClaimed: false, transferAttempted: false, mintSigned: false })
  })
})
