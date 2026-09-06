import { expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { Schema } from "effect"
import { readFileSync } from "node:fs"
import { PublishPage, Wizard, nextPublishCommands } from "../src/components/publish.tsx"
import { SkillManifest } from "../../../packages/core/src/manifest.ts"
import { createPublishPreview } from "../../../packages/runner/src/publish-preview.ts"
import { parsePreview } from "../src/lib/publish-preview.ts"

const base = JSON.parse(readFileSync(new URL("../../../skills/diff-triage/arcade.json", import.meta.url), "utf8"))
const manifest = Schema.decodeUnknownSync(SkillManifest)({ ...base, description: "<script>PUBLIC_LITERAL</script>",
  engine: { ...base.engine, systemPrompt: "<private&literal>" } })
const directory = parsePreview(JSON.stringify(createPublishPreview("skills/diff-triage", manifest)))
const generated = parsePreview(JSON.stringify({ version: 1, kind: "generated", source: "mcp", written: false,
  target: "mcp://fixture.example/mcp", skipped: [{ name: "write_value", reason: "not-marked-read-only" }],
  entries: ["read-value", "read-other"].map(id => createPublishPreview("skills/" + id, Schema.decodeUnknownSync(SkillManifest)({
    ...base, id, price: "$0.05", secrets: [], egress: ["fixture.example"],
    engine: { adapter: "mcp", credential: "none", url: "https://fixture.example/mcp", tool: id }
  }))) }))

it("default SSR is a passive local-run explanation, without a publishing input or IO", () => {
  const request = vi.fn(() => { throw Error("SSR IO") })
  const html = renderToStaticMarkup(<PublishPage enabled={false} request={request} />)
  expect(html).toContain("Publishing runs locally")
  expect(html).toContain("ARCADE_PUBLISH_LOCAL=1")
  expect(html).not.toContain("<form"); expect(html).not.toContain("<input")
  expect(request).not.toHaveBeenCalled()
})
it("enabled SSR exposes only an explicit preview form and still performs no IO", () => {
  const request = vi.fn(() => { throw Error("SSR IO") })
  const html = renderToStaticMarkup(<PublishPage enabled request={request} />)
  expect(html).toContain("Preview"); expect(html).toContain('maxLength="1024"')
  expect(html).toContain("Nothing is generated, registered or started")
  expect(request).not.toHaveBeenCalled()
})
it("renders full escaped columns with qualified hub boundaries and no adapter-access fiction", () => {
  const html = renderToStaticMarkup(<Wizard preview={directory} />)
  expect(html).toContain("leaves this machine"); expect(html).toContain("stays on this machine")
  expect(html).toContain("hub boundary"); expect(html).toContain("not validated")
  expect(html).toContain("No model-tool grants"); expect(html).toContain("Adapter transport")
  expect(html).toContain("&lt;script&gt;PUBLIC_LITERAL&lt;/script&gt;")
  expect(html).toContain("&lt;private&amp;literal&gt;")
  expect(html).not.toContain("<script>"); expect(html).not.toContain("neither the network nor the filesystem")
  expect(html).toContain('tabindex="0"')
})
it("shows every unwritten generated listing, skipped tool and explicit manual generation step", () => {
  const html = renderToStaticMarkup(<Wizard preview={generated} />)
  for (const text of ["read-value", "read-other", "write_value", "not-marked-read-only", "Unwritten", "--yes", "$0.05"])
    expect(html).toContain(text)
  expect((html.match(/leaves this machine/g) ?? [])).toHaveLength(2)
  expect(html).toContain("every eligible listing")
})
it("shell-quotes targets and distinguishes generating files from serving a directory", () => {
  expect(nextPublishCommands(directory)).toBe("arcade start --skills 'skills'")
  expect(nextPublishCommands(generated)).toBe("arcade publish 'mcp://fixture.example/mcp' --yes --out 'skills'\narcade start --skills 'skills'")
  expect(nextPublishCommands({ ...directory, target: "skill's/item" })).toContain("'skill'\\''s'")
})
