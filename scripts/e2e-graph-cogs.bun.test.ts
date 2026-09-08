import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtempSync, chmodSync, writeFileSync, readFileSync, rmSync, symlinkSync, linkSync, mkdirSync, realpathSync, existsSync, readdirSync, copyFileSync, unlinkSync, renameSync, lstatSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { GRAPH_COGS_POLICY, GRAPH_COGS_POLICY_HASH, decodeGraphReservations, readGraphReservations, checkGraphBalance, initializeGraphReservationState, openGraphReservationWriter, readGraphBalance, GRAPH_COGS_RPC, GRAPH_COGS_SOURCE_FILES, readGraphSourceManifest, bindGraphQuery, createGraphResponseRecorder, readGraphResponseCapture, type GraphReservationWriter, type GraphBalanceTransport, type GraphQueryBinding, type GraphResponseRecorder } from "./e2e-graph-cogs.ts"
import { document, AGENT0_BASE_SUBGRAPH_ID, makePaidQuery, type GraphResponseObservation } from "../skills/counterparty-graph/graph-client.ts"

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const header = () => JSON.stringify({ format: "arcade-graph-reservations-v1", policyHash: GRAPH_COGS_POLICY_HASH })
function fixtureLedger(allocations: readonly ("evidence" | "video")[]) {
  let previousHash = hash(header())
  const rows = allocations.map((allocation, i) => {
    const body = { sequence: i + 1, previousHash, allocation, queryHash: hash("synthetic-query-" + i), amountAtomic: "10000" }
    const rowHash = hash(JSON.stringify(body)); previousHash = rowHash
    return JSON.stringify({ ...body, hash: rowHash })
  })
  return [header(), ...rows].join("\n") + "\n"
}
function owned(fn: (dir: string) => void) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "arcade-graph-budget-test-")))
  chmodSync(dir, 0o700)
  try { fn(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
}
test("fixed policy cannot become a new payer, namespace, amount or live approval", () => {
  expect(Object.isFrozen(GRAPH_COGS_POLICY)).toBe(true)
  expect(GRAPH_COGS_POLICY.payer).toBe("0x776d8acf230a371676e637199943aa6e00b7adca")
  expect(GRAPH_COGS_POLICY.queryCostAtomic).toBe("10000")
  expect(GRAPH_COGS_POLICY.totalLimit).toBe(10)
  expect(GRAPH_COGS_POLICY.evidenceLimit).toBe(5)
  expect(GRAPH_COGS_POLICY.liveEnabled).toBe(false)
  expect(GRAPH_COGS_POLICY_HASH).toBe(hash(JSON.stringify(GRAPH_COGS_POLICY)))
  for (const value of [GRAPH_COGS_POLICY.payer, GRAPH_COGS_POLICY.token, GRAPH_COGS_POLICY.merchant, GRAPH_COGS_POLICY.subject]) {
    expect(value).toMatch(/^0x[0-9a-f]{40}$/)
  }
})
test("empty state is not proof of permission or a current balance", () => {
  const result = decodeGraphReservations(fixtureLedger([]))
  expect(result).toEqual({ reservations: 0, evidence: 0, video: 0, reservedAtomic: "0", unresolved: 0, lastHash: hash(header()), liveEnabled: false, paymentProof: "not_checked" })
  expect(Object.isFrozen(result)).toBe(true)
})
test("all ten reservations survive decoding with five kept in the evidence allocation", () => {
  const text = fixtureLedger([...Array<"evidence">(5).fill("evidence"), ...Array<"video">(5).fill("video")])
  const result = decodeGraphReservations(text)
  expect(result.reservations).toBe(10); expect(result.evidence).toBe(5)
  expect(result.video).toBe(5); expect(result.reservedAtomic).toBe("100000")
  expect(result.unresolved).toBe(10); expect(result.paymentProof).toBe("not_checked")
  expect(decodeGraphReservations(text)).toEqual(result)
})
test("six evidence reservations and eleven global reservations both refuse", () => {
  expect(() => decodeGraphReservations(fixtureLedger(Array<"evidence">(6).fill("evidence")))).toThrow("graph_cogs_state_invalid")
  expect(() => decodeGraphReservations(fixtureLedger(Array<"video">(11).fill("video")))).toThrow("graph_cogs_state_invalid")
  expect(decodeGraphReservations(fixtureLedger(Array<"video">(10).fill("video"))).video).toBe(10)
})
test("truncation, alternate JSON spellings, wrong policy, extra lines and fields refuse", () => {
  const text = fixtureLedger(["evidence"])
  for (const bad of ["", text.trimEnd(), text + "\n", text.replace("10000", "10001"),
    text.replace(GRAPH_COGS_POLICY_HASH, "0".repeat(64)), text.replace('"sequence":1', '"sequence":1,"reset":true'),
    text.replace('"sequence":1', '"sequence":1,"sequence":1'), text.replace('"sequence":1', '"sequence":1.0'),
    text.replace('"sequence":1', '"sequence":2'), text.replace('"allocation":"evidence"', '"allocation":"refund"'),
    text.replace("{", "{ "), " ".repeat(32769)]) {
    expect(() => decodeGraphReservations(bad)).toThrow("graph_cogs_state_invalid")
  }
})
test("recomputed hashes do not permit duplicate query reservations", () => {
  const first = JSON.parse(fixtureLedger(["evidence"]).split("\n")[1]!) as { queryHash: string; hash: string }
  const body = { sequence: 2, previousHash: first.hash, allocation: "video", queryHash: first.queryHash, amountAtomic: "10000" }
  const text = fixtureLedger(["evidence"]) + JSON.stringify({ ...body, hash: hash(JSON.stringify(body)) }) + "\n"
  expect(() => decodeGraphReservations(text)).toThrow("graph_cogs_state_invalid")
})
test("disconnected chains and signed/refund state cannot be smuggled into the reservation format", () => {
  const text = fixtureLedger(["evidence", "video"])
  const rows = text.trimEnd().split("\n")
  const second = JSON.parse(rows[2]!) as Record<string, unknown>
  second.previousHash = "1".repeat(64)
  expect(() => decodeGraphReservations([rows[0], rows[1], JSON.stringify(second), ""].join("\n"))).toThrow()
  expect(() => decodeGraphReservations(text.replace('"allocation":"video"', '"allocation":"video","signed":false'))).toThrow()
})
test("balance predicate preserves 0.90 USDC with exactly one 0.01 reservation and no rounding", () => {
  expect(checkGraphBalance("1000000")).toEqual({ balanceAtomic: "1000000", minimumBeforeAtomic: "910000", floorAtomic: "900000" })
  expect(checkGraphBalance("910000").balanceAtomic).toBe("910000")
  for (const bad of ["909999", "900000", "899999", "0.91", "0910000", "-1", "NaN", "1e6", (1n << 256n).toString()]) {
    expect(() => checkGraphBalance(bad)).toThrow("graph_cogs_balance_refused")
  }
})
test("private audit is byte-preserving and rejects linked or public files", () => owned(dir => {
  const path = join(dir, "reservations.jsonl"), text = fixtureLedger(["evidence"])
  writeFileSync(path, text, { mode: 0o600 })
  expect(readGraphReservations(path).reservations).toBe(1)
  expect(readFileSync(path, "utf8")).toBe(text)
  chmodSync(path, 0o644); expect(() => readGraphReservations(path)).toThrow(); chmodSync(path, 0o600)
  symlinkSync(path, join(dir, "alias.jsonl")); expect(() => readGraphReservations(join(dir, "alias.jsonl"))).toThrow()
  linkSync(path, join(dir, "hard.jsonl")); expect(() => readGraphReservations(path)).toThrow()
}))
test("parent aliases, wrong directory modes, oversized files and traversal refuse", () => owned(dir => {
  const sub = join(dir, "private"); mkdirSync(sub, { mode: 0o700 })
  const path = join(sub, "reservations.jsonl"); writeFileSync(path, fixtureLedger([]), { mode: 0o600 })
  symlinkSync(sub, join(dir, "alias")); expect(() => readGraphReservations(join(dir, "alias", "reservations.jsonl"))).toThrow()
  expect(() => readGraphReservations(sub + "/../private/reservations.jsonl")).toThrow()
  chmodSync(sub, 0o755); expect(() => readGraphReservations(path)).toThrow(); chmodSync(sub, 0o700)
  writeFileSync(path, "x".repeat(32769)); expect(() => readGraphReservations(path)).toThrow()
}))
test("the on-disk format rejects a UTF-8 BOM rather than silently changing audited bytes", () => owned(dir => {
  const path = join(dir, "reservations.jsonl")
  writeFileSync(path, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(fixtureLedger([]))]), { mode: 0o600 })
  expect(() => readGraphReservations(path)).toThrow("graph_cogs_state_invalid")
}))
test("native import and help are inert; live and unknown flags refuse without external commands", () => {
  const source = resolve(import.meta.dir, "e2e-graph-cogs.ts")
  const run = (...args: string[]) => spawnSync(process.execPath, ["--no-env-file", ...args], { cwd: tmpdir(), env: { PATH: "" }, encoding: "utf8", timeout: 3000, maxBuffer: 32768 })
  const imported = run("-e", `await import(${JSON.stringify(source)})`)
  expect(imported.status).toBe(0); expect(imported.stdout).toBe(""); expect(imported.stderr).toBe("")
  const help = run(source, "--help"); expect(help.status).toBe(0); expect(help.stdout).toContain("Read-only")
  for (const args of [["--live"], ["--reset"], ["--audit-reservations"], ["--help", "--live"]]) {
    const child = run(source, ...args); expect(child.status).toBe(2); expect(child.stdout).toBe("")
    expect(child.stderr.trim()).toBe("graph_cogs_arguments_invalid")
  }
  const status = run(source); expect(status.status).toBe(1)
  expect(JSON.parse(status.stdout)).toMatchObject({ liveEvidence: "NOT_RUN", liveEnabled: false, state: "not_checked" })
})
test("native readonly audit reports reservations, never paid results or private locations", () => owned(dir => {
  const path = join(dir, "reservations.jsonl"); writeFileSync(path, fixtureLedger(["evidence"]), { mode: 0o600 })
  const result = spawnSync(process.execPath, ["--no-env-file", resolve(import.meta.dir, "e2e-graph-cogs.ts"), "--audit-reservations", path], {
    cwd: tmpdir(), env: { PATH: "" }, encoding: "utf8", timeout: 3000, maxBuffer: 32768
  })
  expect(result.status).toBe(1); expect(result.stderr).toBe("")
  expect(result.stdout).not.toContain(dir); expect(JSON.parse(result.stdout)).toMatchObject({ liveEvidence: "NOT_RUN", state: "validated", reservations: 1, unresolved: 1, paymentProof: "not_checked" })
}))
test("shell rejects live before Bun and does not interpret an arbitrary option as a filename", () => {
  for (const args of [["--live"], ["--audit-reservations", "--reset"]]) {
    const result = spawnSync("/bin/sh", [resolve(import.meta.dir, "e2e-graph-cogs.sh"), ...args], { env: { PATH: "" }, encoding: "utf8", timeout: 2000 })
    expect(result.status).toBe(2); expect(result.stdout).toBe("")
    expect(result.stderr.trim()).toBe("graph_cogs_arguments_invalid")
  }
})

