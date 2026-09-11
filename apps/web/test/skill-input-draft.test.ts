import { expect, it, vi } from "vitest"
import { checkSkillInput, consumeSkillDraft, freeQuoteExample, saveSkillDraft, skillDraftHref, type DraftStorage } from "../src/lib/skill-input-draft.ts"

const memory = () => {
  const rows = new Map<string, string>()
  const storage: DraftStorage = { getItem: key => rows.get(key) ?? null, setItem: (key, value) => { rows.set(key, value) }, removeItem: key => { rows.delete(key) } }
  return { storage, rows }
}

it("accepts only bounded JSON objects and preserves multiline string input", () => {
  for (const raw of ["", "oops", "[]", "null", '"text"', "42", '{"text":"' + "a".repeat(131072) + '"}']) expect(checkSkillInput(raw).ok).toBe(false)
  const result = checkSkillInput(JSON.stringify({ diff: "first\nsecond" }))
  expect(result.ok).toBe(true)
  if (result.ok) expect(result.input.diff).toBe("first\nsecond")
})

it("stores input only in tab storage and consumes it once for its exact skill", () => {
  const { storage, rows } = memory(), input = '{"private_input":"never in the URL"}'
  expect(saveSkillDraft(storage, "diff-triage", input, 100)).toBe(true)
  expect(skillDraftHref("diff-triage")).toBe("/chat?skill=diff-triage")
  expect(skillDraftHref("diff-triage")).not.toContain("private_input")
  expect(consumeSkillDraft(storage, "other-skill", 101)).toBeUndefined()
  expect(rows.size).toBe(1)
  expect(consumeSkillDraft(storage, "diff-triage", 101)).toBe(input)
  expect(rows.size).toBe(0)
  expect(consumeSkillDraft(storage, "diff-triage", 102)).toBeUndefined()
})

it("rejects expired, future, mismatched and corrupt drafts after removing them", () => {
  for (const raw of ["bad JSON", JSON.stringify({ version: 1, skillId: "other", inputJson: "{}", createdAt: 100 }),
    JSON.stringify({ version: 1, skillId: "diff-triage", inputJson: "{}", createdAt: 999 }),
    JSON.stringify({ version: 1, skillId: "diff-triage", inputJson: "{}", createdAt: -2000000 }),
    JSON.stringify({ version: 1, skillId: "diff-triage", inputJson: "[]", createdAt: 100 })]) {
    const { storage, rows } = memory(); rows.set("arcade:skill-draft:v1:diff-triage", raw)
    expect(consumeSkillDraft(storage, "diff-triage", 101)).toBeUndefined(); expect(rows.size).toBe(0)
  }
})

it("fails closed on storage errors, failed removal and invalid identifiers", () => {
  const { storage } = memory(); storage.setItem = () => { throw Error("quota") }
  expect(saveSkillDraft(storage, "diff-triage", "{}", 0)).toBe(false)
  expect(skillDraftHref("../bad?input=secret")).toBeUndefined()
  const live = memory(); saveSkillDraft(live.storage, "diff-triage", "{}", 0)
  live.storage.removeItem = () => {}
  expect(consumeSkillDraft(live.storage, "diff-triage", 1)).toBeUndefined()
})

it("the generated free quote example sends exact JSON once without a payment header", async () => {
  const input = JSON.stringify({ diff: 'a\nb\n"quoted" ` ${globalThis.UNSAFE = true} </script>' })
  const snippet = freeQuoteExample("diff-triage", input)!
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ price: "$0.12" }) }))
  await new Function("fetch", "console", `return (async () => { ${snippet} })()`)(fetcher, { log() {} })
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher.mock.calls[0]?.[0]).toBe("/api/quote")
  const options = (fetcher.mock.calls as unknown[][])[0]![1] as RequestInit
  expect(options.method).toBe("POST"); expect(options.credentials).toBe("omit")
  expect(options.headers).toEqual({ "content-type": "application/json" })
  expect(JSON.parse(options.body as string)).toEqual({ skillId: "diff-triage", input: JSON.parse(input) })
  expect((globalThis as { UNSAFE?: boolean }).UNSAFE).toBeUndefined()
  expect(freeQuoteExample("diff-triage", "[]")).toBeUndefined()
})
