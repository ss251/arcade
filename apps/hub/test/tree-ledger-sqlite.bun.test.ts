import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import { openSqliteStore } from "../src/store-sqlite.ts"

describe("tree ledger survives restart", () => {
  it("re-reads reserved and committed rows", async () => {
    const path = `${process.env["TMPDIR"] ?? "/tmp"}/arcade-tree-${process.pid}-${Date.now()}.db`
    const a = openSqliteStore(path, "boot_a")
    await Effect.runPromise(a.store.reserveTree("job_root", "job_c1", 60_000n, 100_000n))
    await Effect.runPromise(a.store.commitTree("job_c1"))
    await Effect.runPromise(a.store.reserveTree("job_root", "job_c2", 30_000n, 100_000n))
    a.close()
    const b = openSqliteStore(path, "boot_b")
    const st = await Effect.runPromise(b.store.treeState("job_root"))
    expect(st.committedAtomic).toBe(60_000n)
    expect(st.reservedAtomic).toBe(30_000n)
    b.close()
  })

  it("refuses a duplicate childJobId, so a restart doesn't collapse two reservations into one row", async () => {
    const path = `${process.env["TMPDIR"] ?? "/tmp"}/arcade-tree-dup-${process.pid}-${Date.now()}.db`
    const a = openSqliteStore(path, "boot_a")
    const first = await Effect.runPromise(a.store.reserveTree("job_root", "job_dup", 10_000n, 100_000n))
    const second = await Effect.runPromise(a.store.reserveTree("job_root", "job_dup", 90_000n, 100_000n))
    a.close()
    expect(first).toBe(true)
    expect(second).toBe(false)

    const b = openSqliteStore(path, "boot_b")
    const st = await Effect.runPromise(b.store.treeState("job_root"))
    b.close()
    expect(st.children).toHaveLength(1)
    expect(st.reservedAtomic).toBe(10_000n)
  })
})