const reservation = () => ({ allocation: "evidence" as const, queryHash: hash("synthetic-reservation"), balanceAtomic: "1000000" })
test("explicit initialization is exclusive; reopen retains an unresolved reservation", () => owned(parent => {
  const dir = initializeGraphReservationState(parent)
  expect(dir).toBe(join(parent, GRAPH_COGS_POLICY.namespace))
  expect(() => initializeGraphReservationState(parent)).toThrow("graph_cogs_writer_refused")
  const writer = openGraphReservationWriter(parent)
  expect(writer.snapshot().reservations).toBe(0)
  const result = writer.reserve(reservation())
  expect(result.reservations).toBe(1); expect(result.unresolved).toBe(1)
  const bytes = readFileSync(join(dir, "reservations.jsonl"))
  expect(existsSync(join(dir, "head-01.json"))).toBe(true)
  writer.close(); writer.close()
  expect(existsSync(join(dir, ".claim"))).toBe(false)
  const reopened = openGraphReservationWriter(parent)
  expect(reopened.snapshot()).toEqual(result)
  expect(() => reopened.reserve({ ...reservation(), queryHash: hash("another-query") })).toThrow("graph_cogs_writer_refused")
  reopened.close()
  expect(readFileSync(join(dir, "reservations.jsonl"))).toEqual(bytes)
}))
test("missing state is not initialized by opening and an active claim is never stolen", () => owned(parent => {
  expect(() => openGraphReservationWriter(parent)).toThrow("graph_cogs_writer_refused")
  expect(readdirSync(parent)).toEqual([])
  const dir = initializeGraphReservationState(parent), writer = openGraphReservationWriter(parent)
  const claim = readFileSync(join(dir, ".claim"))
  expect(() => openGraphReservationWriter(parent)).toThrow("graph_cogs_writer_refused")
  expect(readFileSync(join(dir, ".claim"))).toEqual(claim)
  writer.close()
}))
test("invalid allocation, low balance and getters cannot append a reservation", () => owned(parent => {
  const dir = initializeGraphReservationState(parent), writer = openGraphReservationWriter(parent)
  const before = readFileSync(join(dir, "reservations.jsonl")); let invoked = false
  for (const value of [{ ...reservation(), balanceAtomic: "909999" }, { ...reservation(), allocation: "refund" },
    { ...reservation(), runId: "new-budget" }, { allocation: "evidence", get queryHash() { invoked = true; return hash("bad") }, balanceAtomic: "1000000" }]) {
    expect(() => writer.reserve(value)).toThrow("graph_cogs_writer_refused")
  }
  expect(invoked).toBe(false); writer.close()
  expect(readFileSync(join(dir, "reservations.jsonl"))).toEqual(before)
}))
test("persisted journal without its head receipt poisons the claim and never acknowledges", () => owned(parent => {
  const dir = initializeGraphReservationState(parent)
  const writer = openGraphReservationWriter(parent, { afterJournalSync() { throw Error("synthetic storage interruption") } })
  expect(() => writer.reserve(reservation())).toThrow("graph_cogs_writer_refused")
  expect(readGraphReservations(join(dir, "reservations.jsonl")).reservations).toBe(1)
  expect(existsSync(join(dir, "head-01.json"))).toBe(false)
  expect(() => writer.close()).toThrow("graph_cogs_writer_refused")
  expect(existsSync(join(dir, ".claim"))).toBe(true)
  expect(() => openGraphReservationWriter(parent)).toThrow("graph_cogs_writer_refused")
  expect(() => initializeGraphReservationState(parent)).toThrow("graph_cogs_writer_refused")
}))
test("a real child death after journal sync leaves durable exposure and a retained claim", () => owned(parent => {
  const dir = initializeGraphReservationState(parent)
  const source = resolve(import.meta.dir, "e2e-graph-cogs.ts")
  const code = `import {openGraphReservationWriter} from ${JSON.stringify(source)};
    const writer=openGraphReservationWriter(${JSON.stringify(parent)},{afterJournalSync(){process.exit(27)}});
    writer.reserve(${JSON.stringify(reservation())});process.exit(99)`
  const child = spawnSync(process.execPath, ["--no-env-file", "-e", code], { cwd: tmpdir(), env: { PATH: "" }, encoding: "utf8", timeout: 3000, maxBuffer: 32768 })
  expect(child.status).toBe(27); expect(child.stdout).toBe(""); expect(child.stderr).toBe("")
  expect(readGraphReservations(join(dir, "reservations.jsonl")).reservedAtomic).toBe("10000")
  expect(existsSync(join(dir, ".claim"))).toBe(true)
  expect(() => openGraphReservationWriter(parent)).toThrow("graph_cogs_writer_refused")
}))
test("head corruption and unexpected files refuse rather than silently repairing state", () => owned(parent => {
  const dir = initializeGraphReservationState(parent), path = join(dir, "head-00.json")
  const original = readFileSync(path)
  writeFileSync(path, "{}\n")
  expect(() => openGraphReservationWriter(parent)).toThrow("graph_cogs_writer_refused")
  expect(readFileSync(path, "utf8")).toBe("{}\n")
  expect(existsSync(join(dir, ".claim"))).toBe(true)
  expect(original.length).toBeGreaterThan(0)
}))
test("hard-linked head receipts are rejected before any reservation write", () => owned(parent => {
  const dir = initializeGraphReservationState(parent)
  linkSync(join(dir, "head-00.json"), join(parent, "head-copy.json"))
  expect(() => openGraphReservationWriter(parent)).toThrow("graph_cogs_writer_refused")
  expect(readGraphReservations(join(dir, "reservations.jsonl")).reservations).toBe(0)
}))
test("a caught re-entrant close cannot turn a poisoned reservation into an acknowledgement", () => owned(parent => {
  const dir = initializeGraphReservationState(parent)
  let writer: GraphReservationWriter
  writer = openGraphReservationWriter(parent, { afterJournalSync() { try { writer.close() } catch { /* injected owner misuse */ } } })
  expect(() => writer.reserve(reservation())).toThrow("graph_cogs_writer_refused")
  expect(() => writer.close()).toThrow("graph_cogs_writer_refused")
  expect(existsSync(join(dir, ".claim"))).toBe(true)
}))
test("a nested reserve cannot clear the outer writer's busy flag", () => owned(parent => {
  const dir = initializeGraphReservationState(parent)
  let writer: GraphReservationWriter
  writer = openGraphReservationWriter(parent, { afterJournalSync() {
    try { writer.reserve(reservation()) } catch { /* injected re-entry */ }
  } })
  expect(() => writer.reserve(reservation())).toThrow("graph_cogs_writer_refused")
  expect(() => writer.close()).toThrow("graph_cogs_writer_refused")
  expect(readGraphReservations(join(dir, "reservations.jsonl")).reservations).toBe(1)
  expect(existsSync(join(dir, "head-01.json"))).toBe(false)
}))
test("a separate process cannot claim held state and can open only after the owner closes", () => owned(parent => {
  const dir = initializeGraphReservationState(parent), writer = openGraphReservationWriter(parent)
  const source = resolve(import.meta.dir, "e2e-graph-cogs.ts")
  const code = `import {openGraphReservationWriter} from ${JSON.stringify(source)};
    try{const writer=openGraphReservationWriter(${JSON.stringify(parent)});writer.close();process.stdout.write("opened");}
    catch{process.stdout.write("refused");process.exitCode=1}`
  const run = () => spawnSync(process.execPath, ["--no-env-file", "-e", code], { cwd: tmpdir(), env: { PATH: "" }, encoding: "utf8", timeout: 3000, maxBuffer: 32768 })
  const held = run(); expect(held.status).toBe(1); expect(held.stdout).toBe("refused"); expect(held.stderr).toBe("")
  expect(writer.snapshot().reservations).toBe(0); writer.close()
  const released = run(); expect(released.status).toBe(0); expect(released.stdout).toBe("opened"); expect(released.stderr).toBe("")
  expect(existsSync(join(dir, ".claim"))).toBe(false)
}))
test("unexpected state files cannot become an alternate run or reset namespace", () => owned(parent => {
  const dir = initializeGraphReservationState(parent)
  writeFileSync(join(dir, "run-2.json"), "{}", { mode: 0o600 })
  expect(() => openGraphReservationWriter(parent)).toThrow("graph_cogs_writer_refused")
  expect(readFileSync(join(dir, "run-2.json"), "utf8")).toBe("{}")
  expect(readGraphReservations(join(dir, "reservations.jsonl")).reservations).toBe(0)
}))
test("writer initialization refuses a public or aliased parent before creating state", () => owned(parent => {
  chmodSync(parent, 0o755)
  expect(() => initializeGraphReservationState(parent)).toThrow("graph_cogs_writer_refused")
  expect(readdirSync(parent)).toEqual([]); chmodSync(parent, 0o700)
  const sub = join(parent, "private"); mkdirSync(sub, { mode: 0o700 })
  const alias = join(parent, "alias"); symlinkSync(sub, alias)
  expect(() => initializeGraphReservationState(alias)).toThrow("graph_cogs_writer_refused")
  expect(readdirSync(sub)).toEqual([])
}))

