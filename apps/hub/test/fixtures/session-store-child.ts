/** Owned, import-inert local checkpoint fixture. No rail, HTTP, secret or environment lookup. */
import { Effect } from "effect"
import { Job, JobOutcome, Receipt, loadChainConfig } from "@arcade/core"
import { openSqliteStore } from "../../src/store-sqlite.ts"
import { sessionRequestDigest, type SessionBinding } from "../../src/session-ledger.ts"

const main = async (path: string | undefined, checkpoint: string | undefined) => {
  if (!path || !checkpoint || !["reserved", "settling", "simulated-acceptance", "settled"].includes(checkpoint)) throw Error("invalid fixture arguments")
  const run = Effect.runPromise, opened = openSqliteStore(path, "owned_child"), store = opened.store
  const c = loadChainConfig("arc-testnet"), buyer = `0x${"1".repeat(40)}`, seller = `0x${"2".repeat(40)}`
  const sessionId = `ses_${"0".repeat(31)}1`, jobId = `job_${"0".repeat(19)}1`, amountAtomic = 60n
  const input = { fixture: "owned local checkpoint" }, ref = "12345678-1234-4234-8234-000000000001"
  const binding: SessionBinding = { sessionId, jobId, buyer, seller, skillId: "fixture", skillVersion: "1.0.0", rail: "gateway",
    network: c.caip2, asset: c.usdc.address, verifyingContract: c.gateway!.wallet, domainName: "GatewayWalletBatched", domainVersion: "1",
    payTo: seller, amountAtomic, nonce: `0x${"0".repeat(63)}1`, validAfter: 1n, validBefore: 604901n, requestDigest: sessionRequestDigest(input) }
  const job = Job.make({ id: jobId, skillId: "fixture", buyer, seller, priceAtomic: amountAtomic, input, status: "queued", createdAtMs: 2,
    rootJobId: jobId, hop: 0, ancestors: [] })
  await run(store.openSession({ id: sessionId, buyer, budgetAtomic: 100n, rail: "gateway", network: c.caip2, openedAtMs: 1 }))
  await run(store.reserveSessionJob(binding, job))
  if (checkpoint !== "reserved") {
    if (!(await run(store.beginSessionSettlement(sessionId, jobId))).claimed) throw Error("fixture barrier not claimed")
  }
  // A pure object, not a network acceptance: this explicitly exercises the local
  // gap between possible external acceptance and durable terminal evidence.
  const simulated = checkpoint === "simulated-acceptance" || checkpoint === "settled"
    ? { payer: buyer, amountAtomic, txHash: ref, settlementKind: "gateway-transfer" as const } : undefined
  if (checkpoint === "settled") {
    if (!simulated) throw Error("fixture result missing")
    await run(store.finishSessionJob({ kind: "settled", sessionId, jobId, settlement: simulated,
      job: Job.make({ ...job, status: "succeeded", outcome: JobOutcome.make({ status: "succeeded", startedAtMs: 2, finishedAtMs: 3, output: { ok: true } }) }),
      receipt: Receipt.make({ jobId, skillId: "fixture", skillVersion: "1.0.0", buyer, seller, priceAtomic: amountAtomic,
        sellerAtomic: amountAtomic, feeAtomic: 0n, feeBps: 0, rail: "gateway", network: c.caip2, latencyMs: 1, settled: true, reason: "ok",
        createdAtMs: 3, rootJobId: jobId, hop: 0, ancestors: [], sessionId, settleTx: ref, settleRefKind: "gateway-transfer" }) }))
  }
  process.stdout.write(`checkpoint:${checkpoint}\n`)
  // Deliberately keep this owned child alive. The parent observes the checkpoint,
  // terminates this exact process and awaits exit before inspecting its database.
  await new Promise<void>(() => { setInterval(() => {}, 1000) })
}
if (import.meta.main) {
  try { await main(process.argv[2], process.argv[3]) }
  catch { process.stderr.write("owned checkpoint fixture failed\n"); process.exitCode = 1 }
}
