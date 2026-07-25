#!/usr/bin/env bun
import { Effect } from "effect"
import { toPublicListing } from "@arcade/core"
import { defaultConfig, configPath, readConfig, writeConfig } from "./config.ts"
import { loadSkills } from "./skills.ts"
import { startDaemon } from "./daemon.ts"
import { buildEnv } from "./exec.ts"
import { seatDir, seatIsLoggedIn } from "./engines/claude-seat.ts"
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

  arcade runner init [--seller 0x..] [--hub URL]   create ~/.arcade/config.json
  arcade runner seat                               set up the Claude Code seat (lane B)
  arcade runner start [--skills DIR]               connect to the hub and serve jobs
  arcade publish <skillDir>                        preview the PUBLIC projection
  arcade doctor [--skills DIR]                     validate config + skills
`)
}

const main = Effect.gen(function* () {
  if (cmd === "runner" && sub === "init") {
    const sellerIdx = args.indexOf("--seller")
    const hubIdx = args.indexOf("--hub")
    const cfg = defaultConfig({
      ...(sellerIdx > -1 && args[sellerIdx + 1] !== undefined ? { sellerAddress: args[sellerIdx + 1]! } : {}),
      ...(hubIdx > -1 && args[hubIdx + 1] !== undefined ? { hubUrl: args[hubIdx + 1]! } : {})
    })
    if (cfg.sellerAddress === "") {
      console.error("A seller address is required: arcade runner init --seller 0xYourAddress")
      console.error("(this is where your USDC earnings are paid — nothing else is sent to the hub)")
      process.exit(2)
    }
    yield* writeConfig(cfg)
    console.log(`wrote ${configPath()}`)
    console.log(`  runner  ${cfg.runnerId}`)
    console.log(`  seller  ${cfg.sellerAddress}`)
    console.log(`  hub     ${cfg.hubUrl}`)
    console.log(`\nnext: arcade runner start`)
    return
  }

  if (cmd === "runner" && sub === "seat") {
    // Lane B runs on a Claude Code seat. This deliberately provisions a SEPARATE one
    // rather than reusing the seller's everyday config directory: credentials are keyed
    // per config directory in the OS keychain, and — more importantly — that directory
    // also carries hooks, MCP servers and skills, all of which would otherwise execute
    // inside a stranger's paid job.
    const dir = seatDir()
    yield* Effect.tryPromise({
      try: () => mkdir(dir, { recursive: true }),
      catch: (e) => new Error(`cannot create ${dir}: ${String((e as Error)?.message ?? e)}`)
    })

    const loggedIn = yield* Effect.promise(() => seatIsLoggedIn())

    console.log(`seat directory  ${dir}`)
    console.log(`status          ${loggedIn ? "logged in" : "NOT logged in"}`)

    if (loggedIn) {
      console.log(`\nLane B is ready. Skills using "adapter": "claude-seat" will run on this seat.`)
      return
    }

    console.log(`
This seat has no credential yet. Log in once, interactively:

  CLAUDE_CONFIG_DIR=${dir} claude

then run /login inside it and pick the account whose spare capacity you want to sell.

Why a separate seat, and not the one you use every day:

  - credentials are keyed per config directory, so this is its own login
  - your personal hooks, MCP servers and skills stay out of buyers' jobs
  - the quota you sell is visibly separate from the quota you work on

Nothing about this seat ever reaches the hub. The runner is on your machine and the
credential stays in your keychain — ARCADE only ever sees a job result.`)
    return
  }

  if (cmd === "runner" && sub === "start") {
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
    const pub = toPublicListing(found.manifest)
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
