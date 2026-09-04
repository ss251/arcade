import { spawnSync } from "node:child_process"
import { describe, expect, it } from "vitest"

/**
 * The preflight refuses to boot a misconfigured public hub. These tests boot it.
 *
 * `preflight()` runs at module load and calls `process.exit(2)`, so the only honest way to
 * check it is to start the real process with a real environment and read what it did. A
 * unit test against an extracted function would be testing a copy of the guard rather than
 * the guard.
 *
 * `ARCADE_DB` is the case that prompted these. `StoreFromEnv` reads an ABSENT value as a
 * legitimate configuration — it returns the in-memory store, which is right on a laptop —
 * so its absence produces no error at all, just a hub that takes payments, writes receipts
 * to RAM and forgets them on the next deploy. That is the same shape as every other
 * failure this repo has hit: the success signal of "no value" is indistinguishable from
 * "correctly configured", which is why it needs an assertion rather than a convention.
 */

const REPO_ROOT = new URL("../../..", import.meta.url).pathname

/** A public deployment with everything set correctly. Individual tests remove one thing. */
const PUBLIC_OK: Record<string, string> = {
  RAILWAY_SERVICE_ID: "svc_test",
  RAILWAY_VOLUME_MOUNT_PATH: "/data",
  ARCADE_PUBLIC_URL: "https://arcade.test",
  ARCADE_HUB_SECRET: "s3cret",
  ARCADE_FACILITATOR_KEY: "0x1",
  ARCADE_DB: "/data/arcade.db",
  ARCADE_RAIL: "eip3009"
}

/**
 * Boot the hub and report what it said. `env` REPLACES the environment rather than
 * extending it, so a developer machine that happens to export ARCADE_* or RAILWAY_* cannot
 * change the result — the test would otherwise pass or fail based on the shell it ran in.
 */
const boot = (env: Record<string, string>): { out: string; refused: boolean } => {
  const r = spawnSync("bun", ["run", "apps/hub/src/server.ts"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    // A refusal exits immediately, so this only bounds the cases that boot successfully
    // and would otherwise serve forever. Those are asserted on their startup output.
    timeout: 3_500,
    env: { PATH: process.env["PATH"] ?? "", HOME: process.env["HOME"] ?? "", ARCADE_CHAIN_CHECK: "0", ...env }
  })
  return { out: `${r.stdout ?? ""}${r.stderr ?? ""}`, refused: r.status === 2 }
}

const without = (key: string): Record<string, string> => {
  const { [key]: _drop, ...rest } = PUBLIC_OK
  return rest
}

describe("preflight — durability", () => {
  it("refuses a public deployment with no ARCADE_DB, and names the consequence", () => {
    const { out, refused } = boot(without("ARCADE_DB"))
    expect(refused).toBe(true)
    expect(out).toContain("ARCADE_DB")
    expect(out).toContain("lose every one of them on the next deploy")
    // The message should hand over the answer, not just the complaint.
    expect(out).toContain("/data/arcade.db")
  })

  it("refuses when ARCADE_DB is set but sits outside the mounted volume", () => {
    // The nastier half: the file is created, writes succeed, and the container filesystem
    // is discarded on redeploy. Silent loss that looks more correct than the unset case.
    const { out, refused } = boot({ ...PUBLIC_OK, ARCADE_DB: "/app/arcade.db" })
    expect(refused).toBe(true)
    expect(out).toContain("NOT under this service's only mounted volume")
    expect(out).toContain("/data")
  })

  it("accepts a path on the volume", () => {
    // The inverse. If it refused here too, the check would be noise rather than a gate.
    const { out } = boot(PUBLIC_OK)
    expect(out).not.toContain("refusing to start")
  })

  it("warns rather than refusing when durability cannot be verified", () => {
    // Fly and Render mount volumes at operator-chosen paths with no comparable variable,
    // so a refusal there would be a false positive. Saying "not checked" is the honest
    // outcome — the failure mode this repo keeps hitting is a check that stays silent.
    const { out, refused } = boot({
      ...without("RAILWAY_VOLUME_MOUNT_PATH"),
      ARCADE_DB: "/tmp/arcade-preflight.db"
    })
    expect(refused).toBe(false)
    expect(out).toContain("durability could not be verified")
  })
})

describe("preflight — the other public-deployment requirements", () => {
  it("refuses without ARCADE_HUB_SECRET", () => {
    const { out, refused } = boot(without("ARCADE_HUB_SECRET"))
    expect(refused).toBe(true)
    expect(out).toContain("ARCADE_HUB_SECRET")
  })

  it("refuses without ARCADE_PUBLIC_URL, detecting the platform by its own env", () => {
    const { out, refused } = boot(without("ARCADE_PUBLIC_URL"))
    expect(refused).toBe(true)
    expect(out).toContain("ARCADE_PUBLIC_URL")
    expect(out).toContain("a hosting platform was detected")
  })

  it("stays out of the way on a laptop", () => {
    // No platform env and no public URL: every insecure default is the right default here,
    // and a guard that fired locally would train people to ignore it.
    const { out, refused } = boot({ ARCADE_RAIL: "test", PORT: "8899" })
    expect(refused).toBe(false)
    expect(out).not.toContain("refusing to start")
  })
})

describe("preflight — the canary", () => {
  it("warns, but does not refuse, when a public hub has no canary key", () => {
    const result = boot(PUBLIC_OK)
    expect(result.refused).toBe(false)
    expect(result.out).toContain("ARCADE_CANARY_KEY is not set")
    expect(result.out).toContain("no automatic pay-tests")
  })
  it("does not warn about a missing key when one is set", () => {
    const result = boot({ ...PUBLIC_OK, ARCADE_CANARY_KEY: `0x${"1".repeat(64)}` })
    expect(result.refused).toBe(false)
    expect(result.out).not.toContain("ARCADE_CANARY_KEY is not set")
  })
  it("starts the opted-in scoped canary on the offline test rail", () => {
    const result = boot({ ARCADE_RAIL: "test", PORT: "0", ARCADE_CANARY_KEY: `0x${"1".repeat(64)}`,
      ARCADE_CANARY_INTERVAL: "5s" })
    expect(result.refused).toBe(false)
    expect(result.out).toContain("[canary] on — buyer")
    expect(result.out).toContain("every 5000ms per listing")
    expect(result.out).toContain("ARCADE listening")
    expect(result.out).not.toContain("[canary] FAIL")
  })
  it.each(["ARCADE_CANARY_INTERVAL", "ARCADE_CANARY_TICK", "ARCADE_CANARY_MAX_PRICE", "ARCADE_CANARY_KEY"])(
    "refuses invalid %s without exposing its contents", (name) => {
      const result = boot({ ARCADE_RAIL: "test", PORT: "0", ARCADE_CANARY_KEY: `0x${"1".repeat(64)}`,
        [name]: "PRIVATE_CANARY_CONFIG" })
      expect(result.refused).toBe(true)
      expect(result.out).toContain(name)
      expect(result.out).not.toContain("PRIVATE_CANARY_CONFIG")
    }
  )
})
