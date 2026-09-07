#!/usr/bin/env bun
import { Effect, Schema } from "effect"
import {
  assertManifestPublishable,
  credentialOf,
  NotPublishable,
  parsePrice,
  Price,
  SkillManifest
} from "@arcade/core"
import { formatUsdc } from "@arcade/core"
import { defaultConfig, configExists, configPath, readConfig, writeConfig } from "./config.ts"
import { loadSkills } from "./skills.ts"
import { startDaemon } from "./daemon.ts"
import { buildEnv } from "./exec.ts"
import { gate } from "./publishable.ts"
import { createPublishPreview } from "./publish-preview.ts"
import { runPublishPlugin } from "./publish-plugin.js"
import { seatDir, seatIsLoggedIn } from "./engines/claude-agent.ts"
import {
  generateWallet,
  keychainAvailable,
  keychainRead,
  keychainStore,
  resolveSellerKey
} from "./wallet.ts"
import { checkHub, fetchBalanceAtomic, planIdentity } from "./onboard.ts"
import { runIdentityCommand } from "./identity-cli.ts"
import { lstat, mkdir, readFile } from "node:fs/promises"
import { dirname, basename, resolve, join } from "node:path"
import {
  listMcpTools,
  manifestFromMcpTool,
  manifestFromOperation,
  operationsOf,
  parseAuthFlag,
  parseMcpTarget,
  publishableTools,
  writeGeneratedSkills
} from "./publish-introspect.ts"

/**
 * `arcade` — the seller's entire interface.
 *
 *   arcade runner init      one-command setup (D3)
 *   arcade runner start     connect and serve
 *   arcade publish <dir>    show exactly what would be published (and what would NOT)
 *   arcade doctor           verify the environment
 */

/** Application options end at --; a stdio server owns every subsequent argument. */
const applicationArgs = (argv: ReadonlyArray<string>): ReadonlyArray<string> => {
  const separator = argv.indexOf("--")
  return separator === -1 ? argv : argv.slice(0, separator)
}
const rawArgs = process.argv.slice(2)
const args = applicationArgs(rawArgs)
const cmd = args[0]
const sub = args[1]

const skillsDirDefault = `${process.cwd()}/skills`

/**
 * `--help` is handled BEFORE any command runs.
 *
 * It was not, and `arcade init --help` therefore fell through to `init` and minted a new
 * identity over a live one. Asking a CLI what a command does is the single most reasonable
 * thing to type at an unfamiliar tool, and it is the one input that must never be
 * destructive — a tool that punishes curiosity teaches people to guess instead.
 */
const wantsHelp = args.length === 0 || args.includes("--help") || args.includes("-h")

const usage = () => {
  console.log(`arcade — publish agent skills as paid endpoints on Arc

  arcade init [--hub URL]                          set up everything: wallet, config, hub
       [--seller 0x..]                             …reuse an address you already control
       [--import 0x<key>]                          …adopt an existing key
  arcade status [--skills DIR]                     identity, hub, skills, earnings
  arcade fund --help                               fund a buyer from owner Unified Balance
  arcade start [--skills DIR]                      connect to the hub and serve jobs

  arcade publish <skillDir>                        preview the PUBLIC projection
  arcade publish <pluginDir> [--yes]               Agent Plugin skills + supported MCP tools
  arcade publish mcp://<host>/<path> [--yes]       one listing per MCP tool
  arcade publish mcp:// [options] -- <cmd> [args…] …from a stdio MCP server
  arcade publish <openapi.json> [--yes]            one listing per OpenAPI operation

    Agent Skill (open standard): https://agentskills.io/specification
    Add arcade.json to its SKILL.md folder. Execution checks non-empty
    name + description frontmatter and body; not full specification validation.

    --price '$0.05'       price per generated listing (default $0.05)
    --out DIR            output directory (default ./skills)
    --tool NAME          select an MCP tool (repeatable)
    --operation ID       select an OpenAPI operation (repeatable)
    --skill FOLDER        select a bundled plugin skill (repeatable)
    --server NAME         select a supported plugin MCP server (repeatable)
    --auth header:X-Api-Key=UPSTREAM_KEY           bind an ENV NAME; also query:name=ENV
    --include-writes     include MCP tools not marked read-only
    --yes                write generated files; without it, preview only
    --force              overwrite existing generated files
    --json               one preview JSON object; generated batches are unwritten
                         preview-only: cannot combine with --yes or --force
    Put all arcade options before --; arguments after it belong to the server.
    Plugins: https://agent-plugins.org/ (portable 1.0.0 + separate Codex compatibility).
    Plugin selectors restrict generation to selected kinds; without them, inspect all.
    Plugin generation refuses --force; use a fresh output directory. Unsupported
    connectors are reported, never installed or executed. Review generated manifests.

  arcade identity status                          recorded agents and pending registration (offline)
  arcade identity register <skill>                 mint/resume this skill's ERC-8004 identity
       --approve-operator ADDRESS                 REQUIRED: consent to the hub operator's full
       [--skills DIR]                             ERC-721 transfer authority over all your identities

  arcade wallet import 0x<key>                     store an existing payout key in the keychain
  arcade wallet export                             print the payout key, to back it up
  arcade runner seat                               set up a local development seat
  arcade doctor [--skills DIR]                     validate config + skills
`)
}