const observedAt = 1_800_000_000_000
const block = () => ({ number: "0x123", hash: "0x" + "a".repeat(64), timestamp: "0x" + Math.floor(observedAt / 1000).toString(16) })
type RpcCall = { url: string; init: RequestInit; id: number; method: string; params: unknown[] }
function balanceTransport(change?: (call: RpcCall, value: unknown) => Response | undefined) {
  const calls: RpcCall[] = []
  const fetch: GraphBalanceTransport = async (url, init) => {
    const body = JSON.parse(String(init.body)) as { id: number; method: string; params: unknown[] }
    const call = { url, init, ...body }; calls.push(call)
    const value: unknown = body.method === "eth_chainId" ? "0x2105" :
      body.method === "eth_call" ? "0x" + (1000000n).toString(16).padStart(64, "0") : block()
    return change?.(call, value) ?? new Response(JSON.stringify({ result: value, id: body.id, jsonrpc: "2.0" }), { headers: { "content-type": "application/json" } })
  }
  return { fetch, calls }
}
test("balance observation pins all four readonly requests to one payer/token/block", async () => {
  const transport = balanceTransport()
  const result = await readGraphBalance(transport.fetch, { now: () => observedAt })
  expect(transport.calls.map(call => call.method)).toEqual(["eth_chainId", "eth_getBlockByNumber", "eth_call", "eth_getBlockByNumber"])
  expect(transport.calls.map(call => call.id)).toEqual([1, 2, 3, 4])
  for (const call of transport.calls) {
    expect(call.url).toBe(GRAPH_COGS_RPC); expect(call.init.method).toBe("POST")
    expect(call.init.redirect).toBe("error"); expect(call.init.credentials).toBe("omit")
  }
  expect(transport.calls[2]!.params).toEqual([{ to: GRAPH_COGS_POLICY.token, data: "0x70a08231" + GRAPH_COGS_POLICY.payer.slice(2).padStart(64, "0") }, "0x123"])
  expect(transport.calls[3]!.params).toEqual(["0x123", false])
  expect(result).toMatchObject({ chain: "eip155:8453", payer: GRAPH_COGS_POLICY.payer, token: GRAPH_COGS_POLICY.token,
    balanceAtomic: "1000000", blockNumber: "291", blockHash: block().hash, blockTimestamp: observedAt / 1000, observedAt })
  expect(result.responseHashes).toHaveLength(4); expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.responseHashes)).toBe(true)
})
test("valid low balances are retained as observations, not silently admitted", async () => {
  const t = balanceTransport((call, value) => call.method === "eth_call" ?
    new Response(JSON.stringify({ jsonrpc: "2.0", id: call.id, result: "0x" + (899999n).toString(16).padStart(64, "0") }), { headers: { "content-type": "application/json" } }) : undefined)
  const observed = await readGraphBalance(t.fetch, { now: () => observedAt })
  expect(observed.balanceAtomic).toBe("899999")
  expect(() => checkGraphBalance(observed.balanceAtomic)).toThrow("graph_cogs_balance_refused")
})
test("wrong chain or envelope ID refuses before any balance request", async () => {
  for (const body of [{ jsonrpc: "2.0", id: 1, result: "0x1" }, { jsonrpc: "2.0", id: 2, result: "0x2105" },
    { jsonrpc: "2.0", id: 1, result: "0x2105", error: null }]) {
    const t = balanceTransport(() => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }))
    await expect(readGraphBalance(t.fetch, { now: () => observedAt })).rejects.toThrow("graph_cogs_balance_unavailable")
    expect(t.calls).toHaveLength(1)
  }
})
test("short quantities, malformed data and changed or stale blocks refuse without retries", async () => {
  for (const invalid of ["0x1", "0x" + "0".repeat(63), "0x" + "g".repeat(64), 1000000]) {
    const t = balanceTransport(call => call.method === "eth_call" ?
      new Response(JSON.stringify({ jsonrpc: "2.0", id: call.id, result: invalid }), { headers: { "content-type": "application/json" } }) : undefined)
    await expect(readGraphBalance(t.fetch, { now: () => observedAt })).rejects.toThrow("graph_cogs_balance_unavailable")
    expect(t.calls).toHaveLength(3)
  }
  for (const altered of [{ ...block(), hash: "0x" + "b".repeat(64) }, { ...block(), number: "0x124" }]) {
    const t = balanceTransport(call => call.id === 4 ?
      new Response(JSON.stringify({ jsonrpc: "2.0", id: call.id, result: altered }), { headers: { "content-type": "application/json" } }) : undefined)
    await expect(readGraphBalance(t.fetch, { now: () => observedAt })).rejects.toThrow("graph_cogs_balance_unavailable")
    expect(t.calls).toHaveLength(4)
  }
  const stale = balanceTransport(call => call.id === 2 ?
    new Response(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { ...block(), timestamp: "0x1" } }), { headers: { "content-type": "application/json" } }) : undefined)
  await expect(readGraphBalance(stale.fetch, { now: () => observedAt })).rejects.toThrow("graph_cogs_balance_unavailable")
  expect(stale.calls).toHaveLength(2)
})
test("HTTP status, content encoding, URL and length do not bypass balance validation", async () => {
  const good = JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x2105" })
  const options: Response[] = [
    new Response(good, { status: 500, headers: { "content-type": "application/json" } }),
    new Response(good, { headers: { "content-type": "application/json", "content-encoding": "gzip" } }),
    new Response(good, { headers: { "content-type": "text/html" } }),
    new Response(good, { headers: { "content-type": "application/json", "content-length": "99999" } }),
    new Response("x".repeat(131073), { headers: { "content-type": "application/json" } }),
  ]
  const mismatched = new Response(good, { headers: { "content-type": "application/json" } })
  Object.defineProperty(mismatched, "url", { value: "https://unexpected.invalid/" }); options.push(mismatched)
  for (const response of options) {
    let calls = 0
    await expect(readGraphBalance(async () => { calls++; return response }, { now: () => observedAt })).rejects.toThrow("graph_cogs_balance_unavailable")
    expect(calls).toBe(1)
  }
})
test("pre-abort makes zero requests and abort during a response prevents the next request", async () => {
  const controller = new AbortController(); controller.abort()
  const t = balanceTransport()
  await expect(readGraphBalance(t.fetch, { signal: controller.signal, now: () => observedAt })).rejects.toThrow("graph_cogs_balance_unavailable")
  expect(t.calls).toHaveLength(0)
  const during = new AbortController()
  const slow = balanceTransport(() => { during.abort(); return undefined })
  await expect(readGraphBalance(slow.fetch, { signal: during.signal, now: () => observedAt })).rejects.toThrow("graph_cogs_balance_unavailable")
  expect(slow.calls).toHaveLength(1)
})
test("a deadline cancels a late response body and never issues a second request", async () => {
  let release: ((response: Response) => void) | undefined, calls = 0, cancelled = false
  const transport: GraphBalanceTransport = () => { calls++; return new Promise(resolve => { release = resolve }) }
  await expect(readGraphBalance(transport, { timeoutMs: 20 })).rejects.toThrow("graph_cogs_balance_unavailable")
  expect(calls).toBe(1)
  const response = new Response(new ReadableStream({ cancel() { cancelled = true } }), { headers: { "content-type": "application/json" } })
  release!(response)
  await new Promise(resolve => setTimeout(resolve, 10))
  expect(cancelled).toBe(true); expect(calls).toBe(1)
})
test("the final observation timestamp must still satisfy the acquisition deadline", async () => {
  let clockReads = 0
  await readGraphBalance(balanceTransport().fetch, { now: () => { clockReads++; return observedAt } })
  let secondReads = 0
  await expect(readGraphBalance(balanceTransport().fetch, { now: () => {
    secondReads++; return secondReads === clockReads ? observedAt + 6000 : observedAt
  } })).rejects.toThrow("graph_cogs_balance_unavailable")
})
test("bounded empty response chunks cannot starve the deadline or trigger another request", async () => {
  let calls = 0, cancelled = false
  const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(0)) }, cancel() { cancelled = true } })
  await expect(readGraphBalance(async () => {
    calls++; return new Response(body, { headers: { "content-type": "application/json" } })
  }, { now: () => observedAt })).rejects.toThrow("graph_cogs_balance_unavailable")
  expect(calls).toBe(1); expect(cancelled).toBe(true)
})

