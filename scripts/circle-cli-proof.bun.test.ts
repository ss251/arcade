import { describe, expect, test } from "bun:test"
import { appendFile, readFile, rm, stat, symlink } from "node:fs/promises"
import { makeCircleProofContext, assertCircleProofChallenge, assertCircleInspection, assertCircleEstimate,
  assertCircleAcceptance, createCircleProofJournal, runCircleProofAction, verifyCircleProofJournal } from "./circle-cli-proof.ts"

const address = (n: number) => `0x${String(n).repeat(40)}`
const base = { buyer: address(1), backingEOA: address(2), seller: address(3), facilitator: address(4), splitter: address(5), origin: "http://127.0.0.1:12345" }
const context = () => makeCircleProofContext(base)
const sha = "a".repeat(64), tx = `0x${"a".repeat(64)}`, jobId = `job_${"a".repeat(32)}`
const exact = () => ({ scheme: "exact", network: "eip155:5042002", amount: "10000", asset: "0x3600000000000000000000000000000000000000",
  payTo: base.splitter, resource: `${base.origin}/x/${base.seller}/usdc-flow-check`, maxTimeoutSeconds: 604900, mimeType: "application/json",
  extra: { name: "USDC", version: "2", feeSplitter: base.splitter, feeSplitterVersion: 2 } })
