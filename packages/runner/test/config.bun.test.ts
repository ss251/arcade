import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { configPath, defaultConfig, readConfig, writeConfig, wsUrlFor } from "../src/config.ts"

/**
 * `hubWsUrl` used to be persisted next to `hubUrl` and derived only when absent, with
 * nothing reconciling them afterwards. That made repointing the runner two edits wearing
 * the shape of one: change `hubUrl` to a public origin, leave `hubWsUrl` on localhost, and
 * the runner reads listings from production while announcing over the local socket — with
 * every surface reporting health, because both halves are individually working.
 *
 * The fix is that the field no longer exists on disk. These tests pin the boundary rather
 * than a check: the drift state is not detected, it is unconstructible, because only one
 * of the two values is ever written down.
 */

let home: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "arcade-cfg-"))
  mkdirSync(join(home, ".arcade"), { recursive: true })
  process.env["HOME"] = home
})

const realHome = process.env["HOME"]
afterEach(() => {
  process.env["HOME"] = realHome
})

const write = (json: unknown) =>
  writeFileSync(join(home, ".arcade", "config.json"), JSON.stringify(json, null, 2))

const SELLER = "0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF"

const stored = (over: Record<string, unknown> = {}) => ({
  runnerId: "rnr_test",
  sellerAddress: SELLER,
  hubUrl: "http://localhost:8792",
  maxConcurrency: 2,
  ...over
})

describe("wsUrlFor", () => {
  it("upgrades https to wss, not ws", () => {
    // The original derivation was correct and this keeps it that way — a public hub
    // reached over https must not be announced to over a cleartext socket.
    expect(wsUrlFor("https://arcade-hub-production.up.railway.app")).toBe(
      "wss://arcade-hub-production.up.railway.app/ws"
    )
  })

  it("keeps http on ws for local development", () => {
    expect(wsUrlFor("http://localhost:8792")).toBe("ws://localhost:8792/ws")
  })
})

describe("runner config — the socket cannot drift from the hub", () => {
  it("derives hubWsUrl from hubUrl on read", async () => {
    write(stored({ hubUrl: "https://arcade-hub-production.up.railway.app" }))
    const cfg = await Effect.runPromise(readConfig)
    expect(cfg.hubWsUrl).toBe("wss://arcade-hub-production.up.railway.app/ws")
  })

  it("ignores a stale persisted hubWsUrl rather than announcing to it", async () => {
    // The exact trap: hubUrl repointed at production, hubWsUrl left on localhost. Before
    // the fix this runner read listings from production and announced to a local socket.
    write(
      stored({
        hubUrl: "https://arcade-hub-production.up.railway.app",
        hubWsUrl: "ws://localhost:8792/ws"
      })
    )
    const cfg = await Effect.runPromise(readConfig)
    expect(cfg.hubWsUrl).toBe("wss://arcade-hub-production.up.railway.app/ws")
    expect(cfg.hubWsUrl).not.toContain("localhost")
  })

  it("never writes hubWsUrl back to disk", async () => {
    // The boundary. If it were persisted again, the two could disagree again.
    await Effect.runPromise(writeConfig(defaultConfig({ sellerAddress: SELLER })))
    const raw = JSON.parse(readFileSync(configPath(), "utf8")) as Record<string, unknown>
    expect(raw["hubWsUrl"]).toBeUndefined()
    expect(raw["hubUrl"]).toBeDefined()
  })

  it("round-trips a repoint as ONE edit", async () => {
    write(stored())
    const before = await Effect.runPromise(readConfig)
    expect(before.hubWsUrl).toBe("ws://localhost:8792/ws")

    await Effect.runPromise(
      writeConfig({ ...before, hubUrl: "https://arcade-hub-production.up.railway.app" })
    )
    const after = await Effect.runPromise(readConfig)
    expect(after.hubWsUrl).toBe("wss://arcade-hub-production.up.railway.app/ws")
  })
})

describe("runner config — decoded, not cast", () => {
  it("refuses a malformed seller address instead of announcing it", async () => {
    // This file decides which address gets paid. A cast would have accepted this and the
    // failure would surface as an unpayable handshake much later.
    write(stored({ sellerAddress: "not-an-address" }))
    const r = await Effect.runPromise(Effect.either(readConfig))
    expect(r._tag).toBe("Left")
    if (r._tag === "Left") expect(r.left.message).toContain("sellerAddress")
  })

  it("refuses a hubUrl that is not http(s)", async () => {
    write(stored({ hubUrl: "localhost:8792" }))
    const r = await Effect.runPromise(Effect.either(readConfig))
    expect(r._tag).toBe("Left")
  })

  it("refuses a missing field rather than reading it as undefined", async () => {
    const { runnerId: _drop, ...rest } = stored()
    write(rest)
    const r = await Effect.runPromise(Effect.either(readConfig))
    expect(r._tag).toBe("Left")
    if (r._tag === "Left") expect(r.left.message).toContain("runnerId")
  })

  it("accepts a well-formed config", async () => {
    // The inverse — a decoder that rejects everything would pass the tests above and be
    // useless.
    write(stored())
    const cfg = await Effect.runPromise(readConfig)
    expect(cfg.sellerAddress).toBe(SELLER)
    expect(cfg.maxConcurrency).toBe(2)
  })
})
