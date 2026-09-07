import { expect, spyOn, test } from "bun:test"
import { Effect, Fiber } from "effect"
import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadChainConfig } from "@arcade/core"
import { callSkill } from "../src/index.ts"
import { escrowSdkPurchase } from "../src/erc8183-sdk.ts"
import { openEscrowBuyerJournal } from "../../payments/src/erc8183-buyer-journal.ts"
import { buyerFixture, buyer, addr } from "../../payments/test/fixtures/erc8183-buyer.ts"
const body = JSON.stringify({ fixture: true })
async function owned(work: (path: string) => Promise<void>) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "arcade-sdk-cancel-test-"))); chmodSync(dir, 0o700)
  try { await work(join(dir, "purchase.sqlite")) } finally { rmSync(dir, { recursive: true, force: true }) }
}
test("SDK interruption joins driver uncertainty before caller-owned journal close", () => owned(async path => {
  const f = await buyerFixture(), opened = openEscrowBuyerJournal(path), events: string[] = []
  let enter!: () => void; const entered = new Promise<void>(r => { enter = r })
  const config = { identity: f.intent.identity, call: f.intent.call, gasBudgetWei: 6000000n, expiresInSeconds: 1800,
    operationTimeoutMs: 3000, nowSeconds: () => 1000, journal: { ...opened.journal,
      uncertain: async (claim: Parameters<typeof opened.journal.uncertain>[0]) => {
        events.push("uncertain-start"); await Bun.sleep(30); await opened.journal.uncertain(claim); events.push("uncertain-done")
      } } }
  const program = escrowSdkPurchase({ config, account: buyer, requirements: f.input.requirements, body, maxAmountAtomic: 300000n,
    fetch: (async (_url, _init) => { enter(); return new Promise<Response>(() => {}) }) as typeof globalThis.fetch })
    .pipe(Effect.ensuring(Effect.sync(() => { events.push("close"); opened.close() })))
  const fiber = Effect.runFork(program)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([entered, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("fixture did not enter health")), 1000) })])
    clearTimeout(timer)
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(events).toEqual(["uncertain-start", "uncertain-done", "close"])
    const reopened = openEscrowBuyerJournal(path)
    try { expect(await reopened.journal.inspect()).toMatchObject({ state: "uncertain" }); expect(await reopened.journal.claim(f.input, body)).toBeUndefined() }
    finally { reopened.close() }
  } finally { clearTimeout(timer); await Effect.runPromise(Fiber.interrupt(fiber)); opened.close() }
}))
test("a used journal refuses before new capability generation or network IO", () => owned(async path => {
  const f = await buyerFixture(), opened = openEscrowBuyerJournal(path); let fetches = 0
  try {
    await opened.journal.claim(f.input, body)
    const random = spyOn(crypto, "getRandomValues").mockImplementation(() => { throw Error("must not regenerate capability") })
    try {
      const result = await Effect.runPromise(Effect.either(escrowSdkPurchase({ account: buyer, requirements: f.input.requirements,
        body, maxAmountAtomic: 300000n, config: { identity: f.intent.identity, call: f.intent.call, gasBudgetWei: 6000000n,
          expiresInSeconds: 1800, operationTimeoutMs: 3000, nowSeconds: () => 1000, journal: opened.journal },
        fetch: (async (_url: unknown, _init: unknown): Promise<Response> => { fetches++; throw Error("network forbidden") }) as typeof globalThis.fetch })))
      expect(result._tag).toBe("Left")
      if (result._tag === "Left") expect(result.left.method).toBe("escrow")
      expect(random).not.toHaveBeenCalled(); expect(fetches).toBe(0)
      expect(await opened.journal.inspect()).toMatchObject({ state: "claimed" })
    } finally { random.mockRestore() }
  } finally { opened.close() }
}))
test.each(["payTo", "chain", "asset", "resource", "health"])("actual SDK escrow refuses %s drift before gas signing", field => owned(async path => {
  const f = await buyerFixture(), opened = openEscrowBuyerJournal(path), calls: string[] = []
  let signatures = 0, rpc = 0
  const endpoint = f.intent.call.resource, origin = new URL(endpoint).origin,
    listing = { id: "skill", version: "1.0.0", seller: f.intent.call.provider, price: "$0.30", rails: ["erc8183"],
      bounds: { timeoutSec: 60 }, delisted: false, erc8004: { agentId: "8", verified: true, chain: "eip155:5042002", registry: loadChainConfig().erc8004!.identity } },
    records: Record<string, string> = { "arcade.endpoint": endpoint, "arcade.payTo": field === "payTo" ? addr(99) : f.intent.call.provider,
      "arcade.chain": field === "chain" ? "eip155:1" : "eip155:5042002", "arcade.priceAtomic": "300000" },
    requirements = { ...f.input.requirements, ...(field === "asset" ? { asset: addr(99) } : {}),
      ...(field === "resource" ? { resource: endpoint.replace("example.test", "elsewhere.test") } : {}) }
  try {
    const result = await Effect.runPromise(Effect.either(callSkill({ name: "skill.seller.arcade.eth", input: { fixture: true },
      ensReader: { getEnsText: async ({ key }) => records[key] ?? null }, expectedHubUrl: origin,
      account: { ...buyer, signTransaction: async (t: Parameters<typeof buyer.signTransaction>[0]) => { signatures++; return buyer.signTransaction(t) } },
      maxAmountAtomic: 300000n, preferRail: ["erc8183"], escrow: { identity: f.intent.identity, gasBudgetWei: 6000000n,
        expiresInSeconds: 1800, operationTimeoutMs: 3000, nowSeconds: () => 1000, journal: opened.journal,
        rpcFetch: (async (_url: unknown, _init: unknown): Promise<Response> => { rpc++; throw Error("RPC forbidden") }) as typeof globalThis.fetch },
      fetch: (async (url, init) => {
        const path = new URL(String(url)).pathname; calls.push(path)
        if (path === "/listings/skill") return Response.json(listing)
        if (String(url) === endpoint && !new Headers(init?.headers).has("payment-signature")) return Response.json({ x402Version: 2, accepts: [requirements] }, { status: 402 })
        if (path === "/healthz") return Response.json({ ok: true, rail: "eip3009", rails: ["eip3009", "erc8183"], network: "eip155:5042002",
          erc8183: { ...f.intent.identity, treasury: addr(99) } })
        throw Error("unexpected fixture request")
      }) as typeof globalThis.fetch })))
    expect(result._tag).toBe("Left"); expect(signatures).toBe(0); expect(rpc).toBe(0)
    expect(calls).toEqual(["/listings/skill", new URL(endpoint).pathname, ...(field === "health" ? ["/healthz"] : [])])
    if (result._tag === "Left") expect(result.left).toMatchObject({ method: field === "health" ? "escrow" : field === "asset" ? "402" : "beforeSign" })
    expect(await opened.journal.inspect()).toMatchObject({ state: field === "health" ? "uncertain" : "empty" })
  } finally { opened.close() }
}))
