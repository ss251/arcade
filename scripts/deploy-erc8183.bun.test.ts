import { expect, it } from "bun:test"
import { parseEscrowDeployArgs, ESCROW_DEPLOY_USAGE } from "./deploy-erc8183.ts"
import { ESCROW_DEFAULT_TREASURY } from "./erc8183-deploy-plan.ts"
it("parses only explicit read-only modes and a complete public plan", () => {
  for (const mode of ["help", "dry-run", "check-build"] as const) expect(parseEscrowDeployArgs(["--" + mode]).mode).toBe(mode)
  expect(parseEscrowDeployArgs(["--plan", "--confirm-treasury", ESCROW_DEFAULT_TREASURY, "--deployer-nonce", "10"]))
    .toEqual({ mode: "plan", confirmedTreasury: ESCROW_DEFAULT_TREASURY, deployerNonce: 10 })
  expect(ESCROW_DEPLOY_USAGE).toContain("No live execution")
})
it("refuses live execution, implicit defaults and malformed or duplicated arguments", () => {
  for (const args of [[], ["--live"], ["--dry-run", "--live"], ["--plan"],
    ["--plan", "--confirm-treasury", ESCROW_DEFAULT_TREASURY, "--deployer-nonce", "01"],
    ["--plan", "--confirm-treasury", "0x" + "00".repeat(20), "--deployer-nonce", "0"],
    ["--plan", "--confirm-treasury", ESCROW_DEFAULT_TREASURY, "--deployer-nonce", "9007199254740991"],
    ["--check-build", "--check-build"]]) expect(() => parseEscrowDeployArgs(args)).toThrow("deployment_preflight_refused")
})
