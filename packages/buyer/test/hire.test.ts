import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { HireRefused, __resetSubSpend, hire, subSpendUsd } from "../src/hire.ts"

/**
 * `hire` from inside the sandbox. It holds no key and cannot pay anyone — it asks the
 * runner's broker to buy, over a Unix socket, with a per-job token.
 *
 * The budget is therefore NOT tested here: it is not enforced here. See
 * `packages/runner/test/hire-broker.test.ts` for the ledger, which is the point of the
 * design — the process being bounded is not the process holding the key.
 */

const saved = { ...process.env }

beforeEach(() => {
  __resetSubSpend()
  delete process.env["ARCADE_HIRE_SOCKET"]
  delete process.env["ARCADE_JOB_ID"]
  delete process.env["ARCADE_JOB_TOKEN"]
})

afterEach(() => {
  process.env = { ...saved }
  __resetSubSpend()
})

describe("hire", () => {
  it("refuses when the capability was never granted", async () => {
    // No socket means the manifest did not declare `hire-skills`, or the runner has no
    // sub-purchase key. This fails inside a seller's own skill where there is nobody to
    // ask, so the message has to name the knobs.
    await expect(hire("usdc-flow-check", {})).rejects.toThrow(HireRefused)
    await expect(hire("usdc-flow-check", {})).rejects.toThrow(/hire-skills/)
    await expect(hire("usdc-flow-check", {})).rejects.toThrow(/maxSubSpendUsd/)
  })

  it("says the wallet is never placed in the sandbox", async () => {
    // Worth stating in the error itself: a seller debugging this should not go looking for
    // a key to inject, because injecting one would defeat the design.
    await expect(hire("usdc-flow-check", {})).rejects.toThrow(/never placed in this sandbox/)
  })

  it("reports nothing spent before anything is hired", () => {
    expect(subSpendUsd()).toBe(0)
  })

  it("fails loudly when the broker socket is not there", async () => {
    // A grant pointing at a dead socket must not look like "nothing to hire" — the seller
    // needs to see a connection error, not a silent no-op.
    process.env["ARCADE_HIRE_SOCKET"] = "/tmp/arcade-definitely-not-a-socket.sock"
    process.env["ARCADE_JOB_ID"] = "job_1"
    process.env["ARCADE_JOB_TOKEN"] = "tok"

    // Asserting rejection rather than a message: Bun and Node word socket errors
    // differently ("Was there a typo in the url or port?" vs "connect ENOENT"), and the
    // property under test is that it fails at all rather than how it is phrased.
    const err = await hire("usdc-flow-check", {}).then(
      () => undefined,
      (e: Error) => e
    )
    expect(err).toBeDefined()
    // And that it got PAST the grant check — a HireRefused here would mean it never tried.
    expect(err).not.toBeInstanceOf(HireRefused)
  })
})

/*
 * The paying paths — refusal passthrough, budget exhaustion, cost accumulation — are
 * covered in `packages/runner/test/hire-broker.test.ts`, against a REAL broker over a real
 * socket, because that is where the ledger lives. Stubbing them here would only assert that
 * a stub returns what the stub was told to return.
 */
