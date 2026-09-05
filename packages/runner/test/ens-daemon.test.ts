import { afterEach, describe, expect, it, vi } from "vitest"
import { Effect, Fiber, Schema } from "effect"
import { privateKeyToAccount } from "viem/accounts"
import { decodeEnsState, loadEnsDeployments, SkillManifest } from "@arcade/core"
import { ensTickerFor, startDaemon } from "../src/daemon.ts"
import { defaultConfig } from "../src/config.ts"

const fixtureKey = `0x${"01".repeat(32)}` as const
const sellerKey = `0x${"02".repeat(32)}` as const
const seller = privateKeyToAccount(sellerKey).address
const daemon = privateKeyToAccount(fixtureKey).address
const deployment = loadEnsDeployments()[0]!
const state = decodeEnsState({ root: "arcade-hub.eth", sellerLabel: "ss251", seller, daemon, deploymentSet: "A", universalResolver: deployment.universalResolver, sellerRegistry: `0x${"55".repeat(20)}`, skillRegistry: `0x${"33".repeat(20)}`, resolver: `0x${"44".repeat(20)}`, ttlSeconds: 3600, skills: [{ skillId: "usdc-flow-check", label: "usdc-flow-check", name: "usdc-flow-check.ss251.arcade-hub.eth", priceAtomic: "10000" }] })
const skill = { dir: "/unused-fixture", manifest: Schema.decodeUnknownSync(SkillManifest)({ id: "usdc-flow-check", version: "1.0.0", serviceName: "Fixture", description: "offline fixture", tags: [], price: "$0.01", bounds: { timeoutSec: 10 }, inputSchema: {}, outputSchema: {}, engine: { adapter: "script", entry: "unused.ts" }, secrets: [], egress: [] }) }
vi.mock("../src/skills.ts", () => ({ loadSkills: () => Effect.succeed([skill]) }))
vi.mock("../src/wallet.ts", () => ({ resolveSellerKey: () => Effect.succeed({ privateKey: sellerKey }) }))
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const env = { ARCADE_ENS_STATE: "/tmp/arcade-test-state.json", ARCADE_ENS_JOURNAL: "/tmp/arcade-test-journal.json", ARCADE_ENS_DAEMON_KEY: fixtureKey }

describe("optional ENS ticker configuration", () => {
  it("does not even inspect a key when state is absent or no state skills are served", async () => {
    let keyReads = 0
    const guarded = { get ARCADE_ENS_DAEMON_KEY(): string { keyReads++; throw Error("SECRET") } }
    expect(await ensTickerFor({ skills: [skill], env: guarded, readState: async () => undefined })).toBeUndefined()
    expect(await ensTickerFor({ skills: [], env: guarded, readState: async () => state })).toBeUndefined()
    expect(keyReads).toBe(0)
  })
  it("distinguishes malformed state from absent state using fixed diagnostics, never fabricated expiry", async () => {
    const lines: string[] = []
    expect(await ensTickerFor({ skills: [skill], env: {}, readState: async () => { throw Error("SECRET malformed state") }, log: line => lines.push(line) })).toBeUndefined()
    expect(lines.join()).toContain("state")
    expect(lines.join()).not.toContain("SECRET")
    expect(lines.join()).not.toContain("expire in")
  })
  it("warns on a missing key and refuses wrong seller/daemon identity before creating a writer", async () => {
    const writerFor = vi.fn(() => ({ renew: async () => "", setText: async () => "" })), lines: string[] = []
    for (const options of [
      { env: {}, expectedSeller: seller },
      { env, expectedSeller: daemon },
      { env: { ...env, ARCADE_ENS_DAEMON_KEY: sellerKey }, expectedSeller: seller }
    ]) expect(await ensTickerFor({ skills: [skill], readState: async () => state, writerFor, log: line => lines.push(line), ...options })).toBeUndefined()
    expect(writerFor).not.toHaveBeenCalled()
    expect(lines.join()).toContain("ARCADE_ENS_DAEMON_KEY")
    expect(lines.join()).not.toContain(fixtureKey)
    expect(lines.join()).not.toContain(sellerKey)
  })
  it("creates a scoped ticker with the supplied serving guard without any file or network IO", async () => {
    let active = false
    const renew = vi.fn(async () => `0x${"aa".repeat(32)}`)
    const ticker = await ensTickerFor({ skills: [skill], env, expectedSeller: seller, readState: async () => state, writerFor: () => ({ renew, setText: async () => "" }), isActive: () => active, log: () => {} })
    expect(ticker).toBeDefined()
    await ticker?.tick(); expect(renew).not.toHaveBeenCalled()
    active = true; await ticker?.tick(); expect(renew).toHaveBeenCalledTimes(1)
    ticker?.stop(); await ticker?.tick(); expect(renew).toHaveBeenCalledTimes(1)
  })
})

