import { describe, expect, it } from "vitest"
import { Effect, Ref } from "effect"
import { makeTestRail, makeTestState, RailTag, type Rail } from "@arcade/payments"

const modulePath = "../src/rails.ts"
const registry = () => import(modulePath) as Promise<typeof import("../src/rails.ts")>
const testRail = (name: Rail["name"] = "test"): Rail => ({
  ...makeTestRail(Effect.runSync(Ref.make(makeTestState({})))),
  name
})

describe("request rail registry", () => {
  it("preserves the exact default rail object", async () => {
    const { makeRails } = await registry()
    const fallback = testRail()
    expect(makeRails(fallback, []).default).toBe(fallback)
  })

  it("always makes the default addressable by name", async () => {
    const { makeRails } = await registry()
    const fallback = testRail()
    const rails = makeRails(fallback, [])
    expect(rails.get("test")).toBe(fallback)
    expect(rails.names).toEqual(["test"])
  })

  it("adds distinct rails without changing the root default", async () => {
    const { makeRails } = await registry()
    const fallback = testRail("eip3009")
    const gateway = testRail("gateway")
    const rails = makeRails(fallback, [gateway])
    expect(rails.default).toBe(fallback)
    expect(rails.get("gateway")).toBe(gateway)
    expect(rails.names).toEqual(["eip3009", "gateway"])
  })

  it("has no fallback for an unbuilt or prototype-looking name", async () => {
    const { makeRails } = await registry()
    const rails = makeRails(testRail(), [])
    for (const name of ["gateway", "eip3009", "toString", "__proto__", "", "TEST"]) {
      expect(rails.get(name)).toBeUndefined()
    }
  })

  it("keeps the default when extras repeat its name", async () => {
    const { makeRails } = await registry()
    const fallback = testRail()
    const rails = makeRails(fallback, [testRail(), fallback])
    expect(rails.default).toBe(fallback)
    expect(rails.get("test")).toBe(fallback)
    expect(rails.names).toEqual(["test"])
  })

  it("uses the first extra of each name deterministically", async () => {
    const { makeRails } = await registry()
    const first = testRail("gateway")
    const rails = makeRails(testRail(), [first, testRail("gateway")])
    expect(rails.get("gateway")).toBe(first)
    expect(rails.names).toEqual(["test", "gateway"])
  })

  it("snapshots the input collection", async () => {
    const { makeRails } = await registry()
    const gateway = testRail("gateway")
    const extras = [gateway]
    const rails = makeRails(testRail(), extras)
    extras.splice(0, 1, testRail("eip3009"))
    expect(rails.get("gateway")).toBe(gateway)
    expect(rails.get("eip3009")).toBeUndefined()
    expect(rails.names).toEqual(["test", "gateway"])
  })

  it("does not expose a mutable advertised-name list", async () => {
    const { makeRails } = await registry()
    const rails = makeRails(testRail(), [])
    expect(Object.isFrozen(rails.names)).toBe(true)
    expect(() => (rails.names as string[]).push("gateway")).toThrow()
    expect(rails.get("gateway")).toBeUndefined()
    expect(rails.names).toEqual(["test"])
  })

  it("does not expose a replaceable default or lookup", async () => {
    const { makeRails } = await registry()
    expect(Object.isFrozen(makeRails(testRail(), []))).toBe(true)
  })

  it("provides both Effect tags from the same construction", async () => {
    const { RailsTag, railsLayerFrom } = await registry()
    const fallback = testRail("eip3009")
    const gateway = testRail("gateway")
    const got = await Effect.runPromise(Effect.gen(function* () {
      const rails = yield* RailsTag
      const rail = yield* RailTag
      return { rails, rail }
    }).pipe(Effect.provide(railsLayerFrom(fallback, [gateway]))))
    expect(got.rails.default).toBe(got.rail)
    expect(got.rail).toBe(fallback)
    expect(got.rails.get("gateway")).toBe(gateway)
  })
})
