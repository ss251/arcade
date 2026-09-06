import { createHash } from "node:crypto"
import { join, relative, sep } from "node:path"
import { Schema } from "effect"
import { assertManifestPublishable, parsePrice, Price, SERVICE_NAME_MAX, SkillManifest } from "@arcade/core"
import { loadPluginBundle, type PluginBundle, type PluginIssue, type PluginSkill } from "./plugin-load.js"
import { collectPluginSkillFiles, PLUGIN_COPY_LIMITS, preparePluginFileBatch, writePluginListings,
  type PluginListingFiles } from "./plugin-files.js"
import { listMcpTools, manifestFromMcpTool, publishableTools, toSkillId } from "./publish-introspect.js"
import { createPublishPreview } from "./publish-preview.js"

export const PLUGIN_DISCOVERY_LIMITS = { servers: 8, startBudgetMs: 90_000 } as const
export interface PluginPublishOptions {
  readonly price: string
  readonly outDir: string
  readonly skills: ReadonlySet<string>
  readonly servers: ReadonlySet<string>
  readonly json: boolean
  readonly yes: boolean
  readonly includeWrites: boolean
}
export const pluginPublishOptions = (argv: ReadonlyArray<string>): PluginPublishOptions => {
  const values = new Map<string, string[]>(), switches = new Set<string>()
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!
    if (["--price", "--out", "--skill", "--server"].includes(flag)) {
      const value = argv[++i]
      if (!value?.trim() || value.startsWith("-")) throw new Error("Plugin publish option requires a value")
      const previous = values.get(flag) ?? []
      if (["--price", "--out"].includes(flag) && previous.length) throw new Error("Plugin publish option can only be supplied once")
      values.set(flag, [...previous, value])
    } else if (["--json", "--yes", "--include-writes"].includes(flag)) {
      if (switches.has(flag)) throw new Error("Plugin publish switch can only be supplied once")
      switches.add(flag)
    } else if (flag === "--force") throw new Error("Plugin generation never overwrites listings; choose a fresh --out directory")
    else throw new Error("Unsupported plugin publish option; see --help (no bundled commands or -- arguments)")
  }
  if (switches.has("--json") && switches.has("--yes")) throw new Error("--json is preview-only; do not combine it with --yes")
  const price = values.get("--price")?.[0] ?? "$0.05"
  try {
    if (price.length > 64 || !Schema.is(Price)(price)) throw new Error()
    parsePrice(price)
  } catch { throw new Error("Invalid plugin price; use at least $0.000001 and at most six decimal places") }
  return { price, outDir: values.get("--out")?.[0] ?? join(process.cwd(), "skills"),
    skills: new Set(values.get("--skill") ?? []), servers: new Set(values.get("--server") ?? []),
    json: switches.has("--json"), yes: switches.has("--yes"), includeWrites: switches.has("--include-writes") }
}

/** Stable across checkout locations; readable slug plus an identity hash avoids
 * truncation/normalization collisions without revealing private absolute paths. */
export const pluginListingId = (
  bundle: Pick<PluginBundle, "name" | "format">, kind: "skill" | "mcp", component: string, tool?: string
): string => {
  const label = toSkillId([bundle.name, kind, component, tool].filter(Boolean).join("-")).slice(0, 50).replace(/-+$/, "")
  const hash = createHash("sha256").update(JSON.stringify([bundle.format, bundle.name, kind, component, tool ?? null])).digest("hex").slice(0, 12)
  return label + "-" + hash
}
const skillPath = (bundle: PluginBundle, skill: PluginSkill) => relative(bundle.root, skill.directory).split(sep).join("/")
const clipDescription = (description: string): string => {
  const text = description.slice(0, 500)
  return /[\uD800-\uDBFF]$/.test(text) ? text.slice(0, -1) : text
}
export const manifestFromPluginSkill = (bundle: PluginBundle, skill: PluginSkill, price: string): Record<string, unknown> => {
  const id = pluginListingId(bundle, "skill", skillPath(bundle, skill))
  const atomic = parsePrice(price)
  const name = skill.name.length <= SERVICE_NAME_MAX && /^[\x20-\x7e]+$/.test(skill.name) ? skill.name : id.slice(0, SERVICE_NAME_MAX)
  return {
    id, version: "0.1.0", serviceName: name, description: clipDescription(skill.description),
    tags: ["agent-skill", "plugin"], price,
    bounds: { timeoutSec: 60, maxTurns: 1, maxTokens: 16000, maxToolCalls: 1,
      maxCostUsd: atomic > 40000n ? 0.02 : Number(atomic) / 2_000_000 },
    inputSchema: { type: "object", required: ["input"], properties: { input: { type: "string" } } },
    outputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" } } },
    engine: { adapter: "skill", credential: "api-key", entry: "SKILL.md", capabilities: [] },
    secrets: [], egress: []
  }
}
type Skip = { readonly component: PluginIssue["component"] | "tool"; readonly reason: string;
  readonly index?: number; readonly serverIndex?: number }
const selectedSkills = (bundle: PluginBundle, options: PluginPublishOptions) => {
  if (!options.skills.size) return options.servers.size ? [] : [...bundle.skills]
  const chosen = new Set<PluginSkill>()
  for (const selector of options.skills) {
    const matches = bundle.skills.filter(s => s.folder === selector || skillPath(bundle, s) === selector)
    if (matches.length !== 1) throw new Error("Requested plugin skill is missing or ambiguous; use its contained relative directory")
    chosen.add(matches[0]!)
  }
  return bundle.skills.filter(s => chosen.has(s))
}

/** Sequential discovery of selected, supported descriptors. Source bodies and
 * file snapshots are local-only, never included in preview.public. */