class OfflineSocket extends EventTarget {
  static OPEN = 1
  static sockets: OfflineSocket[] = []
  readyState = 0
  sent: string[] = []
  constructor(readonly url: string) { super(); OfflineSocket.sockets.push(this) }
  open() { this.readyState = 1; this.dispatchEvent(new Event("open")) }
  send(message: string) { if (this.readyState !== 1) throw Error("closed fixture"); this.sent.push(message) }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.dispatchEvent(new Event("close")) }
}
const begin = async (factory: NonNullable<Parameters<typeof startDaemon>[0]["ensTickerFactory"]>) => {
  vi.useFakeTimers()
  OfflineSocket.sockets = []
  vi.stubGlobal("WebSocket", OfflineSocket)
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  const fiber = Effect.runFork(startDaemon({ config: defaultConfig({ sellerAddress: seller, hubUrl: "http://127.0.0.1:4040" }), skillsDir: "/unused-fixture", ensTickerFactory: factory }))
  await vi.advanceTimersByTimeAsync(1)
  return fiber
}
describe("actual daemon lifecycle with offline socket boundary", () => {
  it("uses one ticker across reconnects, gates writes while disconnected, and owns socket/timer cleanup", async () => {
    const tick = vi.fn(async () => {}), stop = vi.fn()
    let guard: (() => boolean) | undefined
    const factory = vi.fn(async a => { guard = a.isActive; return { tick, stop } })
    const fiber = await begin(factory)
    try {
      expect(OfflineSocket.sockets).toHaveLength(1)
      expect(tick).not.toHaveBeenCalled()
      const first = OfflineSocket.sockets[0]!
      first.open(); await vi.advanceTimersByTimeAsync(1)
      expect(first.sent.some(line => JSON.parse(line)._tag === "Hello")).toBe(true)
      expect(guard?.()).toBe(true); expect(tick).toHaveBeenCalledTimes(1)
      first.close(); expect(guard?.()).toBe(false)
      await vi.advanceTimersByTimeAsync(2999)
      expect(tick).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(2)
      expect(OfflineSocket.sockets).toHaveLength(2)
      OfflineSocket.sockets[1]!.open(); await vi.advanceTimersByTimeAsync(1)
      expect(factory).toHaveBeenCalledTimes(1)
      expect(tick).toHaveBeenCalledTimes(2)
      await Effect.runPromise(Fiber.interrupt(fiber))
      expect(stop).toHaveBeenCalledTimes(1)
      expect(guard?.()).toBe(false)
      expect(OfflineSocket.sockets[1]?.readyState).toBe(3)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(OfflineSocket.sockets).toHaveLength(2)
      expect(tick).toHaveBeenCalledTimes(2)
    } finally { await Effect.runPromise(Fiber.interrupt(fiber)) }
  })
  it("stops a late initializer after daemon cancellation without starting a ticker", async () => {
    let ready!: (ticker: { tick: () => Promise<void>; stop: () => void }) => void
    const tick = vi.fn(async () => {}), stop = vi.fn()
    const fiber = await begin(() => new Promise(resolve => { ready = resolve }))
    OfflineSocket.sockets[0]!.open()
    await Effect.runPromise(Fiber.interrupt(fiber))
    ready({ tick, stop }); await vi.advanceTimersByTimeAsync(1)
    expect(stop).toHaveBeenCalledTimes(1); expect(tick).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(OfflineSocket.sockets).toHaveLength(1)
  })
})
