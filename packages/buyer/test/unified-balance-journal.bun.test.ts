import { afterEach, describe, expect, test } from "bun:test"
import { chmod, lstat, mkdtemp, readFile, realpath, rm, symlink, writeFile, link } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openUnifiedFundingJournal, readUnifiedFundingJournal } from "../src/gateway-funding-journal.ts"
import { captureUnifiedFundingPlan, spendFromOwner } from "../src/unified-balance-funding.ts"
import { Effect } from "effect"

const owner = `0x${"11".repeat(20)}`, recipient = `0x${"22".repeat(20)}`, txHash = `0x${"33".repeat(32)}` as const
const request = { owner, recipient, sourceChain: "Base_Sepolia", amount: "0.25" }
const plan = captureUnifiedFundingPlan(request)
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const path = async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "arcade-unified-journal-")))
  await chmod(root, 0o700); roots.push(root)
  return join(root, "run.jsonl")
}
describe("owned Unified Balance journal", () => {
  test("fresh mode0600 evidence, immutable plan and bounded hash chain survive close", async () => {
    const journalPath = await path(), journal = await openUnifiedFundingJournal(journalPath, plan)
    await journal.append({ stage: "planned", plan })
    await journal.append({ stage: "spend_intent", plan })
    await journal.append({ stage: "sdk_returned", plan, txHash })
    const expected = journal.snapshot()
    await journal.close()
    expect((await lstat(journalPath)).mode & 0o777).toBe(0o600)
    expect(await readUnifiedFundingJournal(journalPath, plan, expected.head)).toEqual(expected)
    expect(expected.events.map(e => e.stage)).toEqual(["planned", "spend_intent", "sdk_returned"])
  })
  test("existing file refuses a restart or competing opener without overwriting", async () => {
    const journalPath = await path(), journal = await openUnifiedFundingJournal(journalPath, plan)
    const before = await readFile(journalPath, "utf8")
    await expect(openUnifiedFundingJournal(journalPath, plan)).rejects.toThrow("Funding journal unavailable")
    expect(await readFile(journalPath, "utf8")).toBe(before)
    await journal.close()
    await expect(openUnifiedFundingJournal(journalPath, plan)).rejects.toThrow()
  })
  test("intent persists before coordinator may spend", async () => {
    const journalPath = await path(), journal = await openUnifiedFundingJournal(journalPath, plan)
    let calls = 0
    const outcome = await Effect.runPromise(spendFromOwner(request, { journal, delegateStatus: async () => "ready", spend: async () => {
      expect((await readUnifiedFundingJournal(journalPath, plan)).events.at(-1)?.stage).toBe("spend_intent")
      calls++
      throw new Error("SIGNATURE-SENSITIVE")
    } }).pipe(Effect.either))
    await journal.close()
    expect(calls).toBe(1)
    expect(outcome._tag).toBe("Left")
    const bytes = await readFile(journalPath, "utf8")
    expect(bytes).not.toContain("SIGNATURE-SENSITIVE")
    expect((await readUnifiedFundingJournal(journalPath, plan)).events.at(-1)?.stage).toBe("uncertain")
  })
  test("rejects a modified plan, unknown evidence, and out-of-order stages", async () => {
    for (const event of [
      { stage: "spend_intent", plan },
      { stage: "planned", plan: { ...plan, amount: "100.000000" } },
      { stage: "planned", plan, signature: "SECRET" }
    ]) {
      const journalPath = await path(), journal = await openUnifiedFundingJournal(journalPath, plan)
      await expect(journal.append(event as Parameters<typeof journal.append>[0])).rejects.toThrow()
      await journal.close().catch(() => {})
      expect(await readFile(journalPath, "utf8")).not.toContain("SECRET")
    }
  })
  test("cannot append after a terminal stage or close", async () => {
    const journal = await openUnifiedFundingJournal(await path(), plan)
    await journal.append({ stage: "planned", plan })
    await journal.append({ stage: "delegate_pending", plan })
    await expect(journal.append({ stage: "spend_intent", plan })).rejects.toThrow()
    await journal.close().catch(() => {})
    await expect(journal.append({ stage: "planned", plan })).rejects.toThrow()
  })
  test("detects external writes before appending", async () => {
    const journalPath = await path(), journal = await openUnifiedFundingJournal(journalPath, plan)
    await writeFile(journalPath, "tampered\n", { mode: 0o600 })
    await expect(journal.append({ stage: "planned", plan })).rejects.toThrow()
    await journal.close().catch(() => {})
    await expect(readUnifiedFundingJournal(journalPath, plan)).rejects.toThrow()
  })
  test("rejects truncated content and an externally pinned head mismatch", async () => {
    const journalPath = await path(), journal = await openUnifiedFundingJournal(journalPath, plan)
    const old = journal.snapshot().head
    await journal.append({ stage: "planned", plan }); await journal.close()
    await expect(readUnifiedFundingJournal(journalPath, plan, old)).rejects.toThrow()
    const bytes = await readFile(journalPath, "utf8")
    await writeFile(journalPath, bytes.slice(0, -1), { mode: 0o600 })
    await expect(readUnifiedFundingJournal(journalPath, plan)).rejects.toThrow()
  })
  test("refuses public permissions, symlinks and hardlinked journals", async () => {
    const journalPath = await path(), journal = await openUnifiedFundingJournal(journalPath, plan)
    await journal.close()
    await chmod(journalPath, 0o644)
    await expect(readUnifiedFundingJournal(journalPath, plan)).rejects.toThrow()
    await chmod(journalPath, 0o600)
    const alias = journalPath.replace("run.jsonl", "alias.jsonl")
    await symlink(journalPath, alias)
    await expect(readUnifiedFundingJournal(alias, plan)).rejects.toThrow()
    await link(journalPath, journalPath.replace("run.jsonl", "hard.jsonl"))
    await expect(readUnifiedFundingJournal(journalPath, plan)).rejects.toThrow()
  })
  test("validates parent ownership mode and path before creating evidence", async () => {
    const journalPath = await path()
    await chmod(roots.at(-1)!, 0o755)
    await expect(openUnifiedFundingJournal(journalPath, plan)).rejects.toThrow()
    await expect(openUnifiedFundingJournal("relative.jsonl", plan)).rejects.toThrow()
  })
  test("only one simultaneous opener owns the evidence path", async () => {
    const journalPath = await path()
    const results = await Promise.allSettled([openUnifiedFundingJournal(journalPath, plan), openUnifiedFundingJournal(journalPath, plan)])
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1)
    for (const result of results) if (result.status === "fulfilled") await result.value.close()
  })
  test("captures caller events and serializes writes before closing", async () => {
    const journalPath = await path(), journal = await openUnifiedFundingJournal(journalPath, plan)
    const mutable = { stage: "planned" as const, plan: { ...plan } }
    const first = journal.append(mutable)
    mutable.plan.amount = "100.000000"
    const second = journal.append({ stage: "spend_intent", plan })
    const closing = journal.close()
    expect(journal.close()).toBe(closing)
    await Promise.all([first, second, closing])
    const saved = await readUnifiedFundingJournal(journalPath, plan)
    expect(saved.events.map(e => e.stage)).toEqual(["planned", "spend_intent"])
    expect(Object.isFrozen(saved.events)).toBe(true)
    expect(saved.events[0]?.plan.amount).toBe("0.250000")
  })
  test("does not evaluate event getters", async () => {
    const journal = await openUnifiedFundingJournal(await path(), plan)
    let calls = 0
    await expect(journal.append({ stage: "planned", get plan() { calls++; return plan } })).rejects.toThrow()
    await journal.close().catch(() => {})
    expect(calls).toBe(0)
  })
  test("refuses the wrong expected source or amount on readback", async () => {
    const journalPath = await path(), journal = await openUnifiedFundingJournal(journalPath, plan)
    await journal.close()
    await expect(readUnifiedFundingJournal(journalPath, { ...plan, sourceChain: "Arc_Testnet" })).rejects.toThrow()
    await expect(readUnifiedFundingJournal(journalPath, { ...plan, amount: "1.000000" })).rejects.toThrow()
  })
})
