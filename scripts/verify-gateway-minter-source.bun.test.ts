import { describe, expect, it } from "bun:test"
import { bindDeclaredSelf, MINTER_SOURCE, minterSourceMain, readPinnedSource, reproduceMinter, sourceSha256 } from "./verify-gateway-minter-source.ts"

const code = "00".repeat(12101)
const refs = { "2025": [3634, 3675, 3968].map(start => ({ start, length: 32 })) }
describe("Minter reproducibility boundaries", () => {
  it("binds only the three exact compiler-declared zero self words", () => {
    const bound = bindDeclaredSelf(code, refs, MINTER_SOURCE.implementation)
    expect(bound.length).toBe(24204)
    for (const offset of [3634, 3675, 3968]) expect(bound.slice(2 + offset * 2, 2 + (offset + 32) * 2)).toBe(MINTER_SOURCE.implementation.slice(2).padStart(64, "0"))
    let undone = bound.slice(2)
    for (const offset of [3634, 3675, 3968]) undone = undone.slice(0, offset * 2) + "00".repeat(32) + undone.slice((offset + 32) * 2)
    expect(undone).toBe(code)
  })
  for (const [name, bad] of [
    ["missing", {}], ["extra", { ...refs, another: [] }], ["wrong-count", { "2025": refs["2025"].slice(1) }],
    ["shifted", { "2025": [{ start: 3635, length: 32 }, ...refs["2025"].slice(1)] }],
    ["wrong-size", { "2025": [{ start: 3634, length: 31 }, ...refs["2025"].slice(1)] }],
    ["reordered", { "2025": [...refs["2025"]].reverse() }], ["array", [refs["2025"]]]
  ] as const) it("refuses " + name + " immutable references", () => expect(() => bindDeclaredSelf(code, bad, MINTER_SOURCE.implementation)).toThrow("minter_source_unavailable"))
  it("refuses nonzero placeholders, truncated code and invalid implementations", () => {
    expect(() => bindDeclaredSelf(code.slice(0, 3634 * 2) + "11" + code.slice(3634 * 2 + 2), refs, MINTER_SOURCE.implementation)).toThrow()
    expect(() => bindDeclaredSelf("00", refs, MINTER_SOURCE.implementation)).toThrow()
    expect(() => bindDeclaredSelf(code, refs, "0x" + "00".repeat(20))).toThrow()
  })
  it("refuses unpinned input before calling compiler", () => {
    let called = false
    expect(() => reproduceMinter("{}", "{}", { version: () => { called = true; return MINTER_SOURCE.compiler }, compile: () => { called = true; return "{}" } })).toThrow()
    expect(called).toBe(false)
  })
  it("validates compiler arguments without reading any sources", async () => {
    for (const args of [[], ["--solc-module", "relative/solc/index.js"], ["--solc-module", "/tmp/other.js"], ["--key", "no"]]) await expect(minterSourceMain(args)).rejects.toThrow()
  })
  const request = (response: Response) => Object.assign(async () => response, { preconnect: () => {} }) as unknown as typeof fetch
  it("reads a pinned public source and validates its digest", async () => {
    await expect(readPinnedSource(MINTER_SOURCE.explorer, sourceSha256("{}"), request(new Response("{}")))).resolves.toBe("{}")
    await expect(readPinnedSource(MINTER_SOURCE.explorer, "0".repeat(64), request(new Response("{}")))).rejects.toThrow()
  })
  it("refuses foreign URLs, redirects, HTTP errors and overlarge bodies", async () => {
    let called = false
    await expect(readPinnedSource("https://example.com", "", Object.assign(async () => { called = true; return new Response("{}") }, { preconnect: () => {} }) as unknown as typeof fetch)).rejects.toThrow()
    expect(called).toBe(false)
    await expect(readPinnedSource(MINTER_SOURCE.explorer, "", request(new Response("{}", { status: 302 })))).rejects.toThrow()
    await expect(readPinnedSource(MINTER_SOURCE.explorer, "", request(new Response("{}", { status: 503 })))).rejects.toThrow()
    await expect(readPinnedSource(MINTER_SOURCE.explorer, "", request(new Response("a".repeat(1048577))))).rejects.toThrow()
    const r = new Response("{}"); Object.defineProperty(r, "url", { value: "https://example.com" })
    await expect(readPinnedSource(MINTER_SOURCE.explorer, "", request(r))).rejects.toThrow()
  })
})
