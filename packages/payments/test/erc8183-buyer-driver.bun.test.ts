import { describe, expect, test } from "bun:test"
import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { keccak256, type Hex } from "viem"
import { formatPrice } from "@arcade/core"
import { createEscrowBuyerDriver, type EscrowBuyerChain } from "../src/erc8183-buyer-driver.ts"
import { openEscrowBuyerJournal } from "../src/erc8183-buyer-journal.ts"
import { buyerFixture, buyer, hash } from "./fixtures/erc8183-buyer.ts"
const body = JSON.stringify({ fixture: true }), jobId = "job_" + "a".repeat(32), token = "b".repeat(32)
type Kind = "create" | "approve" | "fund" | "budget"
type Options = { fail?: string; changed?: "balance" | "allowance" | "provider" | "nonce" | "clock" | "authority";
  badReceipt?: Kind; cancel?: string; hang?: string; deadline?: number;
  terms?: "nonce" | "gas"; wrongSignature?: boolean; wrongBudgetRaw?: boolean }
async function fixture(options: Options, work: (f: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "arcade-buyer-driver-test-"))); chmodSync(dir, 0o700)
  const f = await setup(join(dir, "purchase.sqlite"), options)
  try { await work(f) } finally { f.controller.abort(); f.open.close(); rmSync(dir, { recursive: true, force: true }) }
}
async function setup(path: string, options: Options) {
  const controller = new AbortController(), open = openEscrowBuyerJournal(path), calls: string[] = []
  const fixtures = {} as Record<Kind, Awaited<ReturnType<typeof buyerFixture>>>
  for (const kind of ["create", "budget", "approve", "fund"] as const) fixtures[kind] = await buyerFixture(kind)
  let now = 1000, signed = false
  const edge = async (label: string) => {
    calls.push(label)
    if (options.cancel === label) controller.abort()
    if (options.hang === label) await new Promise<never>(() => {})
    if (options.fail === label) throw Error("private upstream detail must not escape")
  }
  const moved = async (kind: Kind) => {
    const f = fixtures[kind], offset = ({ create: 0, budget: 1, approve: 2, fund: 3 })[kind], nonce = kind === "budget" ? 3 : ({ create: 3, approve: 4, fund: 5 })[kind],
      raw = kind === "budget" ? f.raw : await buyer.signTransaction({ ...f.transaction, nonce }), txHash = keccak256(raw),
      blockNumber = 51n + BigInt(offset), blockHash = hash(51 + offset),
      receipt = { ...f.receipt, transactionHash: txHash, blockNumber, blockHash,
        logs: f.receipt.logs.map(l => ({ ...l, transactionHash: txHash, blockNumber, blockHash })) },
      tx = { ...f.tx, hash: txHash, nonce, blockNumber, blockHash }, after = { ...f.after, blockNumber, blockHash, timestamp: 1001 + offset },
      before = { ...f.snapshot, blockNumber: 50n + BigInt(offset), blockHash: hash(50 + offset), timestamp: 1000 + offset }
    if (options.badReceipt === kind) receipt.status = "reverted"
    return { ...f, raw, receipt, tx, after, before, nonce }
  }
  const data = {} as Record<Kind, Awaited<ReturnType<typeof moved>>>
  for (const kind of ["create", "budget", "approve", "fund"] as const) data[kind] = await moved(kind)
  const source = fixtures.create.input, identity = fixtures.create.intent.identity
  const chain = (kind: Exclude<Kind, "budget">): EscrowBuyerChain => {
    const f = data[kind]
    const pick = (h: Hex) => h === data.budget.tx.hash ? data.budget : f
    return {
      async readDeployment() { await edge(kind + ".readDeployment"); return { identity, chainId: 5042002, escrow: identity.escrow,
        blockNumber: f.before.blockNumber, blockHash: f.before.blockHash, timestamp: f.before.timestamp } },
      async readJob() { await edge(kind + ".readJob"); return f.before },
      async observe() { await edge(kind + ".observe"); return {
        providerCode: signed && options.changed === "provider" ? "0x01" : "0x",
        nativeBalanceWei: signed && options.changed === "balance" ? 300000000000000000n : 10n ** 20n,
        allowanceAtomic: signed && options.changed === "allowance" ? 1n : kind === "fund" ? 300000n : 0n
      } },
      async nonceState() { await edge(kind + ".nonce"); return { latest: f.nonce, pending: f.nonce + (signed && options.changed === "nonce" ? 1 : 0) } },
      async transactionTerms() { await edge(kind + ".terms"); return { ...f.terms,
        nonce: f.nonce + (options.terms === "nonce" ? 1 : 0), gasCapWei: options.terms === "gas" ? 6000001n : f.terms.gasCapWei } },
      async signTransaction(t) { await edge(kind + ".sign"); signed = true; if (options.changed === "clock") now = 2141;
        return buyer.signTransaction(options.wrongSignature ? { ...t, value: 1n } : t) },
      async broadcast(raw) { await edge(kind + ".send"); expect(raw).toBe(f.raw); return keccak256(raw) },
      async readReceipt(h) { const a = pick(h); await edge((a === data.budget ? "budget" : kind) + ".receipt"); return a.receipt },
      async readTransaction(h) { const a = pick(h); await edge((a === data.budget ? "budget" : kind) + ".transaction");
        return { transaction: a.tx, raw: a === data.budget && options.wrongBudgetRaw ? data.create.raw : a.raw } },
      async readJobAt(_, block) { const a = block.blockNumber === data.budget.after.blockNumber ? data.budget : f;
        await edge((a === data.budget ? "budget" : kind) + ".readback"); now = a.after.timestamp; return a.after },
      async allowanceAt() { await edge(kind + ".allowanceAt"); return kind === "approve" ? 300000n : 0n }
    }
  }
  const fetch = (async (url: string, init: RequestInit) => {
    if (url.endsWith("/healthz")) { await edge("health"); return Response.json({ ok: true, rail: "gateway",
      rails: ["gateway", "erc8183"], network: "eip155:5042002", erc8183: identity }) }
    if (url.endsWith("/escrow")) {
      await edge("budget.http"); expect(JSON.parse(init.body as string).payment.payload.capability).toBe(source.capability)
      return Response.json({ status: "budget_set", jobId: "7", budget: "300000", token: identity.token,
        escrow: identity.escrow, budgetTx: data.budget.tx.hash, fundBy: 2140 })
    }
    await edge("root.http")
    return Response.json({ job_id: jobId, status: "queued", job_token: token, price: formatPrice(source.call.amount),
      poll_url: `https://example.test/jobs/${jobId}/result?token=${token}` }, { status: 202 })
  }) as typeof globalThis.fetch
  const journal = { ...open.journal }
  for (const method of ["claim", "intent", "prepared", "attempt", "confirmed", "httpAttempt", "budgetConfirmed", "accepted", "uncertain"] as const) {
    const original = open.journal[method] as (...args: unknown[]) => Promise<unknown>
    // Fixture instrumentation only; concrete methods remain the state authority.
    Object.assign(journal, { [method]: async (...args: unknown[]) => { await edge("journal." + method); return original(...args) } })
  }
  const driver = createEscrowBuyerDriver({ signal: controller.signal, deadlineMs: performance.now() + (options.deadline ?? 10000),
    nowSeconds: () => now, journal, chain, fetch,
    beforeSign: () => { calls.push("authority"); return signed && options.changed === "authority" ? "changed" : null } })
  return { driver, source, open, controller, calls, path }
}
describe("durable buyer driver (synthetic chain, generated keys, private SQLite)", () => {
  test("proves all four transactions, records every attempt before dispatch and returns only funded/queued evidence", () => fixture({}, async f => {
    const result = await f.driver.execute(f.source, body)
    expect(result.response.status).toBe(202)
    expect(result.evidence.state).toBe("funded_and_queued")
    expect(result.evidence.proofs.map(p => p.kind)).toEqual(["create", "budget", "approve", "fund"])
    expect(result.evidence.buyerGasWei).toBe(600000n); expect(result.evidence.fundedAtomic).toBe(300000n)
    expect(f.calls.filter(c => c.endsWith(".send"))).toEqual(["create.send", "approve.send", "fund.send"])
    for (const send of ["create.send", "approve.send", "fund.send"]) {
      const at = f.calls.indexOf(send); expect(f.calls.slice(0, at).lastIndexOf("journal.attempt")).toBeGreaterThan(0)
    }
    expect(f.calls.indexOf("journal.httpAttempt")).toBeLessThan(f.calls.indexOf("budget.http"))
    expect(f.calls.lastIndexOf("journal.httpAttempt")).toBeLessThan(f.calls.indexOf("root.http"))
    expect(await f.open.journal.inspect()).toMatchObject({ state: "accepted" })
    expect((await f.open.journal.readAccepted())?.token).toBe(token)
    const publicJson = JSON.stringify(result.evidence, (_, v) => typeof v === "bigint" ? v.toString() : v)
    expect(publicJson).not.toContain(token); expect(publicJson).not.toContain(f.source.capability)
    await expect(f.driver.execute(f.source, body)).rejects.toThrow("escrow_buyer_refused")
    const other = await setup(f.path, {})
    try {
      await expect(other.driver.execute(other.source, body)).rejects.toThrow("escrow_buyer_refused")
      expect(other.calls).toEqual(["authority", "journal.claim"])
      expect((await other.open.journal.readAccepted())?.token).toBe(token)
    } finally { other.open.close(); other.controller.abort() }
  }))
  for (const changed of ["balance", "allowance", "provider", "nonce", "clock", "authority"] as const)
    test("refuses changed " + changed + " after signing without sending", () => fixture({ changed }, async f => {
      await expect(f.driver.execute(f.source, body)).rejects.toThrow("escrow_buyer_uncertain")
      expect(f.calls).toContain("create.sign"); expect(f.calls.some(c => c.endsWith(".send"))).toBe(false)
      expect(await f.open.journal.inspect()).toMatchObject({ state: "uncertain" })
    }))
  for (const fail of ["journal.intent", "journal.prepared", "journal.attempt", "create.send", "create.receipt", "journal.confirmed",
    "budget.http", "budget.transaction", "journal.budgetConfirmed", "approve.send", "fund.send", "root.http", "journal.accepted"])
    test("stops and retains ownership on " + fail, () => fixture({ fail }, async f => {
      await expect(f.driver.execute(f.source, body)).rejects.toThrow("escrow_buyer_uncertain")
      expect(f.calls).toContain(fail)
      for (const label of ["create.send", "budget.http", "approve.send", "fund.send", "root.http"])
        expect(f.calls.filter(c => c === label).length).toBeLessThanOrEqual(1)
      expect(await f.open.journal.claim(f.source, body)).toBeUndefined()
      expect(await f.open.journal.inspect()).toMatchObject({ state: "uncertain" })
    }))
  for (const badReceipt of ["create", "budget", "approve", "fund"] as const)
    test("never advances from unproven " + badReceipt, () => fixture({ badReceipt }, async f => {
      await expect(f.driver.execute(f.source, body)).rejects.toThrow("escrow_buyer_uncertain")
      expect(f.calls).not.toContain(({ create: "budget.http", budget: "approve.sign", approve: "fund.sign", fund: "root.http" })[badReceipt])
    }))
  test("refuses wrong body before claiming, HTTP or signing", () => fixture({}, async f => {
    await expect(f.driver.execute(f.source, "{}")).rejects.toThrow("escrow_buyer_refused")
    expect(f.calls).toEqual([]); expect(await f.open.journal.inspect()).toEqual({ state: "empty" })
  }))
  test("bounds uncooperative IO and never sends after deadline", () => fixture({ hang: "create.observe", deadline: 40 }, async f => {
    await expect(f.driver.execute(f.source, body)).rejects.toThrow("escrow_buyer_uncertain")
    expect(f.calls).not.toContain("create.sign"); expect(f.calls).not.toContain("create.send")
  }))
  test("cancellation at the send fence causes no broadcast", () => fixture({ cancel: "journal.attempt" }, async f => {
    await expect(f.driver.execute(f.source, body)).rejects.toThrow("escrow_buyer_uncertain")
    expect(f.calls).not.toContain("create.send")
  }))
  for (const terms of ["nonce", "gas"] as const)
    test("refuses excessive transaction " + terms + " before signing", () => fixture({ terms }, async f => {
      await expect(f.driver.execute(f.source, body)).rejects.toThrow("escrow_buyer_uncertain")
      expect(f.calls).toContain("create.terms"); expect(f.calls).not.toContain("create.sign")
    }))
  test("recovers the signed wire rather than trusting signer success", () => fixture({ wrongSignature: true }, async f => {
    await expect(f.driver.execute(f.source, body)).rejects.toThrow("escrow_buyer_uncertain")
    expect(f.calls).toContain("create.sign"); expect(f.calls).not.toContain("create.send")
  }))
  test("rejects unproven budget raw bytes before approval", () => fixture({ wrongBudgetRaw: true }, async f => {
    await expect(f.driver.execute(f.source, body)).rejects.toThrow("escrow_buyer_uncertain")
    expect(f.calls).toContain("budget.transaction"); expect(f.calls).not.toContain("approve.sign")
  }))
  test("retains the private accepted result if cancellation lands during its journal write", () => fixture({ cancel: "journal.accepted" }, async f => {
    await expect(f.driver.execute(f.source, body)).rejects.toThrow("escrow_buyer_uncertain")
    expect(await f.open.journal.inspect()).toMatchObject({ state: "accepted" })
    expect((await f.open.journal.readAccepted())?.token).toBe(token)
    expect(f.calls.filter(c => c === "root.http")).toHaveLength(1)
  }))
})
