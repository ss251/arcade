import { spawnSync } from "node:child_process"
import { describe, expect, it } from "vitest"

const run = (args: string[], env: Record<string, string> = {}) => spawnSync("bun", ["scripts/chain-check.ts", ...args], {
  cwd: new URL("../../..", import.meta.url),
  env: { PATH: process.env["PATH"] ?? "", ...env },
  encoding: "utf8",
  timeout: 5000
})

describe("chain-check operator CLI", () => {
  it("reports pending mainnet before requiring a facilitator or accessing RPC", () => {
    const result = run(["--network", "arc-mainnet"])
    expect(result.status).toBe(1)
    expect(result.stdout + result.stderr).toContain("pending")
  })

  it("requires an explicit facilitator identity for ready-chain balance checks", () => {
    const result = run(["--network", "arc-testnet"])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain("--facilitator")
  })

  it("rejects unknown networks and flags", () => {
    expect(run(["--network", "base"]).status).toBe(2)
    expect(run(["--typo"]).status).toBe(2)
  })

  it("does not expose malformed RPC URLs in diagnostics", () => {
    const result = run(["--facilitator", `0x${"1".repeat(40)}`], { ARCADE_RPC_URL: "private-token-MARKER" })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain("HTTP(S) RPC")
    expect(result.stderr).not.toContain("MARKER")
  })
})
