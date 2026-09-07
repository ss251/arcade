import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtempSync, chmodSync, writeFileSync, readFileSync, rmSync, symlinkSync, linkSync, mkdirSync, realpathSync, existsSync, readdirSync, copyFileSync, unlinkSync, renameSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { GRAPH_COGS_POLICY, GRAPH_COGS_POLICY_HASH, decodeGraphReservations, readGraphReservations, checkGraphBalance, initializeGraphReservationState, openGraphReservationWriter, readGraphBalance, GRAPH_COGS_RPC, GRAPH_COGS_SOURCE_FILES, readGraphSourceManifest, bindGraphQuery, type GraphReservationWriter, type GraphBalanceTransport } from "./e2e-graph-cogs.ts"
import { document, AGENT0_BASE_SUBGRAPH_ID } from "../skills/counterparty-graph/graph-client.ts"

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
