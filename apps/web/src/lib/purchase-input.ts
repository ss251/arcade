/** One interpretation of approved input for display, derivation and the paid job. Browser-safe. */
export const purchaseInput = (raw: unknown = {}): Record<string, unknown> => {
  try {
    if (typeof raw === "string") raw = raw.trim() === "" ? {} : JSON.parse(raw)
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error()
    const json = JSON.stringify(raw)
    if (new TextEncoder().encode(json).byteLength > 131_072) throw new Error()
    return JSON.parse(json) as Record<string, unknown>
  } catch { throw new Error("Skill input must be a bounded JSON object") }
}
