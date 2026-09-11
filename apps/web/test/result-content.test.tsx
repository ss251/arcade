import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ResultContent } from "../src/components/result-content.tsx"

const render = (value: unknown) => renderToStaticMarkup(<ResultContent json={JSON.stringify(value)} />)
describe("readable seller results", () => {
  it("renders useful fields first and preserves exact values in the complete JSON", () => {
    const html = render({ total_changes: 0, approved: false, summary: "Keep the API stable." })
    expect(html).toContain("total changes</dt><dd><span>0")
    expect(html).toContain("false</span>")
    expect(html).toContain("Keep the API stable.")
    expect(html).toContain("&quot;total_changes&quot;:0")
    expect(html).toContain('aria-label="Complete result JSON"')
  })
  it("never treats seller strings or keys as markup, links, or commands", () => {
    const html = render({ '<img src=x onerror=alert(1)>': '<script>alert(1)</script>\nhttps://evil.example' })
    expect(html).not.toContain("<script")
    expect(html).not.toContain("<img")
    expect(html).not.toContain("<a ")
    expect(html).toContain("&lt;script&gt;")
  })
  it("bounds the preview and retains omitted array entries and long text in the full result", () => {
    const values = Array.from({ length: 100 }, (_, i) => `entry ${i}`)
    const html = render({ values, text: "z".repeat(2100), deep: { a: { b: { c: "deep value" } } } })
    const preview = html.split('<details class="result-source">')[0]!
    expect(preview).toContain("92 more in the complete result")
    expect(preview).not.toContain("entry 99")
    expect(preview).not.toContain("deep value")
    expect(preview).not.toContain("z".repeat(2001))
    expect(html).toContain("entry 99")
    expect(html).toContain("deep value")
    expect(html).toContain("z".repeat(2100))
  })
  it("shows non-JSON input as escaped text without losing the original", () => {
    const html = renderToStaticMarkup(<ResultContent json={'<not-json>\nhello'} />)
    expect(html).toContain("&lt;not-json&gt;")
    expect(html).not.toContain("<not-json>")
  })
})
