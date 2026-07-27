import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { HireRefused, __resetSubSpend, hire, subSpendUsd } from "../src/hire.ts"

/**
 * The sub-spend budget, which is what stops one job's subcontracting from eating the
 * seller's margin — or, on a prompt-injected agent, rather more than that.
 *
 * The wallet is the real bound (a seller's own code could bypass `hire` and use the key
 * directly, and the sandbox protects sellers from the platform rather than from
 * themselves). These cover the honest path: code that goes through `hire` is held to the
 * manifest's declared ceiling.
 */

const saved = { ...process.env }

beforeEach(() => {
  __resetSubSpend()
  process.env["ARCADE_HUB"] = "http://hub.test"
  process.env["ARCADE_SUBBUY_KEY"] =
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
  process.env["ARCADE_SUB_BUDGET_USD"] = "0.05"
})

afterEach(() => {
  process.env = { ...saved }
  __resetSubSpend()
})

describe("hire", () => {
  it("refuses when the capability was never granted", async () => {
    // No wallet in the environment means the manifest did not declare `hire-skills`. The
    // message has to say which knob is missing, since this fails inside a seller's own
    // skill where there is nobody to ask.
    delete process.env["ARCADE_SUBBUY_KEY"]

    await expect(hire("usdc-flow-check", {})).rejects.toThrow(HireRefused)
    await expect(hire("usdc-flow-check", {})).rejects.toThrow(/hire-skills/)
    await expect(hire("usdc-flow-check", {})).rejects.toThrow(/maxSubSpendUsd/)
  })

  it("treats an absent budget as zero, never as unlimited", async () => {
    delete process.env["ARCADE_SUB_BUDGET_USD"]
    await expect(hire("usdc-flow-check", {})).rejects.toThrow(/budget exhausted/)
    expect(subSpendUsd()).toBe(0)
  })

  it("refuses once the job's budget is spent, without signing", async () => {
    process.env["ARCADE_SUB_BUDGET_USD"] = "0"
    await expect(hire("usdc-flow-check", {})).rejects.toThrow(/Nothing was signed/)
  })

  it("reports nothing spent before anything is hired", () => {
    expect(subSpendUsd()).toBe(0)
  })

  it("surfaces an unknown skill as a refusal rather than a payment attempt", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response("nope", { status: 404 })) as unknown as typeof fetch
    try {
      await expect(hire("no-such-skill", {})).rejects.toThrow(/cannot hire "no-such-skill"/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
