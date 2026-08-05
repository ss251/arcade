import { afterEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_MODEL, SUPPORTED_PROVIDERS, parseModel } from "../src/lib/model.ts"
import { arcade_quote, arcade_receipts, arcade_list_skills } from "../src/lib/tools.ts"

/**
 * Figures must reach the model as exact strings, and the model spec must be one variable.
 *
 * ## What can actually be tested, and what cannot
 *
 * The concern with swapping to a smaller model is that it rounds a price or smooths a
 * measured statistic into prose — and a plausible WRONG number is worse than a refusal,
 * because a 503 is legible and a rounded price is not. A scripted mock model cannot test
 * that: it says whatever it is told to say, so asserting it does not round would be
 * asserting the fixture.
 *
 * What IS testable is the half we control: what the model is handed. A model asked to quote
 * `0.12000000000000001` or `1.2e-7` will produce something wrong no matter how good it is,
 * and that is a defect in our formatting rather than its arithmetic. So these pin that every
 * monetary figure crossing into a model's context is an exact decimal string — never a JS
 * float, never a bigint that serialises unpredictably, never scientific notation.
 *
 * The prompt instruction to quote figures exactly is a mitigation, not a guarantee. This is
 * the part that can fail a test.
 */

const opts = { toolCallId: "t1", messages: [] } as never
const HUB = "http://hub.test"
process.env["ARCADE_HUB"] = HUB

const stub = (body: unknown, status = 200) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })))

afterEach(() => vi.unstubAllGlobals())

/** Anything a reader would read as money must look like money, exactly. */
const MONEY = /^\$\d+(\.\d+)?$/

describe("figures handed to a model are exact strings", () => {
  it("quotes a price as an exact decimal string, not a float", async () => {
    // 402 challenge in atomic units — 6-dec. The dangerous path is atomic → display, where
    // a naive divide by 1e6 produces 0.12000000000000001 for some values.
    stub({ accepts: [{ amount: "120000", payTo: "0xabc", asset: "0x36", network: "eip155:5042002" }] })
    const listingFetch = vi.fn(async (input: string | URL | Request) =>
      String(input).includes("/listings/")
        ? new Response(JSON.stringify({ id: "diff-triage", seller: "0xseller", price: "$0.12" }))
        : new Response(
            JSON.stringify({
              accepts: [{ amount: "120000", payTo: "0xabc", asset: "0x36", network: "eip155:5042002" }]
            }),
            { status: 402 }
          )
    )
    vi.stubGlobal("fetch", listingFetch)

    const out = (await arcade_quote.execute!({ skillId: "diff-triage" }, opts)) as {
      price: string
      amountAtomic: string
    }
    expect(out.price).toBe("$0.12")
    expect(out.price).toMatch(MONEY)
    // Atomic units stay a string too: 6-dec values exceed what a float represents exactly
    // once amounts grow, and a JSON number here would be a silent precision ceiling.
    expect(typeof out.amountAtomic).toBe("string")
    expect(out.amountAtomic).toBe("120000")
  })

  it("formats a sub-cent fee exactly, without scientific notation", async () => {
    // $0.0005 is the real 5% fee on a $0.01 call — the figure on the live receipt. A float
    // path renders this as 5e-4, which a model will quote verbatim and a reader cannot read.
    stub([
      {
        skillId: "usdc-flow-check",
        priceAtomic: "10000",
        sellerAtomic: "9500",
        feeAtomic: "500",
        feeBps: 500,
        settleTx: "0x63",
        latencyMs: 2471,
        settled: true,
        reason: "ok",
        createdAtMs: 1
      }
    ])
    const out = (await arcade_receipts.execute!({}, opts)) as {
      volume: string
      receipts: ReadonlyArray<{ price: string; fee: string }>
    }
    expect(out.receipts[0]!.fee).toBe("$0.0005")
    expect(out.receipts[0]!.fee).not.toMatch(/e-/i)
    expect(out.receipts[0]!.price).toBe("$0.01")
    expect(out.volume).toBe("$0.01")
    for (const f of [out.volume, out.receipts[0]!.price, out.receipts[0]!.fee]) {
      expect(f).toMatch(MONEY)
    }
  })

  it("keeps the catalogue price outside the fence and exact", async () => {
    // A price the seller cannot write is the hub's own voice, so it stays quotable. If it
    // were inside the fence the model would be told to treat it as an untrusted claim.
    stub([{ id: "diff-triage", serviceName: "D", description: "x", price: "$0.12", seller: "0xs" }])
    const out = (await arcade_list_skills.execute!({}, opts)) as {
      skills: ReadonlyArray<{ price: string }>
      text: string
    }
    expect(out.skills[0]!.price).toBe("$0.12")
    expect(out.skills[0]!.price).toMatch(MONEY)
    expect(out.text.slice(0, out.text.indexOf("<<<UNTRUSTED:"))).not.toContain("$0.12")
  })

  it("emits no raw JS numbers for money anywhere in a tool result", async () => {
    // The general form. A number that reaches JSON is a number a model may reformat.
    stub([
      {
        skillId: "s",
        priceAtomic: "10000",
        sellerAtomic: "9500",
        feeAtomic: "500",
        feeBps: 500,
        latencyMs: 2471,
        settled: true,
        reason: "ok",
        createdAtMs: 1
      }
    ])
    const out = (await arcade_receipts.execute!({}, opts)) as Record<string, unknown>
    const json = JSON.stringify(out)
    // Money keys must never carry bare numerics.
    expect(json).not.toMatch(/"(price|fee|volume)":\s*-?\d/)
  })
})

describe("the model spec is ONE variable", () => {
  it("parses provider and id together", () => {
    const c = parseModel("google:gemini-2.5-flash")
    expect(c).not.toBeNull()
    expect(c!.provider).toBe("google")
    expect(c!.modelId).toBe("gemini-2.5-flash")
    expect(c!.keyVar).toBe("GOOGLE_GENERATIVE_AI_API_KEY")
  })

  it("names the key variable per provider, so the warning is never about the wrong one", () => {
    expect(parseModel("anthropic:claude-opus-5")!.keyVar).toBe("ANTHROPIC_API_KEY")
    expect(parseModel("groq:llama-3.3-70b-versatile")!.keyVar).toBe("GROQ_API_KEY")
    expect(parseModel("deepseek:deepseek-v4-flash")!.keyVar).toBe("DEEPSEEK_API_KEY")
  })

  it("rejects a spec that is not provider:id, rather than guessing", () => {
    // Each of these would otherwise become a silent default or a malformed model id.
    for (const bad of ["claude-opus-5", "google:", ":gemini", "", "openai:gpt-4", "deepseek"]) {
      expect(parseModel(bad), `${bad} must be rejected`).toBeNull()
    }
  })

  it("has a default that parses", () => {
    // A default that fails its own parser would refuse every unconfigured deployment.
    expect(parseModel(DEFAULT_MODEL)).not.toBeNull()
    expect(SUPPORTED_PROVIDERS.length).toBeGreaterThan(1)
  })
})
