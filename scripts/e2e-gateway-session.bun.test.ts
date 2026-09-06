import { describe, expect, it } from "bun:test"
import { parseSessionEvidenceArgs, sessionEvidenceMain, assertTwentyCallEvidence, createEvidenceJournal, launchEvidenceChild, decodeEvidenceFrame, executeTwentySessionCalls, writeClosedEvidence, evidencePolicyHash, runOfflineSessionEvidence, makeEvidenceRequestAudit, SessionEvidenceError, type TwentyCallEvidence } from "./e2e-gateway-session.ts"
import type { BuyerSessionPromise } from "../packages/buyer/src/session.ts"
import { decodeFixtureStart, FIXTURE_POLICY } from "./fixtures/gateway-session-runtime.ts"
import { mkdtemp, rm, stat, readFile, copyFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { execFileSync } from "node:child_process"
import { Job, JobOutcome, Receipt, Session, loadChainConfig } from "@arcade/core"
import { sessionJson, sessionParse, sessionRequestDigest, sessionAuthorizationKey, type SessionLedgerCall } from "../apps/hub/src/session-ledger.ts"
const testBound = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("Owned test deadline")), ms) })]) }
  finally { if (timer !== undefined) clearTimeout(timer) }
}

/** Synthetic rows exercise the verifier only; they are never runner/live evidence. */
const syntheticEvidence = (): TwentyCallEvidence => {
  const chain = loadChainConfig("arc-testnet"), buyer = FIXTURE_POLICY.buyer, seller = FIXTURE_POLICY.seller
  const session = Session.make({ id: `ses_${"a".repeat(32)}`, buyer, rail: "gateway", network: chain.caip2, budgetAtomic: 200000n, spentAtomic: 200000n, openedAtMs: 1000, closedAtMs: 5000 })
  const observations = [], calls = [], jobs = [], receipts = [], closedCalls = []
  for (let index = 1; index <= 20; index++) {
    const jobId = `job_${index.toString().padStart(16, "0")}`, nonce = `0x${index.toString(16).padStart(64, "0")}`
    const settleRef = `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`, at = 1100 + index
    const queued = Job.make({ id: jobId, buyer, seller, skillId: FIXTURE_POLICY.skillId, priceAtomic: 10000n, input: { index }, status: "queued", createdAtMs: at,
      rootJobId: jobId, hop: 0, ancestors: [] })
    const job = Job.make({ ...queued, status: "succeeded", outcome: JobOutcome.make({ status: "succeeded", stopReason: "end_turn", output: { index, proof: "offline-runner-probe" }, startedAtMs: at + 1, finishedAtMs: at + 2 }) })
    const receipt = Receipt.make({ jobId, buyer, seller, skillId: FIXTURE_POLICY.skillId, skillVersion: "1.0.0", sessionId: session.id, rail: "gateway", network: chain.caip2,
      priceAtomic: 10000n, sellerAtomic: 10000n, feeAtomic: 0n, feeBps: 0, settled: true, reason: "ok", settleTx: settleRef, settleRefKind: "gateway-transfer", authorizationNonce: nonce,
      rootJobId: jobId, hop: 0, ancestors: [], latencyMs: 3, createdAtMs: at + 3 })
    const binding = { sessionId: session.id, jobId, buyer, seller, skillId: FIXTURE_POLICY.skillId, skillVersion: "1.0.0", rail: "gateway" as const, network: chain.caip2,
      asset: chain.usdc.address.toLowerCase(), verifyingContract: chain.gateway!.wallet.toLowerCase(), domainName: "GatewayWalletBatched", domainVersion: "1", payTo: seller,
      amountAtomic: 10000n, nonce, validAfter: 1n, validBefore: 100n, requestDigest: sessionRequestDigest(queued.input) }
    const call: SessionLedgerCall = { binding, state: "settled", createdAtMs: at, queuedDigest: sessionRequestDigest(queued), terminalJobDigest: sessionRequestDigest(job), receiptDigest: sessionRequestDigest(receipt), settleRef, settleRefKind: "gateway-transfer" }
    calls.push({ job_id: jobId, session_id: session.id, authorization_key: sessionAuthorizationKey(binding), state: "settled", amount_atomic: "10000", created_at_ms: at, settlement_key: JSON.stringify([chain.caip2, "gateway", settleRef]), json: sessionJson(call) })
    jobs.push({ id: jobId, status: "succeeded", boot_id: "synthetic-verifier-only", created_at_ms: at, json: sessionJson(job) })
    receipts.push({ job_id: jobId, accrual_id: null, created_at_ms: at + 3, json: sessionJson(receipt) })
    observations.push({ index, jobId, nonce, validAfter: "1", validBefore: "100", inputDigest: binding.requestDigest, outputDigest: sessionRequestDigest(job.outcome!.output), settleRef })
    closedCalls.push({ jobId, skillId: FIXTURE_POLICY.skillId, priceAtomic: "10000", state: "settled" as const, settled: true, createdAtMs: at, settleRef, settleRefKind: "gateway-transfer" as const })
  }
  return { sessions: [{ id: session.id, buyer, budget_atomic: "200000", spent_atomic: "200000", rail: "gateway", network: chain.caip2, opened_at_ms: 1000, closed_at_ms: 5000, call_count: 20, held_atomic: "0", json: sessionJson({ session, callCount: 20, heldAtomic: 0n }) }], calls, jobs, receipts, buyer, seller, observations,
    closed: { sessionId: session.id, buyer, rail: "gateway", network: chain.caip2, budgetAtomic: "200000", spentAtomic: "200000", heldAtomic: "0", calls: closedCalls,
      settledCalls: 20, settlementRefs: observations.map(o => o.settleRef), complete: true, openedAtMs: 1000, closedAtMs: 5000 } }
}

