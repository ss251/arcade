/** One cooperative owned proof attempt. Runtime capabilities are supplied by the live entry point. */
import type { DelegateProofChain, OwnerProofReceipt } from "./delegate-funding-chain.ts"
import type { DelegateProofJournal } from "./delegate-funding-journal.ts"
import { DELEGATE_PROOF as P, assertFreshDelegateProof, proofCheck, proofFail, type ProofFacts } from "./delegate-funding-proof.ts"
import type { createDelegateDelivery } from "./delegate-funding-delivery.ts"

type Delivery = ReturnType<typeof createDelegateDelivery>
export interface DelegateSequenceDependencies {
  readonly chain: Pick<DelegateProofChain, "snapshot" | "pause">
  readonly ownerStep: (step: "grant" | "approval" | "deposit", prepared: (txHash: `0x${string}`, gasCapWei: bigint) => Promise<void>) => Promise<OwnerProofReceipt>
  readonly delivery: Pick<Delivery, "status" | "deliver" | "knownMintHash">
  readonly journal: DelegateProofJournal
  readonly purchase: () => Promise<Required<Pick<ProofFacts, "txHash" | "jobId">> & ProofFacts>
}
const attemptedJournals = new WeakSet<DelegateProofJournal>()
export async function runDelegateSequence(d: DelegateSequenceDependencies) {
  proofCheck(!attemptedJournals.has(d.journal)); attemptedJournals.add(d.journal)
  let started = false
  try {
    await d.journal.append("planned"); started = true
    assertFreshDelegateProof(await d.chain.snapshot())
    let deposit: OwnerProofReceipt | undefined
    for (const step of ["grant", "approval", "deposit"] as const) {
      const r = await d.ownerStep(step, (txHash, gasWei) => d.journal.append(`${step}_prepared`, { txHash, gasWei }))
      await d.journal.append(`${step}_confirmed`, { txHash: r.txHash, blockNumber: r.blockNumber,
        blockHash: r.blockHash, gasWei: r.gasWei, ...(step === "deposit" ? { amount: P.depositAtomic } : {}) })
      if (step === "deposit") deposit = r
    }
    proofCheck(deposit)
    let ready = false
    for (let i = 0; i < 60; i++) {
      const status = await d.delivery.status()
      proofCheck(status === "ready" || status === "pending" || status === "none")
      if (status === "ready") {
        const s = await d.chain.snapshot()
        proofCheck(s.authorized && s.allowance === 0n && s.ownerGatewayTotal === P.depositAtomic &&
          s.available <= P.depositAtomic && s.pendingBatch <= P.depositAtomic)
        if (s.available === P.depositAtomic && s.pendingBatch === 0n) { ready = true; break }
      }
      await d.chain.pause(1000)
    }
    proofCheck(ready)
    await d.journal.append("delegation_ready")
    await d.journal.append("spend_intent", { amount: P.deliveryAtomic })
    // deliver owns burn_prepared/mint_confirmed/source_checked. Purchase follows
    // independent mint proof, not merely the SDK-returned transaction hash.
    const delivery = await d.delivery.deliver(deposit.blockNumber)
    await d.journal.append("purchase_intent", { amount: P.paymentAtomic })
    const purchase = await d.purchase()
    proofCheck(purchase.amount === P.paymentAtomic)
    await d.journal.append("purchase_confirmed", purchase)
    await d.journal.append("complete")
    return Object.freeze({ delivery, purchase })
  } catch {
    if (started) {
      const txHash = d.delivery.knownMintHash()
      await d.journal.append("uncertain", txHash ? { txHash } : {}).catch(() => {})
    }
    return proofFail()
  }
}