/** Every value of a repeatable application flag, in order. */
export const flagAll = (argv: ReadonlyArray<string>, name: string): ReadonlyArray<string> => {
  const options = applicationArgs(argv)
  const values: string[] = []
  for (let i = 0; i < options.length; i += 1) {
    if (options[i] !== name) continue
    const value = options[i + 1]
    if (value === undefined || !value.trim() || value.startsWith("-")) {
      throw new Error(`${name} requires a value before --`)
    }
    values.push(value)
    i += 1
  }
  return values
}
const flag = (name: string): string | undefined => flagAll(args, name)[0]

const documentPath = (target: string): string => {
  try { return new URL(target).pathname }
  catch { return target }
}

/** Select the publishing path from the target, including a URL's document pathname. */
export const publishTargetKind = (target: string): "mcp" | "openapi" | "dir" => {
  if (target.startsWith("mcp://")) return "mcp"
  if (/\.(json|ya?ml)$/i.test(documentPath(target))) return "openapi"
  return "dir"
}

class PublishDocumentError extends Error {}
const SPEC_BYTES = 5 * 1024 * 1024

/** Remote documents have one deadline covering both headers and a bounded body. */
const readOpenapiDocument = async (target: string): Promise<Record<string, unknown>> => {
  if (/\.ya?ml$/i.test(documentPath(target))) {
    throw new PublishDocumentError("YAML documents are not supported; convert the spec to JSON before publishing")
  }
  let raw: string
  if (/^[a-z][a-z\d+.-]*:/i.test(target)) {
    let url: URL
    try {
      url = new URL(target)
      if (url.protocol !== "https:" || !url.hostname || url.username || url.password) throw new Error()
    } catch { throw new PublishDocumentError("OpenAPI document URLs must use HTTPS without inline credentials") }
    const controller = new AbortController()
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const download = async () => {
      const response = await fetch(url, { redirect: "error", signal: controller.signal })
      if (response.redirected || (response.status >= 300 && response.status < 400)) {
        throw new PublishDocumentError("OpenAPI document redirects are not allowed")
      }
      if (!response.ok) throw new PublishDocumentError(`OpenAPI document returned HTTP status ${response.status}`)
      const declaredSize = response.headers.get("content-length")
      if (declaredSize !== null && Number(declaredSize) > SPEC_BYTES) {
        throw new PublishDocumentError("OpenAPI document exceeds the 5 MiB size limit")
      }
      if (response.body === null) throw new PublishDocumentError("OpenAPI document has an empty body")
      reader = response.body.getReader()
      const decoder = new TextDecoder()
      let text = ""
      let bytes = 0
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) return text + decoder.decode()
        bytes += chunk.value.byteLength
        if (bytes > SPEC_BYTES) throw new PublishDocumentError("OpenAPI document exceeds the 5 MiB size limit")
        text += decoder.decode(chunk.value, { stream: true })
      }
    }
    try {
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new PublishDocumentError("OpenAPI document exceeded the 30-second time limit"))
          controller.abort()
        }, 30_000)
      })
      raw = await Promise.race([download(), deadline])
    } catch (error) {
      if (error instanceof PublishDocumentError) throw error
      throw new PublishDocumentError("Could not fetch the OpenAPI document; verify its HTTPS URL and availability")
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      controller.abort()
      // Do not let a third-party stream hold publishing open while cancellation finishes.
      void reader?.cancel().catch(() => {})
    }
  } else {
    try { raw = await readFile(target, "utf8") }
    catch { throw new PublishDocumentError("Could not read the OpenAPI JSON document") }
    if (Buffer.byteLength(raw) > SPEC_BYTES) throw new PublishDocumentError("OpenAPI document exceeds the 5 MiB size limit")
  }
  try {
    const spec: unknown = JSON.parse(raw)
    if (spec === null || typeof spec !== "object" || Array.isArray(spec)) throw new Error()
    return spec as Record<string, unknown>
  } catch { throw new PublishDocumentError("OpenAPI document must be a valid JSON object") }
}

