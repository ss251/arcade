import { expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { schemaExample } from "../src/lib/schema-example.ts"
import { SkillTry } from "../src/components/skill-page.tsx"

it("uses genuine root examples/defaults without labeling generated values as examples", () => {
  expect(schemaExample({ type: "object", examples: [{ diff: "real seller example" }] }, true)).toEqual({ kind: "example", json: '{\n  "diff": "real seller example"\n}' })
  expect(schemaExample({ type: "object", default: { diff: "default" } }, true).kind).toBe("default")
  const generated = schemaExample({ type: "object", properties: { diff: { type: "string", minLength: 12 }, count: { type: "integer" } } }, true)
  expect(generated.kind).toBe("template"); expect(JSON.parse(generated.json)).toEqual({ diff: "", count: 0 })
  expect(schemaExample({ $ref: "https://example.test/schema" }, true)).toEqual({ kind: "blank", json: "{}" })
})

it("never invokes schema/example getters or serialization hooks, and bounds recursion", () => {
  let reads = 0
  const getter = Object.defineProperty({}, "examples", { enumerable: true, get: () => { reads++; return [{}] } })
  expect(schemaExample(getter, true).kind).toBe("blank")
  expect(schemaExample({ examples: [{ toJSON() { reads++; return {} } }] }, true).kind).toBe("blank")
  const cycle: Record<string, unknown> = { type: "object" }; cycle.properties = { cycle }
  expect(schemaExample(cycle, true).kind).toBe("blank"); expect(reads).toBe(0)
})

it("escapes seller examples and labels generated output as format, never a completed job", () => {
  const html = renderToStaticMarkup(<SkillTry skillId="diff-triage"
    inputSchema={{ type: "object", examples: [{ diff: '</textarea><img src=x onerror="bad">' }] }}
    outputSchema={{ type: "object", properties: { verdict: { type: "string", enum: ["passed"] } } }} />)
  expect(html).not.toContain("<img"); expect(html).toContain("&lt;img")
  expect(html).toContain("Seller-provided example")
  expect(html).toContain("Generated format template")
  expect(html).toContain("not a completed job or proof of success")
  expect(html).toContain("No call or payment starts on this page")
  expect(html).toContain("Try in assistant"); expect(html).toContain("Copy API example")
  expect(html).toContain("POST /api/quote"); expect(html).not.toContain("payment-signature")
})
