/** Tab-local, short-lived editable input. This is never a permit, quote or payment. */
export const SKILL_INPUT_LIMIT = 131_072
const PREFIX = "arcade:skill-draft:v1:"
const TTL_MS = 30 * 60 * 1000
export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}
const skillOk = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)
export type InputCheck = { readonly ok: true; readonly input: Record<string, unknown>; readonly json: string }
  | { readonly ok: false; readonly message: string }

/** Basic JSON syntax and transport bounds only; never claims schema-valid or executable. */
export function checkSkillInput(text: string): InputCheck {
  try {
    if (typeof text !== "string" || !text.trim()) return { ok: false, message: "Enter a JSON object for this skill." }
    if (new TextEncoder().encode(text).byteLength > SKILL_INPUT_LIMIT) return { ok: false, message: "Keep input under 128 KB." }
    const input: unknown = JSON.parse(text)
    if (input === null || typeof input !== "object" || Array.isArray(input)) return { ok: false, message: "Input must be a JSON object, with field names and values." }
    return { ok: true, input: input as Record<string, unknown>, json: JSON.stringify(input, null, 2) }
  } catch { return { ok: false, message: "Check the JSON syntax: use double quotes, commas between fields, and matching braces." } }
}

export function saveSkillDraft(storage: DraftStorage, skillId: string, inputJson: string, now = Date.now()): boolean {
  const checked = checkSkillInput(inputJson)
  if (!skillOk(skillId) || !checked.ok || !Number.isSafeInteger(now) || now < 0) return false
  try {
    const encoded = JSON.stringify({ version: 1, skillId, inputJson, createdAt: now })
    storage.setItem(PREFIX + skillId, encoded)
    return storage.getItem(PREFIX + skillId) === encoded
  } catch { return false }
}

/** Remove before returning. Failed removal, corrupt data and expired drafts are unusable. */
export function consumeSkillDraft(storage: DraftStorage, skillId: string, now = Date.now()): string | undefined {
  if (!skillOk(skillId) || !Number.isSafeInteger(now) || now < 0) return undefined
  try {
    const raw = storage.getItem(PREFIX + skillId)
    if (raw === null) return undefined
    storage.removeItem(PREFIX + skillId)
    if (storage.getItem(PREFIX + skillId) !== null) return undefined
    if (raw.length > SKILL_INPUT_LIMIT * 6 + 1024) return undefined
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join(",") !== "createdAt,inputJson,skillId,version") return undefined
    const draft = value as Record<string, unknown>
    if (draft.version !== 1 || draft.skillId !== skillId || typeof draft.inputJson !== "string" ||
      typeof draft.createdAt !== "number" || !Number.isSafeInteger(draft.createdAt) || draft.createdAt < 0 ||
      draft.createdAt > now || now - draft.createdAt > TTL_MS || !checkSkillInput(draft.inputJson).ok) return undefined
    return draft.inputJson
  } catch { return undefined }
}

/** The URL contains only the listing identifier; the input stays in this tab. */
export const skillDraftHref = (skillId: string): string | undefined =>
  skillOk(skillId) ? `/chat?skill=${encodeURIComponent(skillId)}` : undefined

/** Browser-console example for the actual unsigned POST /api/quote route. */
export function freeQuoteExample(skillId: string, inputJson: string): string | undefined {
  const checked = checkSkillInput(inputJson)
  if (!skillOk(skillId) || !checked.ok) return undefined
  return `// Run on this ARCADE site. This requests a quote; it does not pay.\nconst input = JSON.parse(${JSON.stringify(inputJson)});\nconst response = await fetch("/api/quote", {\n  method: "POST",\n  credentials: "omit",\n  headers: { "content-type": "application/json" },\n  body: JSON.stringify({ skillId: ${JSON.stringify(skillId)}, input })\n});\nif (!response.ok) throw new Error("Quote unavailable");\nconsole.log(await response.json());`
}
