import { afterEach, describe, expect, it } from "vitest"
import { Effect } from "effect"
import { Job, Rating, Receipt } from "@arcade/core"
import { openSqliteStore } from "../src/store-sqlite.ts"
import { rmSync } from "node:fs"

/**
 * The restart-survival contract, which is what makes a public host viable at all: on
 * Railway every deploy is a restart, so this gets exercised on every push whether anyone
 * tests it or not.
 *
 * Three properties, and one of them is a deliberate NON-property:
 *
 *  - receipts and ratings survive, because they are the evidence the marketplace page's
 *    statistics are computed from;
 *  - jobs survive, because a buyer holds a `job_token` for one;
 *  - listings and runners do NOT survive, because a listing is only valid while its runner
 *    is connected and restoring one would advertise a skill nobody serves.
 */

let paths: Array<string> = []
const tmp = () => {
  const p = `${process.env["TMPDIR"] ?? "/tmp"}/arcade-store-${process.pid}-${paths.length}.db`
  paths.push(p)
  return p
}

afterEach(() => {
  for (const p of paths) {
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        rmSync(`${p}${suffix}`)
      } catch {
        /* not every journal file exists */
      }
    }
  }
  paths = []
})

const receipt = (jobId: string, settled = true) =>
  Receipt.make({
    jobId,
    skillId: "usdc-flow-check",
    skillVersion: "0.1.0",
    buyer: "0xBuyer",
    seller: "0xSeller",
    priceAtomic: 10_000n,
    sellerAtomic: 9_500n,
    feeAtomic: 500n,
    feeBps: 500,
    rail: "test",
    network: "eip155:5042002",
    settled,
    reason: settled ? "ok" : "engine refusal",
    latencyMs: 800,
    createdAtMs: Date.now(),
    feeAccrualId: "acc_2026-07-27"
  })

// `JobId` is `^job_[a-zA-Z0-9]{16,}$`, so fixtures have to be real-shaped ids.
const jid = (name: string) => `job_${name}${"0".repeat(Math.max(0, 16 - name.length))}`

const job = (name: string, status: "queued" | "running" | "succeeded") =>
  Job.make({
    id: jid(name),
    skillId: "usdc-flow-check",
    seller: "0xSeller",
    buyer: "0xBuyer",
    priceAtomic: 10_000n,
    input: { address: "0xabc" },
    status,
    createdAtMs: Date.now()
  })

describe("sqlite store", () => {
  it("keeps receipts across a restart — the evidence the page is built on", async () => {
    const path = tmp()
    const first = openSqliteStore(path, "boot_1")
    await Effect.runPromise(first.store.putReceipt(receipt("job_1")))
    await Effect.runPromise(first.store.putReceipt(receipt("job_2", false)))
    first.close()

    const second = openSqliteStore(path, "boot_2")
    const all = await Effect.runPromise(second.store.allReceipts)
    second.close()

    expect(all).toHaveLength(2)
    // bigints have to survive the round trip, or every amount on the page is wrong.
    expect(all[0]?.priceAtomic).toBe(10_000n)
    expect(all[0]?.feeAtomic).toBe(500n)
    expect(all.map((r) => r.settled)).toEqual([true, false])
  })

  it("recomputes statistics from the restored receipts", async () => {
    // The page's credibility rests on stats being derived, so they have to derive from
    // what survived rather than from a stored summary.
    const path = tmp()
    const first = openSqliteStore(path, "boot_1")
    await Effect.runPromise(first.store.putReceipt(receipt("job_1")))
    await Effect.runPromise(first.store.putReceipt(receipt("job_2", false)))
    first.close()

    const second = openSqliteStore(path, "boot_2")
    const stats = await Effect.runPromise(second.store.statsFor("usdc-flow-check"))
    second.close()

    expect(stats.calls).toBe(2)
    expect(stats.settled).toBe(1)
    expect(stats.successRate).toBeCloseTo(0.5, 6)
  })

  it("reaps a job left running by a previous boot", async () => {
    // THE property. Before the job row was written at dispatch, an interrupted job left no
    // row at all and the poll endpoint answers "pending" when it cannot find one — so the
    // buyer polled forever. Now they get a terminal answer.
    const path = tmp()
    const first = openSqliteStore(path, "boot_1")
    await Effect.runPromise(first.store.putJob(job("live", "running")))
    await Effect.runPromise(first.store.putJob(job("done", "succeeded")))
    first.close()

    const second = openSqliteStore(path, "boot_2")
    const live = await Effect.runPromise(second.store.getJob(jid("live")))
    const done = await Effect.runPromise(second.store.getJob(jid("done")))
    second.close()

    expect(second.reaped).toBe(1)
    expect(live?.status).toBe("failed")
    // A job that already finished is untouched — reaping is for the abandoned, not the old.
    expect(done?.status).toBe("succeeded")
  })

  it("reaps queued jobs too, not just running ones", async () => {
    const path = tmp()
    const first = openSqliteStore(path, "boot_1")
    await Effect.runPromise(first.store.putJob(job("q", "queued")))
    first.close()

    const second = openSqliteStore(path, "boot_2")
    expect((await Effect.runPromise(second.store.getJob(jid("q"))))?.status).toBe("failed")
    second.close()
  })

  it("does NOT restore listings or runners — they belong to live connections", async () => {
    // Deliberate. A restored listing would advertise a skill nobody is serving, which is
    // the one thing `/openapi.json`, `/.well-known/x402` and `/skill.md` promise cannot
    // happen. Runners reconnect with backoff and re-announce.
    const path = tmp()
    const first = openSqliteStore(path, "boot_1")
    await Effect.runPromise(
      first.store.putRunner({
        runnerId: "rnr_1",
        seller: "0xSeller",
        skillIds: ["usdc-flow-check"],
        lastSeenMs: Date.now(),
        activeJobs: 0
      })
    )
    first.close()

    const second = openSqliteStore(path, "boot_2")
    const listings = await Effect.runPromise(second.store.allListings)
    const runners = await Effect.runPromise(second.store.allRunners)
    second.close()

    expect(listings).toHaveLength(0)
    expect(runners).toHaveLength(0)
  })

  it("keeps receipt-gated ratings, so reputation is not reset by a deploy", async () => {
    const path = tmp()
    const first = openSqliteStore(path, "boot_1")
    await Effect.runPromise(
      first.store.putRating(
        Rating.make({
          receiptJobId: "job_1",
          skillId: "usdc-flow-check",
          skillVersion: "0.1.0",
          buyer: "0xBuyer",
          stars: 5,
          createdAtMs: Date.now()
        })
      )
    )
    first.close()

    const second = openSqliteStore(path, "boot_2")
    const ratings = await Effect.runPromise(second.store.ratingsFor("usdc-flow-check"))
    second.close()

    expect(ratings).toHaveLength(1)
    expect(ratings[0]?.stars).toBe(5)
  })

  it("survives being reopened repeatedly, which is what a deploy is", async () => {
    const path = tmp()
    for (let i = 0; i < 3; i++) {
      const s = openSqliteStore(path, `boot_${i}`)
      await Effect.runPromise(s.store.putReceipt(receipt(`job_${i}`)))
      s.close()
    }
    const final = openSqliteStore(path, "boot_final")
    const all = await Effect.runPromise(final.store.allReceipts)
    final.close()

    expect(all).toHaveLength(3)
    expect(final.reaped).toBe(0)
  })
})
