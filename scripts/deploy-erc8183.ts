/** J6B1 preflight only. Live executor intentionally absent while size/owner checkpoints are open. */
import { execFileSync } from "node:child_process"
import { lstatSync, readFileSync, realpathSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { ESCROW_ARTIFACTS, ESCROW_CHAIN, ESCROW_COMPILER, ESCROW_DEFAULT_TREASURY, ESCROW_PIN,
  EscrowDeployRefusal, escrowDeploymentPlan, validateEscrowArtifact, type ArtifactRole, type EscrowArtifact } from "./erc8183-deploy-plan.ts"

export const ESCROW_DEPLOY_USAGE = "Usage: bun --no-env-file scripts/deploy-erc8183.ts --help | --dry-run | --check-build | --plan --confirm-treasury ADDRESS --deployer-nonce INTEGER\n" +
  "Read-only checkpoint. No live execution, keys, RPC, journal/config writes or transactions. The pinned artifact exceeds EIP-170; owner treasury confirmation is separately pending."
function fail(): never { throw new Error("deployment_preflight_refused") }
export function parseEscrowDeployArgs(args: readonly string[]) {
  if (args.length === 1 && args[0] === "--help") return { mode: "help" as const }
  if (args.length === 1 && args[0] === "--dry-run") return { mode: "dry-run" as const }
  if (args.length === 1 && args[0] === "--check-build") return { mode: "check-build" as const }
  if (args.length !== 5 || args[0] !== "--plan" || args[1] !== "--confirm-treasury" || args[3] !== "--deployer-nonce" ||
    !/^0x[0-9a-fA-F]{40}$/.test(args[2]!) || /^0x0{40}$/i.test(args[2]!) ||
    !/^(0|[1-9][0-9]{0,15})$/.test(args[4]!)) return fail()
  const deployerNonce = Number(args[4])
  if (!Number.isSafeInteger(deployerNonce) || deployerNonce > Number.MAX_SAFE_INTEGER - 7) return fail()
  return { mode: "plan" as const, confirmedTreasury: args[2]!, deployerNonce }
}
const noActions = Object.freeze({ keyReads: 0, networkRequests: 0, signatures: 0, broadcasts: 0, fileWrites: 0 })
function readRegular(root: string, path: string, maxBytes: number): string {
  const file = resolve(root, path), stat = lstatSync(file)
  if (!file.startsWith(root + "/") || !stat.isFile() || stat.isSymbolicLink() ||
    stat.size > maxBytes || realpathSync(file) !== file) return fail()
  return readFileSync(file, "utf8")
}
export function inspectEscrowCheckout(root: string) {
  if (realpathSync(root) !== root) return fail()
  const git = (args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8",
    timeout: 5000, maxBuffer: 131072, env: { PATH: process.env.PATH ?? "", GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "ignore"] }).trimEnd()
  if (git(["-C", "lib/erc8183", "rev-parse", "HEAD"]) !== ESCROW_PIN ||
    git(["-C", "lib/erc8183", "status", "--porcelain"]) !== "" ||
    git(["submodule", "status", "--recursive"]).split("\n").some(line => !line || line[0] !== " ")) return fail()
  const reports: { role: ArtifactRole; status: "passed" | "blocked"; reason?: string; runtimeBytes?: number; creationBytes?: number }[] = []
  const artifacts: Partial<Record<ArtifactRole, EscrowArtifact>> = {}
  for (const role of Object.keys(ESCROW_ARTIFACTS) as ArtifactRole[]) {
    const { name } = ESCROW_ARTIFACTS[role]
    try {
      const raw: unknown = JSON.parse(readRegular(root, `contracts/out/erc8183/${name}.sol/${name}.json`, 8_000_000))
      const artifact = validateEscrowArtifact(role, raw, path => readRegular(root, path, 500000))
      artifacts[role] = artifact
      reports.push({ role, status: "passed", runtimeBytes: artifact.runtimeBytes, creationBytes: artifact.creationBytes })
    } catch (error) {
      reports.push({ role, status: "blocked", reason: error instanceof EscrowDeployRefusal ? error.code : "artifact_unavailable",
        ...(error instanceof EscrowDeployRefusal && error.sizes ? error.sizes : {}) })
    }
  }
  return { reports, artifacts }
}
export function escrowDeployMain(args = process.argv.slice(2)): number {
  try {
    const command = parseEscrowDeployArgs(args)
    if (command.mode === "help") { console.log(ESCROW_DEPLOY_USAGE); return 0 }
    if (command.mode === "dry-run") {
      console.log(JSON.stringify({ status: "deployment_paused", chainId: ESCROW_CHAIN, pin: ESCROW_PIN,
        compiler: ESCROW_COMPILER, defaultTreasuryNotConfirmed: ESCROW_DEFAULT_TREASURY,
        plannedTransactions: 7, required: ["deployable_artifact", "explicit_owner_treasury", "bounded_live_executor_and_journal"],
        ...noActions }))
      return 0
    }
    const root = realpathSync(fileURLToPath(new URL("..", import.meta.url)))
    const result = inspectEscrowCheckout(root)
    if (result.reports.some(r => r.status !== "passed")) {
      console.log(JSON.stringify({ status: "build_blocked", pin: ESCROW_PIN, reports: result.reports, ...noActions }))
      return 2
    }
    if (command.mode === "check-build") {
      console.log(JSON.stringify({ status: "artifact_preflight_passed_not_deployment_approval", reports: result.reports, ...noActions }))
      return 0
    }
    const plan = escrowDeploymentPlan({ chainId: ESCROW_CHAIN, confirmedTreasury: command.confirmedTreasury,
      deployerNonce: command.deployerNonce, artifacts: result.artifacts as Record<ArtifactRole, EscrowArtifact> })
    // Public calldata/predicted addresses only. The nonce is supplied, never observed
    // or reserved; this plan cannot be submitted by this script.
    console.log(JSON.stringify({ status: "unsigned_unexecuted_plan", plan, ...noActions },
      (_key, value: unknown) => typeof value === "bigint" ? value.toString() : value))
    return 0
  } catch {
    console.error("deployment_preflight_refused; live execution is unavailable. No key or RPC operation exists in this checkpoint.")
    return 2
  }
}
if (import.meta.main) process.exitCode = escrowDeployMain()
