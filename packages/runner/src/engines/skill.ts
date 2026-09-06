import { lstat, readFile, readdir } from "node:fs/promises"
import { dirname, join, relative, sep } from "node:path"
import { claudeAgentEngine, runClaudeAgent } from "./claude-agent.js"
import type { Engine, EngineConfig, SkillAgent } from "./types.js"

import { parseSkillMd } from "../skill-md.js"
export { parseSkillMd, type SkillMd } from "../skill-md.js"

const isMissing = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"

const referenceError = (): Error =>
  new Error("SKILL.md references could not be read; references must be a readable directory without symlinks.")

/** Sorted skill-relative file names, without following symlinked directories or files. */
export const referenceFiles = async (dir: string): Promise<Array<string>> => {
  const root = join(dir, "references")
  let stat: Awaited<ReturnType<typeof lstat>>
  try {
    stat = await lstat(root)
  } catch (error) {
    if (isMissing(error)) return []
    throw referenceError()
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw referenceError()

  const files: string[] = []
  const walk = async (folder: string): Promise<void> => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) files.push(relative(dir, path).split(sep).join("/"))
    }
  }
  try {
    await walk(root)
  } catch {
    // Harness errors can reach hub logs. Raw fs exceptions expose seller paths.
    throw referenceError()
  }
  return files.sort()
}

export const loadSkillAgent = async (
  entryPath: string,
  config?: EngineConfig
): Promise<SkillAgent> => {
  let text: string
  try {
    text = await readFile(entryPath, "utf8")
  } catch (error) {
    if (isMissing(error)) {
      throw new Error("SKILL.md does not exist. For the skill adapter, engine.entry must point at the SKILL.md file.")
    }
    throw new Error("SKILL.md could not be read. Check engine.entry and file permissions.")
  }

  const { frontmatter, body } = parseSkillMd(text)
  if (!frontmatter["name"]?.trim() || !frontmatter["description"]?.trim()) {
    throw new Error("SKILL.md needs non-empty name/description frontmatter. Point engine.entry at the skill, not a README.")
  }
  if (body === "") {
    throw new Error("SKILL.md has frontmatter but no body. The body is the system prompt; an empty one cannot run a skill.")
  }

  const refs = await referenceFiles(dirname(entryPath))
  const systemPrompt = refs.length === 0 ? body :
    `${body}\n\n## Reference files\n\nThese files are in your working directory. Read one when it is relevant to the task:\n${refs.map((file) => `- ${file}`).join("\n")}`
  return {
    systemPrompt,
    ...(config?.credential === undefined ? {} : { credential: config.credential }),
    ...(config?.model === undefined ? {} : { model: config.model }),
    capabilities: config?.capabilities ?? []
  }
}

export const skillEngine: Engine = {
  adapter: "skill",
  run: (agent, job, prompt) => runClaudeAgent(agent, job, prompt),
  envGrants: (agent) => claudeAgentEngine.envGrants(agent),
  doctor: (agent) => claudeAgentEngine.doctor(agent)
}