describe("F12 explicit evidence entry", () => {
  it("has no armed default or argument-selected live authority", () => {
    expect(parseSessionEvidenceArgs(["--help"])).toEqual({ mode: "help" })
    expect(parseSessionEvidenceArgs(["--offline"])).toEqual({ mode: "offline" })
    for (const argv of [[], ["--live"], ["--offline", "--calls", "21"], ["--offline", "--journal", "/tmp/reuse"], ["--deposit"], ["--offline", "--offline"]])
      expect(() => parseSessionEvidenceArgs(argv)).toThrow(SessionEvidenceError)
  })
  it("returns fixed help/invalid/live refusal before invoking the offline runner", async () => {
    let runs = 0; const output: string[] = []
    const io = { runOffline: async () => { runs++; throw Error("PRIVATE_RUNTIME_SENTINEL") }, write: (line: string) => { output.push(line) } }
    expect(await sessionEvidenceMain(["--help"], io)).toBe(0)
    expect(await sessionEvidenceMain(["--live"], io)).toBe(2)
    expect(await sessionEvidenceMain(["--key", "PRIVATE_ARGUMENT_SENTINEL"], io)).toBe(2)
    expect(runs).toBe(0); expect(output.join("\n")).not.toContain("PRIVATE_ARGUMENT_SENTINEL")
  })
  it("refuses an invented twenty-call summary without original persisted evidence", async () => {
    await expect(assertTwentyCallEvidence({ settledCalls: 20, settlementRefs: ["invented"] })).rejects.toBeInstanceOf(SessionEvidenceError)
  })
  it("shell refuses absent arguments with fixed code before resolving Bun", async () => {
    const child = Bun.spawn(["/bin/sh", "scripts/e2e-gateway-session.sh"], { cwd: new URL("../", import.meta.url).pathname, env: { PATH: "/usr/bin:/bin" }, stdout: "pipe", stderr: "pipe" })
    const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(code).toBe(2); expect(out).toBe(""); expect(err).toBe("Gateway session evidence refused; use --offline or --help.\n")
  })
  it("import/help/invalid entries remain inert with hostile ambient chain selectors", async () => {
    for (const args of [["--help"], ["--live"], []]) {
      const child = Bun.spawn([process.execPath, "--no-env-file", "scripts/e2e-gateway-session.ts", ...args], { cwd: new URL("../", import.meta.url).pathname,
        env: { PATH: "", ARCADE_NETWORK: "PRIVATE_AMBIENT_NETWORK_SENTINEL" }, stdout: "pipe", stderr: "pipe" })
      const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
      expect(code).toBe(args[0] === "--help" ? 0 : 2); expect(out).not.toContain("PRIVATE_AMBIENT"); expect(err).toBe("")
    }
    const child = Bun.spawn([process.execPath, "--no-env-file", "-e", "await import('./scripts/e2e-gateway-session.ts'); console.log('inert')"], {
      cwd: new URL("../", import.meta.url).pathname, env: { PATH: "", ARCADE_NETWORK: "PRIVATE_AMBIENT_NETWORK_SENTINEL" }, stdout: "pipe", stderr: "pipe" })
    const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(code).toBe(0); expect(out).toBe("inert\n"); expect(err).toBe("")
  })
})

