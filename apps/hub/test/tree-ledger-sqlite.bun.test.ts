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
})
