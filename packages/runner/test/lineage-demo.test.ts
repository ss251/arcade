import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { execFileSync } from "node:child_process"
import { Effect } from "effect"
import { decodeManifest } from "@arcade/core"
import { HireRefused, type Hired } from "@arcade/buyer/hire"
import { runLoopProbe } from "../../../skills/loop-probe/run.ts"
import { verifyLineageEvidence } from "../../../scripts/verify-lineage-evidence.ts"

const ROOT = new URL("../../..", import.meta.url).pathname
const LOOP_DIR = join(ROOT, "skills", "loop-probe")

describe("loop-probe lineage demo", () => {
  it("runs through Bun and refuses cleanly without a runner hire grant", () => {
    const raw = execFileSync("bun", [join(LOOP_DIR, "run.ts")], {
      cwd: LOOP_DIR,
      input: JSON.stringify({ jobId: "job_probe", input: { address: `0x${"a".repeat(40)}` } }),
      encoding: "utf8",
      env: { PATH: process.env["PATH"] }
    })
    expect(JSON.parse(raw)).toMatchObject({ output: { ok: false }, stopReason: "refusal" })
  })

  it("has the canonical price, tree ceiling and hire capability", async () => {
    const raw = JSON.parse(readFileSync(join(LOOP_DIR, "arcade.json"), "utf8"))
    const manifest = await Effect.runPromise(decodeManifest(raw))
    expect(manifest.price).toBe("$0.30")
    expect(manifest.bounds.maxSubSpendUsd).toBe(0.25)
    expect(manifest.engine).toMatchObject({
      adapter: "script",
      entry: "run.ts",
      capabilities: ["hire-skills"]
    })
  })

  it("settles the child and reports the expected cycle refusal", async () => {
    const calls: Array<string> = []
    const hire = async (skillId: string): Promise<Hired> => {
      calls.push(skillId)
      if (skillId === "wallet-risk-note") {
        return {
          skillId,
          jobId: "job_wallet",
          settled: true,
          result: { verdict: "ok" },
          fenced: "",
          costUsd: 0.15
        }
      }
      throw new HireRefused("lineage_cycle: loop-probe is already in this call tree")
    }

    const envelope = await runLoopProbe(
      { address: "0xAeB742d58cc7F5CF656fCD9Beb07Bf0C1ACa6f5b" },
      hire
    )

    expect(calls).toEqual(["wallet-risk-note", "loop-probe"])
    expect(envelope.stopReason).toBe("end_turn")
    expect(envelope.output.ok).toBe(true)
    expect(envelope.output.hired.some((line) => line.includes("wallet-risk-note"))).toBe(true)
    expect(envelope.output.hired.some((line) => line.includes("lineage_cycle"))).toBe(true)
  })

  it("does not claim success for a failed child or a different self-hire refusal", async () => {
    const unsettled = await runLoopProbe({ address: `0x${"a".repeat(40)}` }, async () => ({
      skillId: "wallet-risk-note", jobId: "job_wallet", settled: false, result: {}, fenced: "", costUsd: 0
    }))
    expect(unsettled.stopReason).toBe("refusal")
    expect(unsettled.output.ok).toBe(false)
    const wrongRefusal = await runLoopProbe({ address: `0x${"a".repeat(40)}` }, async (skillId) => {
      if (skillId === "loop-probe") throw new HireRefused("tree_budget_exceeded")
      return { skillId, jobId: "job_wallet", settled: true, result: {}, fenced: "", costUsd: 0.15 }
    })
    expect(wrongRefusal.stopReason).toBe("refusal")
    expect(wrongRefusal.output.ok).toBe(false)
  })
})

const tx = (digit: string) => `0x${digit.repeat(64)}`
const receipt = (skillId: string, digit: string, hop: number, ancestors: string[]) => ({
  skillId, settleTx: tx(digit), settled: true, hop, ancestors, network: "eip155:5042002",
  explorer: `https://testnet.arcscan.app/tx/${tx(digit)}`
})
const evidence = () => {
  const wallet = receipt("wallet-risk-note", "b", 1, ["loop-probe"])
  const flow = receipt("usdc-flow-check", "c", 2, ["loop-probe", "wallet-risk-note"])
  const root = { ...receipt("loop-probe", "a", 0, []), children: [wallet, flow] }
  const buyer = `status  succeeded\nresult  ${JSON.stringify({ ok: true, hired: ["wallet-risk-note settled", "loop-probe refused: lineage_cycle"] })}\n\nreceipt\n  settled      true  (ok)\n  tx           ${root.explorer}\n`
  return { root, wallet, flow, buyer }
}

describe("lineage evidence verification", () => {
  it("correlates descendants by settlement transaction to this exact purchase", () => {
    const { root, wallet, flow, buyer } = evidence()
    const stale = { ...root, settleTx: tx("d"), settled: false }
    expect(verifyLineageEvidence(buyer, [root, wallet, flow, stale])).toMatchObject({ root, wallet, flow })
  })

  it("rejects stale or uncorrelated receipts and unsuccessful buyer output", () => {
    const { root, wallet, flow, buyer } = evidence()
    expect(() => verifyLineageEvidence(buyer, [{ ...root, settleTx: tx("d") }, wallet, flow])).toThrow(/purchase/)
    expect(() => verifyLineageEvidence(buyer, [root, { ...wallet, settleTx: tx("e") }, flow])).toThrow(/wallet-risk-note/)
    expect(() => verifyLineageEvidence(buyer.replace('"ok":true', '"ok":false'), [root, wallet, flow])).toThrow(/output/)
    expect(() => verifyLineageEvidence(buyer.replace("lineage_cycle", "tree_budget_exceeded"), [root, wallet, flow])).toThrow(/cycle/)
  })

  it("rejects unpaid or non-testnet receipts", () => {
    const { root, wallet, flow, buyer } = evidence()
    expect(() => verifyLineageEvidence(buyer, [{ ...root, settled: false }, wallet, flow])).toThrow(/settle/)
    expect(() => verifyLineageEvidence(buyer, [{ ...root, network: "eip155:1" }, wallet, flow])).toThrow(/testnet/)
  })
})
