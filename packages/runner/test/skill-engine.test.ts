import { afterEach, describe, expect, it } from "vitest"
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadSkillAgent, parseSkillMd, referenceFiles, skillEngine } from "../src/engines/skill.ts"
import { claudeAgentEngine } from "../src/engines/claude-agent.ts"

const SKILL_MD = `---
name: diff-triage
description: Triage a code diff for a reviewer deciding whether to merge.
---

You triage code diffs for a reviewer deciding whether to merge.

Report every issue you find, including minor ones.`

const scratchDirs: string[] = []
const scratch = async () => {
  const dir = await mkdtemp(join(tmpdir(), "arcade-skill-"))
  scratchDirs.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(scratchDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("parseSkillMd", () => {
  it("splits flat frontmatter from the body", () => {
    const { frontmatter, body } = parseSkillMd(SKILL_MD)
    expect(frontmatter["name"]).toBe("diff-triage")
    expect(frontmatter["description"]).toBe("Triage a code diff for a reviewer deciding whether to merge.")
    expect(body.startsWith("You triage code diffs")).toBe(true)
    expect(body).not.toContain("---")
  })

  it("handles CRLF and matching quotes while preserving colons inside values", () => {
    const parsed = parseSkillMd("---\r\nname: \"quoted-name\"\r\ndescription: 'a task: explained'\r\n---\r\n\r\nbody")
    expect(parsed.frontmatter).toEqual({ name: "quoted-name", description: "a task: explained" })
    expect(parsed.body).toBe("body")
  })

  it("ignores indented nested keys instead of overriding flat metadata", () => {
    const parsed = parseSkillMd("---\nname: flat-name\nmetadata:\n  name: nested-name\n\tdescription: nested-description\ndescription: flat-description\n---\nbody")
    expect(parsed.frontmatter["name"]).toBe("flat-name")
    expect(parsed.frontmatter["description"]).toBe("flat-description")
  })

  it.each(["---suffix\nname: n\n---\nbody", "---\nname: n\n---suffix\nbody"])(
    "requires exact delimiter lines",
    (text) => expect(parseSkillMd(text)).toEqual({ frontmatter: {}, body: text })
  )

  it("accepts a closing delimiter at EOF and preserves body horizontal rules", () => {
    expect(parseSkillMd("---\nname: n\n---").body).toBe("")
    expect(parseSkillMd(`${SKILL_MD}\n\n---\nmore`).body).toContain("---\nmore")
  })

  it("treats a file without frontmatter as all body", () => {
    expect(parseSkillMd(" just a prompt ")).toEqual({ frontmatter: {}, body: "just a prompt" })
  })
})

describe("loadSkillAgent", () => {
  it("uses the body as the prompt and carries the configured model, credential and capabilities", async () => {
    const dir = await scratch()
    await writeFile(join(dir, "SKILL.md"), SKILL_MD)
    const agent = await loadSkillAgent(join(dir, "SKILL.md"), {
      adapter: "skill", credential: "api-key", model: "claude-sonnet-5", capabilities: ["read-workdir"]
    })
    expect(agent.systemPrompt.startsWith("You triage code diffs")).toBe(true)
    expect(agent.model).toBe("claude-sonnet-5")
    expect(agent.credential).toBe("api-key")
    expect(agent.capabilities).toEqual(["read-workdir"])
  })

  it("names available references without reading their contents or granting capabilities", async () => {
    const dir = await scratch()
    await writeFile(join(dir, "SKILL.md"), SKILL_MD)
    await mkdir(join(dir, "references"))
    await writeFile(join(dir, "references", "severity.md"), "PRIVATE_REFERENCE_CONTENT")
    const agent = await loadSkillAgent(join(dir, "SKILL.md"))
    expect(agent.systemPrompt).toContain("references/severity.md")
    expect(agent.systemPrompt).not.toContain("PRIVATE_REFERENCE_CONTENT")
    expect(agent.systemPrompt).not.toContain(dir)
    expect(agent.capabilities).toEqual([])
    expect(agent).not.toHaveProperty("model")
    expect(agent).not.toHaveProperty("credential")
  })

  it.each([
    "# notes\n\nsome markdown",
    "---\nname: x\n---\nbody",
    "---\ndescription: y\n---\nbody",
    "---\nname: \"\"\ndescription: y\n---\nbody",
    "---\nname: x\ndescription: '   '\n---\nbody"
  ])("rejects missing or empty required metadata", async (text) => {
    const dir = await scratch()
    await writeFile(join(dir, "SKILL.md"), text)
    await expect(loadSkillAgent(join(dir, "SKILL.md"))).rejects.toThrow(/name.*description|frontmatter/i)
  })

  it("rejects an empty body", async () => {
    const dir = await scratch()
    await writeFile(join(dir, "SKILL.md"), "---\nname: x\ndescription: y\n---\n \t\n")
    await expect(loadSkillAgent(join(dir, "SKILL.md"))).rejects.toThrow(/body/)
  })

  it("explains a missing SKILL.md without leaking the private path", async () => {
    const dir = await scratch()
    const error = await loadSkillAgent(join(dir, "CANARY_PRIVATE_ENTRY.md")).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain("SKILL.md")
    expect((error as Error).message).not.toContain(dir)
    expect((error as Error).message).not.toContain("CANARY_PRIVATE_ENTRY")
  })
})

describe("referenceFiles", () => {
  it("returns nothing when there is no references directory", async () => {
    expect(await referenceFiles(await scratch())).toEqual([])
  })

  it("walks nested files in sorted skill-relative order", async () => {
    const dir = await scratch()
    await mkdir(join(dir, "references", "deep"), { recursive: true })
    await writeFile(join(dir, "references", "b.md"), "b")
    await writeFile(join(dir, "references", "deep", "a.md"), "a")
    expect(await referenceFiles(dir)).toEqual(["references/b.md", "references/deep/a.md"])
  })

  it("never follows symlinked files or nested reference directories outside the skill", async () => {
    const dir = await scratch()
    const outside = await scratch()
    await mkdir(join(dir, "references"))
    await writeFile(join(outside, "secret.md"), "OUTSIDE_PRIVATE_CONTENT")
    await writeFile(join(dir, "references", "local.md"), "local")
    await symlink(outside, join(dir, "references", "linked"), "dir")
    await symlink(join(outside, "secret.md"), join(dir, "references", "linked.md"))
    expect(await referenceFiles(dir)).toEqual(["references/local.md"])
  })

  it("refuses a symlinked references root without revealing its target", async () => {
    const dir = await scratch()
    const outside = await scratch()
    await symlink(outside, join(dir, "references"), "dir")
    const error = await referenceFiles(dir).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain("references")
    expect((error as Error).message).not.toContain(outside)
    expect((error as Error).message).not.toContain(dir)
  })

  it("does not hide an invalid references directory as missing or expose filesystem paths", async () => {
    const dir = await scratch()
    await writeFile(join(dir, "references"), "not a directory")
    const error = await referenceFiles(dir).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain("references")
    expect((error as Error).message).not.toContain(dir)
  })
})

describe("skillEngine", () => {
  it("uses the existing Claude Agent engine's credential-dependent environment grants", () => {
    expect(skillEngine.adapter).toBe("skill")
    for (const credential of ["api-key", "subscription"] as const) {
      const agent = { systemPrompt: "", credential }
      expect(skillEngine.envGrants(agent)).toEqual(claudeAgentEngine.envGrants(agent))
    }
    expect(skillEngine.envGrants({ systemPrompt: "" })).toEqual([])
  })
})