describe("F12 fixed child policy", () => {
  it("requires an explicit role-bound owned start record", () => {
    expect(FIXTURE_POLICY.calls).toBe(20)
    expect(FIXTURE_POLICY.priceAtomic).toBe("10000")
    for (const value of [null, {}, { version: 1, role: "arbitrary", module: "PRIVATE_MODULE" }])
      expect(() => decodeFixtureStart(value)).toThrow()
  })
  it("rejects unknown, mismatched and extra IPC fields before accepting counters", () => {
    const expected = { runId: "a".repeat(32), role: "hub" as const, pid: 123 }
    const frame = { version: 1, ...expected, event: "ready", facts: { pid: 123, origin: "http://127.0.0.1:1234" } }
    for (const value of [frame, { ...frame, runId: "b".repeat(32) }, { version: 1, runId: expected.runId, role: "hub", event: "ready", facts: { pid: 124, origin: "http://127.0.0.1:1234" } }])
      expect(() => decodeEvidenceFrame(value, expected)).toThrow(SessionEvidenceError)
  })
  it("boots and closes the actual isolated hub with no paid operations", async () => {
    const journal = await createEvidenceJournal()
    const child = launchEvidenceChild({ version: 1, runId: "a".repeat(32), role: "hub", directory: journal.directory, ownerPid: process.pid, deadlineUnixMs: Date.now() + 30000, hubSecret: "a".repeat(64) })
    try { const ready = await child.ready; expect(ready.role).toBe("hub")
      const snapshot = await child.snapshot(); expect(snapshot.facts.settleCalls).toBe(0); expect(snapshot.facts.records).toEqual([])
      const stopped = await child.stop(); expect(stopped.event).toBe("stopped")
      await expect(fetch(String(ready.facts.origin), { signal: AbortSignal.timeout(500) })).rejects.toThrow()
    } finally { await child.reap(); await journal.close(); await rm(journal.directory, { recursive: true }) }
  }, 20000)
  it("rejects an incomplete UTF-8 control tail instead of claiming a clean stop", async () => {
    const journal = await createEvidenceJournal(), runId = "b".repeat(32)
    const child = Bun.spawn([process.execPath, "--no-env-file", "scripts/fixtures/gateway-session-runtime.ts", "--hub"], {
      cwd: new URL("../", import.meta.url).pathname, env: { PATH: dirname(process.execPath), ARCADE_NETWORK: "arc-testnet" }, stdin: "pipe", stdout: "pipe", stderr: "pipe" })
    const timer = setTimeout(() => child.kill("SIGKILL"), 10000)
    try {
      child.stdin.write(JSON.stringify({ version: 1, runId, role: "hub", directory: journal.directory, ownerPid: process.pid, deadlineUnixMs: Date.now() + 15000, hubSecret: "a".repeat(64) }) + "\n"); await child.stdin.flush()
      const reader = child.stdout.getReader(), first = await reader.read()
      const initial = new TextDecoder().decode(first.value); expect(initial).toContain('"event":"ready"')
      child.stdin.write(new Uint8Array([0xc3])); await child.stdin.flush(); child.stdin.end()
      const rest: Uint8Array[] = []
      for (;;) { const next = await reader.read(); if (next.done) break; expect(next.value.length).toBeLessThan(32768); rest.push(next.value) }
      reader.releaseLock()
      expect(await child.exited).toBe(1); expect(Buffer.concat(rest).toString()).toContain('"event":"failed"')
      expect(await new Response(child.stderr).text()).toBe("")
    } finally { clearTimeout(timer); if (child.exitCode === null) child.kill("SIGKILL"); await child.exited; await journal.close(); await rm(journal.directory, { recursive: true }) }
  }, 15000)
})

