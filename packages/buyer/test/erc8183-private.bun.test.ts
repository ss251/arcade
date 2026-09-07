import { expect, test } from "bun:test"
import { chmodSync, existsSync, linkSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { readEscrowBuyerBoot, openEscrowBuyerPurchase, escrowBuyerAccount, escrowGasAtomic } from "../src/erc8183-private.ts"
import { escrowBuyerMain } from "../src/erc8183-cli.ts"
import { loadChainConfig } from "@arcade/core"
import { buyerFixture, buyer, addr, ephemeralBuyerKey } from "../../payments/test/fixtures/erc8183-buyer.ts"
async function owned(work: (f: Awaited<ReturnType<typeof buyerFixture>>, dir: string, env: Record<string, string>, config: Record<string, unknown>) => Promise<void>) {
  const f = await buyerFixture(), dir = realpathSync(mkdtempSync(join(tmpdir(), "arcade-buyer-private-test-"))); chmodSync(dir, 0o700)
  const env = { ARCADE_BUYER_ESCROW_CONFIG: join(dir, "config.json"), ARCADE_BUYER_ESCROW_JOURNAL: join(dir, "purchase.sqlite") },
    config = { identity: f.intent.identity, buyer: buyer.address, gasBudgetWei: "6000000", expiresInSeconds: 1800, operationTimeoutMs: 3000 }
  writeFileSync(env.ARCADE_BUYER_ESCROW_CONFIG, JSON.stringify(config), { mode: 0o600 })
  try { await work(f, dir, env, config) } finally { rmSync(dir, { recursive: true, force: true }) }
}
test("disabled/invalid private config never reads a key or creates a journal", () => owned(async (_f, _dir, env) => {
  let keys = 0; const guarded = (e: Record<string, string>) => new Proxy(e, { get(t, p) { if (p === "ARCADE_BUYER_KEY") { keys++; throw Error("PRIVATE_KEY_SENTINEL") } return t[String(p)] } })
  expect(readEscrowBuyerBoot(guarded({}))).toBeUndefined()
  for (const e of [{ ARCADE_BUYER_ESCROW_EXTRA: "PRIVATE_SENTINEL" }, { ARCADE_BUYER_ESCROW_CONFIG: env.ARCADE_BUYER_ESCROW_CONFIG! },
    { ...env, ARCADE_NETWORK: "arc-mainnet" }]) expect(() => readEscrowBuyerBoot(guarded(e))).toThrow("escrow_buyer_configuration_refused")
  const boot = readEscrowBuyerBoot(guarded(env))!; expect(String(boot.buyer)).toBe(buyer.address.toLowerCase())
  expect(keys).toBe(0); expect(existsSync(env.ARCADE_BUYER_ESCROW_JOURNAL!)).toBe(false)
}))
test.each(["parent-mode", "config-mode", "config-symlink", "config-hardlink", "journal-symlink", "sidecar", "huge", "utf8", "extra", "same-role"])("private path/config refuses %s", mode => owned(async (f, dir, env, config) => {
  const path = env.ARCADE_BUYER_ESCROW_CONFIG!, journal = env.ARCADE_BUYER_ESCROW_JOURNAL!
  if (mode === "parent-mode") chmodSync(dir, 0o755)
  if (mode === "config-mode") chmodSync(path, 0o644)
  if (mode === "config-symlink") { const to = join(dir, "other.json"); writeFileSync(to, JSON.stringify(config), { mode: 0o600 }); rmSync(path); symlinkSync(to, path) }
  if (mode === "config-hardlink") linkSync(path, join(dir, "other.json"))
  if (mode === "journal-symlink") symlinkSync(path, journal)
  if (mode === "sidecar") writeFileSync(journal + "-journal", "", { mode: 0o600 })
  if (mode === "huge") writeFileSync(path, " ".repeat(32769))
  if (mode === "utf8") writeFileSync(path, new Uint8Array([0xff]))
  if (mode === "extra") writeFileSync(path, JSON.stringify({ ...config, key: "PRIVATE_SENTINEL" }))
  if (mode === "same-role") writeFileSync(path, JSON.stringify({ ...config, buyer: f.intent.identity.evaluator }))
  expect(() => readEscrowBuyerBoot(env)).toThrow("escrow_buyer_configuration_refused")
}))
test("opening rechecks original captured config and cannot create after drift or a copied boot", () => owned(async (_f, _dir, env, config) => {
  const boot = readEscrowBuyerBoot(env)!
  await expect(openEscrowBuyerPurchase({ ...boot })).rejects.toThrow("escrow_buyer_configuration_refused")
  writeFileSync(env.ARCADE_BUYER_ESCROW_CONFIG!, JSON.stringify({ ...config, gasBudgetWei: "7000000" }))
  await expect(openEscrowBuyerPurchase(boot)).rejects.toThrow("escrow_buyer_configuration_refused")
  expect(existsSync(env.ARCADE_BUYER_ESCROW_JOURNAL!)).toBe(false)
}))
test("used private file refuses without mutation and cannot export invented funding evidence", () => owned(async (f, _dir, env) => {
  const boot = readEscrowBuyerBoot(env)!, opened = await openEscrowBuyerPurchase(boot)
  try {
    await expect(opened.evidence({ jobId: "job_fake", authorizedRail: "erc8183", authorizedAmountAtomic: 300000n,
      status: "succeeded", result: {}, receipt: { settled: true }, fencedResult: "fixture" })).rejects.toThrow("escrow_buyer_evidence_unavailable")
    await opened.config.journal.claim(f.input, JSON.stringify({ fixture: true }))
  } finally { opened.close() }
  const before = readFileSync(env.ARCADE_BUYER_ESCROW_JOURNAL!)
  await expect(openEscrowBuyerPurchase(boot)).rejects.toThrow("escrow_buyer_configuration_refused")
  expect(readFileSync(env.ARCADE_BUYER_ESCROW_JOURNAL!)).toEqual(before)
}))
test("gas rounds upward once and signer mismatch/cancellation uses fixed private diagnostics", () => owned(async (_f, _dir, env) => {
  expect([0n, 1n, 1000000000000n, 1000000000001n].map(escrowGasAtomic)).toEqual([0n, 1n, 1n, 2n])
  const boot = readEscrowBuyerBoot(env)!, controller = new AbortController(); let keys = 0
  const keyEnv = new Proxy({}, { get() { keys++; return "PRIVATE_SENTINEL" } })
  expect(() => escrowBuyerAccount(boot, keyEnv, controller.signal)).toThrow("escrow_buyer_signer_unavailable")
  controller.abort(); expect(() => escrowBuyerAccount(boot, keyEnv, controller.signal)).toThrow("escrow_buyer_signer_unavailable")
  expect(keys).toBe(1); expect(() => escrowBuyerAccount({ ...boot, buyer: addr(99) }, keyEnv, new AbortController().signal)).toThrow()
}))
test("actual CLI refuses a used file before key or network and retains bytes", () => owned(async (f, _dir, env) => {
  const boot = readEscrowBuyerBoot(env)!, opened = await openEscrowBuyerPurchase(boot)
  await opened.config.journal.claim(f.input, '{"fixture":true}'); opened.close()
  const before = readFileSync(env.ARCADE_BUYER_ESCROW_JOURNAL!), lines: string[] = []; let keys = 0, fetches = 0
  const guarded = new Proxy(env, { get(t, p) { if (p === "ARCADE_BUYER_KEY") { keys++; throw Error("PRIVATE_KEY") } return t[String(p)] } })
  expect(await escrowBuyerMain(["skill", "--rail", "erc8183", "--hub", "https://example.test", "--seller", f.intent.call.provider,
    "--input", '{"fixture":true}', "--max-amount", "0.30"], { env: guarded, write: async line => { lines.push(line) },
    fetch: (async (_url: unknown, _init: unknown): Promise<Response> => { fetches++; throw Error() }) as typeof globalThis.fetch })).toBe(2)
  expect(keys).toBe(0); expect(fetches).toBe(0); expect(readFileSync(env.ARCADE_BUYER_ESCROW_JOURNAL!)).toEqual(before)
  expect(lines.join()).not.toContain("PRIVATE_KEY")
}))
test("actual CLI cancellation joins SDK durable uncertainty before closing private journal", () => owned(async (f, _dir, env) => {
  const controller = new AbortController(), lines: string[] = []; let enter!: () => void, timer: ReturnType<typeof setTimeout> | undefined
  const entered = new Promise<void>(r => { enter = r })
  const running = escrowBuyerMain(["skill", "--rail", "erc8183", "--hub", "https://example.test", "--seller", f.intent.call.provider,
    "--input", '{"fixture":true}', "--max-amount", "0.30"], { env: { ...env, ARCADE_BUYER_KEY: ephemeralBuyerKey }, signal: controller.signal,
    nowSeconds: () => 1000, write: async line => { lines.push(line) }, fetch: (async url => {
      const path = new URL(String(url)).pathname
      if (path === "/listings/skill") return Response.json({ id: "skill", version: "1.0.0", seller: f.intent.call.provider, price: "$0.30", rails: ["erc8183"],
        bounds: { timeoutSec: 60 }, delisted: false, erc8004: { agentId: "8", verified: true, chain: "eip155:5042002", registry: loadChainConfig().erc8004!.identity } })
      if (path === "/healthz") { enter(); return new Promise<Response>(() => {}) }
      return Response.json({ x402Version: 2, accepts: [f.input.requirements] }, { status: 402 })
    }) as typeof globalThis.fetch })
  try {
    await Promise.race([entered, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("health fixture not entered")), 1000) })]); clearTimeout(timer)
    controller.abort(); expect(await running).toBe(1)
    const { openEscrowBuyerJournal } = await import("../../payments/src/erc8183-buyer-journal.ts"), reopened = openEscrowBuyerJournal(env.ARCADE_BUYER_ESCROW_JOURNAL!)
    try { expect(await reopened.journal.inspect()).toMatchObject({ state: "uncertain" }) } finally { reopened.close() }
    expect(lines.join()).toContain("escrow_buyer_uncertain"); expect(lines.join()).not.toContain(ephemeralBuyerKey)
  } finally { clearTimeout(timer); controller.abort(); await running }
}))
