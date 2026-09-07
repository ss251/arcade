/** Populate owned fixture storage with real codec-verified synthetic proofs; no RPC. */
import { buyerFixture, buyer, hash } from "./erc8183-buyer.ts"
import { prepareEscrowBuyerAction } from "../../src/erc8183-buyer-intent.ts"
import { assertEscrowBuyerSigned, assertEscrowBuyerReceipt, assertEscrowBuyerBudgetReceipt } from "../../src/erc8183-buyer-evidence.ts"
import type { openEscrowBuyerJournal } from "../../src/erc8183-buyer-journal.ts"
export async function recordSyntheticBuyerPurchase(journal: ReturnType<typeof openEscrowBuyerJournal>["journal"]) {
  const source = await buyerFixture(), claim = await journal.claim(source.input, '{"fixture":true}')
  if (!claim) throw Error("fixture claim refused")
  for (const kind of ["create", "budget", "approve", "fund"] as const) {
    const f = await buyerFixture(kind), offset = ["create", "budget", "approve", "fund"].indexOf(kind),
      blockNumber = 51n + BigInt(offset), blockHash = hash(51 + offset)
    if (kind === "budget") {
      const receipt = { ...f.receipt, blockNumber, blockHash, logs: f.receipt.logs.map(l => ({ ...l, blockNumber, blockHash })) },
        tx = { ...f.tx, blockNumber, blockHash }, after = { ...f.after, blockNumber, blockHash, timestamp: 1002 }
      await journal.httpAttempt(claim, "budget")
      await journal.budgetConfirmed(claim, await assertEscrowBuyerBudgetReceipt(f.intent, 7n, f.raw, tx, receipt, after)); continue
    }
    const snapshot = { ...f.snapshot, blockNumber: 50n + BigInt(offset), blockHash: hash(50 + offset), timestamp: 1000 + offset },
      before = kind === "create" ? { identity: f.intent.identity, chainId: 5042002, escrow: f.intent.call.escrow,
        blockNumber: snapshot.blockNumber, blockHash: snapshot.blockHash, timestamp: snapshot.timestamp } : snapshot,
      action = prepareEscrowBuyerAction(f.intent, before, kind === "create" ? { kind } : { kind, jobId: 7n, allowanceAtomic: kind === "approve" ? 0n : 300000n }, snapshot.timestamp),
      terms = { ...f.terms, nonce: kind === "create" ? 3 : kind === "approve" ? 4 : 5 },
      raw = await buyer.signTransaction({ ...f.transaction, nonce: terms.nonce }), signed = await assertEscrowBuyerSigned(action, raw, terms),
      receipt = { ...f.receipt, transactionHash: signed.hash, blockNumber, blockHash, logs: f.receipt.logs.map(l => ({ ...l, transactionHash: signed.hash, blockNumber, blockHash })) },
      tx = { ...f.tx, hash: signed.hash, nonce: terms.nonce, blockNumber, blockHash }, after = { ...f.after, blockNumber, blockHash, timestamp: 1001 + offset },
      proof = assertEscrowBuyerReceipt(action, signed, tx, receipt, after, f.allowanceAtomic)
    await journal.intent(claim, action, before, snapshot.timestamp, kind === "create" ? undefined : kind === "approve" ? 0n : 300000n)
    await journal.prepared(claim, signed); await journal.attempt(claim, signed.hash); await journal.confirmed(claim, proof)
  }
  const jobId = "job_" + "a".repeat(32), token = "b".repeat(32)
  await journal.httpAttempt(claim, "root"); await journal.accepted(claim, { jobId, token, pollUrl: `https://example.test/jobs/${jobId}/result?token=${token}` })
  return { jobId, token }
}
