import { afterEach, describe, expect, test } from "bun:test"
import { chmod, mkdtemp, readFile, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Hex } from "viem"
import { openDelegateProofJournal } from "./delegate-funding-journal.ts"
import { runDelegateSequence, type DelegateSequenceDependencies } from "./delegate-funding-sequence.ts"
import { DELEGATE_PROOF as P, proofStages } from "./delegate-funding-proof.ts"
import type { OwnerProofReceipt } from "./delegate-funding-chain.ts"
const HASH = ("0x" + "11".repeat(32)) as Hex
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture(fail?: string) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "arcade-j5-sequence-"))); await chmod(root, 0o700); roots.push(root)
  const path = join(root, "proof.jsonl"), journal = await openDelegateProofJournal(path), calls: string[] = []
  let statusReads = 0
  const events = async () => (await readFile(path, "utf8")).trim().split("\n").slice(1).map(s => JSON.parse(s).event.stage as string)
  const d: DelegateSequenceDependencies = { journal,
    chain: { snapshot: async () => ({ blockNumber: 100n, blockHash: HASH, timestamp: 1000n,
      ownerNativeWei: 1000000000000000000n, delegateNativeWei: 1000000000000000000n,
      allowance: 0n, ownerGatewayTotal: calls.includes("deposit") ? P.depositAtomic : 0n,
      available: calls.includes("deposit") && fail !== "credit_pending" ? P.depositAtomic : 0n, pendingBatch: 0n,
      authorized: fail === "fresh" || calls.includes("deposit"), withdrawalDelay: 10n }),
      pause: async ms => { expect(ms).toBe(1000); calls.push("pause") } },
    ownerStep: async (step, prepared) => {
      calls.push(step); await prepared(HASH, 1n)
      expect((await events()).at(-1)).toBe(step + "_prepared")
      if (fail === step) throw Error("unknown_broadcast_outcome")
      return { txHash: HASH, blockHash: HASH, blockNumber: 100n, gasWei: 1n } as OwnerProofReceipt
    },
    delivery: { status: async () => {
      calls.push("status"); statusReads++
      if (fail === "status") throw Error("read_failed")
      if (fail === "unknown_status") return "unknown"
      return fail === "never_ready" || statusReads === 1 ? "pending" : "ready"
    },
      knownMintHash: () => fail === "delivery" || fail === "purchase" ? HASH : undefined,
      deliver: async () => {
        calls.push("deliver"); expect((await events()).at(-1)).toBe("spend_intent")
        await journal.append("burn_prepared", { specHash: HASH, maxFee: 50000n, maxBlockHeight: 200n })
        if (fail === "delivery") throw Error("uncertain_mint")
        await journal.append("mint_confirmed", { txHash: HASH })
        await journal.append("source_checked", { sourceDebit: "pending", available: 246150n })
        return { txHash: HASH, specHash: HASH, actualFee: 3850n, mintGasWei: 1n, recipientBeforeWei: 1000000000000000000n,
          recipientAfterWei: 1249999999999999999n, sourceDebit: "pending", available: 246150n, pendingBatch: 0n }
      } },
    purchase: async () => {
      calls.push("purchase"); expect((await events()).at(-1)).toBe("purchase_intent")
      if (fail === "purchase") throw Error("paid_outcome_uncertain")
      return { txHash: HASH, jobId: "job_0123456789abcdef", amount: fail === "overprice" ? 10001n : P.paymentAtomic }
    } }
  return { d, events, calls, journal }
}
describe("one owned delegate proof sequence", () => {
  test("durable stage order, bounded readiness and one paid call after independently proved delivery", async () => {
    const f = await fixture()
    try {
      const result = await runDelegateSequence(f.d)
      expect(result.delivery.sourceDebit).toBe("pending")
      expect(await f.events()).toEqual(proofStages.slice(0, -1))
      expect(f.calls).toEqual(["grant", "approval", "deposit", "status", "pause", "status", "deliver", "purchase"])
      await expect(runDelegateSequence(f.d)).rejects.toThrow()
      expect(f.calls.filter(c => c === "purchase")).toHaveLength(1)
    } finally { await f.journal.close() }
  })
  test("failed grant, approval, deposit, delivery or purchase never triggers a retry or later spending", async () => {
    for (const fail of ["fresh", "grant", "approval", "deposit", "status", "unknown_status", "delivery", "purchase", "overprice"]) {
      const f = await fixture(fail)
      try {
        await expect(runDelegateSequence(f.d)).rejects.toThrow()
        expect((await f.events()).at(-1)).toBe("uncertain")
        const earlier = [...f.calls]
        await expect(runDelegateSequence(f.d)).rejects.toThrow()
        expect(f.calls).toEqual(earlier)
        expect(f.calls.filter(c => c === "purchase")).toHaveLength(fail === "purchase" || fail === "overprice" ? 1 : 0)
        expect(f.calls.filter(c => c === "deliver")).toHaveLength(["delivery", "purchase", "overprice"].includes(fail) ? 1 : 0)
      } finally { await f.journal.close() }
    }
  })
  test("never-ready status stops after sixty read-only observations without spending", async () => {
    const f = await fixture("never_ready")
    try {
      await expect(runDelegateSequence(f.d)).rejects.toThrow()
      expect(f.calls.filter(c => c === "status")).toHaveLength(60)
      expect(f.calls.includes("deliver")).toBe(false)
      expect(f.calls.includes("purchase")).toBe(false)
      expect((await f.events()).at(-1)).toBe("uncertain")
    } finally { await f.journal.close() }
  })
  test("failed first durable append prevents even the first state read", async () => {
    const f = await fixture()
    await f.journal.close()
    await expect(runDelegateSequence(f.d)).rejects.toThrow()
    expect(f.calls).toEqual([])
  })
  test("a ready delegation without indexed owner credit never spends", async () => {
    const f = await fixture("credit_pending")
    try {
      await expect(runDelegateSequence(f.d)).rejects.toThrow()
      expect(f.calls.filter(c => c === "status")).toHaveLength(60)
      expect(f.calls.includes("deliver")).toBe(false)
      expect((await f.events()).at(-1)).toBe("uncertain")
    } finally { await f.journal.close() }
  })
})