describe("F12 persisted correlation verifier", () => {
  it("serializes the exact captured policy without treating a ChainConfig class as plain JSON", async () => {
    expect(await evidencePolicyHash()).toMatch(/^[a-f0-9]{64}$/)
  })
  it("accepts exactly twenty fully correlated synthetic rows, not live evidence", async () => {
    expect(await assertTwentyCallEvidence(syntheticEvidence())).toEqual({ closedHash: expect.stringMatching(/^[a-f0-9]{64}$/), persistedHash: expect.stringMatching(/^[a-f0-9]{64}$/) })
  })
  it("rejects extra, missing, duplicate, mismatched and altered evidence", async () => {
    for (const mutate of [
      (v: TwentyCallEvidence) => ({ ...v, jobs: [...v.jobs, v.jobs[0]] }),
      (v: TwentyCallEvidence) => ({ ...v, receipts: v.receipts.slice(1) }),
      (v: TwentyCallEvidence) => ({ ...v, observations: v.observations.map((o, i) => i === 1 ? v.observations[0]! : o) }),
      (v: TwentyCallEvidence) => ({ ...v, calls: v.calls.map((c, i) => i === 0 ? { ...c as object, amount_atomic: "9999" } : c) }),
      (v: TwentyCallEvidence) => ({ ...v, observations: v.observations.map((o, i) => i === 0 ? { ...o, outputDigest: sessionRequestDigest({ index: 21 }) } : o) }),
      (v: TwentyCallEvidence) => ({ ...v, closed: { ...v.closed, closedAtMs: 6000 } })
    ]) await expect(assertTwentyCallEvidence(mutate(syntheticEvidence()))).rejects.toBeInstanceOf(SessionEvidenceError)
  })
  it("rejects a consistently rewritten zero nonce, not just mismatched columns", async () => {
    const v = syntheticEvidence(), zero = `0x${"0".repeat(64)}`
    const callRow = v.calls[0] as Record<string, unknown>, call = sessionParse(callRow.json as string) as SessionLedgerCall
    const receiptRow = v.receipts[0] as Record<string, unknown>, receipt = sessionParse(receiptRow.json as string) as Receipt
    const changedReceipt = { ...receipt, authorizationNonce: zero }, binding = { ...call.binding, nonce: zero }
    const changedCall = { ...call, binding, receiptDigest: sessionRequestDigest(changedReceipt) }
    await expect(assertTwentyCallEvidence({ ...v,
      calls: [{ ...callRow, authorization_key: sessionAuthorizationKey(binding), json: sessionJson(changedCall) }, ...v.calls.slice(1)],
      receipts: [{ ...receiptRow, json: sessionJson(changedReceipt) }, ...v.receipts.slice(1)],
      observations: [{ ...v.observations[0], nonce: zero }, ...v.observations.slice(1)]
    })).rejects.toBeInstanceOf(SessionEvidenceError)
  })
  it("retains exact wire close bytes exclusively and agrees with the independent verifier hash", async () => {
    const journal = await createEvidenceJournal(), v = syntheticEvidence()
    try { const artifactHash = await writeClosedEvidence(journal.directory, v.closed)
      expect((await assertTwentyCallEvidence(v)).closedHash).toBe(artifactHash)
      expect(JSON.parse(await readFile(join(journal.directory, "closed.json"), "utf8"))).toEqual(v.closed)
      expect((await stat(join(journal.directory, "closed.json"))).mode & 0o777).toBe(0o600)
      await expect(writeClosedEvidence(journal.directory, { changed: true })).rejects.toBeInstanceOf(SessionEvidenceError)
    } finally { await journal.close(); await rm(journal.directory, { recursive: true }) }
  })
})

