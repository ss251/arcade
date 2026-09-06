import { expect, it } from "vitest"
import { spawnSync } from "node:child_process"

it("actual offline CLI help names the portable format and its specification", () => {
  const result = spawnSync("bun", ["--no-env-file", "--no-install", "packages/runner/src/cli.ts", "--help"], {
    cwd: new URL("../../..", import.meta.url).pathname,
    env: { PATH: process.env["PATH"] ?? "" }, encoding: "utf8", timeout: 10000, maxBuffer: 32768
  })
  expect(result.status).toBe(0)
  expect(result.stdout).toContain("Agent Skill (open standard)")
  expect(result.stdout).toContain("https://agentskills.io/specification")
  expect(result.stdout).toContain("name + description")
  expect(result.stdout).toContain("arcade publish <skillDir>")
  expect(result.stdout).toContain("one listing per MCP tool")
})
