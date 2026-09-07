import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { Bounds, JobOutcome, PublicListing, hashJson } from "@arcade/core"
import { escrowContextToWire, assertEscrowProviderSignature, captureEscrowProviderIntent } from "@arcade/payments"
import { openEscrowProviderJournal } from "../../payments/src/erc8183-provider-journal.ts"
import { rpcFixture } from "../../payments/test/fixtures/erc8183-rpc.ts"
import { hash, provider, evaluator } from "../../payments/test/fixtures/erc8183-action.ts"
import { createEscrowProviderSession, type EscrowProviderSessionOptions } from "../src/escrow-provider.ts"
async function temporary(work: (path: string) => Promise<void>) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "arcade-provider-session-test-"))); chmodSync(dir, 0o700)
  try { await work(join(dir, "provider.sqlite")) } finally { rmSync(dir, { recursive: true, force: true }) }
}
async function setup(path: string, kind: "budget" | "submit" = "budget") {
  const h = await rpcFixture(kind), disk = openEscrowProviderJournal(path), input = { question: "fixture" }
  const context = { ...h.f.context, call: { ...h.f.context.call, inputHash: hashJson(input) } }
  let listing = PublicListing.make({ id: "skill", version: "1.0.0", serviceName: "Fixture", description: "Fixture",
    price: "$0.30", rails: ["erc8183"], tags: [], bounds: Bounds.make({ timeoutSec: 60 }),
    inputSchema: { type: "object", required: ["question"], properties: { question: { type: "string" } } },
    outputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" } } } })
  const outcome = JobOutcome.make({ status: "succeeded", stopReason: "end_turn", output: { text: "actual" }, startedAtMs: 1000, finishedAtMs: 1001 })
  const hubJobId = "job_" + "a".repeat(32)
  let current = true, now = 1000, keys = 0, signs = 0
  const options: EscrowProviderSessionOptions = { identity: h.identity, provider: context.call.provider,
    currentListing: () => ({ listing, providerAgentId: 8n }), resourceFor: () => context.call.resource,
    isCurrent: () => current, nowSeconds: () => now, operationTimeoutMs: 30000, journal: disk.journal, fetch: h.options.fetch,
    acquireSigner: async () => { keys++; return { address: provider.address, signTypedData: async typed => { signs++; return provider.signTypedData(typed) } } } }
  const request = kind === "budget" ? { _tag: "EscrowBudgetRequest" as const, requestId: hash(101), context: escrowContextToWire(context) } :
    { _tag: "EscrowSubmitRequest" as const, requestId: hash(102), context: escrowContextToWire(context), hubJobId, outputHash: hashJson(outcome.output) }
  return { h, disk, context, input, hubJobId, outcome, options, request, listing,
    setListing: (l: PublicListing) => { listing = l }, setCurrent: (v: boolean) => { current = v }, setNow: (v: number) => { now = v },
    keys: () => keys, signs: () => signs }
}
const refused = (id: string, operation: "budget" | "submit") => ({ _tag: "EscrowAuthorizationRefused", requestId: id, operation, reason: "authorization_refused" } as const)
describe("original-session provider signing (fake RPC, real SQLite, ephemeral key)", () => {
  test.each(["budget", "submit"] as const)("signs %s only after concrete checks and never broadcasts", kind => temporary(async path => {
    const h = await setup(path, kind), session = createEscrowProviderSession(h.options)
    try {
      if (kind === "submit") {
        const job = session.assign({ hubJobId: h.hubJobId, context: h.context, input: h.input })
        expect(job.input).toEqual(h.input); job.complete(h.outcome)
      }
      const result = await session.authorize(h.request)
      expect(result._tag).toBe(kind === "budget" ? "EscrowBudgetSigned" : "EscrowSubmitSigned")
      if (result._tag === "EscrowAuthorizationRefused") throw Error("expected fixture signature")
      const i = captureEscrowProviderIntent({ requestId: result.requestId, context: h.context, kind, issuedAt: 1000,
        nonce: BigInt(result.nonce), deadline: BigInt(result.deadline), hubJobId: kind === "submit" ? h.hubJobId : null,
        outputHash: kind === "submit" ? hashJson(h.outcome.output) : null })
      expect(String(await assertEscrowProviderSignature(i, result.signature))).toBe(result.signature)
      expect(h.keys()).toBe(1); expect(h.signs()).toBe(1)
      expect(h.h.calls.filter(c => c.method === "eth_chainId").length).toBeGreaterThanOrEqual(6)
      expect(h.h.calls.some(c => c.method === "eth_sendRawTransaction")).toBe(false)
      expect(await session.authorize(h.request)).toEqual(refused(h.request.requestId, kind))
      expect(h.signs()).toBe(1)
    } finally { session.close(); h.disk.close() }
  }))
  test("refuses a claimed completion, wrong output, or completion from another socket before keys", () => temporary(async path => {
    const h = await setup(path, "submit"), a = createEscrowProviderSession(h.options), b = createEscrowProviderSession(h.options)
    try {
      expect(await a.authorize(h.request)).toEqual(refused(h.request.requestId, "submit"))
      const job = a.assign({ hubJobId: h.hubJobId, context: h.context, input: h.input }); job.complete(h.outcome)
      expect(await b.authorize({ ...h.request, requestId: hash(103) })).toEqual(refused(hash(103), "submit"))
      expect(await a.authorize({ ...h.request, requestId: hash(104), outputHash: hash(9) })).toEqual(refused(hash(104), "submit"))
      expect(h.keys()).toBe(0); expect(h.h.calls).toHaveLength(0)
    } finally { a.close(); b.close(); h.disk.close() }
  }))
  test("failed or duplicate local completion never grants submit authority", () => temporary(async path => {
    const h = await setup(path, "submit"), session = createEscrowProviderSession(h.options)
    try {
      const job = session.assign({ hubJobId: h.hubJobId, context: h.context, input: h.input })
      expect(() => session.assign({ hubJobId: h.hubJobId, context: h.context, input: h.input })).toThrow("escrow_provider_refused")
      expect(() => job.complete(JobOutcome.make({ ...h.outcome, stopReason: "refusal:policy" }))).toThrow("escrow_provider_refused")
      expect(() => job.complete(h.outcome)).toThrow("escrow_provider_refused")
      expect(await session.authorize(h.request)).toEqual(refused(h.request.requestId, "submit")); expect(h.keys()).toBe(0)
    } finally { session.close(); h.disk.close() }
  }))
  test.each(["listing", "deployment", "resource", "state", "used", "socket"] as const)("refuses %s before key acquisition", mode => temporary(async path => {
    const h = await setup(path), options = { ...h.options }
    if (mode === "listing") h.setListing(PublicListing.make({ ...h.listing, price: "$0.31" }))
    if (mode === "deployment") options.identity = { ...h.h.identity, hook: h.context.client }
    if (mode === "resource") options.resourceFor = () => "https://different.test/x/seller/skill"
    if (mode === "state") h.h.f.snapshot.job.status = 1
    if (mode === "used") h.h.getters.authorizationNonceUsed = true
    if (mode === "socket") h.setCurrent(false)
    const session = createEscrowProviderSession(options)
    try {
      expect(await session.authorize(h.request)).toEqual(refused(h.request.requestId, "budget")); expect(h.keys()).toBe(0)
    } finally { session.close(); h.disk.close() }
  }))
  test("rechecks local schema changes after execution even when version/price did not change", () => temporary(async path => {
    const h = await setup(path, "submit"), session = createEscrowProviderSession(h.options)
    try {
      session.assign({ hubJobId: h.hubJobId, context: h.context, input: h.input }).complete(h.outcome)
      h.setListing(PublicListing.make({ ...h.listing, outputSchema: {} }))
      expect(await session.authorize(h.request)).toEqual(refused(h.request.requestId, "submit")); expect(h.keys()).toBe(0)
    } finally { session.close(); h.disk.close() }
  }))
  test("close cancels a slow signer, retains its reservation and never releases its late result", () => temporary(async path => {
    const h = await setup(path); let release!: (value: Awaited<ReturnType<EscrowProviderSessionOptions["acquireSigner"]>>) => void
    let started!: () => void; const start = new Promise<void>(resolve => { started = resolve })
    const session = createEscrowProviderSession({ ...h.options, acquireSigner: async () => { started(); return new Promise(resolve => { release = resolve }) } })
    try {
      const pending = session.authorize(h.request); await start; session.close()
      expect(await pending).toEqual(refused(h.request.requestId, "budget"))
      release(await h.options.acquireSigner(new AbortController().signal)); await new Promise(resolve => setTimeout(resolve, 0))
      expect(h.signs()).toBe(0)
      const next = createEscrowProviderSession(h.options)
      try { expect(await next.authorize({ ...h.request, requestId: hash(104) })).toEqual(refused(hash(104), "budget")) }
      finally { next.close() }
      expect(h.signs()).toBe(0)
    } finally { session.close(); h.disk.close() }
  }))
  test.each(["wrong-key", "late-clock", "changed-fee"] as const)("refuses %s after claim without retry or exposing a signature", mode => temporary(async path => {
    const h = await setup(path), options = { ...h.options, acquireSigner: async () => ({ address: mode === "wrong-key" ? evaluator.address : provider.address,
      signTypedData: async (typed: Parameters<Awaited<ReturnType<EscrowProviderSessionOptions["acquireSigner"]>>["signTypedData"]>[0]) => {
        const sig = await provider.signTypedData(typed)
        if (mode === "late-clock") h.setNow(1600)
        if (mode === "changed-fee") h.h.getters.platformFeeBP = 501n
        return sig
      } }) }, session = createEscrowProviderSession(options)
    try {
      expect(await session.authorize(h.request)).toEqual(refused(h.request.requestId, "budget"))
      expect(h.h.sent()).toBe(false)
      expect(await session.authorize({ ...h.request, requestId: hash(104) })).toEqual(refused(hash(104), "budget"))
    } finally { session.close(); h.disk.close() }
  }))
  test("a bounded slow signer and a competing request cannot cause a second signing attempt", () => temporary(async path => {
    const h = await setup(path); let started!: () => void, release!: () => void, acquired = 0
    const ready = new Promise<void>(resolve => { started = resolve })
    const session = createEscrowProviderSession({ ...h.options, operationTimeoutMs: 200,
      acquireSigner: async () => { acquired++; started(); await new Promise<void>(resolve => { release = resolve });
        return h.options.acquireSigner(new AbortController().signal) } })
    try {
      const first = session.authorize(h.request); await ready
      expect(await session.authorize({ ...h.request, requestId: hash(103) })).toEqual(refused(hash(103), "budget"))
      expect(await first).toEqual(refused(h.request.requestId, "budget"))
      release(); await new Promise(resolve => setTimeout(resolve, 0))
      expect(acquired).toBe(1); expect(h.signs()).toBe(0)
      expect(await session.authorize({ ...h.request, requestId: hash(104) })).toEqual(refused(hash(104), "budget"))
      expect(acquired).toBe(1)
    } finally { session.close(); h.disk.close() }
  }))
  test("a signer returning another key's signature cannot produce a signed reply", () => temporary(async path => {
    const h = await setup(path); let signs = 0
    const session = createEscrowProviderSession({ ...h.options, acquireSigner: async () => ({ address: provider.address,
      signTypedData: async typed => { signs++; return evaluator.signTypedData(typed) } }) })
    try {
      expect(await session.authorize(h.request)).toEqual(refused(h.request.requestId, "budget"))
      expect(await session.authorize({ ...h.request, requestId: hash(104) })).toEqual(refused(hash(104), "budget"))
      expect(signs).toBe(1)
    } finally { session.close(); h.disk.close() }
  }))
  test("listing changes during signing suppress the signature and retain the claim", () => temporary(async path => {
    const h = await setup(path); let signs = 0
    const session = createEscrowProviderSession({ ...h.options, acquireSigner: async () => ({ address: provider.address,
      signTypedData: async typed => { signs++; const sig = await provider.signTypedData(typed)
        h.setListing(PublicListing.make({ ...h.listing, price: "$0.31" })); return sig } }) })
    try {
      expect(await session.authorize(h.request)).toEqual(refused(h.request.requestId, "budget"))
      h.setListing(h.listing)
      expect(await session.authorize({ ...h.request, requestId: hash(104) })).toEqual(refused(hash(104), "budget"))
      expect(signs).toBe(1)
    } finally { session.close(); h.disk.close() }
  }))
  test("input mutation, wrong local agent and extra claimed-completion fields cannot authorize", () => temporary(async path => {
    const h = await setup(path, "submit"), session = createEscrowProviderSession(h.options)
    try {
      expect(() => session.assign({ hubJobId: h.hubJobId, context: h.context, input: h.input, outputHash: hash(9) }))
        .toThrow(/^escrow_provider_refused$/)
      const job = session.assign({ hubJobId: h.hubJobId, context: h.context, input: h.input })
      ;(job.input as { question: string }).question = "changed"
      expect(() => job.complete(h.outcome)).toThrow(/^escrow_provider_refused$/)
      expect(await session.authorize(h.request)).toEqual(refused(h.request.requestId, "submit")); expect(h.keys()).toBe(0)
      const other = createEscrowProviderSession({ ...h.options, currentListing: () => ({ listing: h.listing, providerAgentId: 9n }) })
      try { expect(() => other.assign({ hubJobId: h.hubJobId, context: h.context, input: h.input })).toThrow(/^escrow_provider_refused$/) }
      finally { other.close() }
    } finally { session.close(); h.disk.close() }
  }))
  test("malformed wire data, volatile journals and invalid operation limits are refused without IO", () => temporary(async path => {
    const h = await setup(path), session = createEscrowProviderSession(h.options); let getters = 0
    try {
      for (const bad of [{ ...h.request, completed: true }, { ...h.request, get context() { getters++; return h.request.context } }])
        await expect(session.authorize(bad)).rejects.toThrow(/^escrow_provider_refused$/)
      for (const operationTimeoutMs of [0, 300001, NaN]) expect(() => createEscrowProviderSession({ ...h.options, operationTimeoutMs }))
        .toThrow(/^escrow_provider_unavailable$/)
      expect(() => createEscrowProviderSession({ ...h.options, journal: { ...h.disk.journal, durability: "volatile" } }))
        .toThrow(/^escrow_provider_unavailable$/)
      expect(getters).toBe(0); expect(h.h.calls).toHaveLength(0); expect(h.keys()).toBe(0)
    } finally { session.close(); h.disk.close() }
  }))
  test("a claim acknowledgement arriving after timeout stays uncertain, without acquiring a signer", () => temporary(async path => {
    const h = await setup(path); let release!: () => void, started!: () => void
    const ready = new Promise<void>(resolve => { started = resolve })
    const session = createEscrowProviderSession({ ...h.options, operationTimeoutMs: 200, journal: { ...h.disk.journal,
      claim: async intent => { const result = await h.disk.journal.claim(intent); started()
        await new Promise<void>(resolve => { release = resolve }); return result } } })
    try {
      const pending = session.authorize(h.request); await ready
      expect(await pending).toEqual(refused(h.request.requestId, "budget")); release()
      await new Promise(resolve => setTimeout(resolve, 0))
      const read = new Database(path, { readonly: true })
      try { expect(read.query<{ state: string }, []>("SELECT state FROM escrow_provider_signatures").get()?.state).toBe("uncertain") }
      finally { read.close() }
      expect(h.keys()).toBe(0); expect(h.signs()).toBe(0)
    } finally { session.close(); h.disk.close() }
  }))
  test("a signature resolving after disconnect is neither journaled as signed nor returned", () => temporary(async path => {
    const h = await setup(path); let release!: (signature: `0x${string}`) => void, started!: () => void
    let captured!: Parameters<Awaited<ReturnType<EscrowProviderSessionOptions["acquireSigner"]>>["signTypedData"]>[0]
    const ready = new Promise<void>(resolve => { started = resolve })
    const session = createEscrowProviderSession({ ...h.options, acquireSigner: async () => ({ address: provider.address,
      signTypedData: async typed => { captured = typed; started(); return new Promise(resolve => { release = resolve }) } }) })
    try {
      const pending = session.authorize(h.request); await ready; session.close()
      expect(await pending).toEqual(refused(h.request.requestId, "budget"))
      release(await provider.signTypedData(captured)); await new Promise(resolve => setTimeout(resolve, 0))
      const read = new Database(path, { readonly: true })
      try { expect(read.query<{ state: string }, []>("SELECT state FROM escrow_provider_signatures").get()?.state).toBe("uncertain") }
      finally { read.close() }
      expect(h.h.sent()).toBe(false)
    } finally { session.close(); h.disk.close() }
  }))
  test("disconnect during execution invalidates the local completion closure", () => temporary(async path => {
    const h = await setup(path, "submit"), first = createEscrowProviderSession(h.options)
    const job = first.assign({ hubJobId: h.hubJobId, context: h.context, input: h.input }); first.close()
    const next = createEscrowProviderSession(h.options)
    try {
      expect(() => job.complete(h.outcome)).toThrow(/^escrow_provider_refused$/)
      expect(await next.authorize(h.request)).toEqual(refused(h.request.requestId, "submit")); expect(h.keys()).toBe(0)
    } finally { next.close(); h.disk.close() }
  }))
  test.each(["stale", "lifetime-floor"] as const)("rechecks %s after durable claim and before acquiring the signer", mode => temporary(async path => {
    const h = await setup(path)
    const context = mode === "lifetime-floor" ? { ...h.context, expiredAt: 1660 } : h.context
    if (mode === "lifetime-floor") h.h.f.snapshot.job.expiredAt = 1660
    const session = createEscrowProviderSession({ ...h.options, journal: { ...h.disk.journal, claim: async intent => {
      const result = await h.disk.journal.claim(intent); h.setNow(mode === "stale" ? 1031 : 1001); return result
    } } })
    try {
      expect(await session.authorize({ ...h.request, context: escrowContextToWire(context) })).toEqual(refused(h.request.requestId, "budget"))
      expect(h.keys()).toBe(0); expect(h.signs()).toBe(0)
    } finally { session.close(); h.disk.close() }
  }))
})
