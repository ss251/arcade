import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import { SkillManifest } from "@arcade/core"
import { createPublishPreview } from "../../../packages/runner/src/publish-preview.ts"
import { parsePreview, PublishFailed } from "../src/lib/publish-preview.ts"

const raw = JSON.parse(readFileSync(new URL("../../../skills/diff-triage/arcade.json", import.meta.url), "utf8")) as Record<string, unknown>
type Entry = { target: string; skillId: string; engine: { adapter: string; credential: string }; grants: string[];
  public: Record<string, unknown>; private: { engine: Record<string, unknown>; [key: string]: unknown }; [key: string]: unknown }
const entry = (target = "skills/diff-triage"): Entry =>
  JSON.parse(JSON.stringify(createPublishPreview(target, Schema.decodeUnknownSync(SkillManifest)(raw)))) as Entry
const batch = () => {
  const manifest = Schema.decodeUnknownSync(SkillManifest)({ ...raw, id: "mcp-read", engine: {
    adapter: "mcp", credential: "none", url: "https://docs.arc.io/mcp", tool: "read_value"
  }, secrets: [], egress: ["docs.arc.io"] })
  return { version: 1, kind: "generated", source: "mcp", written: false, target: "mcp://docs.arc.io/mcp",
    entries: [JSON.parse(JSON.stringify(createPublishPreview("generated/mcp-read", manifest))) as Entry],
    skipped: [{ name: "write_value", reason: "not-marked-read-only" }] }
}
describe("bounded actual CLI preview parsing", () => {
  it("preserves a canonical directory and its private configuration without adding a write claim", () => {
    const value = entry(), parsed = parsePreview(JSON.stringify(value))
    expect(parsed).toEqual({ kind: "directory", target: value.target, entries: [value], skipped: [] })
    expect(parsed.entries[0]!.public).not.toHaveProperty("engine")
  })
  it("preserves generated batches, all entries and reported skipped tools as unwritten", () => {
    const value = batch()
    const second = structuredClone(value.entries[0]!)
    second.skillId = "mcp-second"; second.public.id = "mcp-second"; second.target = "generated/mcp-second"
    second.private.engine.tool = "read_second"
    value.entries.push(second)
    expect(parsePreview(JSON.stringify(value))).toEqual(value)
  })
  it("bounds UTF-8 bytes as well as JavaScript character count", () => {
    const value = entry(); value.public.canaryInput = "💚".repeat(270000)
    expect(JSON.stringify(value).length).toBeLessThan(1048576)
    expect(() => parsePreview(JSON.stringify(value))).toThrow(PublishFailed)
  })
  it.each(["PRIVATE_OUTPUT", "{\"key\":\"PRIVATE_VALUE\"", "null", "[]", "x".repeat(1048577)])("returns only a fixed parse error for malformed/oversized output", stdout => {
    let error: unknown
    try { parsePreview(stdout) } catch (caught) { error = caught }
    expect(error).toBeInstanceOf(PublishFailed)
    expect((error as Error).message).toBe("Could not read a bounded CLI preview.")
  })
  it("refuses mismatched redundant claims instead of trusting the displayed public/private split", () => {
    for (const change of [
      (v: ReturnType<typeof entry>) => { v.skillId = "different" },
      (v: ReturnType<typeof entry>) => { v.engine.adapter = "script" },
      (v: ReturnType<typeof entry>) => { v.grants = ["run-code"] },
      (v: ReturnType<typeof entry>) => { v.public.engine = v.private.engine },
      (v: ReturnType<typeof entry>) => { v.private.secretValue = "PRIVATE" },
      (v: ReturnType<typeof entry>) => { v.private.engine.credential = "subscription" },
      (v: ReturnType<typeof entry>) => { v.unknown = "PRIVATE" }
    ]) { const value = entry(); change(value); expect(() => parsePreview(JSON.stringify(value))).toThrow(PublishFailed) }
  })
  it("rejects written, wrong-source, duplicate and oversized generated batches", () => {
    const zero = batch(); zero.entries[0]!.public.price = "$0"
    for (const value of [
      { ...batch(), written: true }, { ...batch(), source: "openapi" },
      { ...batch(), entries: [batch().entries[0], batch().entries[0]] },
      { ...batch(), entries: new Array(65).fill(batch().entries[0]) },
      { ...batch(), skipped: [{ name: "x", reason: "arbitrary" }] }, zero
    ]) expect(() => parsePreview(JSON.stringify(value))).toThrow(PublishFailed)
  })
  it("permits legitimate public input property names while containing private config", () => {
    const value = entry()
    value.public.inputSchema = { type: "object", properties: { engine: { type: "string" }, secrets: { type: "string" } } }
    expect(parsePreview(JSON.stringify(value)).entries[0]!.public.inputSchema).toEqual(value.public.inputSchema)
  })
  it("bounds nesting and node count before schema processing", () => {
    const deep = entry(); let value: Record<string, unknown> = {}
    deep.public.canaryInput = value
    for (let i = 0; i < 30; i++) { const next = {}; value["nested"] = next; value = next }
    expect(() => parsePreview(JSON.stringify(deep))).toThrow(PublishFailed)
    const wide = entry(); wide.public.canaryInput = new Array(20001).fill(1)
    expect(() => parsePreview(JSON.stringify(wide))).toThrow(PublishFailed)
  })
})
