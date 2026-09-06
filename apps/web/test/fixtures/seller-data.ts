// Actual H2 -> H4 fixture, not hand-written partial DTO casts or live evidence.
import { Bounds, PublicListing, Receipt } from "@arcade/core"
import { sellerSummary } from "../../../hub/src/summary.ts"
import { decodeSellerSummary } from "../../src/lib/hub-decode.ts"
import type { ListingRecord } from "../../../hub/src/store.ts"

export const SELLER = `0x${"3".repeat(40)}`, NOW = 1_800_000_000_000, HASH = `0x${"c".repeat(64)}`
export type SellerMode = "normal" | "negative" | "unknown-cost" | "unknown-spend" | "empty" | "historical" | "zero"
export const sellerFixture = (mode: SellerMode = "normal", address = SELLER) => {
  const listing: ListingRecord = { listing: PublicListing.make({ id: "diff-triage", serviceName: "Diff Triage", version: "1.0.0",
    price: "$0.12", description: "Synthetic seller fixture", bounds: Bounds.make({ timeoutSec: 60 }), inputSchema: {}, outputSchema: {}, tags: [] }),
    seller: SELLER, runnerId: "fixture-runner", publishedAtMs: NOW - 1000,
    payTested: { atMs: NOW - 500, jobId: "PRIVATE_JOB", ok: true, settleTx: HASH },
    ensName: "diff-triage.seller.arcade.eth", agentId: "0", agentVerified: true, registrationTx: HASH }
  const base = { jobId: "job-root", skillId: "diff-triage", skillVersion: "1.0.0", buyer: `0x${"4".repeat(40)}`, seller: SELLER,
    priceAtomic: 120000n, sellerAtomic: 114000n, feeAtomic: 6000n, feeBps: 500, rail: "eip3009" as const, network: "eip155:5042002",
    latencyMs: 1, settled: true, reason: "PRIVATE_DIAGNOSTIC", createdAtMs: NOW - 100, settleTx: HASH,
    rootJobId: "job-root", hop: 0, ancestors: [], children: [], treeCommittedAtomic: 0n }
  const root = Receipt.make({ ...base,
    ...(mode === "unknown-cost" ? {} : { sellerCostUsd: mode === "negative" ? 0.5 : mode === "zero" ? 0.114 : 0.02 }),
    ...(mode === "unknown-spend" ? { children: undefined } : {}) })
  const failed = Receipt.make({ ...base, jobId: "job-failed", rootJobId: "job-failed", settled: false, settleTx: undefined, sellerCostUsd: 0.01 })
  const receipts = mode === "empty" ? [] : mode === "normal" || mode === "unknown-cost" ? [root, failed] : [root]
  return decodeSellerSummary(sellerSummary(address, mode === "historical" ? [] : [listing], receipts, [{ runnerId: "fixture-runner",
    seller: SELLER, skillIds: ["diff-triage"], maxConcurrency: 2, connectedAtMs: NOW - 2000, lastSeenMs: NOW, activeJobs: 0 }], NOW), address)
}
