import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { Effect } from "effect"
import { mkdtemp, open, readdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { beginAgentRegistration, configPath, defaultConfig, readConfig, recordAgent, recordPendingAgent, writeConfig } from "../src/config.ts"

let directory: string
let previous: string | undefined
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "arcade-identity-config-"))
  previous = process.env["ARCADE_CONFIG_PATH"]
  process.env["ARCADE_CONFIG_PATH"] = join(directory, "config.json")
})
afterEach(async () => {
  if (previous === undefined) delete process.env["ARCADE_CONFIG_PATH"]
  else process.env["ARCADE_CONFIG_PATH"] = previous
  await rm(directory, { recursive: true, force: true })
})
const seller = `0x${"aa".repeat(20)}`
const tx = `0x${"ab".repeat(32)}`
const identity = { agentId: "42", agentURI: "https://hub.example/listings/a/agent-registration.json", registrationTx: tx, registeredAtMs: 100,
  registry: `0x${"88".repeat(20)}`, chainId: 5042002 }
const base = () => defaultConfig({ sellerAddress: seller, hubUrl: "https://hub.example" })
const run = Effect.runPromise

describe("persisted seller-owned identities", () => {
  it("flushes the file and containing directory before a checkpoint succeeds", async () => {
    // Observe the real FileHandle prototype: both handles must call fsync, not just
    // finish a buffered write or make the replacement atomically visible.
    const handle = await open(join(directory, "probe"), "wx")
    const prototype = Object.getPrototypeOf(handle)
    await handle.close()
    const original = prototype.sync
    const events: string[] = []
    const sync = spyOn(prototype, "sync").mockImplementation(async function (this: Awaited<ReturnType<typeof open>>) {
      events.push((await this.stat()).isDirectory() ? "directory" : "file")
      return original.call(this)
    })
    try {
      await run(writeConfig(base()))
      expect(events).toEqual(["file", "directory"])
    } finally { sync.mockRestore() }
  })
  it("refuses mismatched confirmations without clearing a pending broadcast", async () => {
    await run(writeConfig(base()))
    const pending = { txHash: tx, agentURI: identity.agentURI, registry: identity.registry, chainId: 5042002, submittedAtMs: 99 }
    await run(recordPendingAgent("a", pending))
    const before = await Bun.file(configPath()).text()
    for (const over of [{ registrationTx: `0x${"cd".repeat(32)}` }, { agentURI: "https://other.example/a" },
      { registry: seller }, { chainId: 1 }, { registry: undefined }, { chainId: undefined }]) {
      expect((await run(Effect.either(recordAgent("a", { ...identity, ...over }))))._tag).toBe("Left")
      expect(await Bun.file(configPath()).text()).toBe(before)
    }
    const { txHash: _hash, ...intent } = pending
    await run(beginAgentRegistration("b", intent))
    expect((await run(Effect.either(recordAgent("b", identity))))._tag).toBe("Left")
    expect((await run(readConfig)).pendingAgents?.b).toBeDefined()
  })
  it("fails closed on a flush failure, preserving prior bytes or the replacement journal", async () => {
    await run(writeConfig(base()))
    const handle = await open(join(directory, "probe"), "wx")
    const prototype = Object.getPrototypeOf(handle)
    await handle.close()
    const original = prototype.sync
    for (const failingKind of ["file", "directory"]) {
      const before = await Bun.file(configPath()).text()
      const sync = spyOn(prototype, "sync").mockImplementation(async function (this: Awaited<ReturnType<typeof open>>) {
        if (((await this.stat()).isDirectory() ? "directory" : "file") === failingKind) throw new Error("private IO diagnostic")
        return original.call(this)
      })
      try {
        const result = await run(Effect.either(beginAgentRegistration("a", {
          agentURI: identity.agentURI, registry: identity.registry, chainId: identity.chainId, submittedAtMs: 99
        })))
        expect(result._tag).toBe("Left")
        expect(JSON.stringify(result)).not.toContain("private IO diagnostic")
        if (failingKind === "file") expect(await Bun.file(configPath()).text()).toBe(before)
        else expect((await run(readConfig)).pendingAgents?.a).toBeDefined()
        expect((await readdir(directory)).sort()).toEqual(["config.json", "probe"])
      } finally { sync.mockRestore() }
    }
  })
  it("permits approval metadata updates but never replaces an existing confirmed identity", async () => {
    await run(writeConfig(base()))
    await run(recordAgent("a", identity))
    const approved = { ...identity, operator: seller, approvalTx: tx }
    await run(recordAgent("a", approved))
    expect((await run(readConfig)).agents.a).toEqual(approved)
    const before = await Bun.file(configPath()).text()
    for (const over of [{ agentId: "43" }, { registrationTx: `0x${"cd".repeat(32)}` },
      { agentURI: "https://other.example/a" }, { registry: seller }, { chainId: 1 }, { registeredAtMs: 101 }]) {
      expect((await run(Effect.either(recordAgent("a", { ...approved, ...over }))))._tag).toBe("Left")
      expect(await Bun.file(configPath()).text()).toBe(before)
    }
  })
  it("uses an explicit test path and defaults old configs to empty agents", async () => {
    await run(writeConfig(base()))
    expect(configPath()).toBe(join(directory, "config.json"))
    expect((await run(readConfig)).agents).toEqual({})
    expect(await Bun.file(configPath()).json()).not.toHaveProperty("agents")
  })
  it("round trips full public identity data without secrets or derived fields", async () => {
    await run(writeConfig(base()))
    await run(recordAgent("a", { ...identity, operator: seller, approvalTx: tx, privateKey: "SECRET_SENTINEL" } as typeof identity))
    expect((await run(readConfig)).agents.a).toMatchObject(identity)
    const raw = await Bun.file(configPath()).text()
    expect(raw).toContain(tx) // A real transaction hash is not a secret key.
    expect(raw).not.toContain("SECRET_SENTINEL"); expect(raw).not.toContain("privateKey"); expect(raw).not.toContain("hubWsUrl")
  })
  it("serializes concurrent read-modify-writes without losing another skill", async () => {
    await run(writeConfig(base()))
    await Promise.all(Array.from({ length: 12 }, (_, i) => run(recordAgent(`skill-${i}`, { ...identity, agentId: String(i) }))))
    const cfg = await run(readConfig)
    expect(Object.keys(cfg.agents)).toHaveLength(12)
    expect(cfg.sellerAddress).toBe(seller); expect(cfg.hubUrl).toBe("https://hub.example")
  })
  it("persists a submitted transaction before confirmation and clears only its journal on confirmed registration", async () => {
    await run(writeConfig(base()))
    const pending = { txHash: tx, agentURI: identity.agentURI, registry: identity.registry, chainId: 5042002, submittedAtMs: 99 }
    await run(recordPendingAgent("a", pending)); await run(recordPendingAgent("b", pending))
    expect((await run(readConfig)).pendingAgents?.a).toEqual(pending)
    await run(recordAgent("a", identity))
    const next = await run(readConfig)
    expect(next.pendingAgents?.a).toBeUndefined(); expect(next.pendingAgents?.b).toEqual(pending)
    expect(next.agents.a).toEqual(identity)
  })
  it("journals intent before broadcasting and refuses a competing attempt even without a known hash", async () => {
    await run(writeConfig(base()))
    const intent = { agentURI: identity.agentURI, registry: identity.registry, chainId: 5042002, submittedAtMs: 99 }
    const results = await Promise.all([run(Effect.either(beginAgentRegistration("a", intent))), run(Effect.either(beginAgentRegistration("a", intent)))])
    expect(results.filter(result => result._tag === "Right")).toHaveLength(1)
    expect((await run(readConfig)).pendingAgents?.a).toEqual(intent)
    expect((await run(Effect.either(recordPendingAgent("a", { ...intent, registry: seller, txHash: tx }))))._tag).toBe("Left")
    await run(recordPendingAgent("a", { ...intent, txHash: tx }))
    expect((await run(readConfig)).pendingAgents?.a?.txHash).toBe(tx)
  })
  it("does not modify an existing file for invalid identity or malformed existing config", async () => {
    await run(writeConfig(base()))
    const before = await Bun.file(configPath()).text()
    for (const over of [{ agentId: "-1" }, { agentId: (2n ** 256n).toString() }, { registeredAtMs: Infinity }, { registrationTx: "not-a-hash" }]) {
      expect((await run(Effect.either(recordAgent("a", { ...identity, ...over }))))._tag).toBe("Left")
      expect(await Bun.file(configPath()).text()).toBe(before)
    }
    await Bun.write(configPath(), '{"sellerAddress":"not-a-config"}')
    expect((await run(Effect.either(recordAgent("a", identity))))._tag).toBe("Left")
    expect(await Bun.file(configPath()).text()).toBe('{"sellerAddress":"not-a-config"}')
  })
  it("rejects invalid skill keys before rewriting", async () => {
    await run(writeConfig(base()))
    for (const id of ["__proto__", "../a", "", "constructor"]) {
      expect((await run(Effect.either(recordAgent(id, identity))))._tag).toBe("Left")
    }
    expect((await run(readConfig)).agents).toEqual({})
  })
})
