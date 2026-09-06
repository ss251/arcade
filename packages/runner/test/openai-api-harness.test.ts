import { describe, expect, it, vi } from "vitest"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Schema } from "effect"
import { SkillManifest } from "@arcade/core"
import { buildEnv } from "../src/exec.ts"
import { doctorOpenAi } from "../src/engines/openai-api.ts"

const manifest = (secrets: string[]) => ({
  id: "api-fixture", version: "1.0.0", serviceName: "API fixture", description: "Fixture",
  tags: [], price: "$0.01", bounds: { timeoutSec: 5 }, inputSchema: {}, outputSchema: {},
  engine: { adapter: "openai-api", credential: "api-key", entry: "SKILL.md", model: "glm-5.3-flash", capabilities: [] },
  secrets, egress: ["api.b.ai"]
})
const root = new URL("../../..", import.meta.url)
const prompt = "---\nname: api-fixture\ndescription: Local fixture\n---\nOPERATOR_MARKER\n"
const run = (args: string[], env: Record<string, string>, input?: unknown) => spawnSync("bun", ["--no-env-file", ...args], {
  cwd: root, env: { PATH: process.env["PATH"] ?? "", ...env },
  ...(input === undefined ? {} : { input: JSON.stringify(input) }), encoding: "utf8", timeout: 8_000
})

describe("actual openai-api harness", () => {
  it("loads the same contained SKILL.md and submits through the new wire engine", () => {
    const dir = mkdtempSync(join(tmpdir(), "arcade-openai-harness-"))
    try {
      mkdirSync(join(dir, "references"))
      writeFileSync(join(dir, "references", "check.md"), "reference body")
      writeFileSync(join(dir, "SKILL.md"), prompt)
      const preload = join(dir, "fetch-fixture.ts")
      writeFileSync(preload, `globalThis.fetch = async (url, init) => {
        const body = JSON.parse(init.body);
        return Response.json({choices:[{finish_reason:"tool_calls",message:{role:"assistant",
          tool_calls:[{id:"fixture",type:"function",function:{name:"submit",arguments:JSON.stringify({
            model:body.model, hasOperator:body.messages[0].content.includes("OPERATOR_MARKER"),
            hasReference:body.messages[0].content.includes("references/check.md"),
            fenced:body.messages[1].content.includes("UNTRUSTED"), maxTokens:body.max_tokens,
            route:url === "https://api.b.ai/v1/chat/completions"
          })}}]}}],usage:{prompt_tokens:10,completion_tokens:5}});
      };`)
      const result = run(["--preload=" + preload, "packages/runner/src/engines/harness.ts", join(dir, "SKILL.md")],
        { HOME: dir, OPENAI_API_KEY: "TEST_KEY_ONLY", OPENAI_BASE_URL: "https://api.b.ai/v1" },
        { jobId: "local", adapter: "openai-api", skillDir: dir, input: { query: "test" },
          bounds: { timeoutSec: 3 }, outputSchema: {}, engineConfig: manifest([]).engine })
      expect(result.status, result.stderr).toBe(0)
      const out = JSON.parse(result.stdout)
      expect(out.stopReason).toBe("end_turn")
      expect(out.output).toEqual({ model: "glm-5.3-flash", hasOperator: true, hasReference: true,
        fenced: true, maxTokens: 16000, route: true })
      expect(result.stdout + result.stderr).not.toContain("TEST_KEY_ONLY")
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it("rejects a symlinked external skill before any request and redacts its location", () => {
    const dir = mkdtempSync(join(tmpdir(), "arcade-openai-contained-"))
    const outside = mkdtempSync(join(tmpdir(), "PRIVATE_EXTERNAL_SKILL_"))
    try {
      writeFileSync(join(outside, "SKILL.md"), prompt)
      symlinkSync(join(outside, "SKILL.md"), join(dir, "SKILL.md"))
      const result = run(["packages/runner/src/engines/harness.ts", join(dir, "SKILL.md")], { HOME: dir },
        { jobId: "local", adapter: "openai-api", skillDir: dir, input: {},
          bounds: { timeoutSec: 3 }, outputSchema: {}, engineConfig: manifest([]).engine })
      expect(result.status).toBe(1)
      expect(JSON.parse(result.stdout).error).toMatch(/inside.*skill directory/)
      expect(result.stdout + result.stderr).not.toContain("PRIVATE_EXTERNAL_SKILL_")
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })
})

describe("manifest-granted doctor environment", () => {
  it("forwards exactly the declared OpenAI key and base, never neighboring credentials", () => {
    vi.stubEnv("OPENAI_API_KEY", "TEST_OPENAI_ONLY")
    vi.stubEnv("OPENAI_BASE_URL", "https://api.b.ai/v1")
    vi.stubEnv("ANTHROPIC_API_KEY", "TEST_NEIGHBOR_ONLY")
    try {
      const absent = buildEnv(Schema.decodeUnknownSync(SkillManifest)(manifest([])), "/unused")
      expect(absent["OPENAI_API_KEY"]).toBeUndefined()
      expect(absent["OPENAI_BASE_URL"]).toBeUndefined()
      expect(doctorOpenAi({ systemPrompt: "", model: "glm-5.3-flash" }, absent).ok).toBe(false)
      const granted = buildEnv(Schema.decodeUnknownSync(SkillManifest)(manifest(["OPENAI_API_KEY", "OPENAI_BASE_URL"])), "/unused")
      expect(granted["OPENAI_API_KEY"]).toBe("TEST_OPENAI_ONLY")
      expect(granted["OPENAI_BASE_URL"]).toBe("https://api.b.ai/v1")
      expect(granted["ANTHROPIC_API_KEY"]).toBeUndefined()
      expect(doctorOpenAi({ systemPrompt: "", model: "glm-5.3-flash" }, granted).ok).toBe(true)
    } finally { vi.unstubAllEnvs() }
  })

  it.each([false, true])("actual CLI doctor uses declared secrets only (declared=%s)", (declared) => {
    const dir = mkdtempSync(join(tmpdir(), "arcade-openai-doctor-"))
    try {
      const skills = join(dir, "skills")
      mkdirSync(join(skills, "fixture"), { recursive: true })
      writeFileSync(join(skills, "fixture", "arcade.json"), JSON.stringify(
        manifest(declared ? ["OPENAI_API_KEY", "OPENAI_BASE_URL"] : [])))
      writeFileSync(join(skills, "fixture", "SKILL.md"), prompt)
      const result = run(["packages/runner/src/cli.ts", "doctor", "--skills", skills],
        { HOME: dir, OPENAI_API_KEY: "TEST_KEY_ONLY", OPENAI_BASE_URL: "https://api.b.ai/v1" })
      expect(result.status, result.stderr).toBe(declared ? 0 : 1)
      expect(result.stdout).toContain(declared ? "openai-api configured" : "OPENAI_API_KEY is missing")
      expect(result.stdout + result.stderr).not.toContain("TEST_KEY_ONLY")
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

