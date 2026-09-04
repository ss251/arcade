import { describe, expect, it } from "vitest"
import { Effect, Layer } from "effect"
import { StoreLive, StoreTag } from "../src/store.ts"

const run = <A>(eff: Effect.Effect<A, never, StoreTag>) =>
  Effect.runPromise(Effect.provide(eff, StoreLive))

describe("tree reservation ledger", () => {
  it("reserves within the ceiling and refuses beyond it", async () => {
    const out = await run(Effect.gen(function* () {
      const s = yield* StoreTag
      const a = yield* s.reserveTree("job_root", "job_c1", 60_000n, 100_000n)
      const b = yield* s.reserveTree("job_root", "job_c2", 60_000n, 100_000n)
      const st = yield* s.treeState("job_root")
      return { a, b, st }
    }))
    expect(out.a).toBe(true)
    expect(out.b).toBe(false)
    expect(out.st.reservedAtomic).toBe(60_000n)
  })
  it("commit moves reserved to committed; release frees it", async () => {
    const out = await run(Effect.gen(function* () {
      const s = yield* StoreTag
      yield* s.reserveTree("job_root", "job_c1", 60_000n, 100_000n)
      yield* s.commitTree("job_c1")
      yield* s.reserveTree("job_root", "job_c2", 30_000n, 100_000n)
      yield* s.releaseTree("job_c2")
      const ok = yield* s.reserveTree("job_root", "job_c3", 40_000n, 100_000n)
      return { ok, st: yield* s.treeState("job_root") }
    }))
    expect(out.ok).toBe(true)
    expect(out.st.committedAtomic).toBe(60_000n)
    expect(out.st.reservedAtomic).toBe(40_000n)
  })
  it("a zero ceiling refuses every hire", async () => {
    const ok = await run(Effect.flatMap(StoreTag, (s) => s.reserveTree("job_r", "job_c", 1n, 0n)))
    expect(ok).toBe(false)
  })
})