const generatedOptions = (argv: ReadonlyArray<string>, kind: "mcp" | "openapi") => {
  const options = applicationArgs(argv)
  const json = options.includes("--json")
  if (options.filter(option => option === "--json").length > 1) throw new Error("--json can only be supplied once")
  if (json && (options.includes("--yes") || options.includes("--force"))) {
    throw new Error("--json is preview-only and cannot be combined with --yes or --force")
  }
  const valued = new Set(["--price", "--out", kind === "mcp" ? "--tool" : "--operation",
    ...(kind === "openapi" ? ["--auth"] : [])])
  const switches = new Set(["--json", "--yes", "--force", ...(kind === "mcp" ? ["--include-writes"] : [])])
  for (let i = 0; i < options.length; i += 1) {
    const name = options[i]!
    if (valued.has(name)) { flagAll(options, name); i += 1 }
    else if (!switches.has(name)) throw new Error("Unsupported publish option; use --help and put server arguments after --")
  }
  const one = (name: string) => {
    const values = flagAll(options, name)
    if (values.length > 1) throw new Error(`${name} can only be supplied once`)
    return values[0]
  }
  const price = one("--price") ?? "$0.05"
  try {
    if (!Schema.is(Price)(price)) throw new Error()
    parsePrice(price)
  } catch { throw new Error("Invalid --price; use at least $0.000001 with at most six decimal places") }
  const authValue = one("--auth")
  return {
    json,
    price,
    outDir: one("--out") ?? skillsDirDefault,
    only: new Set(flagAll(options, kind === "mcp" ? "--tool" : "--operation")),
    auth: authValue === undefined ? undefined : parseAuthFlag(authValue),
    includeWrites: options.includes("--include-writes"),
    yes: options.includes("--yes"),
    force: options.includes("--force")
  }
}

/** The entire batch must be publishable before either a preview or a write is produced. */
const validateGenerated = (manifests: ReadonlyArray<Record<string, unknown>>) => {
  const ids = new Set<string>()
  const decodedManifests: SkillManifest[] = []
  for (const manifest of manifests) {
    let decoded: SkillManifest
    try {
      decoded = Schema.decodeUnknownSync(SkillManifest)(manifest)
      assertManifestPublishable(decoded)
      parsePrice(decoded.price)
    } catch { throw new Error("Generated manifest is invalid; check its price and engine configuration") }
    if (ids.has(decoded.id)) throw new Error("Selected entries produce duplicate listing ids")
    ids.add(decoded.id)
    decodedManifests.push(decoded)
  }
  return decodedManifests
}

/** Publish options exclude the target; any argv after -- is passed literally to MCP. */
export const runPublishIntrospection = async (target: string, argv: ReadonlyArray<string>): Promise<void> => {
  const kind = publishTargetKind(target)
  if (kind === "dir") throw new Error("Introspection requires an MCP target or an OpenAPI JSON document")
  const options = generatedOptions(argv, kind)
  const separator = argv.indexOf("--")
  const rest = separator === -1 ? [] : argv.slice(separator + 1)
  let manifests: Record<string, unknown>[]
  let extras: Array<{ id: string; name: string; content: string }> = []
  let summary: string[]
  let skipped: Array<{ name: string; reason: "not-marked-read-only" }> = []
  if (kind === "mcp") {
    const src = parseMcpTarget(target, rest)
    const tools = await listMcpTools(src).catch(() => { throw new Error("Could not introspect that MCP server; verify its configuration") })
    if ([...options.only].some((name) => !tools.some((tool) => tool.name === name))) {
      throw new Error("Requested MCP tool was not found on the server")
    }
    const eligible = publishableTools(tools, options.includeWrites)
    skipped = tools.filter(tool => !eligible.includes(tool)).map(tool => ({ name: tool.name, reason: "not-marked-read-only" }))
    if ([...options.only].some((name) => !eligible.some((tool) => tool.name === name))) {
      throw new Error("Requested MCP tool is not marked read-only; use --include-writes to select it")
    }
    const chosen = options.only.size === 0 ? eligible : eligible.filter((tool) => options.only.has(tool.name))
    if (chosen.length === 0) throw new Error("No publishable MCP tools selected; check the server or use --include-writes")
    manifests = chosen.map((tool) => manifestFromMcpTool(src, tool, { price: options.price }))
    summary = [`server   ${src.url === undefined ? "local stdio MCP server" : "remote HTTPS MCP server"}`,
      `tools    ${tools.length} found, ${chosen.length} to publish`,
      ...tools.filter((tool) => !eligible.includes(tool)).map((tool) =>
        `  skipped ${tool.name} — not marked read-only (pass --include-writes to sell it)`)]
  } else {
    if (rest.length > 0) throw new Error("Arguments after -- are only supported for a stdio MCP server")
    const spec = await readOpenapiDocument(target)
    const operations = operationsOf(spec)
    if ([...options.only].some((id) => !operations.some((operation) => operation.operationId === id))) {
      throw new Error("Requested OpenAPI operation was not found in the document")
    }
    const chosen = options.only.size === 0 ? operations : operations.filter((operation) => options.only.has(operation.operationId))
    if (chosen.length === 0) throw new Error("No named OpenAPI operations selected")
    manifests = chosen.map((ref) => manifestFromOperation(spec, ref, { specFile: "openapi.json", price: options.price,
      ...(options.auth === undefined ? {} : { auth: options.auth }) }))
    extras = manifests.map((manifest) => ({ id: String(manifest["id"]), name: "openapi.json", content: `${JSON.stringify(spec, null, 2)}\n` }))
    summary = ["document OpenAPI JSON", `ops      ${operations.length} with an operationId, ${chosen.length} to publish`]
  }
  const decoded = validateGenerated(manifests)
  if (options.json) {
    // Validate the entire batch before any stdout. These paths are hypothetical;
    // JSON mode never calls the generated writer and never invokes a tool.
    const batch = {
      version: 1, kind: "generated", source: kind, written: false, target,
      entries: decoded.map(manifest => createPublishPreview(join(options.outDir, manifest.id), manifest)),
      skipped
    }
    console.log(JSON.stringify(batch))
    return
  }
  for (const line of summary) console.log(line)
  console.log("")
  for (const manifest of manifests) console.log(`${manifest["id"]}  ${manifest["price"]}`)
  if (!options.yes) {
    console.log(`\nNothing written. Re-run with --yes to create ${manifests.length} listing(s).`)
    return
  }
  const written = await writeGeneratedSkills(options.outDir, manifests, extras, options.force)
  for (const path of written) console.log(`wrote ${path}`)
  console.log(`\nnext:  arcade publish ${options.outDir}/${manifests[0]!["id"]}    then  arcade start`)
}

