import { describe, expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"

describe("MCP publishing roundtrip", () => {
  it("introspects paginated stdio tools, writes a read-only listing, loads and executes it", () => {
    const dir = mkdtempSync(join(tmpdir(), "arcade-publish-roundtrip-"))
    try {
      const resolve = createRequire(import.meta.url).resolve
      const serverFile = join(dir, "private-server.ts")
      writeFileSync(serverFile, `
import { Server } from ${JSON.stringify(resolve("@modelcontextprotocol/sdk/server/index.js"))};
import { StdioServerTransport } from ${JSON.stringify(resolve("@modelcontextprotocol/sdk/server/stdio.js"))};
import { CallToolRequestSchema, ListToolsRequestSchema } from ${JSON.stringify(resolve("@modelcontextprotocol/sdk/types.js"))};
const server = new Server({ name: "local-fixture", version: "1" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async ({ params }) => params?.cursor === "second"
  ? { tools: [{ name: "write_value", description: "Excluded write fixture", inputSchema: { type: "object" }, annotations: { readOnlyHint: false } }] }
  : { nextCursor: "second", tools: [{ name: "read_value", title: "Read value", description: "Read-only local fixture",
      inputSchema: { type: "object", required: ["n"], properties: { n: { type: "number" } } },
      outputSchema: { type: "object", required: ["doubled", "ambientPresent"], properties: { doubled: { type: "number" }, ambientPresent: { type: "boolean" } } },
      annotations: { readOnlyHint: true } }] });
server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
  if (params.name !== "read_value") return { isError: true, content: [{ type: "text", text: "wrong tool" }] };
  return { content: [], structuredContent: { doubled: params.arguments.n * 2, ambientPresent: process.env.FAKE_AMBIENT !== undefined } };
});
await server.connect(new StdioServerTransport());
`)
      const driver = join(dir, "roundtrip.ts")
      writeFileSync(driver, `
import { Effect } from ${JSON.stringify(resolve("effect"))};
import { toPublicListing } from ${JSON.stringify(resolve("@arcade/core"))};
import { listMcpTools, manifestFromMcpTool, publishableTools, writeGeneratedSkills } from ${JSON.stringify(new URL("../src/publish-introspect.ts", import.meta.url).pathname)};
import { loadSkills } from ${JSON.stringify(new URL("../src/skills.ts", import.meta.url).pathname)};
import { execSkill } from ${JSON.stringify(new URL("../src/exec.ts", import.meta.url).pathname)};
const src = { command: ["bun", "run", ${JSON.stringify(serverFile)}] };
const tools = await listMcpTools(src);
const manifests = publishableTools(tools, false).map(tool => manifestFromMcpTool(src, tool, { price: "$0.02", timeoutSec: 3 }));
const written = await writeGeneratedSkills(${JSON.stringify(join(dir, "generated"))}, manifests);
const skills = await Effect.runPromise(loadSkills(${JSON.stringify(join(dir, "generated"))}));
if (skills.length !== 1) throw new Error("wrong listing count");
const skill = skills[0];
const outcome = await Effect.runPromise(execSkill({ manifest: skill.manifest, skillDir: skill.dir, jobId: "roundtrip", input: { n: 7 } }));
process.stdout.write(JSON.stringify({ tools: tools.map(t => t.name), writtenCount: written.length, public: toPublicListing(skill.manifest), outcome }));
`)
      const run = spawnSync("bun", ["run", driver], {
        cwd: new URL("../../..", import.meta.url),
        env: { PATH: process.env["PATH"] ?? "", HOME: dir, FAKE_AMBIENT: "not-a-real-secret" },
        encoding: "utf8", timeout: 10_000
      })
      expect(run.status, run.stderr).toBe(0)
      const result = JSON.parse(run.stdout)
      expect(result.tools).toEqual(["read_value", "write_value"])
      expect(result.writtenCount).toBe(1)
      expect(result.public.id).toBe("read-value")
      expect(result.public.price).toBe("$0.02")
      expect(result.public).not.toHaveProperty("engine")
      expect(JSON.stringify(result.public)).not.toContain(serverFile)
      expect(result.outcome).toMatchObject({ status: "succeeded", stopReason: "end_turn", costUsd: 0,
        output: { doubled: 14, ambientPresent: false } })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 15_000)
})
