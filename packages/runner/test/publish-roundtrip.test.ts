import { describe, expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
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

describe("OpenAPI publishing roundtrip", () => {
  it.each(["fx", "authenticated-body"])("generates, loads and executes an offline %s listing", (kind) => {
    const dir = mkdtempSync(join(tmpdir(), "arcade-openapi-roundtrip-"))
    try {
      const resolve = createRequire(import.meta.url).resolve
      const spec = kind === "fx"
        ? JSON.parse(readFileSync(new URL("./fixtures/frankfurter.json", import.meta.url), "utf8"))
        : {
            openapi: "3.0.3", info: { title: "Local fixture", version: "1" },
            servers: [{ url: "https://unused.example" }],
            components: {
              requestBodies: { Message: { required: true, content: { "application/json": {
                schema: { type: "object", required: ["text"], properties: { text: { type: "string" } } }
              } } } },
              responses: { Accepted: { description: "result", content: { "application/json": {
                schema: { type: "object", required: ["accepted"], properties: { accepted: { type: "boolean" } } }
              } } } }
            },
            paths: { "/message/{base}": { post: {
              operationId: "sendMessage", summary: "Send message",
              servers: [{ url: "https://bound.example:8443/v2" }],
              parameters: [
                { name: "base", in: "path", required: true, schema: { type: "string" } },
                { name: "x-api-key", in: "header", required: true, schema: { type: "string" } }
              ],
              requestBody: { $ref: "#/components/requestBodies/Message" },
              responses: { "202": { $ref: "#/components/responses/Accepted" } }
            } } }
          }
      const specText = JSON.stringify(spec)
      const preload = join(dir, "offline-fetch.ts")
      writeFileSync(preload, `
globalThis.fetch = async (input, init) => {
  if (process.env.FAKE_AMBIENT !== undefined || init.redirect !== "error") throw new Error("bad environment or redirects");
  const url = new URL(input);
  if (${JSON.stringify(kind)} === "fx") {
    if (url.href !== "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR" || init.method !== "GET") throw new Error("bad FX request");
    return Response.json({ base: "USD", date: "2026-09-04", rates: { EUR: 0.87 } });
  }
  if (url.href !== "https://bound.example:8443/v2/message/USD" || init.method !== "POST" ||
      new Headers(init.headers).get("X-Api-Key") !== "FAKE_SELLER_CREDENTIAL" ||
      init.body !== JSON.stringify({ text: "hello" })) throw new Error("bad authenticated request");
  return Response.json({ accepted: true }, { status: 202 });
};
`)
      const driver = join(dir, "roundtrip.ts")
      writeFileSync(driver, `
import { Effect } from ${JSON.stringify(resolve("effect"))};
import { toPublicListing } from ${JSON.stringify(resolve("@arcade/core"))};
import { manifestFromOperation, operationsOf, parseAuthFlag, writeGeneratedSkills } from ${JSON.stringify(new URL("../src/publish-introspect.ts", import.meta.url).pathname)};
import { loadSkills } from ${JSON.stringify(new URL("../src/skills.ts", import.meta.url).pathname)};
import { execSkill } from ${JSON.stringify(new URL("../src/exec.ts", import.meta.url).pathname)};
const spec = JSON.parse(${JSON.stringify(specText)});
const ref = operationsOf(spec)[0];
const manifest = manifestFromOperation(spec, ref, {
  specFile: "openapi.json", price: "$0.01", timeoutSec: 3,
  ...(${JSON.stringify(kind)} === "fx" ? {} : { auth: parseAuthFlag("header:X-Api-Key=UPSTREAM_KEY") })
});
await writeGeneratedSkills(${JSON.stringify(join(dir, "generated"))}, [manifest], [{ id: manifest.id, name: "openapi.json", content: ${JSON.stringify(specText)} }]);
const skills = await Effect.runPromise(loadSkills(${JSON.stringify(join(dir, "generated"))}));
if (skills.length !== 1) throw new Error("wrong listing count");
const originalSpawn = Bun.spawn.bind(Bun);
Bun.spawn = (cmd, options) => {
  if (cmd[0] !== "bun" || cmd[1] !== "--no-env-file" || cmd[2] !== "run" || !cmd[3].endsWith("/engines/harness.ts")) throw new Error("unexpected subprocess");
  return originalSpawn([...cmd.slice(0, 3), ${JSON.stringify(`--preload=${preload}`)}, ...cmd.slice(3)], options);
};
const skill = skills[0];
const outcome = await Effect.runPromise(execSkill({ manifest: skill.manifest, skillDir: skill.dir, jobId: "openapi-roundtrip",
  input: ${JSON.stringify(kind === "fx" ? { base: "USD", symbols: "EUR" } : { base: "USD", text: "hello", "x-api-key": "buyer-cannot-override", "X-Api-Key": "buyer-cannot-override" })} }));
process.stdout.write(JSON.stringify({ public: toPublicListing(skill.manifest), outcome, egress: skill.manifest.egress }));
`)
      const run = spawnSync("bun", ["run", driver], {
        cwd: new URL("../../..", import.meta.url),
        env: { PATH: process.env["PATH"] ?? "", HOME: dir, FAKE_AMBIENT: "not-a-real-secret", UPSTREAM_KEY: "FAKE_SELLER_CREDENTIAL" },
        encoding: "utf8", timeout: 8_000
      })
      expect(run.status, run.stderr).toBe(0)
      const result = JSON.parse(run.stdout)
      expect(result.public.id).toBe(kind === "fx" ? "fx-rate" : "send-message")
      expect(result.public).not.toHaveProperty("engine")
      expect(result.public.inputSchema.required).toEqual(kind === "fx" ? ["base", "symbols"] : ["base", "text"])
      expect(result.public.inputSchema.properties).not.toHaveProperty("x-api-key")
      expect(result.egress).toEqual([kind === "fx" ? "api.frankfurter.dev" : "bound.example"])
      expect(result.outcome).toMatchObject({ status: "succeeded", stopReason: "end_turn", costUsd: 0,
        output: kind === "fx" ? { base: "USD", date: "2026-09-04", rates: { EUR: 0.87 } } : { accepted: true } })
      expect(run.stdout + run.stderr).not.toMatch(/FAKE_SELLER_CREDENTIAL|buyer-cannot-override/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 12_000)
})
