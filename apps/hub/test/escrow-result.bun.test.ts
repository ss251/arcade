import { Effect } from "effect"
import { Job, JobOutcome, Receipt, hashJson } from "@arcade/core"
import { assertEscrowActionReceipt } from "@arcade/payments"
import { fixture } from "../../../packages/payments/test/fixtures/erc8183-action.ts"
import { openSqliteStore } from "../src/store-sqlite.ts"
import { escrowTerminalEvidence } from "../src/escrow-terminal.ts"
import { createHmac } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Database } from "bun:sqlite"
const SELF = fileURLToPath(import.meta.url), REPO = fileURLToPath(new URL("../../..", import.meta.url))
const SECRET = "owned-escrow-result-fixture", JOB = "job_" + "c".repeat(32)
const TOKEN = createHmac("sha256", SECRET).update(`arcade-job:${JOB}`).digest("hex").slice(0, 32)
const OUTPUT = { z: "PRIVATE_ESCROW_OUTPUT", a: { __bigint: "literal" } }
const bounded = async <A>(work: Promise<A>, ms: number): Promise<A> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("Owned result fixture deadline")), ms) })]) }
  finally { clearTimeout(timer) }
}
if (process.env["J8D2_RESULT_FIXTURE"] === "1") {
  let external = 0
  globalThis.fetch = Object.assign(async () => { external++; throw Error("Owned external request refused") },
    { preconnect() { external++; throw Error("Owned preconnect refused") } })
  const serve = Bun.serve
  Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
    const original = options.fetch!
    const server = serve({ ...options, hostname: "127.0.0.1", port: 0, async fetch(req, server) {
      const url = new URL(req.url)
      if (url.pathname === "/__escrow_result_fixture") {
        if (url.searchParams.get("corrupt") === "1") {
          const db = new Database(process.env["ARCADE_DB"]!); try { db.exec("UPDATE escrow_admissions SET terminal_digest = 'owned_corruption'") } finally { db.close() }
        }
        return Response.json({ external })
      }
      return original.call(server, req, server)
    } } as Parameters<typeof Bun.serve>[0])
    console.log(`[escrow-result-port] ${server.port}`)
    const fuse = setTimeout(() => process.exit(93), 30000); fuse.unref()
    return server
  }) as typeof Bun.serve
} else {
  const { describe, test, expect } = await import("bun:test")
  async function seed(path: string, kind: "complete" | "reject" | "uncertain") {
    const input = { private: "PRIVATE_ESCROW_INPUT" }, options = { inputHash: hashJson(input), outputHash: hashJson(OUTPUT), hubJobId: JOB }
    const f = await fixture(kind === "reject" ? "reject" : "complete", 10001n, { ...options, submittedAt: 1001, timestamp: 1010, blockNumber: 60n })
    const submit = await fixture("submit", 10001n, options), proofOf = (v: typeof f) => assertEscrowActionReceipt(v.action, v.signed, v.mined, v.receipt, v.after)
    const context = f.context, proof = kind === "uncertain" ? null : proofOf(f)
    const queued = Job.make({ id: JOB, skillId: context.call.skillId, buyer: context.client, seller: context.call.provider, priceAtomic: 10001n,
      input, status: "queued", createdAtMs: 990000, rootJobId: JOB, hop: 0, ancestors: [] })
    const outcome = JobOutcome.make({ status: kind === "complete" ? "succeeded" : "failed", output: OUTPUT,
      error: "PRIVATE_ESCROW_ERROR", startedAtMs: 990001, finishedAtMs: 999000 })
    const job = Job.make({ ...queued, status: outcome.status, outcome })
    const receipt = Receipt.make({ jobId: JOB, skillId: job.skillId, skillVersion: "1.0.0", buyer: job.buyer, seller: job.seller,
      priceAtomic: 10001n, sellerAtomic: 9501n, feeAtomic: 500n, feeBps: 500, rail: "erc8183", network: "eip155:5042002",
      latencyMs: 22000, createdAtMs: 1012000, settled: kind === "complete", reason: kind === "complete" ? "ok" :
        kind === "reject" ? "escrow refunded" : "escrow outcome uncertain; reconciliation required", rootJobId: JOB, hop: 0, ancestors: [], children: [],
      ...(kind === "complete" ? { settleTx: proof!.txHash, settleRefKind: "onchain" as const } : {}), escrow: escrowTerminalEvidence(context, proof) })
    const s = openSqliteStore(path, "owned_result_seed")
    try {
      await Effect.runPromise(s.store.escrow!.admit(context, queued)); await Effect.runPromise(s.store.escrow!.begin(context, JOB))
      await Effect.runPromise(s.store.escrow!.finish(context, { job, receipt, proof,
        submission: kind === "complete" ? { proof: proofOf(submit), outputHash: options.outputHash } : null,
        completion: kind === "complete" ? f.action.receipt : null }))
    } finally { s.close() }
  }
  async function hub(kind: "complete" | "reject" | "uncertain", check: (base: string) => Promise<void>) {
    const directory = mkdtempSync(join(tmpdir(), "arcade-escrow-result-")), path = join(directory, "store.sqlite")
    let child: ReturnType<typeof Bun.spawn> | undefined, drains: Promise<unknown> | undefined, output = "", base = ""
    try {
      await seed(path, kind)
      const spawned = child = Bun.spawn([process.execPath, "--no-env-file", "--preload", SELF, "apps/hub/src/server.ts"], {
        cwd: REPO, env: { PATH: "", PORT: "0", ARCADE_NETWORK: "arc-testnet", ARCADE_RAIL: "test", ARCADE_HUB_SECRET: SECRET,
          J8D2_RESULT_FIXTURE: "1", ARCADE_DB: path }, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
      const drain = async (stream: ReadableStream<Uint8Array>) => {
        const reader = stream.getReader()
        try { while (true) { const next = await reader.read(); if (next.done) break
          output = (output + new TextDecoder().decode(next.value)).slice(-32768)
          const port = /\[escrow-result-port\] (\d+)/.exec(output)?.[1]; if (port) base = `http://127.0.0.1:${port}`
        } } finally { reader.releaseLock() }
      }
      drains = Promise.all([drain(spawned.stdout), drain(spawned.stderr)])
      const deadline = performance.now() + 7000
      while (!base && spawned.exitCode === null && spawned.signalCode === null && performance.now() < deadline) await Bun.sleep(10)
      if (!base) throw Error("Owned escrow result router did not start")
      await check(base)
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM"); try { await bounded(child.exited, 800) } catch { child.kill("SIGKILL"); await bounded(child.exited, 1500) }
      }
      if (drains) await bounded(drains, 2000)
      for (const value of [SECRET, TOKEN, "PRIVATE_ESCROW_"]) expect(output).not.toContain(value)
      if (base) await expect(fetch(base + "/healthz", { signal: AbortSignal.timeout(500) })).rejects.toThrow()
      rmSync(directory, { recursive: true, force: true })
    }
  }
  const get = (base: string, path: string, token?: string) => fetch(base + path, { headers: token === undefined ? {} : { "x-job-token": token },
    signal: AbortSignal.timeout(3000), redirect: "error", credentials: "omit" })
  describe("actual escrow result route with reopened durable terminal Store", () => {
    test.each(["complete", "reject", "uncertain"] as const)("authenticates and preserves %s semantics without any external calls", kind => hub(kind, async base => {
      const path = `/jobs/${JOB}/result`
      expect((await get(base, path)).status).toBe(404)
      expect((await get(base, path, "wrong")).status).toBe(404)
      const response = await get(base, path, TOKEN), text = await response.text(), result = JSON.parse(text)
      expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store")
      expect(result.receipt.rail).toBe("erc8183")
      expect(result.receipt.escrow.state).toBe(kind === "complete" ? "settled" : kind === "reject" ? "refunded" : "uncertain")
      if (kind === "complete") expect(result.result).toEqual(OUTPUT)
      else {
        expect(result.result).toBeNull(); expect(result.detail).toContain(kind === "reject" ? "refund confirmed" : "reconciliation required")
        expect(text).not.toContain("PRIVATE_ESCROW_OUTPUT"); expect(text).not.toContain("you were not charged")
      }
      expect(text).not.toContain("PRIVATE_ESCROW_ERROR"); expect(text).not.toContain("PRIVATE_ESCROW_INPUT")
      const publicText = await (await get(base, "/receipts")).text()
      expect(publicText).not.toContain(JOB); expect(publicText).not.toContain("PRIVATE_ESCROW_")
      expect(await (await get(base, "/__escrow_result_fixture")).json()).toEqual({ external: 0 })
      await get(base, "/__escrow_result_fixture?corrupt=1")
      expect((await get(base, path, "wrong")).status).toBe(404)
      const unavailable = await get(base, path, TOKEN)
      expect(unavailable.status).toBe(503); expect(await unavailable.json()).toEqual({ error: "result_unavailable" })
    }))
  })
}