function sourceCopy(parent: string) {
  const dir = join(parent, "source"); mkdirSync(dir, { mode: 0o700 })
  for (const path of GRAPH_COGS_SOURCE_FILES) {
    mkdirSync(dirname(join(dir, path)), { recursive: true, mode: 0o700 })
    copyFileSync(resolve(import.meta.dir, "..", path), join(dir, path))
  }
  return dir
}
const identityQuery = () => ({ subgraphId: AGENT0_BASE_SUBGRAPH_ID, document: document("identities"), variables: { address: GRAPH_COGS_POLICY.subject } })
test("canonical query bindings carry exact source/body digests without private paths", () => owned(parent => {
  const dir = sourceCopy(parent), sources = readGraphSourceManifest(dir)
  const bound = bindGraphQuery(identityQuery(), sources)
  expect(Object.isFrozen(sources)).toBe(true); expect(Object.isFrozen(sources.files)).toBe(true)
  expect(sources.files.every(row => Object.isFrozen(row))).toBe(true)
  expect(() => Object.defineProperty(sources.files[0], "sha256", { value: hash("forged") })).toThrow()
  expect(Object.isFrozen(bound)).toBe(true)
  expect(bound.kind).toBe("identities"); expect(bound.parentQueryHash).toBe(null); expect(bound.blockHash).toBe(null)
  expect(bound.policyHash).toBe(GRAPH_COGS_POLICY_HASH); expect(bound.sourceHash).toBe(sources.sourceHash)
  expect(bound.bodySha256).toBe(hash(bound.body))
  expect(JSON.parse(bound.body)).toEqual({ query: document("identities"), variables: { address: GRAPH_COGS_POLICY.subject } })
  expect(bound.queryHash).toMatch(/^[a-f0-9]{64}$/)
  expect(bindGraphQuery(identityQuery(), sources)).toEqual(bound)
  expect(JSON.stringify({ sources, bound })).not.toContain(dir)
  expect(sources.files.map(row => row.path)).toEqual([...GRAPH_COGS_SOURCE_FILES])
}))
test("forged manifests, foreign subjects and source changes cannot silently create new authority", () => owned(parent => {
  const dir = sourceCopy(parent), sources = readGraphSourceManifest(dir)
  expect(() => bindGraphQuery(identityQuery(), { ...sources })).toThrow("graph_cogs_binding_refused")
  expect(() => bindGraphQuery({ ...identityQuery(), variables: { address: GRAPH_COGS_POLICY.payer } }, sources)).toThrow("graph_cogs_binding_refused")
  writeFileSync(join(dir, "skills/counterparty-graph/run.ts"), "// changed fixture source\n")
  expect(() => bindGraphQuery(identityQuery(), sources)).toThrow("graph_cogs_binding_refused")
  const current = readGraphSourceManifest(dir)
  expect(current.sourceHash).not.toBe(sources.sourceHash)
}))
test("attestation binding requires an identities parent from the same source and declared block", () => owned(parent => {
  const dir = sourceCopy(parent), sources = readGraphSourceManifest(dir), first = bindGraphQuery(identityQuery(), sources)
  const blockHash = "0x" + "b".repeat(64)
  const args = { subgraphId: AGENT0_BASE_SUBGRAPH_ID, document: document("attestations"), variables: { agentIds: ["8453:7"], block: { hash: blockHash } } }
  expect(() => bindGraphQuery(args, sources)).toThrow("graph_cogs_binding_refused")
  const second = bindGraphQuery(args, sources, { binding: first, blockHash })
  expect(second.kind).toBe("attestations"); expect(second.parentQueryHash).toBe(first.queryHash)
  expect(second.blockHash).toBe(blockHash); expect(second.queryHash).not.toBe(first.queryHash)
  expect(() => bindGraphQuery(args, sources, { binding: { ...first }, blockHash })).toThrow("graph_cogs_binding_refused")
  expect(() => bindGraphQuery(args, sources, { binding: first, blockHash: "0x" + "c".repeat(64) })).toThrow("graph_cogs_binding_refused")
  expect(() => bindGraphQuery(args, sources, { binding: second, blockHash })).toThrow("graph_cogs_binding_refused")
  expect(() => bindGraphQuery(identityQuery(), sources, { binding: first, blockHash })).toThrow("graph_cogs_binding_refused")
  writeFileSync(join(dir, "skills/counterparty-graph/run.ts"), "// different fixture version\n")
  expect(() => bindGraphQuery(args, readGraphSourceManifest(dir), { binding: first, blockHash })).toThrow("graph_cogs_binding_refused")
}))
test("the existing query validator still rejects unsupported documents and open variables", () => owned(parent => {
  const sources = readGraphSourceManifest(sourceCopy(parent))
  for (const args of [{ ...identityQuery(), document: "query { arbitrary }" },
    { ...identityQuery(), subgraphId: "foreign" },
    { ...identityQuery(), variables: { address: GRAPH_COGS_POLICY.subject, secret: "fixture" } }]) {
    expect(() => bindGraphQuery(args, sources)).toThrow("graph_cogs_binding_refused")
  }
}))
test("source manifests refuse hardlinked allowlisted files", () => owned(parent => {
  const dir = sourceCopy(parent), path = join(dir, "skills/counterparty-graph/run.ts")
  linkSync(path, join(parent, "linked.ts"))
  expect(() => readGraphSourceManifest(dir)).toThrow("graph_cogs_binding_refused")
}))
test("missing, oversized, invalid UTF-8 and symlinked source files refuse", () => {
  for (const kind of ["missing", "oversized", "utf8", "symlink"] as const) owned(parent => {
    const dir = sourceCopy(parent), path = join(dir, "skills/counterparty-graph/queries/identities.graphql")
    if (kind === "missing") unlinkSync(path)
    else if (kind === "oversized") writeFileSync(path, "a".repeat(8193))
    else if (kind === "utf8") writeFileSync(path, Buffer.from([0xff]))
    else { renameSync(path, join(parent, "query.graphql")); symlinkSync(join(parent, "query.graphql"), path) }
    expect(() => readGraphSourceManifest(dir)).toThrow("graph_cogs_binding_refused")
  })
})
test("a symlinked parent directory cannot stand in for source provenance", () => owned(parent => {
  const dir = sourceCopy(parent), path = join(dir, "skills/counterparty-graph/queries")
  renameSync(path, join(parent, "queries")); symlinkSync(join(parent, "queries"), path)
  expect(() => readGraphSourceManifest(dir)).toThrow("graph_cogs_binding_refused")
}))
test("a fresh manifest with different query bytes cannot bind the client's original body", () => owned(parent => {
  const dir = sourceCopy(parent), args = identityQuery()
  writeFileSync(join(dir, "skills/counterparty-graph/queries/identities.graphql"), args.document + "\n# different fixture query\n")
  expect(() => bindGraphQuery(args, readGraphSourceManifest(dir))).toThrow("graph_cogs_binding_refused")
}))
test("the default manifest reads only current allowlisted disk sources and grants no live authority", () => {
  const sources = readGraphSourceManifest(), result = bindGraphQuery(identityQuery(), sources)
  expect(sources.files).toHaveLength(9)
  expect(sources.files.every(row => row.sha256 === hash(readFileSync(resolve(import.meta.dir, "..", row.path), "utf8")))).toBe(true)
  expect(result.sourceHash).toBe(hash(JSON.stringify(sources.files)))
  expect(GRAPH_COGS_POLICY.liveEnabled).toBe(false)
})

