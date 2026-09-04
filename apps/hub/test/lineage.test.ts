import { describe, expect, it } from "vitest"
import { Effect, Layer } from "effect"
import { Job, mintHireCapability } from "@arcade/core"
import { StoreLive, StoreTag } from "../src/store.ts"
import { resolveLineage } from "../src/lineage.ts"

const SECRET = "s"
const parent = Job.make({
  id: "job_parent0000000000", skillId: "counterparty-brief", seller: "0xs", buyer: "0xb", priceAtomic: 250_000n,
  input: {}, status: "running", createdAtMs: 1, rootJobId: "job_parent0000000000", hop: 0, ancestors: []
})
const withParent = (eff: Effect.Effect<unknown, unknown, StoreTag>) =>
  Effect.runPromise(Effect.provide(Effect.gen(function* () {
    const s = yield* StoreTag
    yield* s.putJob(parent)
    return yield* Effect.either(eff)
  }), StoreLive))

describe("resolveLineage", () => {
  it("no header → root", async () => {
    const r = await withParent(Effect.flatMap(StoreTag, (s) => resolveLineage(s, SECRET, null, { id: "x" }, Date.now(), 3)))
    expect(r).toMatchObject({ _tag: "Right", right: { hop: 0, ancestors: [] } })
  })
  it("valid capability → child of the parent", async () => {
    const cap = mintHireCapability(SECRET, parent.id, Date.now() + 60_000)
    const r = await withParent(Effect.flatMap(StoreTag, (s) => resolveLineage(s, SECRET, cap, { id: "usdc-flow-check" }, Date.now(), 3)))
    expect(r).toMatchObject({ _tag: "Right", right: { rootJobId: parent.id, parentJobId: parent.id, hop: 1, ancestors: ["counterparty-brief"] } })
  })
  it("cycle refused", async () => {
    const cap = mintHireCapability(SECRET, parent.id, Date.now() + 60_000)
    const r = await withParent(Effect.flatMap(StoreTag, (s) => resolveLineage(s, SECRET, cap, { id: "counterparty-brief" }, Date.now(), 3)))
    expect(r).toMatchObject({ _tag: "Left", left: { _tag: "LineageCycle" } })
  })
  it("depth refused", async () => {
    const cap = mintHireCapability(SECRET, parent.id, Date.now() + 60_000)
    const r = await withParent(Effect.flatMap(StoreTag, (s) => resolveLineage(s, SECRET, cap, { id: "usdc-flow-check" }, Date.now(), 0)))
    expect(r).toMatchObject({ _tag: "Left", left: { _tag: "LineageDepth" } })
  })
  it("forged capability refused", async () => {
    const cap = mintHireCapability("other", parent.id, Date.now() + 60_000)
    const r = await withParent(Effect.flatMap(StoreTag, (s) => resolveLineage(s, SECRET, cap, { id: "usdc-flow-check" }, Date.now(), 3)))
    expect(r).toMatchObject({ _tag: "Left", left: { _tag: "LineageInvalid" } })
  })
  it("finished parent refused", async () => {
    const cap = mintHireCapability(SECRET, parent.id, Date.now() + 60_000)
    const r = await Effect.runPromise(Effect.provide(Effect.gen(function* () {
      const s = yield* StoreTag
      yield* s.putJob(Job.make({ ...parent, status: "succeeded" }))
      return yield* Effect.either(resolveLineage(s, SECRET, cap, { id: "usdc-flow-check" }, Date.now(), 3))
    }), StoreLive))
    expect(r).toMatchObject({ _tag: "Left", left: { _tag: "LineageInvalid" } })
  })
})