describe("F12 durable one-shot journal", () => {
  it("owns private fresh files and fsynced ordered records", async () => {
    const parent = await mkdtemp(join(tmpdir(), "f12-journal-test-"))
    try { const journal = await createEvidenceJournal(parent)
      await journal.append("call", { index: 1, inputDigest: sessionRequestDigest({ index: 1 }) })
      await journal.append("signer", { index: 1, nonce: `0x${"1".repeat(64)}`, validAfter: "1", validBefore: "2", typedDataHash: "a".repeat(64) })
      expect((await stat(journal.directory)).mode & 0o777).toBe(0o700)
      expect((await stat(join(journal.directory, "evidence.jsonl"))).mode & 0o777).toBe(0o600)
      expect(await journal.close()).toMatch(/^[a-f0-9]{64}$/)
      expect((await readFile(join(journal.directory, "evidence.jsonl"), "utf8")).trim().split("\n")).toHaveLength(2)
    } finally { await rm(parent, { recursive: true }) }
  })
  it("claims before concurrent writes and never permits a twenty-first attempt", async () => {
    const parent = await mkdtemp(join(tmpdir(), "f12-journal-test-"))
    try { const journal = await createEvidenceJournal(parent)
      const first = journal.append("call", { index: 1, inputDigest: sessionRequestDigest({ index: 1 }) }); void first.catch(() => {})
      await expect(journal.append("call", { index: 1, inputDigest: sessionRequestDigest({ index: 1 }) })).rejects.toBeInstanceOf(SessionEvidenceError)
      await Promise.allSettled([first]); await expect(journal.close()).rejects.toBeInstanceOf(SessionEvidenceError)
      const other = await createEvidenceJournal(parent)
      await expect(other.append("call", { index: 21, inputDigest: "a" })).rejects.toBeInstanceOf(SessionEvidenceError)
      await expect(other.close()).rejects.toBeInstanceOf(SessionEvidenceError)
    } finally { await rm(parent, { recursive: true }) }
  })
  it("rejects unknown/capability fields rather than persisting their values", async () => {
    const parent = await mkdtemp(join(tmpdir(), "f12-journal-test-"))
    try { const journal = await createEvidenceJournal(parent)
      await expect(journal.append("call", { index: 1, inputDigest: "a", token: "PRIVATE_CAPABILITY_SENTINEL" })).rejects.toBeInstanceOf(SessionEvidenceError)
      await expect(journal.close()).rejects.toBeInstanceOf(SessionEvidenceError)
      expect(await readFile(join(journal.directory, "evidence.jsonl"), "utf8")).not.toContain("PRIVATE_CAPABILITY_SENTINEL")
    } finally { await rm(parent, { recursive: true }) }
  })
  it("rejects private prose hidden in a known diagnostic field", async () => {
    const journal = await createEvidenceJournal()
    try { await expect(journal.append("uncertain", { stage: "PRIVATE_DIAGNOSTIC_SENTINEL" })).rejects.toBeInstanceOf(SessionEvidenceError)
      await expect(journal.close()).rejects.toBeInstanceOf(SessionEvidenceError)
      expect(await readFile(join(journal.directory, "evidence.jsonl"), "utf8")).not.toContain("PRIVATE_DIAGNOSTIC_SENTINEL")
    } finally { await journal.close().catch(() => {}); await rm(journal.directory, { recursive: true }) }
  })
})