const FAUCET = "https://faucet.circle.com"

/**
 * `arcade init` — nothing to earning, in one command.
 *
 * The only genuinely required input is an identity to be paid at, and by default a seller
 * does not need to bring even that: a key is generated, stored in the OS keychain, and only
 * the address is written to config. Everything else about setup — hosting, ports, a
 * discovery document, facilitator credentials — has no equivalent here, because the runner
 * dials out.
 */
const runInit = Effect.gen(function* () {
  const plan = planIdentity({ seller: flag("--seller"), importKey: flag("--import") })

  let address: string
  let keyInKeychain = false
  let generated: string | undefined

  switch (plan._tag) {
    case "Generate": {
      const wallet = generateWallet()
      address = wallet.address
      if (keychainAvailable()) {
        yield* keychainStore(wallet.address, wallet.privateKey)
        keyInKeychain = true
      } else {
        // No keychain to hide it in. Printing once at creation is the only way a seller on
        // this platform can keep the identity they were just given; saying nothing would
        // hand them an address they can never sign for.
        generated = wallet.privateKey
      }
      break
    }
    case "Import": {
      address = plan.address
      if (keychainAvailable()) {
        yield* keychainStore(plan.address, plan.privateKey)
        keyInKeychain = true
      }
      break
    }
    case "UseAddress": {
      address = plan.address
      break
    }
  }

  const hubUrl = flag("--hub")
  const cfg = defaultConfig({ sellerAddress: address, ...(hubUrl === undefined ? {} : { hubUrl }) })
  yield* writeConfig(cfg)

  const hub = yield* checkHub(cfg.hubUrl)
  const key = yield* resolveSellerKey(address).pipe(Effect.either)

  console.log(`\n  payout address  ${address}`)
  console.log(`  runner          ${cfg.runnerId}`)
  console.log(`  config          ${configPath()}`)
  console.log(
    `  signing key     ${
      key._tag === "Right"
        ? key.right.source === "keychain"
          ? "keychain (never written to disk in the clear)"
          : "ARCADE_SELLER_KEY"
        : "NOT FOUND"
    }`
  )
  console.log(
    `  hub             ${cfg.hubUrl} — ${
      hub.reachable ? `up (${hub.rail ?? "?"} on ${hub.network ?? "?"})` : `unreachable (${hub.error ?? "?"})`
    }`
  )

  if (generated !== undefined) {
    console.log(
      `\n  ⚠  SAVE THIS KEY NOW — there is no keychain on this platform and it is not\n` +
        `     stored anywhere. Without it you cannot prove this payout address is yours.\n\n` +
        `     export ARCADE_SELLER_KEY=${generated}\n`
    )
  } else if (key._tag === "Left" && plan._tag === "UseAddress") {
    console.log(
      `\n  No key found for ${address}. The runner signs its handshake with the key\n` +
        `  controlling your payout address — that is what stops anyone else claiming your\n` +
        `  listings. Either:\n\n` +
        `     arcade init --import 0x<key>     adopt it (stored in your keychain)\n` +
        `     export ARCADE_SELLER_KEY=0x<key> use it for this shell only\n`
    )
  }

  console.log(
    `\nnext:\n` +
      `  1. fund ${address} with testnet USDC — ${FAUCET} (Arc Testnet)\n` +
      `  2. arcade status        confirm everything is wired\n` +
      `  3. arcade start         connect and start serving jobs\n\n` +
      `Your skill code, prompts and provider credentials stay on this machine. The hub\n` +
      `receives a name, a price, and two schemas.`
  )
})

