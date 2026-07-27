import { describe, expect, it } from "vitest"
import { DEFAULT_HUB, partition, preflightWeb } from "../src/preflight.ts"

/**
 * `apps/web` had no preflight while the hub had one, and its single load-bearing input
 * defaults to `http://localhost:8787` — right on a laptop, certainly wrong in a container.
 *
 * The failure is quieter than the hub's, not louder: nothing listens on 8787 inside a
 * container, so the fetch refuses rather than reaching a wrong hub. But the refusal lands
 * in a tool result, which lands in the model's context, which the model narrates. SSR
 * returns 200, the page renders, the chat streams, the model answers — and the only broken
 * thing is what the app is for, delivered as prose indistinguishable from a transient.
 *
 * Testing the exported guard rather than spawning the process, because here the guard IS a
 * pure function: `server.ts` calls this same function, so there is no copy to drift.
 */

const PLATFORM = { RAILWAY_SERVICE_ID: "svc" }

describe("apps/web preflight", () => {
  it("refuses on a platform when ARCADE_HUB is unset", () => {
    const { fatal } = partition(preflightWeb({ ...PLATFORM }).problems)
    expect(fatal).toHaveLength(1)
    expect(fatal[0]).toContain("ARCADE_HUB")
    // The message must hand over the platform's own answer, not just complain.
    expect(fatal[0]).toContain("RAILWAY_PUBLIC_DOMAIN")
  })

  it("refuses a loopback hub shipped to production", () => {
    for (const hub of [
      "http://localhost:8787",
      "http://127.0.0.1:8792",
      "http://0.0.0.0:3000"
    ]) {
      const { fatal } = partition(preflightWeb({ ...PLATFORM, ARCADE_HUB: hub }).problems)
      expect(fatal, `${hub} should be refused`).toHaveLength(1)
      expect(fatal[0]).toContain("loopback")
    }
  })

  it("accepts a real public origin", () => {
    // The inverse. A guard that refused everything would pass both tests above.
    const { fatal } = partition(
      preflightWeb({
        ...PLATFORM,
        ARCADE_HUB: "https://arcade-hub-production.up.railway.app",
        ANTHROPIC_API_KEY: "sk-test"
      }).problems
    )
    expect(fatal).toHaveLength(0)
  })

  it("stays out of the way on a laptop", () => {
    // No platform env: localhost is the correct answer and a refusal here would train
    // people to ignore the guard.
    const r = preflightWeb({})
    expect(r.onPlatform).toBe(false)
    expect(r.problems).toHaveLength(0)
    expect(r.hub).toBe(DEFAULT_HUB)
  })

  it("warns about a missing ANTHROPIC_API_KEY without refusing", () => {
    // Degradation, not misconfiguration: /api/chat already returns a 503 naming the
    // variable and saying discovery still works. Refusing here would take down a
    // deployment whose catalogue and receipts are fine.
    const { fatal, warnings } = partition(
      preflightWeb({ ...PLATFORM, ARCADE_HUB: "https://hub.example" }).problems
    )
    expect(fatal).toHaveLength(0)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("ANTHROPIC_API_KEY")
    expect(warnings[0]).not.toContain("__warn__")
  })

  it("reports the hub it resolved, so a local run shows which one it hit", () => {
    // Two local defaults exist — the hub's own PORT default is 8787 and a runner config may
    // use another — so "which hub am I actually talking to" should not need inferring.
    expect(preflightWeb({ ARCADE_HUB: "http://localhost:8792" }).hub).toBe(
      "http://localhost:8792"
    )
  })
})
