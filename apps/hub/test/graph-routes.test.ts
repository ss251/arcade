import { describe, expect, it, vi } from "vitest"
import { Effect, Fiber } from "effect"
import { graphOff, type Graph, type GraphStats, type AgentEvidence } from "../src/graph.ts"
import { graphEvidenceOf, graphStatsPayload } from "../src/graph-routes.ts"

const stats = (): GraphStats => ({ settlementCount: 2, treeCount: 1, settledVolumeAtomic: 300000n,
  feeAtomic: 15000n, childTotalAtomic: 20000n, agentCount: 1, feedbackCount: 5, validationPassCount: 4, indexedBlock: 90 })
const evidence = (): AgentEvidence => ({ agentId: "5042002:7", agentUrl: "https://private.example",
  settlementCount: 11, settledVolumeAtomic: 10000n, feedbackCount: 5, validationPassCount: 4 })
const fallback = { settlementCount: 9, settledVolumeAtomic: 900n }
const graph = (changes: Partial<Graph> = {}): Graph => ({ ...graphOff, ...changes })
describe("G8 graph route projections", () => {
  it("selects actual indexed data and never evaluates fallback on success", async () => {
    const local = vi.fn(() => { throw Error("must stay lazy") })
    const value = await Effect.runPromise(graphStatsPayload(graph({ stats: () => Effect.succeed(stats()) }), Effect.sync(local)))
    expect(value).toEqual({ ...stats(), source: "subgraph", settledVolumeAtomic: "300000", feeAtomic: "15000", childTotalAtomic: "20000" })
    expect(local).not.toHaveBeenCalled()
  })
  it("Graph-off returns only available local totals, never invented indexed zeros", async () => {
    expect(await Effect.runPromise(graphStatsPayload(graphOff, fallback))).toEqual({ source: "hub", settlementCount: 9, settledVolumeAtomic: "900" })
  })
  it.each(["throw", "die", "invalid"] as const)("contains Graph %s without diagnostics or losing fallback", async mode => {
    const provider = graph({ stats: () => { if (mode === "throw") throw Error("PRIVATE")
      return mode === "die" ? Effect.die("PRIVATE") : Effect.succeed({ ...stats(), feeAtomic: -1n }) } })
    expect(await Effect.runPromise(graphStatsPayload(provider, fallback))).toEqual({ source: "hub", settlementCount: 9, settledVolumeAtomic: "900" })
  })
  it("does not turn a failed local fallback into zero", async () => {
    const result = await Effect.runPromise(graphStatsPayload(graphOff, Effect.die("offline-store")).pipe(Effect.exit))
    expect(result._tag).toBe("Failure")
  })
  it.each([{ indexedBlock: 0 }, { treeCount: 3 }, { feeAtomic: 300001n }, { settlementCount: Number.MAX_SAFE_INTEGER + 1 },
    { settledVolumeAtomic: 1n << 256n }])("refuses malformed aggregate facts", changed => {
    return expect(Effect.runPromise(graphStatsPayload(graph({ stats: () => Effect.succeed({ ...stats(), ...changed }) }), fallback)))
      .resolves.toEqual({ source: "hub", settlementCount: 9, settledVolumeAtomic: "900" })
  })
  it("projects only four fields once per unique listing, preserving absent evidence", async () => {
    const read = vi.fn((id: string) => Effect.succeed(id === "missing" ? null : evidence()))
    const result = await Effect.runPromise(graphEvidenceOf(graph({ evidenceFor: read }), ["skill-a", "skill-a", "missing"]))
    expect(read).toHaveBeenCalledTimes(2)
    expect(result.get("skill-a")).toEqual({ agentId: "5042002:7", settlementCount: 11, feedbackCount: 5, validationPassCount: 4 })
    expect(result.has("missing")).toBe(false); expect(JSON.stringify([...result])).not.toMatch(/agentUrl|private|settledVolume/)
  })
  it("bounds application fanout at four and omits only failed listing observations", async () => {
    let active = 0, peak = 0
    const provider = graph({ evidenceFor: id => Effect.tryPromise(async () => {
      active++; peak = Math.max(peak, active)
      try { await new Promise(resolve => setTimeout(resolve, 5)); if (id === "skill-3") throw Error("PRIVATE"); return evidence() }
      finally { active-- }
    }).pipe(Effect.catchAll(() => Effect.succeed(null))) })
    const result = await Effect.runPromise(graphEvidenceOf(provider, Array.from({ length: 9 }, (_, i) => `skill-${i}`)))
    expect(peak).toBe(4); expect(active).toBe(0); expect(result.size).toBe(8); expect(result.has("skill-3")).toBe(false)
  })
  it("invalid/oversized/accessor listing inputs refuse before Graph work", async () => {
    const read = vi.fn(() => Effect.succeed(evidence())), getter = vi.fn(() => "skill-a")
    const accessors = ["skill-a"]; Object.defineProperty(accessors, "0", { get: getter })
    for (const ids of [["x"], ["/path"], Array.from({ length: 257 }, (_, i) => `skill-${i}`), accessors]) {
      expect((await Effect.runPromise(graphEvidenceOf(graph({ evidenceFor: read }), ids))).size).toBe(0)
    }
    expect(read).not.toHaveBeenCalled(); expect(getter).not.toHaveBeenCalled()
  })
  it("refuses malformed and accessor evidence without publishing provider data", async () => {
    const getter = vi.fn(() => "5042002:7"), accessor = evidence()
    Object.defineProperty(accessor, "agentId", { get: getter })
    for (const value of [accessor, { ...evidence(), agentId: "1:7" }, { ...evidence(), feedbackCount: -1 },
      { ...evidence(), validationPassCount: 1.5 }]) {
      expect((await Effect.runPromise(graphEvidenceOf(graph({ evidenceFor: () => Effect.succeed(value) }), ["skill-a"]))).size).toBe(0)
    }
    expect(getter).not.toHaveBeenCalled()
  })
  it("one shared five-second deadline cancels a hung batch", async () => {
    let active = 0
    const provider = graph({ evidenceFor: () => Effect.acquireUseRelease(Effect.sync(() => { active++ }),
      () => Effect.never, () => Effect.sync(() => { active-- })) })
    const result = await Effect.runPromise(graphEvidenceOf(provider, ["skill-a", "skill-b"]))
    expect(result.size).toBe(0); expect(active).toBe(0)
  }, 8000)
  it("caller interruption stops the batch and cannot publish late evidence", async () => {
    let active = 0
    const provider = graph({ evidenceFor: () => Effect.acquireUseRelease(Effect.sync(() => { active++ }),
      () => Effect.never, () => Effect.sync(() => { active-- })) })
    const fiber = Effect.runFork(graphEvidenceOf(provider, ["skill-a"]))
    await new Promise(resolve => setTimeout(resolve, 5)); expect(active).toBe(1)
    await Effect.runPromise(Fiber.interrupt(fiber)); expect(active).toBe(0)
  })
})