/** `arcade status` — one screen answering "is this working, and am I earning?". */
const runStatus = (skillsDir: string) =>
  Effect.gen(function* () {
    const cfgE = yield* readConfig.pipe(Effect.either)
    if (cfgE._tag === "Left") {
      console.log(`config    MISSING — run: arcade init`)
      return
    }
    const cfg = cfgE.right

    console.log(`config    ${configPath()}`)
    console.log(`runner    ${cfg.runnerId}`)
    console.log(`seller    ${cfg.sellerAddress}`)

    const key = yield* resolveSellerKey(cfg.sellerAddress).pipe(Effect.either)
    console.log(
      `key       ${key._tag === "Right" ? `ok (${key.right.source})` : `MISSING — ${key.left.message.split("\n")[0]}`}`
    )

    const hub = yield* checkHub(cfg.hubUrl)
    console.log(
      `hub       ${cfg.hubUrl} — ${hub.reachable ? `up (${hub.rail ?? "?"})` : `DOWN (${hub.error ?? "?"})`}`
    )

    const balance = yield* fetchBalanceAtomic(cfg.sellerAddress)
    console.log(
      `earnings  ${balance === undefined ? "unavailable (RPC)" : `${formatUsdc(balance)} USDC`}` +
        // Sellers never fund anything: the buyer signs offline and the facilitator pays the
        // gas, so this address only ever receives. Worth saying, because every other way of
        // selling an API starts with "now put in a card".
        (balance === 0n ? "  — nothing yet; you never fund this, earnings land here" : "")
    )

    const skills = yield* loadSkills(skillsDir).pipe(Effect.either)
    if (skills._tag === "Left") {
      console.log(`skills    FAILED: ${skills.left.message}`)
      return
    }
    const gated = gate(skills.right)
    console.log(`skills    ${gated.sellable.length} sellable, ${gated.refused.length} refused (${skillsDir})`)
    for (const s of gated.sellable) {
      console.log(`  ✓ ${s.manifest.id}@${s.manifest.version}  ${s.manifest.price}`)
    }
    for (const r of gated.refused) {
      console.log(`  ✗ ${r.skillId}  ${r.reason.split("\n")[0]}`)
    }
  })

