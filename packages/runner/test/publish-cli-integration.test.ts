import { afterEach, describe, expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"

const root = new URL("../../..", import.meta.url).pathname
const fixture = new URL("./fixtures/frankfurter.json", import.meta.url).pathname
const homes: string[] = []
const home = () => {
  const dir = mkdtempSync(join(tmpdir(), "arcade-publish-cli-"))
  homes.push(dir)
  return dir
}
afterEach(() => { for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true }) })

const run = (dir: string, argv: string[], preload?: string) => spawnSync("bun", [
  "run", ...(preload === undefined ? [] : [`--preload=${preload}`]), "packages/runner/src/cli.ts", ...argv
], {
  cwd: root, env: { PATH: process.env["PATH"] ?? "", HOME: dir }, encoding: "utf8", timeout: 12_000
})

describe("arcade publish subprocess integration", () => {
  it("prints the directory wizard contract as one JSON object without touching runner configuration", () => {
    const dir = home()
    const result = run(dir, ["publish", "skills/diff-triage", "--json"])
    expect(result.status, result.stderr).toBe(0)
    const preview = JSON.parse(result.stdout)
    const manifest = JSON.parse(readFileSync(join(root, "skills/diff-triage/arcade.json"), "utf8"))
    expect(preview).toMatchObject({ target: "skills/diff-triage", skillId: "diff-triage",
      engine: { adapter: manifest.engine.adapter, credential: "api-key" }, grants: [],
      public: { id: "diff-triage" }, private: { engine: manifest.engine, secrets: ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"] } })
    expect(preview.public).not.toHaveProperty("engine")
    expect(preview.public).not.toHaveProperty("secrets")
    expect(existsSync(join(dir, ".arcade"))).toBe(false)
  })

  it("previews OpenAPI without writes, writes self-contained listings only on --yes, and protects edits until --force", () => {
    const dir = home()
    const out = join(dir, "generated")
    const argv = ["publish", fixture, "--out", out, "--price", "$0.01"]
    const preview = run(dir, argv)
    expect(preview.status, preview.stderr).toBe(0)
    expect(preview.stdout).toContain("fx-rate")
    expect(preview.stdout).toContain("Nothing written")
    expect(existsSync(out)).toBe(false)
    const written = run(dir, [...argv, "--yes"])
    expect(written.status, written.stderr).toBe(0)
    const path = join(out, "fx-rate", "arcade.json")
    const generated = JSON.parse(readFileSync(path, "utf8"))
    expect(generated).toMatchObject({ id: "fx-rate", price: "$0.01", engine: {
      adapter: "openapi", credential: "none", operationId: "fxRate", spec: "openapi.json"
    } })
    expect(JSON.parse(readFileSync(join(out, "fx-rate", "openapi.json"), "utf8")))
      .toEqual(JSON.parse(readFileSync(fixture, "utf8")))
    writeFileSync(path, "seller edits")
    const refused = run(dir, [...argv, "--yes"])
    expect(refused.status).not.toBe(0)
    expect(readFileSync(path, "utf8")).toBe("seller edits")
    const forced = run(dir, [...argv, "--yes", "--force"])
    expect(forced.status, forced.stderr).toBe(0)
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(generated)
    const privatePreview = run(dir, ["publish", join(out, "fx-rate"), "--json"])
    expect(privatePreview.status, privatePreview.stderr).toBe(0)
    expect(JSON.parse(privatePreview.stdout).private.engine).toEqual({ ...generated.engine, capabilities: [] })
    const prose = run(dir, ["publish", join(out, "fx-rate")])
    expect(prose.status, prose.stderr).toBe(0)
    expect(prose.stdout).not.toContain("reaches neither the network nor the filesystem")
  }, 15_000)

  it.each([
    ["--operation", "doesNotExist"], ["--auth", "header:X-Key=HOME"],
    ["--price", "not-a-price"], ["--operation"], ["--unknown-option"]
  ])("refuses invalid OpenAPI selections or flags before writing: %j", (...flags) => {
    const dir = home()
    const out = join(dir, "generated")
    const result = run(dir, ["publish", fixture, "--out", out, "--yes", ...flags])
    expect(result.status).not.toBe(0)
    expect(existsSync(out)).toBe(false)
  })

  it("refuses YAML before attempting to read a missing file", () => {
    const result = run(home(), ["publish", "/nonexistent/private-api.yaml"])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/YAML|JSON/)
    expect(result.stderr).not.toMatch(/ENOENT|private-api/)
  })

  it.each(["success", "http-error", "redirect", "bad-json"])("handles remote JSON documents through the actual CLI: %s", (mode) => {
    const dir = home()
    const preload = join(dir, "offline-fetch.ts")
    const marker = join(dir, "fetch-called")
    writeFileSync(preload, `
import { writeFileSync } from "node:fs";
globalThis.fetch = async (input, init) => {
  writeFileSync(${JSON.stringify(marker)}, "called");
  if (String(input) !== "https://upstream.example/openapi.json?version=1" || init.redirect !== "error" || !init.signal) throw new Error("wrong fetch options");
  if (${JSON.stringify(mode)} === "http-error") return new Response("PRIVATE_UPSTREAM_BODY", { status: 503 });
  if (${JSON.stringify(mode)} === "redirect") return new Response("PRIVATE_UPSTREAM_BODY", { status: 302, headers: { location: "https://other.example/private" } });
  if (${JSON.stringify(mode)} === "bad-json") return new Response("PRIVATE_UPSTREAM_BODY");
  return Response.json(${readFileSync(fixture, "utf8")});
};
`)
    const result = run(dir, ["publish", "https://upstream.example/openapi.json?version=1"], preload)
    expect(existsSync(marker)).toBe(true)
    if (mode === "success") {
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toContain("fx-rate")
      expect(result.stdout).toContain("Nothing written")
    } else expect(result.status).not.toBe(0)
    expect(result.stdout + result.stderr).not.toContain("PRIVATE_UPSTREAM_BODY")
  })

  it("keeps server flags after -- literal and never treats server --yes or --help as publisher instructions", () => {
    const dir = home()
    const out = join(dir, "generated")
    const resolve = createRequire(import.meta.url).resolve
    const server = join(dir, "stdio-fixture.ts")
    const rest = ["--yes", "--help", "--price", "$9"]
    writeFileSync(server, `
import { Server } from ${JSON.stringify(resolve("@modelcontextprotocol/sdk/server/index.js"))};
import { StdioServerTransport } from ${JSON.stringify(resolve("@modelcontextprotocol/sdk/server/stdio.js"))};
import { ListToolsRequestSchema } from ${JSON.stringify(resolve("@modelcontextprotocol/sdk/types.js"))};
if (JSON.stringify(process.argv.slice(2)) !== ${JSON.stringify(JSON.stringify(rest))}) throw new Error("server arguments changed");
const server = new Server({ name: "fixture", version: "1" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [
  { name: "read_value", description: "Read fixture", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
  { name: "write_value", description: "Write fixture", inputSchema: { type: "object" }, annotations: { readOnlyHint: false } }
] }));
await server.connect(new StdioServerTransport());
`)
    const args = ["publish", "mcp://", "--price", "$0.02", "--out", out]
    const serverArgs = ["--", "bun", "run", server, ...rest]
    const preview = run(dir, [...args, ...serverArgs])
    expect(preview.status, preview.stderr).toBe(0)
    expect(preview.stdout).toContain("read-value")
    expect(preview.stdout).toContain("Nothing written")
    expect(existsSync(out)).toBe(false)
    const write = run(dir, [...args, "--yes", ...serverArgs])
    expect(write.status, write.stderr).toBe(0)
    const manifest = JSON.parse(readFileSync(join(out, "read-value", "arcade.json"), "utf8"))
    expect(manifest.price).toBe("$0.02")
    expect(manifest.engine.command).toEqual(["bun", "run", server, ...rest])
    expect(existsSync(join(out, "write-value"))).toBe(false)
    const unknown = run(dir, [...args, "--tool", "missing", "--yes", ...serverArgs])
    expect(unknown.status).not.toBe(0)
    expect(existsSync(join(out, "missing"))).toBe(false)
  }, 15_000)
})
