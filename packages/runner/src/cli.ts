#!/usr/bin/env bun
import { Effect } from "effect"
import {
  advisoryFor,
  assertManifestPublishable,
  credentialOf,
  NotPublishable,
  toPublicListing
} from "@arcade/core"
import { formatUsdc } from "@arcade/core"
import { defaultConfig, configPath, readConfig, writeConfig } from "./config.ts"
import { loadSkills } from "./skills.ts"
import { startDaemon } from "./daemon.ts"
import { buildEnv } from "./exec.ts"
import { gate } from "./publishable.ts"
import { seatDir, seatIsLoggedIn } from "./engines/claude-agent.ts"
import {
  generateWallet,
  keychainAvailable,
  keychainRead,
  keychainStore,
  resolveSellerKey
} from "./wallet.ts"
import { checkHub, fetchBalanceAtomic, planIdentity } from "./onboard.ts"
import { mkdir } from "node:fs/promises"

/**
 * `arcade` — the seller's entire interface.
 *
 *   arcade runner init      one-command setup (D3)
 *   arcade runner start     connect and serve
 *   arcade publish <dir>    show exactly what would be published (and what would NOT)
 *   arcade doctor           verify the environment
 */

const args = process.argv.slice(2)
const cmd = args[0]
const sub = args[1]

const skillsDirDefault = `${process.cwd()}/skills`

const usage = () => {
  console.log(`arcade — publish agent skills as paid endpoints on Arc

  arcade init [--hub URL]                          set up everything: wallet, config, hub
       [--seller 0x..]                             …reuse an address you already control
       [--import 0x<key>]                          …adopt an existing key
  arcade status [--skills DIR]                     identity, hub, skills, earnings
  arcade start [--skills DIR]                      connect to the hub and serve jobs

  arcade publish <skillDir>                        preview the PUBLIC projection
  arcade wallet export                             print the payout key, to back it up
  arcade runner seat                               set up a local development seat
  arcade doctor [--skills DIR]                     validate config + skills
`)
}

const flag = (name: string): string | undefined => {
  const i = args.indexOf(name)
  return i > -1 && args[i + 1] !== undefined && !args[i + 1]!.startsWith("--") ? args[i + 1]! : undefined
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
  // `runner init` kept as an alias: it is in the README, the two-machine script and every
  // doc written so far, and breaking it to rename a command would be a poor trade.
  if (cmd === "init" || (cmd === "runner" && sub === "init")) {
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
    const dir = args[1]
    if (dir === undefined) {
      console.error("usage: arcade publish <skillDir>")
      process.exit(2)
    }
    const parent = dir.replace(/\/[^/]+\/?$/, "")
    const name = dir.replace(/\/$/, "").split("/").pop()!
    const skills = yield* loadSkills(parent === dir ? "." : parent)
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

    const advisory = advisoryFor(found.manifest.engine.adapter, credentialOf(found.manifest))
    if (advisory !== undefined) {
      // Publishable, but the provider's terms are not unambiguous. Saying so is not the
      // same as refusing: this repository does not get to settle a licensing question on a
      // seller's behalf, and it should not stay quiet about one either.
      console.error(`ADVISORY\n\n${advisory}\n`)
    }

    const pub = toPublicListing(found.manifest)
    const caps = found.manifest.engine.capabilities
    console.log(`engine  ${found.manifest.engine.adapter} (${credentialOf(found.manifest)})`)
    console.log(
      `grants  ${caps.length === 0 ? "no tools — this job reaches neither the network nor the filesystem" : caps.join(", ")}\n`
    )
    console.log("PUBLISHED to the hub:\n")
    console.log(JSON.stringify(pub, null, 2))
    console.log("\nSTAYS ON THIS MACHINE (never transmitted):\n")
    console.log(
      JSON.stringify(
        {
          engine: found.manifest.engine,
          secrets: found.manifest.secrets,
          egress: found.manifest.egress,
          workdir: found.manifest.workdir
        },
        null,
        2
      )
    )
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
    }
    return
  }

  usage()
})

Effect.runPromise(main).catch((e) => {
  console.error(String((e as Error)?.message ?? e))
  process.exit(1)
})
