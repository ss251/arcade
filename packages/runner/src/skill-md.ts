/** Agent Skill (open standard): https://agentskills.io/specification.
 * SKILL.md is an input format for the existing Claude Agent engine, not another sandbox. */
export interface SkillMd {
  readonly frontmatter: Record<string, string>
  readonly body: string
}

/** Flat key:value metadata only. Nested YAML is deliberately ignored, never flattened. */
export const parseSkillMd = (text: string): SkillMd => {
  const lines = text.split(/\r?\n/)
  if (lines[0] !== "---") return { frontmatter: {}, body: text.trim() }
  const end = lines.findIndex((line, index) => index > 0 && line === "---")
  if (end === -1) return { frontmatter: {}, body: text.trim() }

  const frontmatter: Record<string, string> = Object.create(null)
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z_][A-Za-z0-9_-]*):[ \t]*(.*)$/.exec(line)
    if (match === null) continue
    let value = match[2]!.trim()
    if (value.length >= 2 && (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )) value = value.slice(1, -1)
    frontmatter[match[1]!] = value
  }
  return { frontmatter, body: lines.slice(end + 1).join("\n").trim() }
}