describe("F12 sequence ownership", () => {
  it("stops at an uncertain call without closing, filling in, or issuing a twenty-first", async () => {
    const v = syntheticEvidence(), calls: number[] = [], events: string[] = []; let close = 0
    const capture = { index: 0, signed: new Map(v.observations.map(o => [o.index, { nonce: o.nonce, validAfter: o.validAfter, validBefore: o.validBefore }])) }
    const session = { call: async (args: { input: { index: number } }) => {
      const index = args.input.index; calls.push(index); if (index === 3) throw Error("PRIVATE_UNCERTAIN_SENTINEL")
      return { jobId: v.observations[index - 1]!.jobId, status: "succeeded", result: { index, proof: "offline-runner-probe" }, receipt: { settleTx: v.observations[index - 1]!.settleRef }, authorizedAmountAtomic: 10000n }
    }, close: async () => { close++; return v.closed } } as unknown as BuyerSessionPromise
    await expect(executeTwentySessionCalls(session, { directory: "unused", append: async event => { events.push(event) }, close: async () => "unused" }, capture, new AbortController().signal)).rejects.toThrow()
    expect(calls).toEqual([1, 2, 3]); expect(close).toBe(0); expect(events).toEqual(["call", "result", "call", "result", "call"])
  })
  it("claims exactly twenty calls and close once, recovering a lost close only through same-handle status", async () => {
    const v = syntheticEvidence(), calls: number[] = []; let close = 0, status = 0
    const capture = { index: 0, signed: new Map(v.observations.map(o => [o.index, { nonce: o.nonce, validAfter: o.validAfter, validBefore: o.validBefore }])) }
    const session = { call: async (args: { input: { index: number } }) => {
      const index = args.input.index; calls.push(index)
      return { jobId: v.observations[index - 1]!.jobId, status: "succeeded", result: { index, proof: "offline-runner-probe" }, receipt: { settleTx: v.observations[index - 1]!.settleRef }, authorizedAmountAtomic: 10000n }
    }, close: async () => { close++; throw Error("lost") }, status: async () => { status++; return { closed: true, closedReceipt: v.closed } } } as unknown as BuyerSessionPromise
    const result = await executeTwentySessionCalls(session, { directory: "unused", append: async () => {}, close: async () => "unused" }, capture, new AbortController().signal)
    expect(calls).toEqual(Array.from({ length: 20 }, (_, i) => i + 1)); expect(close).toBe(1); expect(status).toBe(1); expect(result.closed).toBe(v.closed)
  })
  it("never enters a call when its durable intent fails", async () => {
    let calls = 0
    const session = { call: async () => { calls++ } } as unknown as BuyerSessionPromise
    await expect(executeTwentySessionCalls(session, { directory: "unused", append: async () => { throw Error("fsync failure") }, close: async () => "unused" }, { index: 0, signed: new Map() }, new AbortController().signal)).rejects.toThrow()
    expect(calls).toBe(0)
  })
})