export const preparePluginPublish = async (bundle: PluginBundle, options: PluginPublishOptions) => {
  const skills = selectedSkills(bundle, options)
  if ([...options.servers].some(name => !bundle.servers.some(s => s.name === name)))
    throw new Error("Requested plugin MCP server is missing or unsupported")
  const servers = options.servers.size ? bundle.servers.filter(s => options.servers.has(s.name))
    : options.skills.size ? [] : bundle.servers
  const listings: PluginListingFiles[] = []
  const skipped: Skip[] = [...bundle.issues]
  const warnings = new Set<string>()
  let retainedBytes = 0
  for (const [index, skill] of skills.entries()) {
    if (listings.length >= PLUGIN_COPY_LIMITS.listings || retainedBytes >= PLUGIN_COPY_LIMITS.batchBytes) {
      skipped.push({ component: "skill", index, reason: "batch-limit" }); continue
    }
    try {
      const files = await collectPluginSkillFiles(bundle, skill)
      const bytes = files.reduce((n, f) => n + f.content.byteLength, 0)
      if (retainedBytes + bytes > PLUGIN_COPY_LIMITS.batchBytes) {
        skipped.push({ component: "skill", index, reason: "batch-limit" }); continue
      }
      const manifest = manifestFromPluginSkill(bundle, skill, options.price)
      // Refuse one malformed source tree, never hide valid sibling skills.
      preparePluginFileBatch([{ manifest, files }])
      retainedBytes += bytes
      listings.push({ manifest, files })
      warnings.add("Review generic input/output schemas, API-key/model configuration, capabilities and third-party licensing before serving")
      if (skill.description.length > 500) warnings.add("Skill descriptions longer than the public limit are clipped; source SKILL.md stays unchanged")
    } catch { skipped.push({ component: "skill", index, reason: "unsafe-or-unsupported-skill-files" }) }
  }
  const started = Date.now()
  for (const [index, server] of servers.entries()) {
    if (index >= PLUGIN_DISCOVERY_LIMITS.servers || Date.now() - started >= PLUGIN_DISCOVERY_LIMITS.startBudgetMs) {
      skipped.push({ component: "server", index, reason: "discovery-budget" }); continue
    }
    let tools: Awaited<ReturnType<typeof listMcpTools>>
    try { tools = await listMcpTools({ url: server.url }) }
    catch { skipped.push({ component: "server", index, reason: "discovery-failed" }); continue }
    if (tools.length > 1000) { skipped.push({ component: "server", index, reason: "discovery-limit" }); continue }
    const eligible = new Set(publishableTools(tools, options.includeWrites))
    for (const [toolIndex, tool] of tools.entries()) {
      if (!eligible.has(tool)) { skipped.push({ component: "tool", serverIndex: index, index: toolIndex, reason: "not-marked-read-only" }); continue }
      if (listings.length >= PLUGIN_COPY_LIMITS.listings) {
        skipped.push({ component: "tool", serverIndex: index, index: toolIndex, reason: "batch-limit" }); continue
      }
      try {
        const manifest = { ...manifestFromMcpTool({ url: server.url }, tool, { price: options.price }),
          id: pluginListingId(bundle, "mcp", server.name, tool.name) }
        preparePluginFileBatch([{ manifest, files: [] }])
        listings.push({ manifest, files: [] })
      } catch { skipped.push({ component: "tool", serverIndex: index, index: toolIndex, reason: "unsupported-tool" }) }
    }
  }
  // Collision and aggregate resource guards apply equally to dry runs and writes.
  // No partial stdout or generated files are emitted if the final batch is invalid.
  if (listings.length) preparePluginFileBatch(listings)
  const entries = listings.map(({ manifest, files }) => {
    const decoded = Schema.decodeUnknownSync(SkillManifest)(manifest)
    assertManifestPublishable(decoded)
    return { ...createPublishPreview(join(options.outDir, decoded.id), decoded), localFiles: files.map(f => f.name) }
  })
  return { listings, skipped, warnings: [...warnings], entries }
}

/** Returns false only when the directory has no recognized plugin manifest.
 * The caller preserves ordinary arcade.json directory precedence. */
export const runPublishPlugin = async (target: string, argv: ReadonlyArray<string>): Promise<boolean> => {
  const options = pluginPublishOptions(argv)
  const bundle = await loadPluginBundle(target)
  if (!bundle) return false
  const prepared = await preparePluginPublish(bundle, options)
  if (options.json) {
    console.log(JSON.stringify({ version: 1, kind: "generated", source: "plugin", format: bundle.format,
      pluginName: bundle.name, target, written: false, hasListings: prepared.entries.length > 0,
      entries: prepared.entries, skipped: prepared.skipped, warnings: prepared.warnings }))
    return true
  }
  console.log("plugin   " + JSON.stringify(bundle.name) + " (" + bundle.format + ")")
  for (const skip of prepared.skipped) console.log("  skipped " +
    (skip.serverIndex === undefined ? "" : "server#" + skip.serverIndex + "/") +
    skip.component + (skip.index === undefined ? "" : "#" + skip.index) + " — " + skip.reason)
  for (const warning of prepared.warnings) console.log("  review  " + warning)
  for (const entry of prepared.entries) console.log(entry.skillId + "  " + entry.public.price)
  if (!options.yes) {
    console.log("Nothing written. Re-run with --yes and a fresh --out directory to generate " + prepared.entries.length + " listing(s).")
    return true
  }
  if (!prepared.listings.length) throw new Error("No supported plugin listings to write; review the skipped components")
  const written = await writePluginListings(options.outDir, prepared.listings, bundle.root)
  for (const path of written) console.log("wrote " + path)
  console.log("Local files only. Review the generated manifests, then use arcade publish on each listing before serving.")
  return true
}
