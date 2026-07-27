import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * `arcade init` mints a NEW identity. These two guards exist because it did that to a live
 * one.
 *
 * `arcade init --help` was typed to read the flags. The CLI did not parse `--help`, so it
 * fell through to the command, generated a fresh key, and rewrote the config — replacing a
 * payout address with earnings against it and a hub pointed at production with a new
 * address pointed at localhost. Nothing errored. `init` reported success, because from its
 * point of view it had done its job.
 *
 * Both halves are guarded now, and both are tested by running the real binary with an
 * isolated HOME — a guard that failed here would clobber a real config, which is precisely
 * the thing being prevented.
 */

const REPO_ROOT = new URL("../../..", import.meta.url).pathname

const withHome = () => {
  const home = mkdtempSync(join(tmpdir(), "arcade-cli-"))
  mkdirSync(join(home, ".arcade"), { recursive: true })
  return home
}

const run = (home: string, argv: ReadonlyArray<string>) => {
  const r = spawnSync("bun", ["run", "packages/runner/src/cli.ts", ...argv], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 30_000,
    env: { PATH: process.env["PATH"] ?? "", HOME: home }
  })
  return { out: `${r.stdout ?? ""}${r.stderr ?? ""}`, code: r.status }
}

const EXISTING = {
  runnerId: "rnr_existing",
  sellerAddress: "0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF",
  hubUrl: "https://arcade-hub-production.up.railway.app",
  maxConcurrency: 2
}

const seed = (home: string, cfg: unknown = EXISTING) =>
  writeFileSync(join(home, ".arcade", "config.json"), JSON.stringify(cfg, null, 2))

const configOf = (home: string) =>
  JSON.parse(readFileSync(join(home, ".arcade", "config.json"), "utf8")) as Record<string, unknown>

describe("arcade init — refuses to replace a live runner", () => {
  it("does not overwrite an existing config", () => {
    const home = withHome()
    seed(home)
    const { out, code } = run(home, ["init"])

    expect(code).toBe(2)
    expect(out).toContain("refusing to replace it")
    // The identity is untouched — this is the assertion that matters.
    expect(configOf(home)["sellerAddress"]).toBe(EXISTING.sellerAddress)
    expect(configOf(home)["runnerId"]).toBe("rnr_existing")
    expect(configOf(home)["hubUrl"]).toBe(EXISTING.hubUrl)
  })

  it("names the identity it is protecting, so the refusal is actionable", () => {
    const home = withHome()
    seed(home)
    const { out } = run(home, ["init"])
    expect(out).toContain(EXISTING.sellerAddress)
    expect(out).toContain(EXISTING.hubUrl)
    // And says how to do each thing someone might actually have wanted.
    expect(out).toContain("--force")
    expect(out).toContain("edit hubUrl")
  })

  it("refuses even when the existing config is malformed", () => {
    // A config that fails to decode is still an identity someone may have earnings against.
    // Replacing it because it did not parse would be the worst reading of the situation.
    const home = withHome()
    seed(home, { runnerId: "x" })
    const { out, code } = run(home, ["init"])
    expect(code).toBe(2)
    expect(out).toContain("refusing to replace it")
  })

  it("proceeds on a genuinely fresh machine", () => {
    // The inverse. A guard that blocked first-run setup would break the one command the
    // whole seller story rests on.
    //
    // `--seller` on purpose: an isolated HOME does NOT isolate the macOS Keychain, so the
    // key-generating path would write to the developer's real keychain and stall on an
    // authorization dialog. Taking the address path exercises the guard without touching a
    // credential store this test has no business writing to.
    const home = withHome()
    const { out } = run(home, ["init", "--seller", EXISTING.sellerAddress])
    expect(out).toContain("payout address")
    expect(existsSync(join(home, ".arcade", "config.json"))).toBe(true)
  })
})

describe("arcade --help never acts", () => {
  it("prints usage instead of running init", () => {
    const home = withHome()
    seed(home)
    const { out } = run(home, ["init", "--help"])

    expect(out).toContain("publish agent skills as paid endpoints")
    // The tell that it did NOT run: init prints this line on success.
    expect(out).not.toContain("payout address")
    expect(configOf(home)["sellerAddress"]).toBe(EXISTING.sellerAddress)
  })

  it("prints usage for -h and for no arguments at all", () => {
    const home = withHome()
    seed(home)
    for (const argv of [["-h"], ["init", "-h"], []]) {
      const { out } = run(home, argv)
      expect(out, argv.join(" ")).toContain("publish agent skills as paid endpoints")
      expect(out, argv.join(" ")).not.toContain("payout address")
    }
    expect(configOf(home)["sellerAddress"]).toBe(EXISTING.sellerAddress)
  })
})