test("a private recorder persists exact response bytes before acknowledgement without creating payment proof", async () => {
  let work: Promise<void> | undefined
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "arcade-graph-recorder-test-")))
  try {
    const binding = bindGraphQuery(identityQuery(), readGraphSourceManifest(sourceCopy(parent)))
    const recorder = createGraphResponseRecorder(parent, binding)
    const body = Buffer.from([0xff, 0, 0x61]), observation = {
      phase: "challenge" as const, requestUrl: binding.endpoint, requestBodySha256: binding.bodySha256,
      responseUrl: binding.endpoint, redirected: false, status: 402, complete: true as const,
      headers: { "content-type": "application/json", "content-length": "3", "content-encoding": null,
        "payment-required": "synthetic-challenge", "payment-response": null },
      bodyBase64: body.toString("base64"), bodySha256: createHash("sha256").update(body).digest("hex"),
    }
    work = recorder.observe(observation, new AbortController().signal); await work
    const stored = JSON.parse(readFileSync(join(parent, "query-" + binding.queryHash, "response-01.json"), "utf8"))
    expect(stored.observation).toEqual(observation)
    expect(recorder.snapshot()).toMatchObject({ responses: 1, paidResponses: 0, receiptProof: "not_checked" })
    recorder.close()
  } finally { await work?.catch(() => {}); rmSync(parent, { recursive: true, force: true }) }
})

