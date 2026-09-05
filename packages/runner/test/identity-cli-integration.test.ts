import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadChainConfig } from "@arcade/core"

const root = new URL("../../..", import.meta.url).pathname
const preload = new URL("./fixtures/identity-cli-offline.ts", import.meta.url).pathname
const operator = `0x${"22".repeat(20)}`
const hash = `0x${"ab".repeat(32)}`
let directory: string
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "arcade-identity-cli-")) })
afterEach(() => { rmSync(directory, { recursive: true, force: true }) })
const config = (over: Record<string, unknown> = {}) => {
  const raw = JSON.stringify({ runnerId: "rnr_fixture", sellerAddress: `0x${"aa".repeat(20)}`, hubUrl: "https://hub.example", maxConcurrency: 1, ...over })
  writeFileSync(join(directory, "config.json"), raw)
  return raw
}
const run = (argv: string[], mode = "armed") => spawnSync("bun", ["run", `--preload=${preload}`, "packages/runner/src/cli.ts", ...argv], {
  cwd: root, encoding: "utf8", timeout: 12_000,
  env: { PATH: process.env["PATH"] ?? "", ARCADE_CONFIG_PATH: join(directory, "config.json"), ARCADE_NETWORK: "arc-testnet",
    // A deliberately invalid explicit key makes unexpected key resolution fail BEFORE
    // macOS Keychain fallback; no real key or HOME override enters this process.
    ARCADE_SELLER_KEY: "FAKE_KEY_NEVER_RESOLVE", ARCADE_IDENTITY_TEST_MODE: mode,
    ARCADE_IDENTITY_FETCH_MARKER: join(directory, "fetched") }
})
const register = () => ["identity", "register", "diff-triage", "--approve-operator", operator, "--skills", join(root, "skills")]

describe("actual isolated identity CLI", () => {
  it("help advertises explicit approval without config, network, or key access", () => {
    const result = run(["identity", "register", "--help"])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain("identity status"); expect(result.stdout).toContain("--approve-operator")
    expect(existsSync(join(directory, "config.json"))).toBe(false); expect(existsSync(join(directory, "fetched"))).toBe(false)
  })
  it("status displays confirmed and unknown pending state entirely offline", () => {
    const chain = loadChainConfig("arc-testnet")
    const before = config({ agents: { "diff-triage": { agentId: "42", agentURI: "https://hub.example/listings/diff-triage/agent-registration.json", registrationTx: hash, registeredAtMs: 1, operator } },
      pendingAgents: { "usdc-flow-check": { agentURI: "https://hub.example/pending", registry: chain.erc8004!.identity, chainId: chain.chainId, submittedAtMs: 1 } } })
    const result = run(["identity", "status"])
    expect(result.status, result.stderr).toBe(0); expect(result.stdout).toContain("42")
    expect(result.stdout).toMatch(/recorded only; not checked/); expect(result.stdout).toMatch(/unknown.*reconcile/)
    expect(existsSync(join(directory, "fetched"))).toBe(false)
    expect(readFileSync(join(directory, "config.json"), "utf8")).toBe(before)
  })
  it.each([[], ["nonsense"], ["register"], ["register", "diff-triage"], ["register", "diff-triage", "--approve-operator", "0x1"], ["status", "--skills", "/invalid"]].map(args => ({ args })))(
    "invalid usage is nonzero and offline", ({ args }) => {
      const before = config(), result = run(["identity", ...args])
      expect(result.status).toBe(2); expect(result.stderr).toMatch(/usage|approve-operator/)
      expect(existsSync(join(directory, "fetched"))).toBe(false)
      expect(readFileSync(join(directory, "config.json"), "utf8")).toBe(before)
    })
  it.each(["unarmed", "wrong-chain", "invalid-role", "http-error", "redirect", "malformed", "oversized"])("refuses %s metadata through the real command", mode => {
    const before = config(), result = run(register(), mode)
    expect(result.status).not.toBe(0); expect(existsSync(join(directory, "fetched"))).toBe(true)
    expect(result.stdout + result.stderr).not.toMatch(/FAKE_KEY_NEVER_RESOLVE|PRIVATE_BODY/)
    expect(readFileSync(join(directory, "config.json"), "utf8")).toBe(before)
  })
  it("compares explicit consent with published operator before any key lookup", () => {
    config(); const args = register(); args[4] = `0x${"33".repeat(20)}`
    const result = run(args)
    expect(result.status).toBe(2); expect(result.stderr).toMatch(/exactly match.*operator/)
    expect(result.stderr).not.toMatch(/signing key/)
  })
  it("prints the full grant and fails safely for an invalid test key without touching config", () => {
    const before = config(), result = run(register())
    expect(result.status).toBe(1); expect(result.stderr).toMatch(/signing key/)
    expect(result.stdout).toMatch(/transfer ALL current and future identity NFTs/)
    expect(result.stdout + result.stderr).not.toContain("FAKE_KEY_NEVER_RESOLVE")
    expect(readFileSync(join(directory, "config.json"), "utf8")).toBe(before)
  })
})