describe("F12 outbound private-header observation", () => {
  const origin = "http://127.0.0.1:1234", id = `ses_${"a".repeat(32)}`, path = "/x/gateway-session-probe/gateway-session-probe"
  const headers = () => new Headers({ "x-arcade-session": id, "x-session-token": "b".repeat(32) })
  it("refuses missing, changed or misplaced capabilities without reflecting them", () => {
    const audit = makeEvidenceRequestAudit(origin); audit.opened(id)
    expect(() => audit.record(origin + path, "POST", new Headers())).toThrow(SessionEvidenceError)
    for (const key of ["x-arcade-session", "x-session-token"]) { const h = headers(); h.delete(key); expect(() => audit.record(origin + path, "POST", h)).toThrow(SessionEvidenceError) }
    audit.record(origin + path, "POST", headers())
    for (const key of ["x-arcade-session", "x-session-token"]) { const h = headers(); h.set(key, "c".repeat(32)); expect(() => audit.record(origin + path, "POST", h)).toThrow(SessionEvidenceError) }
    for (const endpoint of ["/sessions", "/listings/gateway-session-probe"]) for (const key of ["x-arcade-session", "x-session-token", "x-job-token", "payment-signature"]) {
      expect(() => audit.record(origin + endpoint, endpoint === "/sessions" ? "POST" : "GET", new Headers({ [key]: "" }))).toThrow(SessionEvidenceError)
    }
    expect(() => audit.record("http://127.0.0.1:2345" + path, "POST", headers())).toThrow(SessionEvidenceError)
    const job = `job_${"1".repeat(16)}`, result = `/jobs/${job}/result`
    expect(() => audit.record(origin + result, "GET", headers())).toThrow(SessionEvidenceError)
    const h = headers(); h.set("x-job-token", "d".repeat(32)); audit.record(origin + result, "GET", h)
    h.set("x-job-token", "e".repeat(32)); expect(() => audit.record(origin + result, "GET", h)).toThrow(SessionEvidenceError)
    expect(() => audit.record(origin + `/sessions/${id}/close`, "POST", h)).toThrow(SessionEvidenceError)
    expect(() => audit.complete([job])).toThrow(SessionEvidenceError)
    expect(JSON.stringify(audit)).not.toContain("b".repeat(32))
  })
  it("observes continuous probe/retry/poll/close/status headers without exposing capability state", () => {
    const audit = makeEvidenceRequestAudit(origin); audit.record(origin + "/sessions", "POST", new Headers()); audit.opened(id)
    // Actual F9 begins each call with an authoritative session-status read.
    audit.record(origin + `/sessions/${id}`, "GET", headers())
    const ids: string[] = []
    for (let index = 1; index <= 20; index++) {
      audit.record(origin + "/listings/gateway-session-probe", "GET", new Headers()); audit.record(origin + path, "POST", headers())
      const paid = headers(); paid.set("payment-signature", "opaque SDK authorization"); audit.record(origin + path, "POST", paid)
      const job = `job_${String(index).padStart(16, "0")}`, h = headers(); ids.push(job); h.set("x-job-token", index.toString(16).padStart(32, "0"))
      audit.record(origin + `/jobs/${job}/result`, "GET", h); audit.record(origin + `/jobs/${job}/result`, "GET", h)
    }
    audit.record(origin + `/sessions/${id}/close`, "POST", headers()); audit.record(origin + `/sessions/${id}`, "GET", headers())
    expect(() => audit.complete(ids)).not.toThrow(); expect(Object.keys(audit).sort()).toEqual(["complete", "opened", "record"])
  })
})

