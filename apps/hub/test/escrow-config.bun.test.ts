import { afterEach, expect, test } from "bun:test"
import { chmodSync, existsSync, linkSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { readEscrowHubBoot, openEscrowHubRail } from "../src/escrow-config.ts"
import { openSqliteStore } from "../src/store-sqlite.ts"
import { BrokerLive, BrokerTag } from "../src/broker.ts"
import { Effect } from "effect"
const cleanups: Array<() => void> = []
afterEach(() => { for (const close of cleanups.splice(0).reverse()) close() })
const selection = { chainId: 5042002, rail: "gateway" }
function setup() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "arcade-hub-escrow-config-"))); chmodSync(dir, 0o700)
  cleanups.push(() => rmSync(dir, { recursive: true }))
  const key = generatePrivateKey(), evaluator = privateKeyToAccount(key).address.toLowerCase(), address = (n: string) => `0x${n.repeat(40)}`
  const identity = { chainId: 5042002, escrow: address("1"), implementation: address("2"), hook: address("3"), evaluator,
    treasury: address("5"), token: "0x3600000000000000000000000000000000000000", proxyCodeHash: `0x${"6".repeat(64)}`,
    implementationCodeHash: `0x${"7".repeat(64)}`, hookCodeHash: `0x${"8".repeat(64)}` }
  const config = { identity, gasCapWei: "10000000000000000", expiresInSeconds: 1800, operationTimeoutMs: 30000 }
  const configPath = join(dir, "public.json"), journalPath = join(dir, "actions.sqlite"), dbPath = join(dir, "hub.sqlite")
  writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 })
  const env = { ARCADE_ESCROW_CONFIG: configPath, ARCADE_ESCROW_JOURNAL: journalPath, ARCADE_DB: dbPath,
    ARCADE_HUB_SECRET: "s".repeat(64), ARCADE_PUBLIC_URL: "http://127.0.0.1:8787", ARCADE_FACILITATOR_KEY: key }
  return { dir, key, identity, config, configPath, journalPath, dbPath, env }
}
test("disabled startup never reads unrelated env/key or creates files", () => {
  let reads = 0
  const env = { get ARCADE_FACILITATOR_KEY(): string { reads++; throw Error("PRIVATE_KEY") } }
  expect(readEscrowHubBoot(env, selection)).toBeUndefined(); expect(reads).toBe(0)
})
test("paired explicit config captures full identity without opening any journal or DB", () => {
  const h = setup(), boot = readEscrowHubBoot(h.env, selection)!
  expect(JSON.stringify(boot.identity)).toBe(JSON.stringify(h.identity)); expect(boot.gasCapWei).toBe(10000000000000000n)
  expect(existsSync(h.journalPath)).toBe(false); expect(existsSync(h.dbPath)).toBe(false)
  expect(JSON.stringify(boot, (_, value) => typeof value === "bigint" ? value.toString() : value)).not.toContain(h.key)
})
test("invalid public config refuses before even reading the explicit evaluator key", () => {
  const h = setup(); let reads = 0
  writeFileSync(h.configPath, JSON.stringify({ ...h.config, privateKey: "PRIVATE_FIELD" }))
  expect(() => readEscrowHubBoot({ ...h.env, get ARCADE_FACILITATOR_KEY() { reads++; return h.key } }, selection))
    .toThrow(/^escrow_hub_configuration_refused$/)
  expect(reads).toBe(0)
})
test.each(["config", "journal", "db", "secret", "key", "origin"])("missing %s refuses before journal creation", mode => {
  const h = setup(), env: Record<string, string> = { ...h.env }
  delete env[{ config: "ARCADE_ESCROW_CONFIG", journal: "ARCADE_ESCROW_JOURNAL", db: "ARCADE_DB", secret: "ARCADE_HUB_SECRET",
    key: "ARCADE_FACILITATOR_KEY", origin: "ARCADE_PUBLIC_URL" }[mode]!]
  expect(() => readEscrowHubBoot(env, selection)).toThrow(/^escrow_hub_configuration_refused$/)
  expect(existsSync(h.journalPath)).toBe(false); expect(existsSync(h.dbPath)).toBe(false)
})
test.each(["chain", "test", "short secret", "wrong key", "unknown env", "relative DB", "DB in memory", "origin path"])("invalid %s cannot arm escrow", mode => {
  const h = setup(), env = { ...h.env,
    ...(mode === "short secret" ? { ARCADE_HUB_SECRET: "short" } : {}),
    ...(mode === "wrong key" ? { ARCADE_FACILITATOR_KEY: generatePrivateKey() } : {}),
    ...(mode === "unknown env" ? { ARCADE_ESCROW_RPC_URL: "PRIVATE_PROVIDER" } : {}),
    ...(mode === "relative DB" ? { ARCADE_DB: "hub.sqlite" } : {}),
    ...(mode === "DB in memory" ? { ARCADE_DB: ":memory:" } : {}),
    ...(mode === "origin path" ? { ARCADE_PUBLIC_URL: "https://example.test/private" } : {}) }
  expect(() => readEscrowHubBoot(env, { chainId: mode === "chain" ? 1 : 5042002, rail: mode === "test" ? "test" : "gateway" }))
    .toThrow(/^escrow_hub_configuration_refused$/)
  expect(existsSync(h.journalPath)).toBe(false); expect(existsSync(h.dbPath)).toBe(false)
})
test.each(["private field", "zero gas", "leading gas", "overflow gas", "expiry", "operation", "identity", "utf8", "oversize"])("invalid public %s never opens private files", mode => {
  const h = setup(), config = { ...h.config,
    ...(mode === "private field" ? { privateKey: "PRIVATE_FORBIDDEN" } : {}),
    ...(mode === "zero gas" ? { gasCapWei: "0" } : {}), ...(mode === "leading gas" ? { gasCapWei: "01" } : {}),
    ...(mode === "overflow gas" ? { gasCapWei: String(2n ** 256n) } : {}),
    ...(mode === "expiry" ? { expiresInSeconds: 600 } : {}), ...(mode === "operation" ? { operationTimeoutMs: 300001 } : {}),
    ...(mode === "identity" ? { identity: { ...h.identity, hookCodeHash: "0x" } } : {}) }
  writeFileSync(h.configPath, mode === "utf8" ? new Uint8Array([0xff]) : mode === "oversize" ? " ".repeat(32769) : JSON.stringify(config))
  expect(() => readEscrowHubBoot(h.env, selection)).toThrow(/^escrow_hub_configuration_refused$/)
  expect(existsSync(h.dbPath)).toBe(false); expect(existsSync(h.journalPath)).toBe(false)
})
test.each(["same file", "DB WAL", "DB journal", "journal WAL"])("SQLite path collision %s refuses without overwrite", mode => {
  const h = setup(), env = { ...h.env,
    ...(mode === "same file" ? { ARCADE_ESCROW_JOURNAL: h.configPath } : {}),
    ...(mode === "DB WAL" ? { ARCADE_ESCROW_JOURNAL: h.dbPath + "-wal" } : {}),
    ...(mode === "DB journal" ? { ARCADE_ESCROW_JOURNAL: h.dbPath + "-journal" } : {}),
    ...(mode === "journal WAL" ? { ARCADE_DB: h.journalPath + "-wal" } : {}) }
  const bytes = readFileSync(h.configPath)
  expect(() => readEscrowHubBoot(env, selection)).toThrow(/^escrow_hub_configuration_refused$/)
  expect(readFileSync(h.configPath)).toEqual(bytes); expect(existsSync(h.dbPath)).toBe(false)
})
test.each(["config symlink", "config hardlink", "config writable", "parent public", "DB symlink", "DB WAL symlink", "journal sidecar"])("unsafe %s is refused", mode => {
  const h = setup(), env = { ...h.env }
  if (mode === "config symlink") { symlinkSync(h.configPath, h.configPath + ".link"); env.ARCADE_ESCROW_CONFIG = h.configPath + ".link" }
  if (mode === "config hardlink") linkSync(h.configPath, h.configPath + ".hard")
  if (mode === "config writable") chmodSync(h.configPath, 0o666)
  if (mode === "parent public") chmodSync(h.dir, 0o755)
  if (mode === "DB symlink") symlinkSync(h.configPath, h.dbPath)
  if (mode === "DB WAL symlink") symlinkSync(join(h.dir, "absent"), h.dbPath + "-wal")
  if (mode === "journal sidecar") writeFileSync(h.journalPath + "-journal", "PRIVATE_RETAINED", { mode: 0o600 })
  expect(() => readEscrowHubBoot(env, selection)).toThrow(/^escrow_hub_configuration_refused$/)
  expect(existsSync(h.journalPath)).toBe(false)
})
test("actual durable journal and original broker construct a pure guarded rail, with no network", async () => {
  const h = setup(), boot = readEscrowHubBoot(h.env, selection)!, disk = openSqliteStore(h.dbPath, "config_fixture")
  cleanups.push(disk.close)
  const broker = await Effect.runPromise(BrokerTag.pipe(Effect.provide(BrokerLive)))
  const configBytes = readFileSync(h.configPath), network = globalThis.fetch; let calls = 0
  globalThis.fetch = Object.assign(async () => { calls++; throw Error("PRIVATE_NETWORK_FORBIDDEN") }, { preconnect() { calls++; throw Error("forbidden") } })
  try {
    const opened = openEscrowHubRail(boot, disk.store, broker)
    try {
      const quote = await Effect.runPromise(opened.rail.challenge({ priceAtomic: 300000n, resource: "https://example.test/x/provider/skill",
        payTo: "0x" + "9".repeat(40), escrow: { skillId: "skill", skillVersion: "1.0.0", inputHash: `0x${"a".repeat(64)}`,
          providerAgentId: 8n, timeoutSeconds: 60 } }))
      expect(quote).toMatchObject({ scheme: "erc8183", network: "eip155:5042002", extra: { escrow: h.identity.escrow, evaluator: h.identity.evaluator } })
      expect(existsSync(h.journalPath)).toBe(true); expect(readFileSync(h.configPath)).toEqual(configBytes); expect(calls).toBe(0)
    } finally { opened.close(); opened.close() }
  } finally { globalThis.fetch = network }
})
test.each(["copied plan", "volatile store", "missing broker", "changed config", "missing DB"])("runtime refuses %s before journal open", async mode => {
  const h = setup(), boot = readEscrowHubBoot(h.env, selection)!, disk = mode === "missing DB" ? undefined : openSqliteStore(h.dbPath, "refusal_fixture")
  if (disk) cleanups.push(disk.close)
  const broker = await Effect.runPromise(BrokerTag.pipe(Effect.provide(BrokerLive)))
  const store = disk?.store ?? { escrow: { durability: "durable" } } as Parameters<typeof openEscrowHubRail>[1]
  if (mode === "changed config") writeFileSync(h.configPath, JSON.stringify({ ...h.config, gasCapWei: "2" }))
  const { escrow: _unused, ...withoutEscrow } = broker
  expect(() => openEscrowHubRail(mode === "copied plan" ? { ...boot } : boot,
    mode === "volatile store" ? { ...store, escrow: { ...store.escrow!, durability: "volatile" } } : store,
    mode === "missing broker" ? withoutEscrow : broker)).toThrow(/^escrow_hub_configuration_refused$/)
  expect(existsSync(h.journalPath)).toBe(false)
})