const gateway = () => ({ ...exact(), payTo: base.seller,
  extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" } })
const challenge = () => ({ x402Version: 2, accepts: [gateway(), exact()] })
const inspect = () => ({ data: { status: "payable", httpStatus: 402, url: context().endpoint, price: { amount: "10000" },
  chains: ["eip155:5042002"], scheme: "GatewayWalletBatched", seller: base.seller } })
const estimate = () => ({ data: { price: "$0.01 USDC", chain: "Arc Testnet", scheme: "GatewayWalletBatched", seller: base.seller } })
const accepted = () => ({ data: { response: { job_id: jobId, poll_url: `${base.origin}/jobs/${jobId}/result?token=${"b".repeat(32)}` },
  payment: { amount: "$0.01 USDC", chain: "Arc Testnet", scheme: "GatewayWalletBatched", seller: base.seller, receipt: null } } })

describe("Circle CLI proof authority", () => {
  test("captures only distinct public roles and owned loopback origins", () => {
    const input = { ...base }, c = makeCircleProofContext(input); input.seller = address(6)
    expect(c.seller).toBe(base.seller); expect(Object.isFrozen(c)).toBe(true)
    expect(c.endpoint).toEndWith(`/x/${base.seller}/usdc-flow-check`)
  })
  for (const patch of [{ origin: "https://merchant.example" }, { origin: "http://127.0.0.1:0" }, { origin: "http://127.0.0.1:12345/" },
    { origin: "http://localhost:12345" }, { seller: address(2) }, { buyer: address(0) }, { network: "eip155:1" }]) {
    test(`refuses context variant ${JSON.stringify(patch)}`, () => expect(() => makeCircleProofContext({ ...base, ...patch })).toThrow("Circle proof unavailable"))
  }
  test("never invokes accessor authority", () => {
    let called = 0
    expect(() => makeCircleProofContext({ ...base, get seller() { called++; return address(3) } })).toThrow()
    expect(called).toBe(0)
  })
  test("requires actual ordered Gateway and splitter exact accepts", () => {
    expect(() => assertCircleProofChallenge(context(), 402, challenge())).not.toThrow()
    for (const accepts of [[exact(), gateway()], [gateway()], [gateway(), exact(), { scheme: "future" }],
      [{ ...gateway(), amount: "10001" }, exact()], [gateway(), { ...exact(), payTo: base.seller }],
      [{ ...gateway(), network: "eip155:1" }, exact()]]) {
      expect(() => assertCircleProofChallenge(context(), 402, { x402Version: 2, accepts })).toThrow()
    }
    expect(() => assertCircleProofChallenge(context(), 200, challenge())).toThrow()
  })
  test("distinguishes baseline inspect from locally configured discovery", () => {
    expect(assertCircleInspection(context(), inspect())).toEqual({ methodAdvertised: false, inputAdvertised: false })
    expect(() => assertCircleInspection(context(), inspect(), true)).toThrow()
    const body = { ...inspect().data, method: "POST", input: { type: "object", required: ["address"], properties: { address: { type: "string" } } } }
    expect(assertCircleInspection(context(), { data: body }, true)).toEqual({ methodAdvertised: true, inputAdvertised: true })
    for (const patch of [{ httpStatus: 200 }, { scheme: "USDC" }, { seller: base.buyer }, { chains: ["eip155:1"] }, { method: "GET" }]) {
      expect(() => assertCircleInspection(context(), { data: { ...body, ...patch } }, true)).toThrow()
    }
  })
  test("verifies the CLI's actual estimate display without interpreting a success exit as payment", () => {
    expect(() => assertCircleEstimate(context(), estimate())).not.toThrow()
    expect(() => assertCircleEstimate(context(), { data: { ...estimate().data, price: "$1 USDC" } })).toThrow()
    expect(() => assertCircleEstimate(context(), { data: { ...estimate().data, chain: "Base" } })).toThrow()
    let coerced = 0
    expect(() => assertCircleEstimate(context(), { data: { ...estimate().data, chain: { toString() { coerced++; return "Arc Testnet" } } } })).toThrow()
    expect(coerced).toBe(0)
  })
  test("keeps queued202 and its private same-origin poll distinct from settlement", () => {
    const value = assertCircleAcceptance(context(), 202, accepted())
    expect(value.jobId).toBe(jobId); expect(value.pollUrl).toContain("?token=")
    expect(() => assertCircleAcceptance(context(), 200, accepted())).toThrow()
    for (const poll_url of [`https://foreign.example/jobs/${jobId}/result?token=${"b".repeat(32)}`,
      `${base.origin}/jobs/${jobId}/result?token=bad`, `${base.origin}/jobs/${jobId}/result?token=${"b".repeat(32)}&extra=1`]) {
      expect(() => assertCircleAcceptance(context(), 202, { data: { ...accepted().data, response: { job_id: jobId, poll_url } } })).toThrow()
    }
  })
})

describe("fresh private one-shot Circle journal", () => {
  test("creates private exclusive records, syncs before an action, verifies the closed hash chain", async () => {
    const j = await createCircleProofJournal()
    try {
      expect((await stat(j.directory)).mode & 0o777).toBe(0o700)
      expect((await stat(j.path)).mode & 0o777).toBe(0o600)
      let calls = 0
      await runCircleProofAction(j, "deposit", async () => {
        calls++; const lines = (await readFile(j.path, "utf8")).trim().split("\n")
        expect(JSON.parse(lines.at(-1)!).event).toBe("deposit-intent")
        return tx
      })
      await expect(runCircleProofAction(j, "deposit", async () => { calls++; return tx })).rejects.toThrow()
      expect(calls).toBe(1)
      const head = await j.close()
      expect(await verifyCircleProofJournal(j.path, head)).toEqual({ events: ["deposit-intent"], head })
    } finally { await j.close().catch(() => {}); await rm(j.directory, { recursive: true, force: true }) }
  })
  test("never retries ambiguous paid work and records only a fixed uncertain stage", async () => {
    const j = await createCircleProofJournal()
    try {
      let calls = 0
      await expect(runCircleProofAction(j, "payment", async () => { calls++; throw Error("PRIVATE_PROVIDER_DETAIL") })).rejects.toThrow("Circle proof unavailable")
      expect(calls).toBe(1)
      const head = await j.close(), raw = await readFile(j.path, "utf8")
      expect(raw).not.toContain("PRIVATE_PROVIDER_DETAIL")
      expect((await verifyCircleProofJournal(j.path, head)).events).toEqual(["payment-intent", "uncertain"])
    } finally { await j.close().catch(() => {}); await rm(j.directory, { recursive: true, force: true }) }
  })
  test("rejects secret-bearing/unknown facts before writing or running work", async () => {
    const j = await createCircleProofJournal()
    try {
      await expect(j.append("challenge", { sha256: sha, accepts: 2, token: "PRIVATE" })).rejects.toThrow()
      expect(await readFile(j.path, "utf8")).toBe("")
      await expect(j.append("challenge", { sha256: sha, accepts: 2 })).rejects.toThrow()
    } finally { await j.close().catch(() => {}); await rm(j.directory, { recursive: true, force: true }) }
  })
  test("claims once under competing callers without starting two actions", async () => {
    const j = await createCircleProofJournal()
    try {
      let calls = 0
      const action = async () => { calls++; return tx }
      const results = await Promise.allSettled([runCircleProofAction(j, "payment", action), runCircleProofAction(j, "payment", action)])
      expect(calls).toBe(1); expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1)
      expect((await verifyCircleProofJournal(j.path, await j.close())).events).toEqual(["payment-intent"])
    } finally { await j.close().catch(() => {}); await rm(j.directory, { recursive: true, force: true }) }
  })
  test("rejects replay through a closed journal before calling paid work", async () => {
    const j = await createCircleProofJournal()
    try {
      await j.append("challenge", { sha256: sha, accepts: 2 }); await j.close()
      let calls = 0
      await expect(runCircleProofAction(j, "payment", async () => { calls++; return tx })).rejects.toThrow()
      expect(calls).toBe(0)
    } finally { await j.close().catch(() => {}); await rm(j.directory, { recursive: true, force: true }) }
  })
  test("rejects corruption and symlinks instead of accepting a claimed head", async () => {
    const j = await createCircleProofJournal()
    try {
      await j.append("challenge", { sha256: sha, accepts: 2 }); const head = await j.close()
      await symlink(j.path, `${j.directory}/alias.jsonl`)
      await expect(verifyCircleProofJournal(`${j.directory}/alias.jsonl`, head)).rejects.toThrow()
      await expect(verifyCircleProofJournal(j.path, "b".repeat(64))).rejects.toThrow()
      await appendFile(j.path, "PRIVATE_TAMPER\n")
      await expect(verifyCircleProofJournal(j.path, head)).rejects.toThrow("Circle proof unavailable")
    } finally { await j.close().catch(() => {}); await rm(j.directory, { recursive: true, force: true }) }
  })
})