describe("F12 actual inert probe guards", () => {
  it("terminates an actual stalled probe at its committed deadline", async () => {
    const parent = await mkdtemp(join(tmpdir(), "f12-probe-test-")), entry = join(parent, "run.ts")
    await copyFile(new URL("./fixtures/gateway-session-probe/run.ts.txt", import.meta.url), entry)
    const child = Bun.spawn([process.execPath, "--no-env-file", entry], { env: { PATH: "" }, stdin: "pipe", stdout: "pipe", stderr: "pipe" })
    const timer = setTimeout(() => child.kill("SIGKILL"), 6000), start = performance.now()
    try { expect(await child.exited).toBe(92); expect(performance.now() - start).toBeLessThan(5500)
      expect(await new Response(child.stdout).text()).toBe(""); expect(await new Response(child.stderr).text()).toBe("")
    } finally { clearTimeout(timer); if (child.exitCode === null) child.kill("SIGKILL"); await child.exited; await rm(parent, { recursive: true }) }
  }, 7000)
  it("terminates its exact orphaned probe after the owning parent exits", async () => {
    const parent = await mkdtemp(join(tmpdir(), "f12-probe-test-")), entry = join(parent, "run.ts")
    await copyFile(new URL("./fixtures/gateway-session-probe/run.ts.txt", import.meta.url), entry)
    const code = `const c=Bun.spawn([process.execPath,'--no-env-file','run',${JSON.stringify(entry)}],{env:{PATH:''},stdin:'pipe',stdout:'ignore',stderr:'ignore'});console.log(c.pid);await new Promise(()=>{});`
    const owner = Bun.spawn([process.execPath, "--no-env-file", "-e", code], { env: { PATH: "" }, stdout: "pipe", stderr: "pipe" })
    const timer = setTimeout(() => owner.kill("SIGKILL"), 6000); let childPid = 0, capturedIdentity: string | undefined
    const exists = () => { try { process.kill(childPid, 0); return true } catch (e) { if ((e as { code?: string }).code === "ESRCH") return false; throw e } }
    const field = (name: "ppid=" | "lstart=" | "command=") => execFileSync("/bin/ps", ["-p", String(childPid), "-o", name], { encoding: "utf8", timeout: 300, maxBuffer: 4096, env: { LC_ALL: "C" }, stdio: ["ignore", "pipe", "ignore"] }).trim()
    const identity = () => field("lstart=") + "\n" + field("command=")
    const waitGone = async () => { const deadline = performance.now() + 1800
      while (exists()) { if (performance.now() >= deadline) throw Error("Owned descendant remains"); await new Promise(resolve => setTimeout(resolve, 20)) } }
    const reader = owner.stdout.getReader(), stderr = new Response(owner.stderr).text()
    try { let value = ""
      while (!value.endsWith("\n")) { const first = await testBound(reader.read(), 1000); if (first.done) throw Error("Owned identity unavailable")
        value += new TextDecoder().decode(first.value); if (value.length > 128) throw Error("Owned identity bound") }
      childPid = Number(value.trim())
      expect(Number.isSafeInteger(childPid) && childPid > 1 && childPid !== owner.pid).toBe(true)
      expect(field("ppid=")).toBe(String(owner.pid)); expect(field("command=")).toBe(`${process.execPath} --no-env-file run ${entry}`)
      capturedIdentity = identity()
      // Allow the reviewed guard to capture its actual parent before terminating it.
      await new Promise(resolve => setTimeout(resolve, 150)); owner.kill("SIGKILL"); await owner.exited
      await waitGone(); expect(exists()).toBe(false); expect(await testBound(stderr, 500)).toBe("")
    } finally { clearTimeout(timer); if (owner.exitCode === null && owner.signalCode === null) owner.kill("SIGKILL"); await owner.exited
      if (childPid > 1 && exists()) { if (capturedIdentity === undefined || identity() !== capturedIdentity) throw Error("Owned identity changed")
        process.kill(childPid, "SIGKILL"); await waitGone() }
      await reader.cancel().catch(() => {}); reader.releaseLock(); await testBound(stderr, 500); await rm(parent, { recursive: true }) }
  }, 7000)
})

describe("F12 actual twenty-call offline evidence", () => {
  it("runs real SDK, Gateway, hub, runner, WebSocket and SQLite before reporting cleanup-complete PASS", async () => {
    const result = await runOfflineSessionEvidence()
    expect(result).toMatchObject({ mode: "offline", status: "PASS", calls: 20, transferReferences: 20, spentAtomic: "200000", fundsMoved: false, liveEvidence: "NOT_RUN", minedBatchesProved: 0 })
    for (const key of ["closedHash", "persistedHash", "journalHash", "manifestHash", "sourceHash", "executedSourceHash"] as const) expect(result[key]).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(result)).not.toMatch(/ses_|job_|token|signature|privateKey|directory/)
  }, 120000)
})
