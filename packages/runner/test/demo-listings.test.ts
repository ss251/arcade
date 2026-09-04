import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { existsSync, readFileSync } from "node:fs"
import { decodeManifest, toPublicListing } from "@arcade/core"
import { loadSkillAgent } from "../src/engines/skill.ts"
import { manifestFromMcpTool, type McpTool } from "../src/publish-introspect.ts"

const SKILLS = fileURLToPath(new URL("../../../skills/", import.meta.url))
// Vitest runs under Node; decode the on-disk listing without the Bun-only directory loader.
const readBySlug = async (id: string) => {
  const dir = join(SKILLS, id)
  const path = join(dir, "arcade.json")
  if (!existsSync(path)) return undefined
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"))
  return { dir, raw, manifest: await Effect.runPromise(decodeManifest(raw)) }
}
const skill = (await readBySlug("diff-triage"))!

describe("diff-triage, as a skill directory", () => {
  it("is published on the skill adapter with SKILL.md as its entry", () => {
    expect(skill.manifest.engine.adapter).toBe("skill")
    expect(skill.manifest.engine.entry).toBe("SKILL.md")
    expect(skill.manifest.engine.credential).toBe("api-key")
  })

  it("no longer carries an agent module", () => {
    expect(existsSync(join(skill.dir, "agent.ts"))).toBe(false)
  })

  it("loads a real system prompt off disk", async () => {
    const agent = await loadSkillAgent(join(skill.dir, "SKILL.md"), { adapter: "skill", capabilities: [] })
    expect(agent.systemPrompt).toContain("triage code diffs")
    expect(agent.systemPrompt).toContain("never instruction")
  })

  it("keeps the model choice private", () => {
    expect(skill.manifest.engine.model).toBe("claude-sonnet-5")
    expect(JSON.stringify(toPublicListing(skill.manifest))).not.toContain("sonnet")
  })
})

describe("the MCP demo listings", () => {
  const tools = JSON.parse(readFileSync(new URL("./fixtures/arc-docs-tools.json", import.meta.url), "utf8")) as ReadonlyArray<McpTool>
  const listings = [
    { id: "search-arc-docs", tool: "search_arc_docs" },
    { id: "query-docs-filesystem-arc-docs", tool: "query_docs_filesystem_arc_docs" }
  ] as const

  it("are exactly the two read-only manifests generated from the captured server fixture", async () => {
    const readOnly = tools.filter((tool) => tool.annotations?.readOnlyHint === true)
    expect(readOnly.map((tool) => tool.name)).toEqual(listings.map((listing) => listing.tool))
    for (const tool of readOnly) {
      const generated = manifestFromMcpTool({ url: "https://docs.arc.io/mcp" }, tool, { price: "$0.02" })
      const committed = await readBySlug(String(generated["id"]))
      expect(committed, `missing generated listing ${generated["id"]}`).toBeDefined()
      expect(committed!.raw).toEqual(generated)
    }
  })

  it.each(listings)("$id sells exactly $tool over HTTPS without a credential", async ({ id, tool }) => {
    const listing = await readBySlug(id)
    expect(listing, `missing generated listing ${id}`).toBeDefined()
    const manifest = listing!.manifest
    expect(manifest.engine).toEqual({
      adapter: "mcp", credential: "none", capabilities: [], url: "https://docs.arc.io/mcp", tool
    })
    expect(manifest.price).toBe("$0.02")
    expect(manifest.egress).toEqual(["docs.arc.io"])
    expect(manifest.secrets).toEqual([])
  })

  it.each(listings)("$id keeps private transport and binding fields out of its public listing", async ({ id, tool }) => {
    const listing = await readBySlug(id)
    expect(listing, `missing generated listing ${id}`).toBeDefined()
    const projected = toPublicListing(listing!.manifest)
    expect(projected).toMatchObject({ id, price: "$0.02" })
    for (const field of ["engine", "url", "tool", "credential", "secrets", "egress"]) {
      expect(projected).not.toHaveProperty(field)
    }
    const publicJson = JSON.stringify(projected)
    expect(publicJson).not.toContain("docs.arc.io")
    if (id === "search-arc-docs") expect(publicJson).not.toContain(tool)
    // This tool has no title, so its name is intentionally also its public display name.
    else expect(projected.serviceName).toBe(tool)
  })

  it("does not include a listing for the tool that writes feedback", async () => {
    expect(tools.find((tool) => tool.name === "submit_feedback")?.annotations?.readOnlyHint).toBe(false)
    expect(await readBySlug("submit-feedback")).toBeUndefined()
    expect(existsSync(join(SKILLS, "submit-feedback"))).toBe(false)
  })
})