const main = Effect.gen(function* () {
  // Before anything can act. See `wantsHelp`.
  if (wantsHelp) {
    usage()
    return
  }

  // `runner init` kept as an alias: it is in the README, the two-machine script and every
  // doc written so far, and breaking it to rename a command would be a poor trade.
  if (cmd === "init" || (cmd === "runner" && sub === "init")) {
    // `init` MINTS A NEW IDENTITY and rewrites the config. Run against a machine that
    // already has one, it silently replaces the payout address, the runner id and the hub
    // — so a seller with earnings against the old address keeps serving under a new one and
    // finds out later. It cost exactly that here: a stray `--help` (which this CLI does not
    // parse, so it fell through to the command) replaced a live config pointed at
    // production with a fresh identity pointed at localhost.
    //
    // So an existing config is now a refusal rather than something to overwrite. The
    // failure this prevents is not data loss — it is CONTINUING TO WORK under a different
    // identity, which is the same shape as every other quiet failure in this repo.
    if (!args.includes("--force") && (yield* configExists)) {
      // `Effect.either`, NOT a bare read. A config that fails to decode still EXISTS, and
      // its owner may have earnings against the address inside it — so a decode failure has
      // to keep the refusal rather than replace it with a crash. Getting this wrong meant
      // the guard threw instead of refusing on exactly the configs most likely to tempt
      // someone into re-running `init`.
      const cfgE = yield* readConfig.pipe(Effect.either)
      const cfg = cfgE._tag === "Right" ? cfgE.right : undefined
      console.error(
        `there is already a runner on this machine — refusing to replace it.\n\n` +
          `  config   ${configPath()}\n` +
          `  seller   ${cfg?.sellerAddress ?? "(unreadable — but present)"}\n` +
          `  hub      ${cfg?.hubUrl ?? "(unreadable — but present)"}\n\n` +
          `\`init\` mints a NEW payout address and runner id. If this ran by accident, ` +
          `nothing has changed.\n\n` +
          `  to repoint at another hub   edit hubUrl in that file (one field; the socket is derived)\n` +
          `  to store an existing key    arcade wallet import\n` +
          `  to genuinely start over     arcade init --force  (the current address keeps any earnings)`
      )
      process.exit(2)
    }
    yield* runInit
    return
  }

  if (cmd === "status") {
    const idx = args.indexOf("--skills")
    yield* runStatus(idx > -1 && args[idx + 1] !== undefined ? args[idx + 1]! : skillsDirDefault)
    return
  }

  if (cmd === "wallet" && sub === "export") {
    // Deliberately explicit and never part of any other command's output. A seller whose
    // key exists only in the keychain still has to be able to move machines or take it
    // elsewhere — the alternative is an identity they cannot leave with.
    const cfg = yield* readConfig
    if (!keychainAvailable()) {
      console.error("no keychain on this platform — the key lives in ARCADE_SELLER_KEY")
      process.exit(2)
    }
    const stored = yield* keychainRead(cfg.sellerAddress)
    if (stored === undefined) {
      console.error(`no keychain entry for ${cfg.sellerAddress}`)
      process.exit(1)
    }
    console.error(`Payout key for ${cfg.sellerAddress}. Anyone holding this controls that`)
    console.error(`address. Do not paste it into a chat, a commit, or an issue.\n`)
    console.log(stored)
    return
  }

  if (cmd === "wallet" && sub === "import") {
    /*
     * The mirror of `wallet export`, and it exists because tightening `init` revealed there
     * was only ever one door.
     *
     * Both `keychainStore` callsites lived inside `init`, so writing a key to the keychain
     * was only ever available as a SIDE EFFECT of creating an identity. Once `init`
     * correctly refused to replace a live config, an existing runner could no longer get
     * its key into the keychain at all — and nobody deleted that capability, because nobody
     * had written it. It was implied by the bundling.
     *
     * That is why a seller ends up on `export ARCADE_SELLER_KEY` forever: it works, and it
     * dies with the shell. Restart the daemon from a different terminal and the listings
     * vanish — which on a public hub is an empty catalogue nobody can explain.
     *
     * This writes the keychain and NOTHING else. It does not touch the config, mint an
     * address, or change the hub.
     */
    /*
     * READ FROM STDIN BY DEFAULT. A private key passed as an argument is unsafe by
     * construction: it lands in shell history, in `ps` output, and in anything that echoes
     * argv — `bun run` prints the resolved command line, so even piping the value in from
     * the keychain to avoid a `cat` still printed it to the terminal. That happened here,
     * with a real key, which is why this now exists.
     *
     * The positional form is kept because scripts use it, and it warns loudly.
     */
    const positional = args[2] ?? flag("--key")
    let key = positional
    if (positional !== undefined) {
      console.error(
        "WARNING: passing a key as an argument exposes it in shell history, in `ps`, and in\n" +
          "any wrapper that echoes the command line (`bun run` does). Prefer:\n" +
          "  security find-generic-password -s <item> -w | bun run arcade wallet import --stdin\n"
      )
    } else if (args.includes("--stdin")) {
      key = (yield* Effect.promise(() => Bun.stdin.text())).trim()
      if (key === "") key = undefined
    }
    if (key === undefined) {
      console.error(
        `usage: arcade wallet import --stdin        (preferred — reads the key from stdin)\n` +
          `       arcade wallet import 0x<key>       (exposes it in history and process args)\n\n` +
          `Stores the payout key for this runner's existing address in your OS keychain, so\n` +
          `it survives shell restarts. Changes nothing else.`
      )
      process.exit(2)
    }

    const cfg = yield* readConfig
    if (!keychainAvailable()) {
      console.error("no keychain on this platform — the key lives in ARCADE_SELLER_KEY")
      process.exit(2)
    }

    // `planIdentity` THROWS on a malformed key with its own message ("not a private key —
    // expected 32 hex bytes"), so there is no `_tag !== "Import"` branch to write here: a
    // check for it would be unreachable, and an unreachable branch guarding a credential
    // implies a path that does not exist. The throw surfaces through the top-level handler.
    const plan = planIdentity({ importKey: key }) as Extract<
      ReturnType<typeof planIdentity>,
      { _tag: "Import" }
    >

    // THE CHECK THAT MATTERS. A key controlling a different address would store a
    // credential that cannot sign this runner's handshake — the runner would keep
    // announcing `cfg.sellerAddress` and fail to prove it, or worse, quietly become a
    // different seller. Same identity-substitution failure `init` was just guarded against.
    if (plan.address.toLowerCase() !== cfg.sellerAddress.toLowerCase()) {
      console.error(
        `that key controls ${plan.address}, but this runner is configured to be paid at\n` +
          `${cfg.sellerAddress}.\n\n` +
          `Nothing has been stored. Either import the key for the configured address, or\n` +
          `if you meant to become ${plan.address}, that is a new identity: arcade init --force --import <key>`
      )
      process.exit(2)
    }

    yield* keychainStore(plan.address, plan.privateKey)
    console.log(
      `stored the payout key for ${cfg.sellerAddress} in your keychain.\n` +
        `It now survives shell restarts — \`arcade start\` no longer needs ARCADE_SELLER_KEY.`
    )
    return
  }

  if (cmd === "runner" && sub === "seat") {
    // A LOCAL DEVELOPMENT seat — skills on it run for the seller alone and cannot be
    // published. Provisioned separately from the everyday config directory because
    // credentials are keyed per directory in the OS keychain, and because that directory
    // also carries hooks, MCP servers and skills that have no business inside a job.
    const dir = seatDir()
    yield* Effect.tryPromise({
      try: () => mkdir(dir, { recursive: true }),
      catch: (e) => new Error(`cannot create ${dir}: ${String((e as Error)?.message ?? e)}`)
    })

    const loggedIn = yield* Effect.promise(() => seatIsLoggedIn())

    console.log(`seat directory  ${dir}`)
    console.log(`status          ${loggedIn ? "logged in" : "NOT logged in"}`)

    if (loggedIn) {
      console.log(
        `\nThe seat is ready. Skills with "credential": "subscription" run on it — locally\n` +
          `only. Consumer terms forbid selling a seat's output, so those skills cannot be\n` +
          `published; switch the manifest to "api-key" to list one.`
      )
      return
    }

    console.log(`
This seat has no credential yet. Log in once, interactively:

  CLAUDE_CONFIG_DIR=${dir} claude

then run /login inside it and pick the account you want to develop against.

Why a separate seat, and not the one you use every day:

  - credentials are keyed per config directory, so this is its own login
  - your personal hooks, MCP servers and skills stay out of buyers' jobs
  - the quota you develop against is visibly separate from the quota you work on

Nothing about this seat ever reaches the hub. The runner is on your machine and the
credential stays in your keychain — ARCADE only ever sees a job result.`)
    return
  }

  if (cmd === "start" || (cmd === "runner" && sub === "start")) {
    const idx = args.indexOf("--skills")
    const skillsDir = idx > -1 && args[idx + 1] !== undefined ? args[idx + 1]! : skillsDirDefault
    const config = yield* readConfig
    yield* startDaemon({ config, skillsDir })
    return
  }

  if (cmd === "publish") {
    const target = args[1]
    if (target === undefined || target.startsWith("-")) {
      console.error("usage: arcade publish <skillDir|pluginDir|mcp://host/path|openapi.json> [options]\n" +
        "       arcade publish mcp:// [options] -- <cmd> [args…]\n" +
        "Run arcade publish --help for options.")
      process.exit(2)
    }
    const targetKind = publishTargetKind(target)
    // Local directories can legitimately have a .json suffix. Keep URL routing
    // pure, but inspect a local document-looking target before choosing its lane.
    const documentDirectory = targetKind === "openapi" && !/^[a-z][a-z\d+.-]*:/i.test(target)
      ? yield* Effect.promise(() => lstat(target).then(info => info.isDirectory(), () => false)) : false
    if (targetKind !== "dir" && !documentDirectory) {
      yield* Effect.tryPromise({
        try: () => runPublishIntrospection(target, rawArgs.slice(2)),
        catch: (error) => error instanceof Error ? error : new Error("Could not prepare generated listings")
      })
      return
    }
    const singular = yield* Effect.tryPromise({
      try: async () => {
        try { await lstat(join(resolve(target), "arcade.json")); return true }
        catch (error) {
          if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false
          throw new Error("Could not inspect the listing directory")
        }
      },
      catch: () => new Error("Could not inspect the listing directory")
    })
    if (!singular) {
      const handled = yield* Effect.tryPromise({
        try: () => runPublishPlugin(target, rawArgs.slice(2)),
        catch: (error) => error instanceof Error ? error : new Error("Could not prepare plugin listings")
      })
      if (handled) return
    }
    if (args.slice(2).some((option) => option !== "--json")) {
      throw new Error("Directory previews support --json; use --help for generated listing options")
    }
    const dir = target
    const absoluteDir = resolve(dir)
    const parent = dirname(absoluteDir)
    const name = basename(absoluteDir)
    const skills = yield* loadSkills(parent).pipe(
      Effect.mapError(() => new Error("Could not load the skill manifest; check its JSON and engine configuration"))
    )
    const found = skills.find((s) => s.dir.endsWith(`/${name}`))
    if (found === undefined) {
      console.error(`no arcade.json found under ${dir}`)
      process.exit(1)
    }
    // The gate, before anything is presented as publishable. Consumer terms for every
    // provider forbid reselling a subscription seat, so a seat-backed listing must never
    // be shown as something this marketplace can carry.
    try {
      assertManifestPublishable(found.manifest)
    } catch (e) {
      if (e instanceof NotPublishable) {
        console.error(`CANNOT PUBLISH ${e.skillId}\n`)
        console.error(`  engine      ${e.adapter}`)
        console.error(`  credential  ${e.credential}\n`)
        console.error(e.reason)
        process.exit(2)
      }
      throw e
    }

    const preview = createPublishPreview(dir, found.manifest)
    const advisory = preview.advisory
    if (advisory !== undefined) {
      // Publishable, but the provider's terms are not unambiguous. Saying so is not the
      // same as refusing: this repository does not get to settle a licensing question on a
      // seller's behalf, and it should not stay quiet about one either.
      console.error(`ADVISORY\n\n${advisory}\n`)
    }

    if (args.includes("--json")) {
      console.log(JSON.stringify(preview))
      return
    }
    const caps = found.manifest.engine.capabilities
    const adapter = found.manifest.engine.adapter
    const access = adapter === "mcp" ? "MCP server access through its configured HTTPS transport or local subprocess"
      : adapter === "openapi" ? "HTTPS access to the configured API"
      : adapter === "script" ? "seller executable access under the runner sandbox"
      : caps.length === 0 ? "no model tools granted" : caps.join(", ")
    console.log(`engine  ${adapter} (${credentialOf(found.manifest)})`)
    console.log(`grants  ${access}\n`)
    console.log("PUBLISHED to the hub:\n")
    console.log(JSON.stringify(preview.public, null, 2))
    console.log("\nSTAYS ON THIS MACHINE (never transmitted):\n")
    console.log(
      JSON.stringify(
        preview.private,
        null,
        2
      )
    )
    return
  }

  if (cmd === "identity") {
    const result = yield* Effect.either(runIdentityCommand(rawArgs.slice(1), { skillsDirDefault, faucet: FAUCET }))
    if (result._tag === "Left") {
      console.error(result.left.message)
      process.exitCode = result.left.exitCode
    }
    return
  }

  if (cmd === "doctor") {
    const idx = args.indexOf("--skills")
    const skillsDir = idx > -1 && args[idx + 1] !== undefined ? args[idx + 1]! : skillsDirDefault
    const cfg = yield* readConfig.pipe(Effect.either)
    console.log(cfg._tag === "Right" ? `config   ok (${configPath()})` : `config   MISSING — run: arcade runner init`)

    const skills = yield* loadSkills(skillsDir).pipe(Effect.either)
    if (skills._tag === "Left") {
      console.log(`skills   FAILED: ${skills.left.message}`)
      process.exit(1)
    }
    console.log(`skills   ${skills.right.length} loaded from ${skillsDir}`)
    for (const s of skills.right) {
      const env = buildEnv(s.manifest, s.dir)
      const missing = s.manifest.secrets.filter((n) => process.env[n] === undefined)
      console.log(
        `  ${s.manifest.id}@${s.manifest.version}  ${s.manifest.price}  ${s.manifest.engine.adapter}` +
          `  env=[${Object.keys(env).join(",")}]` +
          (missing.length > 0 ? `  MISSING SECRETS: ${missing.join(",")}` : "")
      )
      if (s.manifest.engine.adapter === "openai-api") {
        const { doctorOpenAi } = yield* Effect.promise(() => import("./engines/openai-api.js"))
        const engine = s.manifest.engine
        const check = doctorOpenAi({ systemPrompt: "", capabilities: engine.capabilities,
          ...(engine.credential === undefined ? {} : { credential: engine.credential }),
          ...(engine.model === undefined ? {} : { model: engine.model }) }, env)
        console.log(`    ${check.ok ? "ok" : "FAILED"}: ${check.detail}`)
        if (!check.ok) process.exitCode = 1
      }
    }
    return
  }

  usage()
})

// Importing the helpers must never execute a seller command.
if (import.meta.main) {
  if (rawArgs[0] === "fund") {
    const { runOwnedFundingCli } = await import("../../buyer/src/gateway-funding-cli.ts")
    const { runUnifiedFundingCommand } = await import("../../buyer/src/unified-balance-cli.ts")
    await runOwnedFundingCli(() => runUnifiedFundingCommand(rawArgs, process.env))
  } else Effect.runPromise(main).catch((e) => {
    console.error(String((e as Error)?.message ?? e))
    process.exit(1)
  })
}