async function captureOwned(fn: (f: { parent: string; source: string; binding: GraphQueryBinding; dir: string }) => Promise<void>) {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "arcade-graph-recorder-test-")))
  try {
    const source = sourceCopy(parent), binding = bindGraphQuery(identityQuery(), readGraphSourceManifest(source))
    await fn({ parent, source, binding, dir: join(parent, "query-" + binding.queryHash) })
  } finally { rmSync(parent, { recursive: true, force: true }) }
}
function observation(binding: GraphQueryBinding, phase: GraphResponseObservation["phase"] = "challenge", body = "fixture"): GraphResponseObservation {
  return { phase, requestUrl: phase === "rpc" ? GRAPH_COGS_RPC : binding.endpoint, requestBodySha256: binding.bodySha256,
    responseUrl: "", redirected: false, status: phase === "challenge" ? 402 : 200, complete: true,
    headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)), "content-encoding": null,
      "payment-required": phase === "challenge" ? "fixture" : null, "payment-response": phase === "paid" ? "fixture" : null },
    bodyBase64: Buffer.from(body).toString("base64"), bodySha256: hash(body) }
}
const captureSignal = () => new AbortController().signal
test("exclusive private capture retains its evidence after clean close and cannot be reset by creation", () => captureOwned(async f => {
  const recorder = createGraphResponseRecorder(f.parent, f.binding)
  expect(() => createGraphResponseRecorder(f.parent, f.binding)).toThrow("graph_cogs_capture_refused")
  await recorder.observe(observation(f.binding), captureSignal())
  await recorder.observe(observation(f.binding, "rpc"), captureSignal())
  const summary = recorder.snapshot(); expect(Object.isFrozen(summary)).toBe(true)
  expect(summary.responses).toBe(2); expect(summary.paidResponses).toBe(0)
  const first = JSON.parse(readFileSync(join(f.dir, "response-01.json"), "utf8"))
  const second = JSON.parse(readFileSync(join(f.dir, "response-02.json"), "utf8"))
  expect(second.previousHash).toBe(first.hash); expect(summary.lastHash).toBe(second.hash)
  expect(lstatSync(f.dir).mode & 0o777).toBe(0o700)
  for (const file of readdirSync(f.dir)) expect(lstatSync(join(f.dir, file)).mode & 0o777).toBe(0o600)
  recorder.close(); recorder.close()
  expect(existsSync(join(f.dir, ".claim"))).toBe(false)
  expect(existsSync(join(f.dir, "response-02.json"))).toBe(true)
  expect(() => createGraphResponseRecorder(f.parent, f.binding)).toThrow("graph_cogs_capture_refused")
}))
test("complete paid errors are captured once without being declared receipt-proven", async () => {
  for (const status of [402, 500]) await captureOwned(async f => {
    const recorder = createGraphResponseRecorder(f.parent, f.binding)
    await recorder.observe(observation(f.binding), captureSignal())
    const paid = { ...observation(f.binding, "paid", "private provider diagnostic"), status }
    await recorder.observe(paid, captureSignal())
    expect(recorder.snapshot()).toMatchObject({ responses: 2, paidResponses: 1, receiptProof: "not_checked" })
    expect(JSON.parse(readFileSync(join(f.dir, "response-02.json"), "utf8")).observation).toEqual(paid)
    await expect(recorder.observe(paid, captureSignal())).rejects.toThrow("graph_cogs_capture_refused")
    expect(() => recorder.close()).toThrow("graph_cogs_capture_refused")
    expect(existsSync(join(f.dir, ".claim"))).toBe(true)
  })
})
test("the actual client observer durably records a malformed challenge before the original validator refuses", () => captureOwned(async f => {
  const recorder = createGraphResponseRecorder(f.parent, f.binding); let calls = 0
  const net = Object.assign(async () => { calls++; return new Response("actual bounded body", { status: 402, headers: { "payment-required": "invalid" } }) }, { preconnect() {} })
  await expect(makePaidQuery("0x" + "11".repeat(32), { fetch: net, observeResponse: recorder.observe })(identityQuery())).rejects.toThrow("graph query could not be completed")
  expect(calls).toBe(1); expect(recorder.snapshot().responses).toBe(1)
  const stored = JSON.parse(readFileSync(join(f.dir, "response-01.json"), "utf8"))
  expect(stored.observation.bodyBase64).toBe(Buffer.from("actual bounded body").toString("base64"))
  recorder.close()
}))
test("malformed, open, unrelated or incomplete snapshots poison capture without writing a response", async () => {
  let invoked = false
  const changes: ((v: GraphResponseObservation) => unknown)[] = [
    v => ({ ...v, phase: "signer-entered" }), v => ({ ...v, requestUrl: "https://example.invalid" }),
    v => ({ ...v, requestBodySha256: hash("other query") }), v => ({ ...v, responseUrl: "https://example.invalid" }),
    v => ({ ...v, complete: false }), v => ({ ...v, status: 600 }), v => ({ ...v, redirected: "false" }),
    v => ({ ...v, bodyBase64: v.bodyBase64 + "=" }), v => ({ ...v, bodySha256: hash("other bytes") }),
    v => ({ ...v, headers: { ...v.headers, "payment-signature": "not a response header" } }),
    v => ({ ...v, headers: { ...v.headers, "content-type": "a".repeat(16385) } }),
    v => ({ ...v, headers: { ...v.headers, "content-type": "a".repeat(16384), "payment-required": "b".repeat(16384), "payment-response": "c" } }),
    v => ({ ...v, get bodyBase64() { invoked = true; return v.bodyBase64 } }),
  ]
  for (const change of changes) await captureOwned(async f => {
    const recorder = createGraphResponseRecorder(f.parent, f.binding)
    await expect(recorder.observe(change(observation(f.binding)) as GraphResponseObservation, captureSignal())).rejects.toThrow("graph_cogs_capture_refused")
    expect(existsSync(join(f.dir, "response-01.json"))).toBe(false)
    expect(() => recorder.snapshot()).toThrow("graph_cogs_capture_refused")
    expect(() => recorder.close()).toThrow("graph_cogs_capture_refused")
  })
  expect(invoked).toBe(false)
})
test("truncation, hardlinks, public modes and unexpected files block later capture", async () => {
  for (const fault of ["truncated", "hardlink", "public", "unexpected"] as const) await captureOwned(async f => {
    const recorder = createGraphResponseRecorder(f.parent, f.binding)
    await recorder.observe(observation(f.binding), captureSignal())
    const path = join(f.dir, "response-01.json")
    if (fault === "truncated") writeFileSync(path, "{}\n")
    if (fault === "hardlink") linkSync(path, join(f.parent, "linked.json"))
    if (fault === "public") chmodSync(path, 0o644)
    if (fault === "unexpected") writeFileSync(join(f.dir, "unrecognized.json"), "{}\n", { mode: 0o600 })
    await expect(recorder.observe(observation(f.binding, "rpc"), captureSignal())).rejects.toThrow("graph_cogs_capture_refused")
    expect(existsSync(join(f.dir, "response-02.json"))).toBe(false)
    expect(existsSync(join(f.dir, ".claim"))).toBe(true)
    expect(() => recorder.close()).toThrow("graph_cogs_capture_refused")
  })
})
test("source mutation invalidates a recorder before subsequent response storage", () => captureOwned(async f => {
  const recorder = createGraphResponseRecorder(f.parent, f.binding)
  writeFileSync(join(f.source, "skills/counterparty-graph/run.ts"), "// changed source fixture\n")
  await expect(recorder.observe(observation(f.binding), captureSignal())).rejects.toThrow("graph_cogs_capture_refused")
  expect(existsSync(join(f.dir, "response-01.json"))).toBe(false)
  expect(() => recorder.close()).toThrow("graph_cogs_capture_refused")
}))
test("copied bindings and public parents refuse before creating capture state", () => captureOwned(async f => {
  expect(() => createGraphResponseRecorder(f.parent, { ...f.binding })).toThrow("graph_cogs_capture_refused")
  expect(existsSync(f.dir)).toBe(false)
  chmodSync(f.parent, 0o755)
  expect(() => createGraphResponseRecorder(f.parent, f.binding)).toThrow("graph_cogs_capture_refused")
  expect(existsSync(f.dir)).toBe(false)
}))
test("pre-abort and post-sync cancellation retain uncertainty rather than acknowledging", async () => {
  for (const afterSync of [false, true]) await captureOwned(async f => {
    const controller = new AbortController()
    const recorder = createGraphResponseRecorder(f.parent, f.binding, { afterRecordSync() { if (afterSync) controller.abort() } })
    if (!afterSync) controller.abort()
    await expect(recorder.observe(observation(f.binding), controller.signal)).rejects.toThrow("graph_cogs_capture_refused")
    expect(existsSync(join(f.dir, "response-01.json"))).toBe(afterSync)
    expect(existsSync(join(f.dir, ".claim"))).toBe(true)
    expect(() => recorder.close()).toThrow("graph_cogs_capture_refused")
  })
})
test("post-sync deadline and backwards-clock observations cannot acknowledge", async () => {
  for (const delta of [5000, -1]) await captureOwned(async f => {
    let time = 100000
    const recorder = createGraphResponseRecorder(f.parent, f.binding, { now: () => time, afterRecordSync() { time += delta } })
    await expect(recorder.observe(observation(f.binding), captureSignal())).rejects.toThrow("graph_cogs_capture_refused")
    expect(existsSync(join(f.dir, "response-01.json"))).toBe(true)
    expect(() => recorder.close()).toThrow("graph_cogs_capture_refused")
  })
})
test("a caught reentrant close cannot convert a partial record into success", () => captureOwned(async f => {
  let recorder: GraphResponseRecorder
  recorder = createGraphResponseRecorder(f.parent, f.binding, { afterRecordSync() { try { recorder.close() } catch { /* injected misuse */ } } })
  await expect(recorder.observe(observation(f.binding), captureSignal())).rejects.toThrow("graph_cogs_capture_refused")
  expect(existsSync(join(f.dir, ".claim"))).toBe(true)
  expect(() => recorder.close()).toThrow("graph_cogs_capture_refused")
}))
test("actual child death after exclusive file sync leaves capture files and a non-reusable claim", () => captureOwned(async f => {
  const source = resolve(import.meta.dir, "e2e-graph-cogs.ts")
  const code = `import {readGraphSourceManifest,bindGraphQuery,createGraphResponseRecorder} from ${JSON.stringify(source)};
    const binding=bindGraphQuery(${JSON.stringify(identityQuery())},readGraphSourceManifest(${JSON.stringify(f.source)}));
    const recorder=createGraphResponseRecorder(${JSON.stringify(f.parent)},binding,{afterRecordSync(){process.exit(29)}});
    await recorder.observe(${JSON.stringify(observation(f.binding))},new AbortController().signal);process.exit(99)`
  const child = spawnSync(process.execPath, ["--no-env-file", "-e", code], { cwd: tmpdir(), env: { PATH: "" }, encoding: "utf8", timeout: 3000, maxBuffer: 32768 })
  expect(child.status).toBe(29); expect(child.stdout).toBe(""); expect(child.stderr).toBe("")
  expect(existsSync(join(f.dir, "response-01.json"))).toBe(true)
  expect(existsSync(join(f.dir, ".claim"))).toBe(true)
  expect(() => createGraphResponseRecorder(f.parent, f.binding)).toThrow("graph_cogs_capture_refused")
}))
test("snapshot count and byte limits stop without automatic capture continuation", async () => {
  await captureOwned(async f => {
    const recorder = createGraphResponseRecorder(f.parent, f.binding)
    await recorder.observe(observation(f.binding), captureSignal())
    for (let i = 1; i < 32; i++) await recorder.observe(observation(f.binding, "rpc"), captureSignal())
    expect(recorder.snapshot().responses).toBe(32)
    await expect(recorder.observe(observation(f.binding, "rpc"), captureSignal())).rejects.toThrow("graph_cogs_capture_refused")
    expect(existsSync(join(f.dir, "response-33.json"))).toBe(false)
    expect(() => recorder.close()).toThrow("graph_cogs_capture_refused")
  })
  await captureOwned(async f => {
    const recorder = createGraphResponseRecorder(f.parent, f.binding), large = "a".repeat(1048576)
    await recorder.observe(observation(f.binding, "challenge", large), captureSignal())
    for (let i = 1; i < 11; i++) await recorder.observe(observation(f.binding, "rpc", large), captureSignal())
    expect(recorder.snapshot().storedBytes).toBeLessThanOrEqual(16 * 1024 * 1024)
    await expect(recorder.observe(observation(f.binding, "rpc", large), captureSignal())).rejects.toThrow("graph_cogs_capture_refused")
    expect(existsSync(join(f.dir, "response-12.json"))).toBe(false)
    expect(() => recorder.close()).toThrow("graph_cogs_capture_refused")
  })
})
test("paid-before-challenge, repeated challenges and oversized bodies cannot create extra records", async () => {
  for (const kind of ["paid-first", "challenge-again", "oversized"] as const) await captureOwned(async f => {
    const recorder = createGraphResponseRecorder(f.parent, f.binding)
    if (kind === "challenge-again") await recorder.observe(observation(f.binding), captureSignal())
    const input = observation(f.binding, kind === "paid-first" ? "paid" : "challenge", kind === "oversized" ? "a".repeat(1048577) : "fixture")
    await expect(recorder.observe(input, captureSignal())).rejects.toThrow("graph_cogs_capture_refused")
    expect(existsSync(join(f.dir, kind === "challenge-again" ? "response-02.json" : "response-01.json"))).toBe(false)
    expect(() => recorder.close()).toThrow("graph_cogs_capture_refused")
  })
})
test("a failed post-sync operation cannot release its claim or overwrite the retained record", () => captureOwned(async f => {
  const recorder = createGraphResponseRecorder(f.parent, f.binding, { afterRecordSync() { throw Error("private filesystem diagnostic") } })
  await expect(recorder.observe(observation(f.binding), captureSignal())).rejects.toThrow(/^graph_cogs_capture_refused$/)
  const path = join(f.dir, "response-01.json"), before = readFileSync(path)
  await expect(recorder.observe(observation(f.binding, "rpc"), captureSignal())).rejects.toThrow(/^graph_cogs_capture_refused$/)
  expect(readFileSync(path)).toEqual(before)
  expect(existsSync(join(f.dir, "response-02.json"))).toBe(false)
  expect(() => recorder.close()).toThrow("graph_cogs_capture_refused")
  expect(existsSync(join(f.dir, ".claim"))).toBe(true)
}))
test("retained capture readback is immutable, byte-preserving and never receipt proof", () => captureOwned(async f => {
  const recorder = createGraphResponseRecorder(f.parent, f.binding)
  await recorder.observe(observation(f.binding), captureSignal())
  await recorder.observe(observation(f.binding, "paid"), captureSignal())
  const paths = readdirSync(f.dir).sort(), before = paths.map(path => readFileSync(join(f.dir, path)))
  const result = readGraphResponseCapture(f.parent, f.binding)
  expect(result.claimPresent).toBe(true)
  expect(result.summary).toEqual(recorder.snapshot())
  expect(result.records[1]?.observation).toEqual(observation(f.binding, "paid"))
  expect(result.summary.receiptProof).toBe("not_checked")
  expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.records)).toBe(true)
  expect(Object.isFrozen(result.records[0]?.observation.headers)).toBe(true)
  expect(paths.map(path => readFileSync(join(f.dir, path)))).toEqual(before)
  recorder.close()
  expect(readGraphResponseCapture(f.parent, f.binding).claimPresent).toBe(false)
}))
function rewriteCapture(path: string, change: (row: Record<string, unknown>) => void) {
  const row = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>
  change(row)
  const { hash: _old, ...body } = row
  writeFileSync(path, JSON.stringify({ ...body, hash: hash(JSON.stringify(body)) }) + "\n")
}
test("missing capture state is never initialized by readback", () => captureOwned(async f => {
  const before = readdirSync(f.parent)
  expect(() => readGraphResponseCapture(f.parent, f.binding)).toThrow("graph_cogs_capture_refused")
  expect(readdirSync(f.parent)).toEqual(before)
}))
test("empty and interrupted byte-complete captures remain inspectable but never paid success", () => captureOwned(async f => {
  const recorder = createGraphResponseRecorder(f.parent, f.binding, { afterRecordSync() { throw Error("interrupted") } })
  expect(readGraphResponseCapture(f.parent, f.binding).summary).toMatchObject({ responses: 0, paidResponses: 0, receiptProof: "not_checked" })
  await expect(recorder.observe(observation(f.binding), captureSignal())).rejects.toThrow()
  const partial = readGraphResponseCapture(f.parent, f.binding)
  expect(partial.claimPresent).toBe(true)
  expect(partial.summary).toMatchObject({ responses: 1, paidResponses: 0, receiptProof: "not_checked" })
  expect(() => recorder.close()).toThrow()
}))
test("malformed claims, missing intent, extra files and record gaps refuse without repairing bytes", async () => {
  for (const fault of ["claim", "intent", "extra", "gap", "symlink", "hardlink", "public", "bom"] as const) await captureOwned(async f => {
    const recorder = createGraphResponseRecorder(f.parent, f.binding)
    await recorder.observe(observation(f.binding), captureSignal())
    const path = join(f.dir, "response-01.json")
    if (fault === "claim") writeFileSync(join(f.dir, ".claim"), "{}\n")
    if (fault === "intent") unlinkSync(join(f.dir, "intent.json"))
    if (fault === "extra") writeFileSync(join(f.dir, "unknown.json"), "{}\n", { mode: 0o600 })
    if (fault === "gap") renameSync(path, join(f.dir, "response-02.json"))
    if (fault === "symlink") { renameSync(path, join(f.parent, "response.json")); symlinkSync(join(f.parent, "response.json"), path) }
    if (fault === "hardlink") linkSync(path, join(f.parent, "response.json"))
    if (fault === "public") chmodSync(path, 0o644)
    if (fault === "bom") writeFileSync(path, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), readFileSync(path)]))
    const names = readdirSync(f.dir).sort(), before = names.map(name => readFileSync(join(f.dir, name)))
    expect(() => readGraphResponseCapture(f.parent, f.binding)).toThrow("graph_cogs_capture_refused")
    expect(readdirSync(f.dir).sort()).toEqual(names)
    expect(names.map(name => readFileSync(join(f.dir, name)))).toEqual(before)
  })
})
test("recomputed record hashes do not authorize changed policies, query bindings, order or future times", async () => {
  const changes: ((row: Record<string, unknown>) => void)[] = [
    row => { row.policyHash = hash("different policy") }, row => { row.queryHash = hash("different request") },
    row => { row.sequence = 2 }, row => { row.previousHash = hash("disconnected") },
    row => { row.capturedAt = Date.now() + 60000 }, row => { row.extra = true },
    row => { (row.observation as Record<string, unknown>).phase = "paid" },
    row => { (row.observation as Record<string, unknown>).bodySha256 = hash("different body") },
  ]
  for (const change of changes) await captureOwned(async f => {
    const recorder = createGraphResponseRecorder(f.parent, f.binding)
    await recorder.observe(observation(f.binding), captureSignal()); recorder.close()
    rewriteCapture(join(f.dir, "response-01.json"), change)
    expect(() => readGraphResponseCapture(f.parent, f.binding)).toThrow("graph_cogs_capture_refused")
  })
})
test("duplicate JSON keys and truncated tails cannot become canonical retained records", async () => {
  for (const fault of ["duplicate", "tail", "space"] as const) await captureOwned(async f => {
    const recorder = createGraphResponseRecorder(f.parent, f.binding)
    await recorder.observe(observation(f.binding), captureSignal()); recorder.close()
    const path = join(f.dir, "response-01.json"), text = readFileSync(path, "utf8")
    writeFileSync(path, fault === "duplicate" ? text.replace('"sequence":1', '"sequence":1,"sequence":1') : fault === "tail" ? text.trimEnd() : " " + text)
    expect(() => readGraphResponseCapture(f.parent, f.binding)).toThrow("graph_cogs_capture_refused")
  })
})
test("reversed capture time and a second paid response refuse even when the file chain is rehashed", async () => {
  for (const fault of ["time", "paid"] as const) await captureOwned(async f => {
    let time = Date.now() - 1000
    const recorder = createGraphResponseRecorder(f.parent, f.binding, { now: () => time })
    await recorder.observe(observation(f.binding), captureSignal()); time++
    await recorder.observe(observation(f.binding, "paid"), captureSignal()); time++
    await recorder.observe(observation(f.binding, "rpc"), captureSignal()); recorder.close()
    rewriteCapture(join(f.dir, "response-03.json"), row => {
      if (fault === "time") row.capturedAt = time - 2
      else row.observation = observation(f.binding, "paid")
    })
    expect(() => readGraphResponseCapture(f.parent, f.binding)).toThrow("graph_cogs_capture_refused")
  })
})
test("manifest/source mismatch and forged binding objects refuse retained readback", () => captureOwned(async f => {
  const recorder = createGraphResponseRecorder(f.parent, f.binding)
  await recorder.observe(observation(f.binding), captureSignal()); recorder.close()
  expect(() => readGraphResponseCapture(f.parent, { ...f.binding })).toThrow("graph_cogs_capture_refused")
  writeFileSync(join(f.source, "skills/counterparty-graph/run.ts"), "// different fixture source\n")
  expect(() => readGraphResponseCapture(f.parent, f.binding)).toThrow("graph_cogs_capture_refused")
}))
test("a concurrent change after initial manifest read is caught by the second byte capture", () => captureOwned(async f => {
  const recorder = createGraphResponseRecorder(f.parent, f.binding)
  await recorder.observe(observation(f.binding), captureSignal())
  let ticks = 0, changed = false
  expect(() => readGraphResponseCapture(f.parent, f.binding, { now() {
    if (++ticks === 5) { changed = true; writeFileSync(join(f.dir, "intent.json"), "{}\n") }
    return Date.now()
  } })).toThrow("graph_cogs_capture_refused")
  expect(changed).toBe(true)
}))
test("readback deadlines refuse rather than returning a late snapshot", () => captureOwned(async f => {
  const recorder = createGraphResponseRecorder(f.parent, f.binding)
  await recorder.observe(observation(f.binding), captureSignal()); recorder.close()
  const base = Date.now(); let reads = 0
  expect(() => readGraphResponseCapture(f.parent, f.binding, { now: () => base + (++reads >= 8 ? 5000 : 0) })).toThrow("graph_cogs_capture_refused")
}))
test("a separate keyless read-only process verifies retained capture without emitting raw provider data", () => captureOwned(async f => {
  const recorder = createGraphResponseRecorder(f.parent, f.binding)
  await recorder.observe(observation(f.binding, "challenge", "private-provider-sentinel"), captureSignal()); recorder.close()
  const names = readdirSync(f.dir).sort(), before = names.map(name => readFileSync(join(f.dir, name)))
  const source = resolve(import.meta.dir, "e2e-graph-cogs.ts")
  const code = `import {readGraphSourceManifest,bindGraphQuery,readGraphResponseCapture} from ${JSON.stringify(source)};
    const binding=bindGraphQuery(${JSON.stringify(identityQuery())},readGraphSourceManifest(${JSON.stringify(f.source)}));
    const value=readGraphResponseCapture(${JSON.stringify(f.parent)},binding);console.log(JSON.stringify({claimPresent:value.claimPresent,summary:value.summary}));`
  const child = spawnSync(process.execPath, ["--no-env-file", "-e", code], { cwd: tmpdir(), env: { PATH: "" }, encoding: "utf8", timeout: 3000, maxBuffer: 32768 })
  expect(child.status).toBe(0); expect(child.stderr).toBe("")
  expect(JSON.parse(child.stdout)).toMatchObject({ claimPresent: false, summary: { responses: 1, paidResponses: 0, receiptProof: "not_checked" } })
  expect(child.stdout).not.toContain("private-provider-sentinel"); expect(child.stdout).not.toContain(f.parent)
  expect(names.map(name => readFileSync(join(f.dir, name)))).toEqual(before)
}))
test("readback refuses oversized files and more than32 record names before trusting stored summaries", async () => {
  for (const fault of ["oversized", "count"] as const) await captureOwned(async f => {
    const recorder = createGraphResponseRecorder(f.parent, f.binding)
    await recorder.observe(observation(f.binding), captureSignal()); recorder.close()
    const path = join(f.dir, "response-01.json")
    if (fault === "oversized") writeFileSync(path, "x".repeat(2 * 1024 * 1024 + 1))
    else for (let n = 2; n <= 33; n++) copyFileSync(path, join(f.dir, "response-" + String(n).padStart(2, "0") + ".json"))
    expect(() => readGraphResponseCapture(f.parent, f.binding)).toThrow("graph_cogs_capture_refused")
  })
})
test("a fully rehashed but over-budget stored capture cannot bypass the16MiB read bound", () => captureOwned(async f => {
  const recorder = createGraphResponseRecorder(f.parent, f.binding)
  await recorder.observe(observation(f.binding), captureSignal()); recorder.close()
  const template = JSON.parse(readFileSync(join(f.dir, "response-01.json"), "utf8")) as Record<string, unknown>
  let previousHash = hash(readFileSync(join(f.dir, "intent.json"), "utf8"))
  const large = "a".repeat(1048576)
  for (let sequence = 1; sequence <= 12; sequence++) {
    const row: Record<string, unknown> = { ...template, sequence, previousHash,
      observation: observation(f.binding, sequence === 1 ? "challenge" : "rpc", large) }
    const { hash: _old, ...body } = row
    const digest = hash(JSON.stringify(body)); previousHash = digest
    writeFileSync(join(f.dir, "response-" + String(sequence).padStart(2, "0") + ".json"), JSON.stringify({ ...body, hash: digest }) + "\n", { mode: 0o600 })
    if (sequence === 11) expect(readGraphResponseCapture(f.parent, f.binding).summary.responses).toBe(11)
  }
  expect(() => readGraphResponseCapture(f.parent, f.binding)).toThrow("graph_cogs_capture_refused")
}))
