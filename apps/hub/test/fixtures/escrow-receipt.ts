import { Receipt } from "@arcade/core"
// Synthetic reader data only, not an independently verified or live chain proof.
export const hash = (n: string) => "0x" + n.repeat(64), address = (n: string) => "0x" + n.repeat(40)
export const ROOT = "job_" + "a".repeat(32), CHILD = "job_" + "b".repeat(32), SELLER = address("4"), BUYER = address("5")
export const TX = hash("7"), ZERO = hash("0"), REFUND = hash("8")
export function row(state: "settled" | "refunded" | "uncertain" = "settled"): Receipt {
  const base = { protocol: "arcade:erc8183:terminal:v1" as const, chainId: 5042002 as const, escrow: address("6"),
    jobId: "7", requestHash: hash("9"), amountAtomic: "120000" }
  const proof = { txHash: state === "refunded" ? REFUND : TX, blockHash: hash("2"), blockNumber: "50", blockTimestamp: 1000,
    submittedAt: 900, gasWei: "100", sellerAtomic: state === "settled" ? "114000" : "0", feeAtomic: state === "settled" ? "6000" : "0",
    refundAtomic: state === "refunded" ? "120000" : "0" }
  return Receipt.make({ jobId: ROOT, skillId: "root-skill", skillVersion: "1.0.0", buyer: BUYER, seller: SELLER,
    priceAtomic: 120000n, sellerAtomic: 114000n, feeAtomic: 6000n, feeBps: 500, rail: "erc8183", network: "eip155:5042002",
    latencyMs: 1000, createdAtMs: 1001000, settled: state === "settled", reason: state === "settled" ? "ok" :
      state === "refunded" ? "escrow refunded" : "escrow outcome uncertain; reconciliation required",
    ...(state === "settled" ? { settleTx: TX, settleRefKind: "onchain" as const } : {}),
    rootJobId: ROOT, hop: 0, ancestors: [], children: [], treeHash: ZERO, treeCommittedAtomic: 0n, treeCeilingAtomic: 50000n, sellerCostUsd: 0,
    escrow: state === "uncertain" ? { ...base, state } : { ...base, state, ...proof } })
}
