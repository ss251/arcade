import { expect, test } from "bun:test"
import { createGraphBalanceRecorder, readGraphBalanceJournal, verifyGraphJournaledQuery, readGraphQualifiedReservations, type GraphBalanceObservation } from "./e2e-graph-cogs.ts"
import { createHash } from "node:crypto"
import { mkdtempSync, chmodSync, writeFileSync, readFileSync, rmSync, symlinkSync, linkSync, mkdirSync, realpathSync, existsSync, readdirSync, copyFileSync, unlinkSync, renameSync, lstatSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { GRAPH_COGS_POLICY, GRAPH_COGS_POLICY_HASH, decodeGraphReservations, readGraphReservations, checkGraphBalance, initializeGraphReservationState, openGraphReservationWriter, readGraphBalance, GRAPH_COGS_RPC, GRAPH_COGS_SOURCE_FILES, readGraphSourceManifest, bindGraphQuery, createGraphResponseRecorder, readGraphResponseCapture, verifyGraphCapturedQuery, writeGraphQueryCache, readGraphQueryCache, bindGraphQueryBalances, claimGraphReservation, type GraphReservationWriter, type GraphBalanceTransport, type GraphQueryBinding, type GraphResponseRecorder } from "./e2e-graph-cogs.ts"
import { document, AGENT0_BASE_SUBGRAPH_ID, makePaidQuery, type GraphResponseObservation, type GraphPaymentIntent } from "../skills/counterparty-graph/graph-client.ts"
import { encodeAbiParameters, encodeEventTopics, parseAbi } from "viem"

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
test("only a fresh acknowledged reservation can supply a one-use local journal handoff", () => owned(parent => {
  const source = sourceCopy(parent), binding = bindGraphQuery(identityQuery(), readGraphSourceManifest(source))
  const directory = initializeGraphReservationState(parent), writer = openGraphReservationWriter(parent)
  const summary = writer.reserve({ allocation: "evidence", queryHash: binding.queryHash, balanceAtomic: "1000000" })
  const before = readFileSync(join(directory, "reservations.jsonl"), "utf8")
  const handoff = claimGraphReservation(parent, binding, summary)
  expect(handoff.queryHash).toBe(binding.queryHash); expect(handoff.balanceAtomic).toBe("1000000")
  expect(() => claimGraphReservation(parent, binding, summary)).toThrow()
  expect(readFileSync(join(directory, "reservations.jsonl"), "utf8")).toBe(before)
  expect(writer.snapshot().unresolved).toBe(1); writer.close()
  expect(Object.isFrozen(handoff)).toBe(true); expect(handoff.amountAtomic).toBe("10000")
  expect(JSON.stringify(handoff)).not.toContain(parent)
}))
test("snapshot, decoded and copied summaries cannot stand in for the fresh acknowledgement", () => owned(parent => {
  const source = sourceCopy(parent), binding = bindGraphQuery(identityQuery(), readGraphSourceManifest(source))
  const directory = initializeGraphReservationState(parent), writer = openGraphReservationWriter(parent)
  const empty = writer.snapshot(), summary = writer.reserve({ allocation: "video", queryHash: binding.queryHash, balanceAtomic: "1000000" })
  for (const candidate of [empty, writer.snapshot(), structuredClone(summary), JSON.parse(JSON.stringify(summary)),
    readGraphReservations(join(directory, "reservations.jsonl")), null, {}]) {
    expect(() => claimGraphReservation(parent, binding, candidate)).toThrow(/^graph_cogs_reservation_handoff_refused$/)
  }
  expect(claimGraphReservation(parent, binding, summary).allocation).toBe("video")
  writer.close()
}))
for (const fault of ["closed", "source", "query", "parent", "alias", "stale", "backwards", "head", "claim"]) test(`fresh reservation handoff refuses ${fault} and never refunds a slot`, () => owned(parent => {
  const source = sourceCopy(parent), binding = bindGraphQuery(identityQuery(), readGraphSourceManifest(source))
  const directory = initializeGraphReservationState(parent), writer = openGraphReservationWriter(parent)
  const summary = writer.reserve({ allocation: "evidence", queryHash: fault === "query" ? hash("other query") : binding.queryHash, balanceAtomic: "1000000" })
  const before = readFileSync(join(directory, "reservations.jsonl"), "utf8")
  let target = parent
  if (fault === "closed") writer.close()
  if (fault === "source") writeFileSync(join(source, "skills/counterparty-graph/run.ts"), "changed")
  if (fault === "parent") { target = join(parent, "other"); mkdirSync(target, { mode: 0o700 }) }
  if (fault === "alias") { target = parent + "/." }
  if (fault === "head") writeFileSync(join(directory, "head-01.json"), "{}\n")
  if (fault === "claim") writeFileSync(join(directory, ".claim"), "changed\n")
  const options = fault === "stale" ? { now: () => Date.now() + 5000 } : fault === "backwards" ? { now: () => Date.now() - 5000 } : {}
  expect(() => claimGraphReservation(target, binding, summary, options)).toThrow(/^graph_cogs_reservation_handoff_refused$/)
  expect(() => claimGraphReservation(parent, binding, summary)).toThrow()
  expect(readFileSync(join(directory, "reservations.jsonl"), "utf8")).toBe(before)
  expect(readGraphReservations(join(directory, "reservations.jsonl")).unresolved).toBe(1)
  try { writer.close() } catch { /* A deliberately corrupted owned fixture remains poisoned. */ }
}))
test("reopening the same unresolved ledger cannot mint a new reservation handoff", () => owned(parent => {
  const source = sourceCopy(parent), binding = bindGraphQuery(identityQuery(), readGraphSourceManifest(source))
  initializeGraphReservationState(parent); const writer = openGraphReservationWriter(parent)
  const summary = writer.reserve({ allocation: "evidence", queryHash: binding.queryHash, balanceAtomic: "1000000" }); writer.close()
  const reopened = openGraphReservationWriter(parent)
  expect(() => claimGraphReservation(parent, binding, summary)).toThrow()
  expect(() => claimGraphReservation(parent, binding, reopened.snapshot())).toThrow()
  expect(() => reopened.reserve({ allocation: "evidence", queryHash: hash("retry"), balanceAtomic: "1000000" })).toThrow()
  reopened.close()
}))
test("the fresh handoff captures the originally validated balance before a test hook mutates caller input", () => owned(parent => {
  const source = sourceCopy(parent), binding = bindGraphQuery(identityQuery(), readGraphSourceManifest(source))
  initializeGraphReservationState(parent)
  const input = { allocation: "evidence", queryHash: binding.queryHash, balanceAtomic: "1000000" }
  const writer = openGraphReservationWriter(parent, { afterJournalSync() { input.balanceAtomic = "0" } })
  const summary = writer.reserve(input)
  expect(claimGraphReservation(parent, binding, summary).balanceAtomic).toBe("1000000")
  expect(input.balanceAtomic).toBe("0"); writer.close()
}))
test("a separate no-key process cannot consume the parent's serialized reservation acknowledgement", () => owned(parent => {
  const source = sourceCopy(parent), binding = bindGraphQuery(identityQuery(), readGraphSourceManifest(source))
  initializeGraphReservationState(parent); const writer = openGraphReservationWriter(parent)
  const summary = writer.reserve({ allocation: "evidence", queryHash: binding.queryHash, balanceAtomic: "1000000" })
  const script = `import{claimGraphReservation,bindGraphQuery,readGraphSourceManifest}from${JSON.stringify(resolve(import.meta.dir, "e2e-graph-cogs.ts"))};import{document}from${JSON.stringify(resolve(import.meta.dir, "../skills/counterparty-graph/graph-client.ts"))};const b=bindGraphQuery({subgraphId:${JSON.stringify(GRAPH_COGS_POLICY.subgraph)},document:document("identities"),variables:{address:${JSON.stringify(GRAPH_COGS_POLICY.subject)}}},readGraphSourceManifest(${JSON.stringify(source)}));try{claimGraphReservation(${JSON.stringify(parent)},b,${JSON.stringify(summary)});process.exit(99)}catch{process.exit(35)}`
  const child = spawnSync(process.execPath, ["--no-env-file", "-e", script], { env: { PATH: "" }, encoding: "utf8", timeout: 3000, maxBuffer: 4096 })
  expect(child.status).toBe(35); expect(child.stdout).toBe(""); expect(child.stderr).toBe("")
  expect(claimGraphReservation(parent, binding, summary).reservationHash).toBe(summary.lastHash)
  writer.close()
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

// Declared observations only: no RPC or signer runs in journal fixtures.
function journalBalance(observedAt: number, balanceAtomic = "1000000"): GraphBalanceObservation {
  return { chain: GRAPH_COGS_POLICY.chain, payer: GRAPH_COGS_POLICY.payer, token: GRAPH_COGS_POLICY.token,
    balanceAtomic, blockNumber: "10", blockHash: "0x" + "a".repeat(64),
    blockTimestamp: Math.floor(observedAt / 1000), observedAt,
    responseHashes: [1, 2, 3, 4].map(n => hash("declared balance response " + n)) }
}
function journalFixture(parent: string) {
  const source = sourceCopy(parent), binding = bindGraphQuery(identityQuery(), readGraphSourceManifest(source))
  const directory = initializeGraphReservationState(parent), writer = openGraphReservationWriter(parent)
  const before = journalBalance(Date.now())
  const summary = writer.reserve({ allocation: "evidence", queryHash: binding.queryHash, balanceAtomic: before.balanceAtomic })
  const handoff = claimGraphReservation(parent, binding, summary)
  return { source, binding, directory, writer, before, handoff, journal: join(parent, "balance-" + binding.queryHash) }
}
test("a balance journal durably binds fresh admission, pre-forward intent and low after balance without clearing exposure", () => owned(parent => {
  const f = journalFixture(parent), ledger = readFileSync(join(f.directory, "reservations.jsonl"))
  const recorder = createGraphBalanceRecorder(parent, f.binding, f.handoff, f.before)
  expect(recorder.snapshot()).toMatchObject({ observations: 1, phase: "admission", paymentProof: "not_checked", belowFloor: null })
  recorder.recordPreForward(journalBalance(Date.now()), declaredIntent(f.binding), captureSignal())
  recorder.recordAfter(journalBalance(Date.now(), "899999"), captureSignal())
  expect(recorder.snapshot()).toMatchObject({ observations: 3, phase: "after", belowFloor: true, reservationUnresolved: true })
  recorder.close(); recorder.close()
  expect(existsSync(join(f.journal, ".claim"))).toBe(false)
  expect(JSON.parse(readFileSync(join(f.journal, "after.json"), "utf8")).observation.balanceAtomic).toBe("899999")
  expect(JSON.parse(readFileSync(join(f.journal, "complete.json"), "utf8")).observations).toBe(3)
  expect(readFileSync(join(f.directory, "reservations.jsonl"))).toEqual(ledger)
  expect(f.writer.snapshot().unresolved).toBe(1); f.writer.close()
}))


test("balance journals use private immutable hash-chain records and preserve original caller values", () => owned(parent => {
  const f = journalFixture(parent), before = structuredClone(f.before), pre = journalBalance(Date.now()), intent = declaredIntent(f.binding)
  const recorder = createGraphBalanceRecorder(parent, f.binding, f.handoff, before, {
    afterRecordSync(phase) {
      if (phase === "admission") Object.assign(before, { balanceAtomic: "0" })
      if (phase === "pre-forward") { Object.assign(pre, { balanceAtomic: "0" }); Object.assign(intent.authorization, { value: "0" }) }
    },
  })
  Object.assign(pre, { observedAt: Date.now() })
  recorder.recordPreForward(pre, intent, captureSignal())
  recorder.recordAfter(journalBalance(Date.now(), "990000"), captureSignal())
  recorder.close()
  expect(lstatSync(f.journal).mode & 0o777).toBe(0o700)
  expect(readdirSync(f.journal).sort()).toEqual(["admission.json", "after.json", "complete.json", "intent.json", "pre-forward.json"])
  let previous = hash(readFileSync(join(f.journal, "intent.json"), "utf8"))
  for (const [i, phase] of ["admission", "pre-forward", "after"].entries()) {
    const path = join(f.journal, phase + ".json"), bytes = readFileSync(path, "utf8"), row = JSON.parse(bytes)
    expect(lstatSync(path).mode & 0o777).toBe(0o600); expect(lstatSync(path).nlink).toBe(1)
    expect(bytes).toBe(JSON.stringify(row) + "\n")
    expect(row.previousHash).toBe(previous); expect(row.sequence).toBe(i + 1)
    const { hash: digest, ...body } = row
    expect(digest).toBe(hash(JSON.stringify(body))); previous = digest
    expect(bytes).not.toContain(parent); expect(row.reservationHash).toBe(f.handoff.reservationHash)
  }
  expect(JSON.parse(readFileSync(join(f.journal, "admission.json"), "utf8")).observation.balanceAtomic).toBe("1000000")
  const stored = JSON.parse(readFileSync(join(f.journal, "pre-forward.json"), "utf8"))
  expect(stored.observation.balanceAtomic).toBe("1000000"); expect(stored.intent.authorization.value).toBe("10000")
  f.writer.close()
}))
test("a copied balance handoff cannot consume the original but duplicate original creation always refuses", () => owned(parent => {
  const f = journalFixture(parent)
  expect(() => createGraphBalanceRecorder(parent, f.binding, structuredClone(f.handoff), f.before)).toThrow(/^graph_cogs_balance_journal_refused$/)
  expect(existsSync(f.journal)).toBe(false)
  const recorder = createGraphBalanceRecorder(parent, f.binding, f.handoff, f.before)
  const bytes = readFileSync(join(f.journal, "admission.json"))
  expect(() => createGraphBalanceRecorder(parent, f.binding, f.handoff, f.before)).toThrow()
  expect(readFileSync(join(f.journal, "admission.json"))).toEqual(bytes)
  expect(() => recorder.close()).toThrow()
  expect(existsSync(join(f.journal, ".claim"))).toBe(true); f.writer.close()
}))
for (const fault of ["parent", "binding", "source", "closed", "expired", "backwards", "old-balance", "future-balance", "wrong-balance", "getter", "exists"] as const) {
  test(`balance journal creation burns a fresh handoff on ${fault} refusal without refund`, () => owned(parent => {
    const f = journalFixture(parent), ledger = readFileSync(join(f.directory, "reservations.jsonl"))
    let target = parent, binding = f.binding, before = f.before, invoked = false
    if (fault === "parent") { target = join(parent, "other"); mkdirSync(target, { mode: 0o700 }) }
    if (fault === "binding") binding = bindGraphQuery(identityQuery(), readGraphSourceManifest(f.source))
    if (fault === "source") writeFileSync(join(f.source, "skills/counterparty-graph/run.ts"), "changed")
    if (fault === "closed") f.writer.close()
    if (fault === "old-balance") before = journalBalance(f.handoff.issuedAt - 5000)
    if (fault === "future-balance") before = journalBalance(f.handoff.issuedAt + 1)
    if (fault === "wrong-balance") before = journalBalance(f.before.observedAt, "990000")
    if (fault === "getter") { before = structuredClone(before); Object.defineProperty(before, "balanceAtomic", { get() { invoked = true; return "1000000" } }) }
    if (fault === "exists") mkdirSync(f.journal, { mode: 0o700 })
    const options = fault === "expired" ? { now: () => f.handoff.issuedAt + 5000 } :
      fault === "backwards" ? { now: () => f.handoff.claimedAt - 1 } : {}
    expect(() => createGraphBalanceRecorder(target, binding, f.handoff, before, options)).toThrow(/^graph_cogs_balance_journal_refused$/)
    expect(() => createGraphBalanceRecorder(parent, f.binding, f.handoff, f.before)).toThrow()
    expect(invoked).toBe(false)
    expect(readFileSync(join(f.directory, "reservations.jsonl"))).toEqual(ledger)
    expect(readGraphReservations(join(f.directory, "reservations.jsonl")).unresolved).toBe(1)
    try { f.writer.close() } catch { /* Retain deliberately poisoned owned fixture. */ }
  }))
}
for (const fault of ["low", "changed", "stale", "future", "intent", "aborted", "source", "global-claim", "global-head", "local-claim", "extra", "hardlink", "mode", "directory-alias"] as const) {
  test(`pre-forward balance journaling refuses ${fault}, retains claim and cannot retry`, () => owned(parent => {
    const f = journalFixture(parent), recorder = createGraphBalanceRecorder(parent, f.binding, f.handoff, f.before)
    let observation = journalBalance(Date.now()), intent = declaredIntent(f.binding)
    const controller = new AbortController(), ledger = readFileSync(join(f.directory, "reservations.jsonl"))
    if (fault === "low") observation = journalBalance(Date.now(), "909999")
    if (fault === "changed") observation = journalBalance(Date.now(), "990000")
    if (fault === "stale") observation = journalBalance(f.before.observedAt - 5001)
    if (fault === "future") observation = journalBalance(Date.now() + 10000)
    if (fault === "intent") intent = changeDeclaredIntent(intent, value => { Object.assign(value.authorization as Record<string, unknown>, { value: "10001" }) })
    if (fault === "aborted") controller.abort()
    if (fault === "source") writeFileSync(join(f.source, "skills/counterparty-graph/run.ts"), "changed")
    if (fault === "global-claim") writeFileSync(join(f.directory, ".claim"), "changed")
    if (fault === "global-head") writeFileSync(join(f.directory, "head-01.json"), "{}\n")
    if (fault === "local-claim") writeFileSync(join(f.journal, ".claim"), "changed")
    if (fault === "extra") writeFileSync(join(f.journal, "retry.json"), "{}", { mode: 0o600 })
    if (fault === "hardlink") linkSync(join(f.journal, "admission.json"), join(parent, "linked.json"))
    if (fault === "mode") chmodSync(join(f.journal, "admission.json"), 0o644)
    if (fault === "directory-alias") { renameSync(f.journal, f.journal + "-saved"); symlinkSync(f.journal + "-saved", f.journal) }
    expect(() => recorder.recordPreForward(observation, intent, controller.signal)).toThrow(/^graph_cogs_balance_journal_refused$/)
    expect(() => recorder.recordPreForward(journalBalance(Date.now()), declaredIntent(f.binding), captureSignal())).toThrow()
    expect(() => recorder.close()).toThrow(); expect(() => recorder.snapshot()).toThrow()
    expect(existsSync(join(f.journal, ".claim"))).toBe(true)
    expect(existsSync(join(f.journal, "pre-forward.json"))).toBe(false)
    expect(readFileSync(join(f.directory, "reservations.jsonl"))).toEqual(ledger)
    try { f.writer.close() } catch { /* Retain deliberately poisoned owned fixture. */ }
  }))
}
test("out-of-order and duplicate journal operations poison without overwriting retained records", () => {
  for (const operation of ["after-first", "duplicate-pre", "duplicate-after", "incomplete-close"] as const) owned(parent => {
    const f = journalFixture(parent), recorder = createGraphBalanceRecorder(parent, f.binding, f.handoff, f.before)
    if (operation === "duplicate-pre" || operation === "duplicate-after") recorder.recordPreForward(journalBalance(Date.now()), declaredIntent(f.binding), captureSignal())
    if (operation === "duplicate-after") recorder.recordAfter(journalBalance(Date.now(), "990000"), captureSignal())
    const files = Object.fromEntries(readdirSync(f.journal).map(name => [name, readFileSync(join(f.journal, name), "utf8")]))
    expect(() => {
      if (operation === "duplicate-pre") recorder.recordPreForward(journalBalance(Date.now()), declaredIntent(f.binding), captureSignal())
      else if (operation === "incomplete-close") recorder.close()
      else recorder.recordAfter(journalBalance(Date.now(), "990000"), captureSignal())
    }).toThrow(/^graph_cogs_balance_journal_refused$/)
    expect(Object.fromEntries(readdirSync(f.journal).map(name => [name, readFileSync(join(f.journal, name), "utf8")]))).toEqual(files)
    expect(() => recorder.close()).toThrow(); f.writer.close()
  })
})
test("canonical after balances including zero and unrelated increases remain recorded facts, not success", () => {
  for (const balance of ["0", "990000", "1000000", "2000000"]) owned(parent => {
    const f = journalFixture(parent), recorder = createGraphBalanceRecorder(parent, f.binding, f.handoff, f.before)
    recorder.recordPreForward(journalBalance(Date.now()), declaredIntent(f.binding), captureSignal())
    recorder.recordAfter(journalBalance(Date.now(), balance), captureSignal())
    expect(recorder.snapshot().belowFloor).toBe(BigInt(balance) < 900000n)
    expect(recorder.snapshot().paymentProof).toBe("not_checked"); recorder.close()
    expect(JSON.parse(readFileSync(join(f.journal, "after.json"), "utf8")).observation.balanceAtomic).toBe(balance)
    expect(f.writer.snapshot().unresolved).toBe(1); f.writer.close()
  })
})
test("interrupted, late and reentrant file-sync acknowledgements retain partial journals", () => {
  for (const fault of ["throw", "late", "reentry", "source", "mutation", "abort"] as const) owned(parent => {
    const f = journalFixture(parent); let time = Date.now()
    const controller = new AbortController()
    let recorder: ReturnType<typeof createGraphBalanceRecorder> | undefined
    recorder = createGraphBalanceRecorder(parent, f.binding, f.handoff, f.before, {
      now: () => time,
      afterRecordSync(phase) {
        if (phase !== "pre-forward") return
        if (fault === "throw") throw Error("synthetic key text must not escape")
        if (fault === "late") time += 5000
        if (fault === "reentry") { try { recorder!.snapshot() } catch { /* Poison even if caught by callback. */ } }
        if (fault === "source") writeFileSync(join(f.source, "skills/counterparty-graph/run.ts"), "changed")
        if (fault === "mutation") writeFileSync(join(f.journal, "pre-forward.json"), "{}\n")
        if (fault === "abort") controller.abort()
      },
    })
    expect(() => recorder!.recordPreForward(journalBalance(time), declaredIntent(f.binding), controller.signal)).toThrow(/^graph_cogs_balance_journal_refused$/)
    expect(existsSync(join(f.journal, "pre-forward.json"))).toBe(true)
    expect(existsSync(join(f.journal, ".claim"))).toBe(true)
    expect(() => recorder!.close()).toThrow(); expect(f.writer.snapshot().unresolved).toBe(1); f.writer.close()
  })
})
test("close failure after marker fsync retains the complete bytes and unresolved claim", () => owned(parent => {
  const f = journalFixture(parent), recorder = createGraphBalanceRecorder(parent, f.binding, f.handoff, f.before, {
    afterRecordSync(phase) { if (phase === "complete") throw Error("synthetic marker acknowledgement loss") },
  })
  recorder.recordPreForward(journalBalance(Date.now()), declaredIntent(f.binding), captureSignal())
  recorder.recordAfter(journalBalance(Date.now(), "990000"), captureSignal())
  expect(() => recorder.close()).toThrow(/^graph_cogs_balance_journal_refused$/)
  expect(existsSync(join(f.journal, "complete.json"))).toBe(true)
  expect(existsSync(join(f.journal, ".claim"))).toBe(true)
  expect(() => createGraphBalanceRecorder(parent, f.binding, f.handoff, f.before)).toThrow()
  expect(f.writer.snapshot().unresolved).toBe(1); f.writer.close()
}))
test("a lost acknowledgement after claim release is failure, never a reclaimed reservation", () => owned(parent => {
  const f = journalFixture(parent); let releasing = false
  const recorder = createGraphBalanceRecorder(parent, f.binding, f.handoff, f.before, {
    now: () => Date.now() + (releasing && !existsSync(join(f.journal, ".claim")) ? 5000 : 0),
    afterRecordSync(phase) { if (phase === "complete") releasing = true },
  })
  recorder.recordPreForward(journalBalance(Date.now()), declaredIntent(f.binding), captureSignal())
  recorder.recordAfter(journalBalance(Date.now(), "990000"), captureSignal())
  expect(() => recorder.close()).toThrow(/^graph_cogs_balance_journal_refused$/)
  expect(existsSync(join(f.journal, "complete.json"))).toBe(true)
  expect(existsSync(join(f.journal, ".claim"))).toBe(false)
  expect(() => recorder.close()).toThrow(); expect(f.writer.snapshot().unresolved).toBe(1); f.writer.close()
}))
test("actual no-key child interruption after each balance-file sync preserves exposure and partial evidence", () => {
  for (const phase of ["admission", "pre-forward", "after", "complete"]) owned(parent => {
    const source = sourceCopy(parent), binding = bindGraphQuery(identityQuery(), readGraphSourceManifest(source))
    const script = `import{initializeGraphReservationState,openGraphReservationWriter,claimGraphReservation,createGraphBalanceRecorder,bindGraphQuery,readGraphSourceManifest}from${JSON.stringify(resolve(import.meta.dir, "e2e-graph-cogs.ts"))};
      const binding=bindGraphQuery(${JSON.stringify(identityQuery())},readGraphSourceManifest(${JSON.stringify(source)}));
      const parent=${JSON.stringify(parent)},balance=${JSON.stringify(journalBalance(Date.now()))};
      initializeGraphReservationState(parent);const writer=openGraphReservationWriter(parent);
      const summary=writer.reserve({allocation:"evidence",queryHash:binding.queryHash,balanceAtomic:balance.balanceAtomic});
      const handoff=claimGraphReservation(parent,binding,summary);
      const recorder=createGraphBalanceRecorder(parent,binding,handoff,balance,{afterRecordSync(p){if(p===${JSON.stringify(phase)})process.exit(36)}});
      recorder.recordPreForward({...balance,observedAt:Date.now()},${JSON.stringify(declaredIntent(binding))},new AbortController().signal);
      recorder.recordAfter({...balance,balanceAtomic:"990000",observedAt:Date.now()},new AbortController().signal);recorder.close();process.exit(99)`
    const child = spawnSync(process.execPath, ["--no-env-file", "-e", script], { env: { PATH: "" }, encoding: "utf8", timeout: 4000, maxBuffer: 4096 })
    expect(child.status).toBe(36); expect(child.stdout).toBe(""); expect(child.stderr).toBe("")
    const directory = join(parent, GRAPH_COGS_POLICY.namespace), journal = join(parent, "balance-" + binding.queryHash)
    expect(readGraphReservations(join(directory, "reservations.jsonl")).unresolved).toBe(1)
    expect(existsSync(join(directory, ".claim"))).toBe(true)
    expect(existsSync(join(journal, ".claim"))).toBe(true)
    expect(existsSync(join(journal, phase + ".json"))).toBe(true)
    expect(() => openGraphReservationWriter(parent)).toThrow()
  })
})


test("malformed after observations refuse without inventing or overwriting the missing balance", () => owned(parent => {
  const f = journalFixture(parent), recorder = createGraphBalanceRecorder(parent, f.binding, f.handoff, f.before)
  recorder.recordPreForward(journalBalance(Date.now()), declaredIntent(f.binding), captureSignal())
  const after = journalBalance(Date.now(), "0"); let getter = false
  Object.defineProperty(after.responseHashes, "0", { get() { getter = true; return hash("fake") } })
  expect(() => recorder.recordAfter(after, captureSignal())).toThrow(/^graph_cogs_balance_journal_refused$/)
  expect(getter).toBe(false); expect(existsSync(join(f.journal, "after.json"))).toBe(false)
  expect(existsSync(join(f.journal, "pre-forward.json"))).toBe(true)
  expect(existsSync(join(f.journal, ".claim"))).toBe(true)
  expect(() => recorder.close()).toThrow(); f.writer.close()
}))
test("admission-file acknowledgement failure consumes the handoff and retains the admission", () => owned(parent => {
  const f = journalFixture(parent)
  expect(() => createGraphBalanceRecorder(parent, f.binding, f.handoff, f.before, {
    afterRecordSync() { throw Error("synthetic failure") },
  })).toThrow(/^graph_cogs_balance_journal_refused$/)
  expect(existsSync(join(f.journal, "admission.json"))).toBe(true)
  expect(existsSync(join(f.journal, ".claim"))).toBe(true)
  expect(() => createGraphBalanceRecorder(parent, f.binding, f.handoff, f.before)).toThrow()
  expect(f.writer.snapshot().unresolved).toBe(1); f.writer.close()
}))


test("balance freshness is rechecked at the final acknowledgement, not only before file IO", () => owned(parent => {
  const f = journalFixture(parent); let time = Date.now(), ageOnSync = false
  const recorder = createGraphBalanceRecorder(parent, f.binding, f.handoff, f.before, {
    now: () => time, afterRecordSync(phase) { if (phase === "pre-forward" && ageOnSync) time += 1001 },
  })
  const pre = journalBalance(time); time += 4000; ageOnSync = true
  expect(() => recorder.recordPreForward(pre, declaredIntent(f.binding), captureSignal())).toThrow(/^graph_cogs_balance_journal_refused$/)
  expect(existsSync(join(f.journal, "pre-forward.json"))).toBe(true)
  expect(existsSync(join(f.journal, ".claim"))).toBe(true)
  expect(() => recorder.close()).toThrow(); f.writer.close()
}))
test("intent expiration during pre-forward file IO cannot receive a successful acknowledgement", () => owned(parent => {
  const f = journalFixture(parent); let time = Date.now()
  const recorder = createGraphBalanceRecorder(parent, f.binding, f.handoff, f.before, {
    now: () => time, afterRecordSync(phase) { if (phase === "pre-forward") time += 1100 },
  })
  const intent = changeDeclaredIntent(declaredIntent(f.binding), value => {
    Object.assign(value.authorization as Record<string, unknown>, { validBefore: String(Math.floor(time / 1000) + 1) })
  })
  expect(() => recorder.recordPreForward(journalBalance(time), intent, captureSignal())).toThrow(/^graph_cogs_balance_journal_refused$/)
  expect(existsSync(join(f.journal, "pre-forward.json"))).toBe(true)
  expect(existsSync(join(f.journal, ".claim"))).toBe(true)
  expect(() => recorder.close()).toThrow(); f.writer.close()
}))

test("readonly balance journal verification preserves completed files and unresolved reservation", () => owned(parent => {
  const f = journalFixture(parent), recorder = createGraphBalanceRecorder(parent, f.binding, f.handoff, f.before)
  recorder.recordPreForward(journalBalance(Date.now()), declaredIntent(f.binding), captureSignal())
  recorder.recordAfter(journalBalance(Date.now(), "899999"), captureSignal()); recorder.close(); f.writer.close()
  const before = Object.fromEntries(readdirSync(f.journal).map(name => [name, readFileSync(join(f.journal, name), "utf8")]))
  const result = readGraphBalanceJournal(parent, f.binding)
  expect(result.handoff).toEqual(f.handoff); expect(result.after.balanceAtomic).toBe("899999")
  expect(result.paymentProof).toBe("not_checked"); expect(Object.isFrozen(result)).toBe(true)
  expect(Object.isFrozen(result.after.responseHashes)).toBe(true)
  expect(Object.fromEntries(readdirSync(f.journal).map(name => [name, readFileSync(join(f.journal, name), "utf8")]))).toEqual(before)
  expect(readGraphReservations(join(f.directory, "reservations.jsonl")).unresolved).toBe(1)
  expect(() => createGraphBalanceRecorder(parent, f.binding, result.handoff, f.before)).toThrow()
}))


function completedJournal(parent: string) {
  const f = journalFixture(parent), recorder = createGraphBalanceRecorder(parent, f.binding, f.handoff, f.before)
  recorder.recordPreForward(journalBalance(Date.now()), declaredIntent(f.binding), captureSignal())
  recorder.recordAfter(journalBalance(Date.now(), "990000"), captureSignal()); recorder.close(); f.writer.close()
  return f
}
function rewriteJournal(directory: string, change: (files: Record<string, Record<string, unknown>>) => void) {
  const names = ["intent", "admission", "pre-forward", "after", "complete"]
  const files = Object.fromEntries(names.map(name => [name, JSON.parse(readFileSync(join(directory, name + ".json"), "utf8"))])) as Record<string, Record<string, unknown>>
  change(files)
  const manifest = JSON.stringify(files.intent) + "\n"; writeFileSync(join(directory, "intent.json"), manifest)
  let previous = hash(manifest)
  for (const name of ["admission", "pre-forward", "after"]) {
    const row = files[name]!; row.previousHash = previous
    const { hash: _ignored, ...body } = row; row.hash = hash(JSON.stringify(body)); previous = String(row.hash)
    writeFileSync(join(directory, name + ".json"), JSON.stringify(row) + "\n")
  }
  const complete = files.complete!; complete.manifestHash = hash(manifest); complete.lastHash = previous
  const { hash: _ignored, ...body } = complete; complete.hash = hash(JSON.stringify(body))
  writeFileSync(join(directory, "complete.json"), JSON.stringify(complete) + "\n")
}
for (const fault of ["claim", "missing", "extra", "mode", "hardlink", "alias", "bytes", "bom", "oversized", "source", "ledger", "head"] as const) {
  test(`readonly balance journal refuses ${fault} without repairing files or resetting exposure`, () => owned(parent => {
    const f = completedJournal(parent), path = join(f.journal, "after.json")
    if (fault === "claim") writeFileSync(join(f.journal, ".claim"), "retained", { mode: 0o600 })
    if (fault === "missing") unlinkSync(path)
    if (fault === "extra") writeFileSync(join(f.journal, "extra.json"), "{}", { mode: 0o600 })
    if (fault === "mode") chmodSync(path, 0o644)
    if (fault === "hardlink") linkSync(path, join(parent, "linked.json"))
    if (fault === "alias") { renameSync(path, join(parent, "after.json")); symlinkSync(join(parent, "after.json"), path) }
    if (fault === "bytes") writeFileSync(path, "{}\n")
    if (fault === "bom") writeFileSync(path, "\ufeff" + readFileSync(path, "utf8"))
    if (fault === "oversized") writeFileSync(path, "x".repeat(32769))
    if (fault === "source") writeFileSync(join(f.source, "skills/counterparty-graph/run.ts"), "changed")
    if (fault === "ledger") writeFileSync(join(f.directory, "reservations.jsonl"), fixtureLedger(["video"]))
    if (fault === "head") writeFileSync(join(f.directory, "head-01.json"), "{}\n")
    const before = Object.fromEntries(readdirSync(f.journal).map(name => [name, readFileSync(join(f.journal, name), "utf8")]))
    expect(() => readGraphBalanceJournal(parent, f.binding)).toThrow(/^graph_cogs_journal_evidence_refused$/)
    expect(Object.fromEntries(readdirSync(f.journal).map(name => [name, readFileSync(join(f.journal, name), "utf8")]))).toEqual(before)
    expect(readGraphReservations(join(f.directory, "reservations.jsonl")).unresolved).toBe(1)
  }))
}
for (const fault of ["sequence", "allocation", "amount", "namespace", "claimed-time", "created-time", "admission-balance", "admission-freshness",
  "pre-balance", "pre-order", "pre-intent", "after-order", "complete-time", "complete-count"] as const) {
  test(`coherently rehashed journal still refuses inconsistent ${fault}`, () => owned(parent => {
    const f = completedJournal(parent)
    rewriteJournal(f.journal, files => {
      const handoff = files.intent!.handoff as Record<string, unknown>
      const before = files.admission!.observation as Record<string, unknown>, pre = files["pre-forward"]!.observation as Record<string, unknown>
      if (fault === "sequence") handoff.sequence = 2
      if (fault === "allocation") handoff.allocation = "video"
      if (fault === "amount") handoff.amountAtomic = "10001"
      if (fault === "namespace") handoff.namespace = "new-budget"
      if (fault === "claimed-time") handoff.claimedAt = Number(files.intent!.createdAt) + 1
      if (fault === "created-time") files.intent!.createdAt = Number(handoff.issuedAt) + 5000
      if (fault === "admission-balance") before.balanceAtomic = "990000"
      if (fault === "admission-freshness") { before.observedAt = Number(handoff.issuedAt) - 5000; before.blockTimestamp = Math.floor(Number(before.observedAt) / 1000) }
      if (fault === "pre-balance") pre.balanceAtomic = "990000"
      if (fault === "pre-order") pre.observedAt = Number(files.admission!.capturedAt) - 1
      if (fault === "pre-intent") files["pre-forward"]!.intent = null
      if (fault === "after-order") (files.after!.observation as Record<string, unknown>).observedAt = Number(files["pre-forward"]!.capturedAt) - 1
      if (fault === "complete-time") files.complete!.closedAt = Number(files.after!.capturedAt) - 1
      if (fault === "complete-count") files.complete!.observations = 2
    })
    expect(() => readGraphBalanceJournal(parent, f.binding)).toThrow(/^graph_cogs_journal_evidence_refused$/)
    expect(readGraphReservations(join(f.directory, "reservations.jsonl")).unresolved).toBe(1)
  }))
}
test("a historical journal remains readable after a declared later ledger row, never a fresh handoff", () => owned(parent => {
  const f = completedJournal(parent), original = readGraphBalanceJournal(parent, f.binding)
  const path = join(f.directory, "reservations.jsonl"), prior = readFileSync(path, "utf8")
  // Explicit synthetic future ledger, not a successfully authorized second reserve.
  const body = { sequence: 2, previousHash: f.handoff.reservationHash, allocation: "video", queryHash: hash("later declared query"), amountAtomic: "10000" }
  const text = prior + JSON.stringify({ ...body, hash: hash(JSON.stringify(body)) }) + "\n"
  writeFileSync(path, text)
  writeFileSync(join(f.directory, "head-02.json"), JSON.stringify({ format: "arcade-graph-head-v1", policyHash: GRAPH_COGS_POLICY_HASH, reservations: 2, journalHash: hash(text) }) + "\n", { mode: 0o600 })
  expect(readGraphBalanceJournal(parent, f.binding)).toEqual(original)
  expect(readGraphReservations(path).unresolved).toBe(2)
  expect(() => createGraphBalanceRecorder(parent, f.binding, original.handoff, f.before)).toThrow()
}))
test("readonly journal abort, backwards clock and deadline refuse with byte preservation", () => {
  for (const fault of ["abort", "backwards", "deadline"] as const) owned(parent => {
    const f = completedJournal(parent), controller = new AbortController(), time = Date.now()
    if (fault === "abort") controller.abort()
    let calls = 0
    expect(() => readGraphBalanceJournal(parent, f.binding, { signal: controller.signal, now: () => {
      calls++; return calls === 1 ? time : fault === "backwards" ? time - 1 : time + 5000
    } })).toThrow(/^graph_cogs_journal_evidence_refused$/)
    expect(existsSync(join(f.journal, "complete.json"))).toBe(true)
    expect(readGraphReservations(join(f.directory, "reservations.jsonl")).unresolved).toBe(1)
  })
})
test("a concurrent file change detected on the second read cannot become accepted journal evidence", () => owned(parent => {
  const f = completedJournal(parent); let reads = 0
  readGraphBalanceJournal(parent, f.binding, { now: () => { reads++; return Date.now() } })
  let calls = 0
  expect(() => readGraphBalanceJournal(parent, f.binding, { now: () => {
    calls++; if (calls === Math.floor(reads / 2)) writeFileSync(join(f.journal, "admission.json"), "{}\n")
    return Date.now()
  } })).toThrow(/^graph_cogs_journal_evidence_refused$/)
  expect(readGraphReservations(join(f.directory, "reservations.jsonl")).unresolved).toBe(1)
}))
async function declaredJournaledQuery(parent: string, afterAtomic = "990000", data?: Record<string, unknown>) {
  const f = journalFixture(parent), recorder = createGraphBalanceRecorder(parent, f.binding, f.handoff, f.before)
  const protocol = await declaredProtocolCapture({ parent, binding: f.binding }, {
    ...(data === undefined ? {} : { data }),
    beforeForward(intent, receiptTimestamp) {
      const pre = { ...journalBalance(Date.now()), blockNumber: "40", blockHash: "0x" + "e".repeat(64), blockTimestamp: receiptTimestamp }
      recorder.recordPreForward(pre, intent, captureSignal())
    },
  })
  const evidence = verifyGraphCapturedQuery(parent, f.binding)
  writeGraphQueryCache(parent, f.binding, evidence)
  recorder.recordAfter({ ...journalBalance(Date.now(), afterAtomic), blockNumber: "41", blockHash: "0x" + "b".repeat(64),
    blockTimestamp: protocol.receiptTimestamp }, captureSignal())
  recorder.close(); f.writer.close()
  return { ...f, protocol, evidence }
}
test("journaled query verification joins original intent, exact retained receipt/cache and balance delta without clearing exposure", async () => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "arcade-graph-journal-proof-")))
  try {
    const f = await declaredJournaledQuery(parent), result = verifyGraphJournaledQuery(parent, f.binding)
    expect(result.evidence).toBe("retained-reservation-query-consistency")
    expect(result.reservationHash).toBe(f.handoff.reservationHash); expect(result.queryEvidenceHash).toBe(f.evidence.hash)
    expect(result.paymentTx).toBe(f.protocol.tx); expect(result.spentAtomic).toBe("10000")
    expect(result.journalHash).toBe(readGraphBalanceJournal(parent, f.binding).journalHash)
    expect(result.cacheHash).toBe(readGraphQueryCache(parent, f.binding).cacheHash)
    expect(Object.isFrozen(result)).toBe(true); expect(JSON.stringify(result)).not.toContain(parent)
    expect(readGraphReservations(join(f.directory, "reservations.jsonl")).unresolved).toBe(1)
    const child = spawnSync(process.execPath, ["--no-env-file", "-e", cacheChild({ parent, source: f.source },
      `const {readGraphBalanceJournal,verifyGraphJournaledQuery}=await import(${JSON.stringify(resolve(import.meta.dir, "e2e-graph-cogs.ts"))});console.log(JSON.stringify(verifyGraphJournaledQuery(parent,binding)))`)], {
      env: { PATH: "" }, encoding: "utf8", timeout: 4000, maxBuffer: 8192,
    })
    expect(child.status).toBe(0); expect(child.stderr).toBe("")
    expect(JSON.parse(child.stdout)).toEqual(result)
  } finally { rmSync(parent, { recursive: true, force: true }) }
})
for (const fault of ["header", "nonce", "balance-delta", "floor", "missing-cache", "changed-cache", "retained-claim"] as const) {
  test(`journaled query refuses ${fault} without erasing the retained observations`, async () => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), "arcade-graph-journal-proof-")))
    try {
      const f = await declaredJournaledQuery(parent, fault === "floor" ? "899999" : fault === "balance-delta" ? "1000000" : "990000")
      if (fault === "header" || fault === "nonce") rewriteJournal(f.journal, files => {
        files["pre-forward"]!.intent = changeDeclaredIntent(files["pre-forward"]!.intent as GraphPaymentIntent, value => {
          if (fault === "header") value.paymentHeaderSha256 = hash("different declared header")
          else (value.authorization as Record<string, unknown>).nonce = "0x" + "f".repeat(64)
        })
      })
      if (fault === "missing-cache") unlinkSync(join(parent, "cache-" + f.binding.queryHash, "commit.json"))
      if (fault === "changed-cache") writeFileSync(join(parent, "cache-" + f.binding.queryHash, "result.json"), "{}\n")
      if (fault === "retained-claim") writeFileSync(join(f.journal, ".claim"), "retained", { mode: 0o600 })
      const bytes = readFileSync(join(f.journal, "after.json"))
      expect(() => verifyGraphJournaledQuery(parent, f.binding)).toThrow(/^graph_cogs_journal_evidence_refused$/)
      expect(readFileSync(join(f.journal, "after.json"))).toEqual(bytes)
      expect(readGraphReservations(join(f.directory, "reservations.jsonl")).unresolved).toBe(1)
    } finally { rmSync(parent, { recursive: true, force: true }) }
  })
}

test("qualified reservation readback keeps all quota counts while recognizing complete retained evidence", async () => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "arcade-graph-qualified-budget-")))
  try {
    const f = await declaredJournaledQuery(parent), before = readFileSync(join(f.directory, "reservations.jsonl"))
    const result = readGraphQualifiedReservations(parent, readGraphSourceManifest(f.source))
    expect(result).toMatchObject({ reservations: 1, evidence: 1, video: 0, reservedAtomic: "10000", qualifiedPaid: 1, unresolved: 0, liveEnabled: false })
    expect(result.entries[0]).toMatchObject({ sequence: 1, queryHash: f.binding.queryHash, state: "retained-consistency" })
    expect(Object.isFrozen(result.entries[0])).toBe(true)
    expect(readFileSync(join(f.directory, "reservations.jsonl"))).toEqual(before)
    expect(readGraphReservations(join(f.directory, "reservations.jsonl")).unresolved).toBe(1)
    const writer = openGraphReservationWriter(parent)
    expect(() => writer.reserve({ allocation: "video", queryHash: hash("new query"), balanceAtomic: "990000" })).toThrow()
    writer.close()
  } finally { rmSync(parent, { recursive: true, force: true }) }
})


test("empty and pending qualified budget views never initialize, reset or invent paid evidence", () => owned(parent => {
  const sources = readGraphSourceManifest(sourceCopy(parent))
  expect(() => readGraphQualifiedReservations(parent, sources)).toThrow(/^graph_cogs_qualified_budget_refused$/)
  const directory = initializeGraphReservationState(parent)
  expect(readGraphQualifiedReservations(parent, sources)).toMatchObject({ reservations: 0, qualifiedPaid: 0, unresolved: 0 })
  const writer = openGraphReservationWriter(parent); writer.reserve(reservation())
  expect(readGraphQualifiedReservations(parent, sources)).toMatchObject({ reservations: 1, qualifiedPaid: 0, unresolved: 1, reservedAtomic: "10000" })
  expect(existsSync(join(directory, ".claim"))).toBe(true); writer.close()
  expect(readGraphQualifiedReservations(parent, sources).unresolved).toBe(1)
}))
for (const fault of ["missing-journal", "journal-claim", "cache-claim", "missing-result", "missing-marker"] as const) {
  test(`qualified budget leaves ${fault} unresolved without consuming another slot`, async () => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), "arcade-graph-qualified-budget-")))
    try {
      const f = await declaredJournaledQuery(parent), sources = readGraphSourceManifest(f.source)
      if (fault === "missing-journal") renameSync(f.journal, join(parent, "retained-journal"))
      if (fault === "journal-claim") writeFileSync(join(f.journal, ".claim"), "retained", { mode: 0o600 })
      if (fault === "cache-claim") writeFileSync(join(parent, "cache-" + f.binding.queryHash, ".claim"), "retained", { mode: 0o600 })
      if (fault === "missing-result") unlinkSync(join(parent, "cache-" + f.binding.queryHash, "result.json"))
      if (fault === "missing-marker") unlinkSync(join(f.journal, "complete.json"))
      expect(readGraphQualifiedReservations(parent, sources)).toMatchObject({ reservations: 1, qualifiedPaid: 0, unresolved: 1 })
      expect(readGraphReservations(join(f.directory, "reservations.jsonl")).unresolved).toBe(1)
    } finally { rmSync(parent, { recursive: true, force: true }) }
  })
}
for (const fault of ["source-copy", "source-change", "global-extra", "global-head", "global-claim", "journal-extra", "cache-extra", "cache-corrupt", "journal-corrupt", "alias"] as const) {
  test(`qualified budget refuses ${fault} rather than hiding corrupted complete evidence`, async () => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), "arcade-graph-qualified-budget-")))
    try {
      const f = await declaredJournaledQuery(parent); let sources = readGraphSourceManifest(f.source)
      if (fault === "source-copy") sources = structuredClone(sources)
      if (fault === "source-change") writeFileSync(join(f.source, "skills/counterparty-graph/run.ts"), "changed")
      if (fault === "global-extra") writeFileSync(join(f.directory, "refund.json"), "{}", { mode: 0o600 })
      if (fault === "global-head") writeFileSync(join(f.directory, "head-00.json"), "{}\n")
      if (fault === "global-claim") writeFileSync(join(f.directory, ".claim"), "{}", { mode: 0o600 })
      if (fault === "journal-extra") writeFileSync(join(f.journal, "refund.json"), "{}", { mode: 0o600 })
      if (fault === "cache-extra") writeFileSync(join(parent, "cache-" + f.binding.queryHash, "refund.json"), "{}", { mode: 0o600 })
      if (fault === "cache-corrupt") writeFileSync(join(parent, "cache-" + f.binding.queryHash, "result.json"), "{}\n")
      if (fault === "journal-corrupt") writeFileSync(join(f.journal, "after.json"), "{}\n")
      if (fault === "alias") { renameSync(f.journal, f.journal + "-saved"); symlinkSync(f.journal + "-saved", f.journal) }
      expect(() => readGraphQualifiedReservations(parent, sources)).toThrow(/^graph_cogs_qualified_budget_refused$/)
      expect(readGraphReservations(join(f.directory, "reservations.jsonl")).reservations).toBe(1)
    } finally { rmSync(parent, { recursive: true, force: true }) }
  })
}
// Assemble declared two-query history from two owned offline writers. Moving and
// rehashing the second reservation is synthetic fixture construction, NOT a
// successfully admitted second reservation in the global budget.
async function declaredTwoQueryBudget(parent: string, secondBefore = "990000") {
  const first = await declaredJournaledQuery(parent, "990000", declaredIdentityData())
  const staging = join(parent, "second"); mkdirSync(staging, { mode: 0o700 })
  const sources = readGraphSourceManifest(first.source), binding = bindGraphQuery({
    subgraphId: GRAPH_COGS_POLICY.subgraph, document: document("attestations"),
    variables: { agentIds: ["8453:7"], block: { hash: "0x" + "c".repeat(64) } },
  }, sources, { binding: first.binding, blockHash: "0x" + "c".repeat(64) })
  initializeGraphReservationState(staging); const writer = openGraphReservationWriter(staging)
  const before = { ...journalBalance(Date.now(), secondBefore), blockNumber: "41", blockHash: "0x" + "b".repeat(64),
    blockTimestamp: first.protocol.receiptTimestamp }
  const summary = writer.reserve({ allocation: "evidence", queryHash: binding.queryHash, balanceAtomic: before.balanceAtomic })
  const handoff = claimGraphReservation(staging, binding, summary), recorder = createGraphBalanceRecorder(staging, binding, handoff, before)
  const protocol = await declaredProtocolCapture({ parent: staging, binding }, {
    firstId: 6, tx: "0x" + "e".repeat(64), nonce: "0x" + "f".repeat(64), receiptBlockNumber: 43, receiptBlockHash: "0x" + "9".repeat(64),
    data: { _meta: declaredIdentityData()._meta, feedbacks: [] },
    beforeForward(intent, receiptTimestamp) {
      recorder.recordPreForward({ ...journalBalance(Date.now(), secondBefore), blockNumber: "42", blockHash: "0x" + "e".repeat(64),
        blockTimestamp: receiptTimestamp }, intent, captureSignal())
    },
  })
  const evidence = verifyGraphCapturedQuery(staging, binding, { parent: first.evidence })
  writeGraphQueryCache(staging, binding, evidence, { parent: first.evidence })
  recorder.recordAfter({ ...journalBalance(Date.now(), (BigInt(secondBefore) - 10000n).toString()), blockNumber: "43",
    blockHash: "0x" + "9".repeat(64), blockTimestamp: protocol.receiptTimestamp }, captureSignal())
  recorder.close(); writer.close()
  for (const prefix of ["query-", "cache-", "balance-"]) renameSync(join(staging, prefix + binding.queryHash), join(parent, prefix + binding.queryHash))
  const path = join(first.directory, "reservations.jsonl"), prior = readFileSync(path, "utf8")
  const body = { sequence: 2, previousHash: first.handoff.reservationHash, allocation: "evidence", queryHash: binding.queryHash, amountAtomic: "10000" }
  const digest = hash(JSON.stringify(body)), text = prior + JSON.stringify({ ...body, hash: digest }) + "\n"
  writeFileSync(path, text)
  writeFileSync(join(first.directory, "head-02.json"), JSON.stringify({ format: "arcade-graph-head-v1", policyHash: GRAPH_COGS_POLICY_HASH,
    reservations: 2, journalHash: hash(text) }) + "\n", { mode: 0o600 })
  rewriteJournal(join(parent, "balance-" + binding.queryHash), files => {
    const value = files.intent!.handoff as Record<string, unknown>; value.sequence = 2; value.reservationHash = digest
    for (const name of ["admission", "pre-forward", "after", "complete"]) files[name]!.reservationHash = digest
  })
  return { first, binding, sources }
}
test("qualified global view binds the second query to the earlier identity result and continuous balances", async () => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "arcade-graph-qualified-budget-")))
  try {
    const f = await declaredTwoQueryBudget(parent), result = readGraphQualifiedReservations(parent, f.sources)
    expect(result).toMatchObject({ reservations: 2, evidence: 2, reservedAtomic: "20000", qualifiedPaid: 2, unresolved: 0 })
    expect(result.entries.map(entry => entry.proof?.paymentTx)).toEqual(["0x" + "a".repeat(64), "0x" + "e".repeat(64)])
    expect(readGraphReservations(join(f.first.directory, "reservations.jsonl")).unresolved).toBe(2)
    const child = spawnSync(process.execPath, ["--no-env-file", "-e", cacheChild({ parent, source: f.first.source },
      `const{readGraphQualifiedReservations}=await import(${JSON.stringify(resolve(import.meta.dir, "e2e-graph-cogs.ts"))});console.log(JSON.stringify(readGraphQualifiedReservations(parent,readGraphSourceManifest(${JSON.stringify(f.first.source)}))))`)], {
      env: { PATH: "" }, encoding: "utf8", timeout: 4000, maxBuffer: 8192,
    })
    expect(child.status).toBe(0); expect(child.stderr).toBe(""); expect(JSON.parse(child.stdout)).toEqual(result)
  } finally { rmSync(parent, { recursive: true, force: true }) }
})
test("individually consistent queries with a balance discontinuity cannot qualify globally", async () => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "arcade-graph-qualified-budget-")))
  try {
    const f = await declaredTwoQueryBudget(parent, "995000")
    expect(verifyGraphJournaledQuery(parent, f.binding, { parent: f.first.evidence }).spentAtomic).toBe("10000")
    expect(() => readGraphQualifiedReservations(parent, f.sources)).toThrow(/^graph_cogs_qualified_budget_refused$/)
    expect(readGraphReservations(join(f.first.directory, "reservations.jsonl")).reservations).toBe(2)
  } finally { rmSync(parent, { recursive: true, force: true }) }
})
test("an unresolved first row stops qualification of all later rows without dropping quota counts", async () => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "arcade-graph-qualified-budget-")))
  try {
    const f = await declaredTwoQueryBudget(parent)
    unlinkSync(join(f.first.journal, "complete.json"))
    const result = readGraphQualifiedReservations(parent, f.sources)
    expect(result).toMatchObject({ reservations: 2, evidence: 2, qualifiedPaid: 0, unresolved: 2, reservedAtomic: "20000" })
    expect(result.entries.every(entry => entry.state === "unresolved" && entry.proof === null)).toBe(true)
  } finally { rmSync(parent, { recursive: true, force: true }) }
})
test("qualified budget clock/cancellation checks cannot acknowledge a stale global view", () => owned(parent => {
  const sources = readGraphSourceManifest(sourceCopy(parent)); initializeGraphReservationState(parent)
  for (const fault of ["abort", "backwards", "deadline"]) {
    const time = Date.now(), controller = new AbortController(); let calls = 0
    if (fault === "abort") controller.abort()
    expect(() => readGraphQualifiedReservations(parent, sources, { signal: controller.signal, now: () => {
      calls++; return calls === 1 ? time : fault === "backwards" ? time - 1 : time + 5000
    } })).toThrow(/^graph_cogs_qualified_budget_refused$/)
  }
}))


for (const fault of ["time", "block"] as const) test(`individually valid journals cannot hide cross-query ${fault} discontinuity`, async () => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "arcade-graph-qualified-budget-")))
  try {
    const f = await declaredTwoQueryBudget(parent), first = readGraphBalanceJournal(parent, f.first.binding)
    rewriteJournal(join(parent, "balance-" + f.binding.queryHash), files => {
      const before = files.admission!.observation as Record<string, unknown>
      if (fault === "time") before.observedAt = first.closedAt - 1
      else before.blockHash = "0x" + "8".repeat(64)
    })
    expect(verifyGraphJournaledQuery(parent, f.binding, { parent: f.first.evidence }).spentAtomic).toBe("10000")
    expect(() => readGraphQualifiedReservations(parent, f.sources)).toThrow(/^graph_cogs_qualified_budget_refused$/)
    expect(readGraphReservations(join(f.first.directory, "reservations.jsonl")).unresolved).toBe(2)
  } finally { rmSync(parent, { recursive: true, force: true }) }
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
// Declared fixed-owner protocol data only: no owner key/signature or real RPC.
async function declaredProtocolCapture(f: { parent: string; binding: GraphQueryBinding }, options: {
  firstId?: number; nullReceipts?: number; tx?: string; nonce?: string; data?: Record<string, unknown>;
  receiptBlockNumber?: number; receiptBlockHash?: string;
  change?: (rows: GraphResponseObservation[]) => void
  beforeForward?: (intent: GraphPaymentIntent, receiptTimestamp: number) => void
} = {}) {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64")
  const binding = f.binding, stamp = Math.floor(Date.now() / 1000), tx = options.tx ?? `0x${"a".repeat(64)}`
  const blockHash = options.receiptBlockHash ?? `0x${"b".repeat(64)}`, graphHash = `0x${"c".repeat(64)}`
  const blockNumber = `0x${(options.receiptBlockNumber ?? 41).toString(16)}`
  let intent = declaredIntent(binding)
  if (options.nonce) intent = changeDeclaredIntent(intent, value => { (value.authorization as Record<string, unknown>).nonce = options.nonce })
  const abi = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)", "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)"])
  const base = { address: binding.token, transactionHash: tx, blockHash, blockNumber, transactionIndex: "0x0", removed: false }
  const receipt = { transactionHash: tx, blockHash, blockNumber, transactionIndex: "0x0", status: "0x1", logs: [
    { ...base, logIndex: "0x0", topics: encodeEventTopics({ abi, eventName: "Transfer", args: { from: binding.payer as `0x${string}`, to: binding.merchant as `0x${string}` } }), data: encodeAbiParameters([{ type: "uint256" }], [10000n]) },
    { ...base, logIndex: "0x1", topics: encodeEventTopics({ abi, eventName: "AuthorizationUsed", args: { authorizer: binding.payer as `0x${string}`, nonce: intent.authorization.nonce as `0x${string}` } }), data: "0x" },
  ] }
  const initialBase = observation(binding, "challenge", "{}")
  const initial = { ...initialBase, headers: { ...initialBase.headers, "payment-required": enc({ x402Version: 2,
    resource: { url: `http://mainnet-thegraph-arbitrum-04-asia-east1.thegraph.com/subgraphs/id/${GRAPH_COGS_POLICY.subgraph}` },
    accepts: [{ scheme: "exact", network: GRAPH_COGS_POLICY.chain, asset: binding.token, amount: binding.amountAtomic,
      payTo: binding.merchant, maxTimeoutSeconds: 300, extra: { assetTransferMethod: "eip3009", name: "USD Coin", version: "2" } }] }) } }
  let id = options.firstId ?? 1
  const rpc = (method: string, params: unknown[], result: unknown) => {
    const next = observation(binding, "rpc", JSON.stringify({ jsonrpc: "2.0", id, result }))
    const request = JSON.stringify({ jsonrpc: "2.0", id, method, params }); id++
    return { ...next, requestBodySha256: hash(request) }
  }
  const data = options.data ?? { _meta: { block: { number: 19, hash: graphHash }, hasIndexingErrors: false }, asWallet: [], asOwner: [] }
  const paidBase = observation(binding, "paid", JSON.stringify({ data }))
  const paid = { ...paidBase, headers: { ...paidBase.headers, "payment-response": enc({ success: true, network: GRAPH_COGS_POLICY.chain, payer: binding.payer, transaction: tx }) } }
  const rows = [initial, rpc("eth_chainId", [], "0x2105"), rpc("eth_getBlockByNumber", ["latest", false], { timestamp: `0x${stamp.toString(16)}` }), paid,
    rpc("eth_chainId", [], "0x2105"), ...Array.from({ length: options.nullReceipts ?? 0 }, () => rpc("eth_getTransactionReceipt", [tx], null)),
    rpc("eth_getTransactionReceipt", [tx], receipt), rpc("eth_getBlockByNumber", [blockNumber, false], { number: blockNumber, hash: blockHash, timestamp: `0x${stamp.toString(16)}` })]
  options.change?.(rows)
  const recorder = createGraphResponseRecorder(f.parent, binding)
  for (let i = 0; i < rows.length; i++) {
    if (i === 3) { options.beforeForward?.(intent, stamp); await recorder.beforePaidRequest(intent, captureSignal()) }
    await recorder.observe(rows[i]!, captureSignal())
  }
  recorder.close()
  return { tx, intent, data, lastRpcId: id - 1, receiptTimestamp: stamp }
}
test("retained protocol correlation joins declared challenge/intent/receipt without any new transport", () => captureOwned(async f => {
  const declared = await declaredProtocolCapture(f)
  const before = readdirSync(f.dir).map(name => [name, hash(readFileSync(join(f.dir, name), "utf8"))])
  const evidence = verifyGraphCapturedQuery(f.parent, f.binding)
  expect(evidence.evidence).toBe("retained-protocol-consistency")
  expect(evidence.result).toEqual({ data: declared.data, paymentTx: declared.tx, costAtomic: "10000" })
  expect(evidence.receiptBlockHash).not.toBe((declared.data._meta as { block: { hash: string } }).block.hash)
  expect(evidence).toMatchObject({ firstRpcId: 1, lastRpcId: 5, nonce: declared.intent.authorization.nonce })
  expect(Object.isFrozen(evidence)).toBe(true); expect(Object.isFrozen(evidence.result.data._meta)).toBe(true)
  expect(verifyGraphCapturedQuery(f.parent, f.binding)).toEqual(evidence)
  expect(readdirSync(f.dir).map(name => [name, hash(readFileSync(join(f.dir, name), "utf8"))])).toEqual(before)
}))
function changeProtocolBody(row: GraphResponseObservation, change: (value: Record<string, unknown>) => void): GraphResponseObservation {
  const value = JSON.parse(Buffer.from(row.bodyBase64, "base64").toString()) as Record<string, unknown>; change(value)
  const body = JSON.stringify(value)
  return { ...row, headers: { ...row.headers, "content-length": String(Buffer.byteLength(body)) }, bodyBase64: Buffer.from(body).toString("base64"), bodySha256: hash(body) }
}
test("exclusive per-query cache preserves the correlated result without a new paid call", () => captureOwned(async f => {
  await declaredProtocolCapture(f)
  const evidence = verifyGraphCapturedQuery(f.parent, f.binding)
  const stored = writeGraphQueryCache(f.parent, f.binding, evidence)
  expect(stored.evidence).toEqual(evidence); expect(stored.newPaidQueries).toBe(0)
  const dir = join(f.parent, "cache-" + f.binding.queryHash)
  expect(readdirSync(dir).sort()).toEqual(["commit.json", "result.json"])
  expect(lstatSync(dir).mode & 0o777).toBe(0o700)
  for (const file of readdirSync(dir)) expect(lstatSync(join(dir, file)).mode & 0o777).toBe(0o600)
  const before = readdirSync(dir).map(name => [name, hash(readFileSync(join(dir, name), "utf8"))])
  expect(readGraphQueryCache(f.parent, f.binding)).toEqual(stored)
  expect(() => writeGraphQueryCache(f.parent, f.binding, evidence)).toThrow(/^graph_cogs_cache_refused$/)
  expect(readdirSync(dir).map(name => [name, hash(readFileSync(join(dir, name), "utf8"))])).toEqual(before)
  expect(Object.isFrozen(stored.evidence.result.data._meta)).toBe(true)
}))
test("missing cache and forged evidence cannot initialize or silently refresh state", () => captureOwned(async f => {
  await declaredProtocolCapture(f); const evidence = verifyGraphCapturedQuery(f.parent, f.binding)
  expect(() => readGraphQueryCache(f.parent, f.binding)).toThrow(/^graph_cogs_cache_refused$/)
  expect(() => writeGraphQueryCache(f.parent, f.binding, structuredClone(evidence))).toThrow()
  expect(existsSync(join(f.parent, "cache-" + f.binding.queryHash))).toBe(false)
}))
test("pre-aborted cache operations cannot create files and source changes invalidate a completed cache", () => captureOwned(async f => {
  await declaredProtocolCapture(f); const evidence = verifyGraphCapturedQuery(f.parent, f.binding)
  const controller = new AbortController(); controller.abort()
  expect(() => writeGraphQueryCache(f.parent, f.binding, evidence, { signal: controller.signal })).toThrow()
  expect(() => readGraphQueryCache(f.parent, f.binding, { signal: controller.signal })).toThrow()
  expect(existsSync(join(f.parent, "cache-" + f.binding.queryHash))).toBe(false)
  writeGraphQueryCache(f.parent, f.binding, evidence)
  writeFileSync(join(f.source, "skills/counterparty-graph/run.ts"), "changed")
  expect(() => readGraphQueryCache(f.parent, f.binding)).toThrow(/^graph_cogs_cache_refused$/)
}))
for (const fault of ["result-json", "result-hash", "rehashed-result", "commit-json", "commit-hash", "missing-result", "missing-commit", "extra-file", "claim-present", "public-file", "hard-link", "symlink", "public-directory", "oversized-result"]) test(`committed query cache refuses ${fault} without overwriting`, () => captureOwned(async f => {
  await declaredProtocolCapture(f); const evidence = verifyGraphCapturedQuery(f.parent, f.binding)
  writeGraphQueryCache(f.parent, f.binding, evidence)
  const dir = join(f.parent, "cache-" + f.binding.queryHash), result = join(dir, "result.json"), marker = join(dir, "commit.json")
  if (fault === "result-json") writeFileSync(result, "{}\n")
  if (fault === "result-hash") writeFileSync(result, readFileSync(result, "utf8").replace(evidence.hash, "0".repeat(64)))
  if (fault === "rehashed-result") {
    const value = JSON.parse(readFileSync(result, "utf8")); value.evidence.result.costAtomic = "0"
    const { hash: _hash, ...body } = value; value.hash = hash(JSON.stringify(body))
    const text = JSON.stringify(value) + "\n"; writeFileSync(result, text)
    const commit = JSON.parse(readFileSync(marker, "utf8")); commit.resultHash = hash(text); writeFileSync(marker, JSON.stringify(commit) + "\n")
  }
  if (fault === "commit-json") writeFileSync(marker, "{}\n")
  if (fault === "commit-hash") { const commit = JSON.parse(readFileSync(marker, "utf8")); commit.resultHash = "0".repeat(64); writeFileSync(marker, JSON.stringify(commit) + "\n") }
  if (fault === "missing-result") unlinkSync(result)
  if (fault === "missing-commit") unlinkSync(marker)
  if (fault === "extra-file") writeFileSync(join(dir, "extra"), "no", { mode: 0o600 })
  if (fault === "claim-present") writeFileSync(join(dir, ".claim"), "held", { mode: 0o600 })
  if (fault === "public-file") chmodSync(result, 0o644)
  if (fault === "hard-link") linkSync(result, join(f.parent, "cache-alias"))
  if (fault === "symlink") { renameSync(result, join(f.parent, "cache-target")); symlinkSync(join(f.parent, "cache-target"), result) }
  if (fault === "public-directory") chmodSync(dir, 0o755)
  if (fault === "oversized-result") writeFileSync(result, " ".repeat(2097153))
  const names = readdirSync(dir).sort()
  expect(() => readGraphQueryCache(f.parent, f.binding)).toThrow(/^graph_cogs_cache_refused$/)
  expect(() => writeGraphQueryCache(f.parent, f.binding, evidence)).toThrow(/^graph_cogs_cache_refused$/)
  expect(readdirSync(dir).sort()).toEqual(names)
}))
for (const fault of ["result-error", "commit-error", "result-abort", "commit-abort", "deadline", "source-change", "capture-change"]) test(`query cache retains uncertainty after ${fault}`, () => captureOwned(async f => {
  await declaredProtocolCapture(f); const evidence = verifyGraphCapturedQuery(f.parent, f.binding)
  const controller = new AbortController(); let time = Date.now()
  const hook = () => {
    if (fault.endsWith("error")) throw Error("synthetic IO failure")
    if (fault.endsWith("abort")) controller.abort()
    if (fault === "deadline") time += 5000
    if (fault === "source-change") writeFileSync(join(f.source, "skills/counterparty-graph/run.ts"), "changed")
    if (fault === "capture-change") writeFileSync(join(f.dir, "response-01.json"), "{}\n")
  }
  expect(() => writeGraphQueryCache(f.parent, f.binding, evidence, { signal: controller.signal, now: () => time,
    ...(fault.startsWith("commit") ? { afterCommitSync: hook } : { afterResultSync: hook }) })).toThrow(/^graph_cogs_cache_refused$/)
  const dir = join(f.parent, "cache-" + f.binding.queryHash)
  expect(existsSync(join(dir, ".claim"))).toBe(true); expect(existsSync(join(dir, "result.json"))).toBe(true)
  expect(() => readGraphQueryCache(f.parent, f.binding)).toThrow()
}))
test("a lost post-release acknowledgement is not a fresh payment and valid committed bytes remain readable", () => captureOwned(async f => {
  await declaredProtocolCapture(f); const evidence = verifyGraphCapturedQuery(f.parent, f.binding)
  const dir = join(f.parent, "cache-" + f.binding.queryHash)
  expect(() => writeGraphQueryCache(f.parent, f.binding, evidence, { now: () => {
    return Date.now() + (existsSync(join(dir, "commit.json")) && !existsSync(join(dir, ".claim")) ? 5000 : 0)
  } })).toThrow(/^graph_cogs_cache_refused$/)
  expect(existsSync(join(dir, ".claim"))).toBe(false)
  const cached = readGraphQueryCache(f.parent, f.binding)
  expect(cached.evidence).toEqual(evidence); expect(cached.newPaidQueries).toBe(0)
}))
function cacheChild(f: { parent: string; source: string }, action: string) {
  return `import{readGraphSourceManifest,bindGraphQuery,verifyGraphCapturedQuery,writeGraphQueryCache,readGraphQueryCache}from${JSON.stringify(resolve(import.meta.dir, "e2e-graph-cogs.ts"))};import{document}from${JSON.stringify(resolve(import.meta.dir, "../skills/counterparty-graph/graph-client.ts"))};globalThis.fetch=()=>{throw Error("network forbidden")};const parent=${JSON.stringify(f.parent)},binding=bindGraphQuery({subgraphId:${JSON.stringify(GRAPH_COGS_POLICY.subgraph)},document:document("identities"),variables:{address:${JSON.stringify(GRAPH_COGS_POLICY.subject)}}},readGraphSourceManifest(${JSON.stringify(f.source)}));${action}`
}
// The reader is real; responses and historical times are declared synthetic data.
async function declaredQueryBalances(f: { parent: string; binding: GraphQueryBinding }, beforeAtomic = "1000000") {
  const capture = readGraphResponseCapture(f.parent, f.binding), cached = readGraphQueryCache(f.parent, f.binding)
  const receiptTime = Number(BigInt(JSON.parse(Buffer.from(capture.records.at(-1)!.observation.bodyBase64, "base64").toString()).result.timestamp))
  const observations = []
  const points = [capture.createdAt - 1, capture.forwardIntent!.observedAt, cached.evidence.capturedAt + 1]
  for (let i = 0; i < 3; i++) {
    const time = points[i]!, balance = i === 2 ? BigInt(beforeAtomic) - 10000n : BigInt(beforeAtomic)
    const blockTime = i < 2 ? Math.min(Math.floor(time / 1000), receiptTime) : Math.floor(time / 1000)
    const data = { number: `0x${(39 + i).toString(16)}`, hash: `0x${["d", "e", "b"][i]!.repeat(64)}`, timestamp: `0x${blockTime.toString(16)}` }
    let calls = 0
    const observation = await readGraphBalance(async (_url, init) => {
      const request = JSON.parse(String(init.body)); calls++
      const result = request.method === "eth_chainId" ? "0x2105" : request.method === "eth_call" ? `0x${balance.toString(16).padStart(64, "0")}` : data
      return Response.json({ jsonrpc: "2.0", id: request.id, result })
    }, { now: () => time })
    expect(calls).toBe(4); observations.push(observation)
  }
  return { before: observations[0]!, preForward: observations[1]!, after: observations[2]! }
}
test("retained balance binding joins three synthetic observations without clearing a reservation", () => captureOwned(async f => {
  await declaredProtocolCapture(f); writeGraphQueryCache(f.parent, f.binding, verifyGraphCapturedQuery(f.parent, f.binding))
  const balances = await declaredQueryBalances(f)
  const directory = initializeGraphReservationState(f.parent), writer = openGraphReservationWriter(f.parent)
  writer.reserve({ allocation: "evidence", queryHash: f.binding.queryHash, balanceAtomic: balances.before.balanceAtomic }); writer.close()
  const ledger = readFileSync(join(directory, "reservations.jsonl"), "utf8")
  const result = bindGraphQueryBalances(f.parent, f.binding, balances)
  expect(result.evidence).toBe("retained-balance-consistency"); expect(result.spentAtomic).toBe("10000")
  expect(result.before.balanceAtomic).toBe("1000000"); expect(result.after.balanceAtomic).toBe("990000")
  expect(result.queryHash).toBe(f.binding.queryHash); expect(Object.isFrozen(result.after.responseHashes)).toBe(true)
  expect(readFileSync(join(directory, "reservations.jsonl"), "utf8")).toBe(ledger)
  expect(readGraphReservations(join(directory, "reservations.jsonl")).unresolved).toBe(1)
}))
test("retained balance binding accepts exactly0.91 before and0.90 after without widening the floor", () => captureOwned(async f => {
  await declaredProtocolCapture(f); writeGraphQueryCache(f.parent, f.binding, verifyGraphCapturedQuery(f.parent, f.binding))
  const balances = await declaredQueryBalances(f, "910000"), result = bindGraphQueryBalances(f.parent, f.binding, balances)
  expect(result.before.balanceAtomic).toBe("910000"); expect(result.after.balanceAtomic).toBe("900000")
  expect(result.spentAtomic).toBe(GRAPH_COGS_POLICY.queryCostAtomic)
}))
test("synthetic balance block times remain coherent when the query crosses a wall-clock second", () => captureOwned(async f => {
  const stamp = `0x${(Math.floor(Date.now() / 1000) - 1).toString(16)}`
  await declaredProtocolCapture(f, { change(rows) {
    for (const i of [2, 6]) rows[i] = changeProtocolBody(rows[i]!, value => { (value.result as Record<string, unknown>).timestamp = stamp })
  } })
  writeGraphQueryCache(f.parent, f.binding, verifyGraphCapturedQuery(f.parent, f.binding))
  const balances = await declaredQueryBalances(f)
  expect(bindGraphQueryBalances(f.parent, f.binding, balances).spentAtomic).toBe("10000")
}))
for (const fault of ["chain", "payer", "token", "noncanonical", "overflow", "before-low", "pre-low", "changed-before", "no-delta", "double-delta", "after-floor", "after-increase", "hash-zero", "hash-case", "zero-block", "hash-count", "hash-value", "extra-field", "before-stale", "before-late", "pre-early", "pre-late", "after-early", "after-late", "block-stale", "height-backwards", "same-height-fork", "receipt-height", "receipt-fork", "reused-block-hash", "receipt-time", "cache-corrupt", "source-change"]) test(`retained balance binding refuses ${fault} without new reads or writes to a network`, () => captureOwned(async f => {
  await declaredProtocolCapture(f); writeGraphQueryCache(f.parent, f.binding, verifyGraphCapturedQuery(f.parent, f.binding))
  const balances = JSON.parse(JSON.stringify(await declaredQueryBalances(f))) as Record<string, unknown>
  const before = balances.before as Record<string, unknown>, pre = balances.preForward as Record<string, unknown>, after = balances.after as Record<string, unknown>
  if (fault === "chain") before.chain = "eip155:1"
  if (fault === "payer") before.payer = f.binding.merchant
  if (fault === "token") before.token = f.binding.merchant
  if (fault === "noncanonical") before.balanceAtomic = "01000000"
  if (fault === "overflow") before.balanceAtomic = (1n << 256n).toString()
  if (fault === "before-low") before.balanceAtomic = "909999"
  if (fault === "pre-low") pre.balanceAtomic = "909999"
  if (fault === "changed-before") before.balanceAtomic = "1000001"
  if (fault === "no-delta") after.balanceAtomic = "1000000"
  if (fault === "double-delta") after.balanceAtomic = "980000"
  if (fault === "after-floor") { before.balanceAtomic = "909999"; pre.balanceAtomic = "909999"; after.balanceAtomic = "899999" }
  if (fault === "after-increase") after.balanceAtomic = "1010000"
  if (fault === "hash-zero") before.blockHash = `0x${"0".repeat(64)}`
  if (fault === "hash-case") before.blockHash = `0x${"D".repeat(64)}`
  if (fault === "zero-block") before.blockNumber = "0"
  if (fault === "hash-count") (before.responseHashes as string[]).pop()
  if (fault === "hash-value") (before.responseHashes as string[])[1] = "0".repeat(64)
  if (fault === "extra-field") before.extra = true
  if (fault === "before-stale") before.observedAt = Number(before.observedAt) - 5001
  if (fault === "before-late") before.observedAt = Number(pre.observedAt) + 1
  if (fault === "pre-early") pre.observedAt = before.observedAt
  if (fault === "pre-late") pre.observedAt = Number(pre.observedAt) + 1
  if (fault === "after-early") after.observedAt = Number(after.observedAt) - 2
  if (fault === "after-late") after.observedAt = Number(after.observedAt) + 5001
  if (fault === "block-stale") before.blockTimestamp = Number(before.blockTimestamp) - 31
  if (fault === "height-backwards") before.blockNumber = "41"
  if (fault === "same-height-fork") pre.blockNumber = before.blockNumber
  if (fault === "receipt-height") pre.blockNumber = "41"
  if (fault === "receipt-fork") after.blockHash = `0x${"f".repeat(64)}`
  if (fault === "reused-block-hash") { pre.blockHash = after.blockHash; after.blockNumber = "42"; after.blockHash = `0x${"f".repeat(64)}` }
  if (fault === "receipt-time") {
    const last = readGraphResponseCapture(f.parent, f.binding).records.at(-1)!
    const receiptTime = Number(BigInt(JSON.parse(Buffer.from(last.observation.bodyBase64, "base64").toString()).result.timestamp))
    before.blockTimestamp = receiptTime - 1; pre.blockTimestamp = receiptTime - 1; after.blockTimestamp = receiptTime - 1
  }
  if (fault === "cache-corrupt") writeFileSync(join(f.parent, "cache-" + f.binding.queryHash, "commit.json"), "{}\n")
  if (fault === "source-change") writeFileSync(join(f.source, "skills/counterparty-graph/run.ts"), "changed")
  const files = readdirSync(f.parent).sort()
  expect(() => bindGraphQueryBalances(f.parent, f.binding, balances)).toThrow(/^graph_cogs_balance_evidence_refused$/)
  expect(readdirSync(f.parent).sort()).toEqual(files)
}))
test("retained balance binding rejects getters and caller copies stay isolated", () => captureOwned(async f => {
  await declaredProtocolCapture(f); writeGraphQueryCache(f.parent, f.binding, verifyGraphCapturedQuery(f.parent, f.binding))
  const balances = await declaredQueryBalances(f), result = bindGraphQueryBalances(f.parent, f.binding, balances)
  let invoked = false
  const bad = { ...balances, before: { ...balances.before } }
  Object.defineProperty(bad.before, "balanceAtomic", { enumerable: true, get() { invoked = true; return "1000000" } })
  expect(() => bindGraphQueryBalances(f.parent, f.binding, bad)).toThrow(); expect(invoked).toBe(false)
  const copied = JSON.parse(JSON.stringify(balances)); copied.after.balanceAtomic = "0"
  expect(result.after.balanceAtomic).toBe("990000")
  const controller = new AbortController(); controller.abort()
  expect(() => bindGraphQueryBalances(f.parent, f.binding, balances, { signal: controller.signal })).toThrow()
  let time = Date.now()
  expect(() => bindGraphQueryBalances(f.parent, f.binding, balances, { now: () => { const value = time; time += 5000; return value } })).toThrow()
}))
for (const phase of ["afterResultSync", "afterCommitSync"]) test(`actual child death at ${phase} preserves cache claim and refuses reuse`, () => captureOwned(async f => {
  await declaredProtocolCapture(f)
  const child = spawnSync(process.execPath, ["--no-env-file", "-e", cacheChild(f, `writeGraphQueryCache(parent,binding,verifyGraphCapturedQuery(parent,binding),{${phase}:()=>process.exit(33)});process.exit(99)`)], { env: { PATH: "" }, encoding: "utf8", timeout: 5000, maxBuffer: 4096 })
  expect(child.status).toBe(33); expect(child.stdout).toBe(""); expect(child.stderr).toBe("")
  const dir = join(f.parent, "cache-" + f.binding.queryHash)
  expect(existsSync(join(dir, ".claim"))).toBe(true)
  expect(existsSync(join(dir, "commit.json"))).toBe(phase === "afterCommitSync")
  expect(() => readGraphQueryCache(f.parent, f.binding)).toThrow()
  expect(() => writeGraphQueryCache(f.parent, f.binding, verifyGraphCapturedQuery(f.parent, f.binding))).toThrow()
}))
test("a competing child cannot overwrite an in-progress cache and a no-key child can read the later commit", () => captureOwned(async f => {
  await declaredProtocolCapture(f); const evidence = verifyGraphCapturedQuery(f.parent, f.binding)
  writeGraphQueryCache(f.parent, f.binding, evidence, { afterResultSync() {
    const child = spawnSync(process.execPath, ["--no-env-file", "-e", cacheChild(f, `try{writeGraphQueryCache(parent,binding,verifyGraphCapturedQuery(parent,binding));process.exit(99)}catch{process.exit(34)}`)], { env: { PATH: "" }, encoding: "utf8", timeout: 5000, maxBuffer: 4096 })
    expect(child.status).toBe(34); expect(child.stderr).toBe("")
  } })
  const child = spawnSync(process.execPath, ["--no-env-file", "-e", cacheChild(f, `const c=readGraphQueryCache(parent,binding);console.log(JSON.stringify({mode:c.mode,newPaidQueries:c.newPaidQueries,cost:c.evidence.result.costAtomic}));`)], { env: { PATH: "" }, encoding: "utf8", timeout: 5000, maxBuffer: 4096 })
  expect(child.status).toBe(0); expect(child.stderr).toBe("")
  expect(JSON.parse(child.stdout)).toEqual({ mode: "retained-query-cache", newPaidQueries: 0, cost: "10000" })
  expect(readGraphQueryCache(f.parent, f.binding).evidence).toEqual(evidence)
}))
test("the first committed query survives a later paid-error capture without refreshing either query", () => captureOwned(async f => {
  await declaredProtocolCapture(f, { data: declaredIdentityData() })
  const first = writeGraphQueryCache(f.parent, f.binding, verifyGraphCapturedQuery(f.parent, f.binding))
  const binding = bindGraphQuery({ subgraphId: GRAPH_COGS_POLICY.subgraph, document: document("attestations"), variables: { agentIds: ["8453:7"], block: { hash: `0x${"c".repeat(64)}` } } }, readGraphSourceManifest(f.source), { binding: f.binding, blockHash: `0x${"c".repeat(64)}` })
  await declaredProtocolCapture({ parent: f.parent, binding }, { firstId: 6, tx: `0x${"e".repeat(64)}`, nonce: `0x${"f".repeat(64)}`, change(rows) { rows[3] = { ...rows[3]!, status: 500 } } })
  expect(() => readGraphQueryCache(f.parent, binding, { parent: first.evidence })).toThrow()
  expect(readGraphQueryCache(f.parent, f.binding)).toEqual(first)
  expect(existsSync(join(f.parent, "cache-" + binding.queryHash))).toBe(false)
}))
test("a second committed query requires its retained first-query evidence and both original costs survive", () => captureOwned(async f => {
  await declaredProtocolCapture(f, { data: declaredIdentityData() })
  const first = writeGraphQueryCache(f.parent, f.binding, verifyGraphCapturedQuery(f.parent, f.binding))
  const binding = bindGraphQuery({ subgraphId: GRAPH_COGS_POLICY.subgraph, document: document("attestations"), variables: { agentIds: ["8453:7"], block: { hash: `0x${"c".repeat(64)}` } } }, readGraphSourceManifest(f.source), { binding: f.binding, blockHash: `0x${"c".repeat(64)}` })
  await declaredProtocolCapture({ parent: f.parent, binding }, { firstId: 6, tx: `0x${"e".repeat(64)}`, nonce: `0x${"f".repeat(64)}` })
  const evidence = verifyGraphCapturedQuery(f.parent, binding, { parent: first.evidence })
  const second = writeGraphQueryCache(f.parent, binding, evidence, { parent: first.evidence })
  expect(readGraphQueryCache(f.parent, binding, { parent: first.evidence })).toEqual(second)
  expect(() => readGraphQueryCache(f.parent, binding)).toThrow()
  expect(first.evidence.result.costAtomic).toBe("10000"); expect(second.evidence.result.costAtomic).toBe("10000")
}))
function changeProtocolHeader(row: GraphResponseObservation, header: "payment-required" | "payment-response", change: (value: Record<string, unknown>) => void): GraphResponseObservation {
  const value = JSON.parse(Buffer.from(row.headers[header]!, "base64").toString()) as Record<string, unknown>; change(value)
  return { ...row, headers: { ...row.headers, [header]: Buffer.from(JSON.stringify(value)).toString("base64") } }
}
for (const fault of ["challenge-status", "challenge-amount", "challenge-window", "challenge-network", "challenge-extra", "paid-status", "settle-amount", "settle-error", "settle-network", "settle-payer", "settle-zero", "data-errors", "index-errors", "rpc-id", "rpc-request", "first-chain", "post-chain", "old-time", "future-time", "time-encoding", "receipt-status", "receipt-nonce", "receipt-transfer", "receipt-block", "wrong-length", "wrong-encoding", "redirected", "trailing-rpc", "missing-block", "all-null"]) {
  test(`retained protocol consistency refuses durably rehashed ${fault}`, () => captureOwned(async f => {
    await declaredProtocolCapture(f, { change(rows) {
      const body = (i: number, change: (value: Record<string, unknown>) => void) => { rows[i] = changeProtocolBody(rows[i]!, change) }
      if (fault === "challenge-status") rows[0] = { ...rows[0]!, status: 200 }
      if (["challenge-amount", "challenge-window", "challenge-network", "challenge-extra"].includes(fault)) rows[0] = changeProtocolHeader(rows[0]!, "payment-required", v => {
        const accept = (v.accepts as Record<string, unknown>[])[0]!
        if (fault === "challenge-amount") accept.amount = "10001"
        if (fault === "challenge-window") accept.maxTimeoutSeconds = 301
        if (fault === "challenge-network") accept.network = "eip155:1"
        if (fault === "challenge-extra") v.extra = true
      })
      if (fault === "paid-status") rows[3] = { ...rows[3]!, status: 500 }
      if (fault.startsWith("settle-")) rows[3] = changeProtocolHeader(rows[3]!, "payment-response", v => {
        if (fault === "settle-amount") v.amount = "9999"
        if (fault === "settle-error") v.errorReason = "uncertain"
        if (fault === "settle-network") v.network = "eip155:1"
        if (fault === "settle-payer") v.payer = f.binding.merchant
        if (fault === "settle-zero") v.transaction = `0x${"0".repeat(64)}`
      })
      if (fault === "data-errors") body(3, v => { v.errors = [] })
      if (fault === "index-errors") body(3, v => { ((v.data as Record<string, unknown>)._meta as Record<string, unknown>).hasIndexingErrors = true })
      if (fault === "rpc-id") body(1, v => { v.id = 2 })
      if (fault === "rpc-request") rows[1] = { ...rows[1]!, requestBodySha256: hash("different method/params") }
      if (fault === "first-chain") body(1, v => { v.result = "0x1" })
      if (fault === "post-chain") body(4, v => { v.result = "0x1" })
      if (["old-time", "future-time", "time-encoding"].includes(fault)) body(2, v => {
        (v.result as Record<string, unknown>).timestamp = fault === "time-encoding" ? "0x01" : `0x${(Math.floor(Date.now() / 1000) + (fault === "old-time" ? -40 : 40)).toString(16)}`
      })
      if (["receipt-status", "receipt-nonce", "receipt-transfer"].includes(fault)) body(5, v => {
        const receipt = v.result as Record<string, unknown>, logs = receipt.logs as Record<string, unknown>[]
        if (fault === "receipt-status") receipt.status = "0x0"
        if (fault === "receipt-nonce") (logs[1]!.topics as string[])[2] = `0x${"e".repeat(64)}`
        if (fault === "receipt-transfer") logs[0]!.data = encodeAbiParameters([{ type: "uint256" }], [9999n])
      })
      if (fault === "receipt-block") body(6, v => { (v.result as Record<string, unknown>).hash = `0x${"e".repeat(64)}` })
      if (fault === "wrong-length") rows[3] = { ...rows[3]!, headers: { ...rows[3]!.headers, "content-length": "1" } }
      if (fault === "wrong-encoding") rows[3] = { ...rows[3]!, headers: { ...rows[3]!.headers, "content-encoding": "gzip" } }
      if (fault === "redirected") rows[3] = { ...rows[3]!, redirected: true }
      if (fault === "trailing-rpc") rows.push(rows[6]!)
      if (fault === "missing-block") rows.pop()
      if (fault === "all-null") { body(5, v => { v.result = null }); body(6, v => { v.result = null }) }
    } })
    expect(readGraphResponseCapture(f.parent, f.binding).records.length).toBeGreaterThanOrEqual(6)
    expect(() => verifyGraphCapturedQuery(f.parent, f.binding)).toThrow(/^graph_cogs_query_evidence_refused$/)
  }))
}
test("retained null-receipt polling is finite and keeps exact RPC IDs", () => captureOwned(async f => {
  await declaredProtocolCapture(f, { nullReceipts: 2 })
  expect(verifyGraphCapturedQuery(f.parent, f.binding).lastRpcId).toBe(7)
}))
const declaredIdentityData = () => ({ _meta: { block: { number: 19, hash: `0x${"c".repeat(64)}` }, hasIndexingErrors: false },
  asWallet: [{ id: "8453:7", agentId: "7", chainId: "8453", owner: String(GRAPH_COGS_POLICY.subject), agentWallet: String(GRAPH_COGS_POLICY.subject) }], asOwner: [] })
for (const firstId of [1, 6]) test(`second retained query uses exact first result with RPC start${firstId}`, () => captureOwned(async f => {
  const first = await declaredProtocolCapture(f, { data: declaredIdentityData() }), prior = verifyGraphCapturedQuery(f.parent, f.binding)
  const binding = bindGraphQuery({ subgraphId: GRAPH_COGS_POLICY.subgraph, document: document("attestations"), variables: { agentIds: ["8453:7"], block: { hash: `0x${"c".repeat(64)}` } } }, readGraphSourceManifest(f.source), { binding: f.binding, blockHash: `0x${"c".repeat(64)}` })
  await declaredProtocolCapture({ parent: f.parent, binding }, { firstId, tx: `0x${"e".repeat(64)}`, nonce: `0x${"f".repeat(64)}`, data: { _meta: declaredIdentityData()._meta, feedbacks: [] } })
  const evidence = verifyGraphCapturedQuery(f.parent, binding, { parent: prior })
  expect(evidence.firstRpcId).toBe(firstId); expect(evidence.lastRpcId).toBe(firstId + 4)
  expect(evidence.result.paymentTx).not.toBe(first.tx)
  expect(() => verifyGraphCapturedQuery(f.parent, binding)).toThrow()
  expect(() => verifyGraphCapturedQuery(f.parent, binding, { parent: structuredClone(prior) })).toThrow()
}))
for (const fault of ["ids", "block", "reused-nonce", "reused-tx", "rpc-start", "parent-mutated", "parent-empty", "parent-foreign"]) test(`second retained query refuses ${fault}`, () => captureOwned(async f => {
  const data = declaredIdentityData()
  if (fault === "parent-empty") data.asWallet = []
  if (fault === "parent-foreign") data.asWallet[0]!.agentWallet = f.binding.payer
  await declaredProtocolCapture(f, { data }); const prior = verifyGraphCapturedQuery(f.parent, f.binding)
  const binding = bindGraphQuery({ subgraphId: GRAPH_COGS_POLICY.subgraph, document: document("attestations"), variables: {
    agentIds: [fault === "ids" ? "8453:8" : "8453:7"], block: { hash: `0x${(fault === "block" ? "b" : "c").repeat(64)}` } } }, readGraphSourceManifest(f.source), { binding: f.binding, blockHash: `0x${(fault === "block" ? "b" : "c").repeat(64)}` })
  await declaredProtocolCapture({ parent: f.parent, binding }, { firstId: fault === "rpc-start" ? 2 : 6,
    tx: `0x${(fault === "reused-tx" ? "a" : "e").repeat(64)}`, nonce: `0x${(fault === "reused-nonce" ? "d" : "f").repeat(64)}` })
  if (fault === "parent-mutated") writeFileSync(join(f.dir, "response-01.json"), "{}\n")
  expect(() => verifyGraphCapturedQuery(f.parent, binding, { parent: prior })).toThrow(/^graph_cogs_query_evidence_refused$/)
}))
test("retained evidence with absent intent, changed source or expired read budget stays refused", () => captureOwned(async f => {
  await declaredProtocolCapture(f)
  let time = Date.now()
  expect(() => verifyGraphCapturedQuery(f.parent, f.binding, { now: () => { const value = time; time += 5000; return value } })).toThrow()
  const path = join(f.dir, "forward.json"), text = readFileSync(path)
  unlinkSync(path); expect(() => verifyGraphCapturedQuery(f.parent, f.binding)).toThrow(); writeFileSync(path, text, { mode: 0o600 })
  writeFileSync(join(f.source, "skills/counterparty-graph/run.ts"), "changed source")
  expect(() => verifyGraphCapturedQuery(f.parent, f.binding)).toThrow()
}))
test("actual no-key child reads retained protocol consistency without changing evidence bytes", () => captureOwned(async f => {
  await declaredProtocolCapture(f)
  const before = readdirSync(f.dir).map(name => [name, hash(readFileSync(join(f.dir, name), "utf8"))])
  const module = resolve(import.meta.dir, "e2e-graph-cogs.ts"), client = resolve(import.meta.dir, "../skills/counterparty-graph/graph-client.ts")
  const script = `import{readGraphSourceManifest,bindGraphQuery,verifyGraphCapturedQuery}from${JSON.stringify(module)};import{document}from${JSON.stringify(client)};globalThis.fetch=()=>{throw Error("network forbidden")};const binding=bindGraphQuery({subgraphId:${JSON.stringify(GRAPH_COGS_POLICY.subgraph)},document:document("identities"),variables:{address:${JSON.stringify(GRAPH_COGS_POLICY.subject)}}},readGraphSourceManifest(${JSON.stringify(f.source)}));const e=verifyGraphCapturedQuery(${JSON.stringify(f.parent)},binding);console.log(JSON.stringify({evidence:e.evidence,cost:e.result.costAtomic,lastRpcId:e.lastRpcId}));`
  const child = spawnSync(process.execPath, ["--no-env-file", "-e", script], { env: { PATH: "" }, encoding: "utf8", timeout: 5000, maxBuffer: 4096 })
  expect(child.status).toBe(0); expect(child.stderr).toBe("")
  expect(JSON.parse(child.stdout)).toEqual({ evidence: "retained-protocol-consistency", cost: "10000", lastRpcId: 5 })
  expect(readdirSync(f.dir).map(name => [name, hash(readFileSync(join(f.dir, name), "utf8"))])).toEqual(before)
}))
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
function declaredIntent(binding: GraphQueryBinding): GraphPaymentIntent {
  const domain = { name: "USD Coin" as const, version: "2" as const, chainId: 8453 as const, verifyingContract: binding.token }
  const primaryType = "TransferWithAuthorization" as const
  const authorization = { from: binding.payer, to: binding.merchant, value: binding.amountAtomic, validAfter: "0",
    validBefore: String(Math.floor(Date.now() / 1000) + 300), nonce: "0x" + "d".repeat(64) }
  return { endpoint: binding.endpoint, network: "eip155:8453", primaryType, domain, authorization,
    authorizationSha256: hash(JSON.stringify({ domain, primaryType, authorization })),
    requestBodySha256: binding.bodySha256, paymentHeaderSha256: hash("declared synthetic header, not an owner signature") }
}
async function beforeForward(recorder: GraphResponseRecorder, binding: GraphQueryBinding) {
  await recorder.observe(observation(binding), captureSignal())
  await recorder.observe(observation(binding, "rpc"), captureSignal())
  await recorder.observe(observation(binding, "rpc"), captureSignal())
}
test("a declared forward intent is durable before acknowledgement and remains data, not payment proof", () => captureOwned(async f => {
  const recorder = createGraphResponseRecorder(f.parent, f.binding)
  await beforeForward(recorder, f.binding)
  const intent = declaredIntent(f.binding), before = recorder.snapshot()
  await recorder.beforePaidRequest(intent, captureSignal())
  const text = readFileSync(join(f.dir, "forward.json"), "utf8"), stored = JSON.parse(text)
  expect(stored.intent).toEqual(intent); expect(stored.responsePrefixHash).toBe(before.lastHash)
  expect(stored.responsesBefore).toBe(3)
  await recorder.observe(observation(f.binding, "paid"), captureSignal()); recorder.close()
  const readback = readGraphResponseCapture(f.parent, f.binding)
  expect(readback.forwardIntent?.intent).toEqual(intent)
  expect(readback.summary).toMatchObject({ responses: 4, paidResponses: 1, receiptProof: "not_checked" })
  expect(readFileSync(join(f.dir, "forward.json"), "utf8")).toBe(text)
  expect(Object.isFrozen(readback.forwardIntent)).toBe(true)
  expect(Object.isFrozen(readback.forwardIntent?.intent.authorization)).toBe(true)
}))
test("legacy response-only captures remain inspectable without a fabricated forward intent", () => captureOwned(async f => {
  const recorder = createGraphResponseRecorder(f.parent, f.binding)
  await recorder.observe(observation(f.binding), captureSignal()); recorder.close()
  expect(readGraphResponseCapture(f.parent, f.binding).forwardIntent).toBe(null)
}))
test("forward intent is exclusive and cannot be written before the exact response prefix", async () => {
  for (const fault of ["early", "twice", "after-paid"] as const) await captureOwned(async f => {
    const recorder = createGraphResponseRecorder(f.parent, f.binding), intent = declaredIntent(f.binding)
    if (fault !== "early") await beforeForward(recorder, f.binding)
    if (fault === "twice") await recorder.beforePaidRequest(intent, captureSignal())
    if (fault === "after-paid") await recorder.observe(observation(f.binding, "paid"), captureSignal())
    const before = existsSync(join(f.dir, "forward.json")) ? readFileSync(join(f.dir, "forward.json")) : null
    await expect(recorder.beforePaidRequest(intent, captureSignal())).rejects.toThrow("graph_cogs_capture_refused")
    expect(existsSync(join(f.dir, "forward.json"))).toBe(before !== null)
    if (before) expect(readFileSync(join(f.dir, "forward.json"))).toEqual(before)
    expect(() => recorder.close()).toThrow("graph_cogs_capture_refused")
  })
})
function changeDeclaredIntent(intent: GraphPaymentIntent, change: (value: Record<string, unknown>) => void): GraphPaymentIntent {
  const value = JSON.parse(JSON.stringify(intent)) as Record<string, unknown>; change(value)
  value.authorizationSha256 = hash(JSON.stringify({ domain: value.domain, primaryType: value.primaryType, authorization: value.authorization }))
  return value as unknown as GraphPaymentIntent
}
test("rehashed declarations cannot change payer, domain, amount, query or authorization shape", async () => {
  const changes: ((value: Record<string, unknown>) => void)[] = [
    v => { v.endpoint = "https://example.invalid" }, v => { v.network = "eip155:1" },
    v => { v.requestBodySha256 = hash("another query") }, v => { v.paymentHeaderSha256 = "0".repeat(64) },
    v => { v.primaryType = "ReceiveWithAuthorization" }, v => { v.extra = "unrecognized" },
    v => { (v.domain as Record<string, unknown>).chainId = 1 },
    v => { (v.domain as Record<string, unknown>).verifyingContract = GRAPH_COGS_POLICY.merchant },
    v => { (v.authorization as Record<string, unknown>).from = GRAPH_COGS_POLICY.merchant },
    v => { (v.authorization as Record<string, unknown>).to = GRAPH_COGS_POLICY.payer },
    v => { (v.authorization as Record<string, unknown>).value = "10001" },
    v => { (v.authorization as Record<string, unknown>).validAfter = "1" },
    v => { (v.authorization as Record<string, unknown>).validBefore = "0" },
    v => { (v.authorization as Record<string, unknown>).validBefore = String(Math.floor(Date.now() / 1000) + 600) },
    v => { (v.authorization as Record<string, unknown>).nonce = "0x" + "0".repeat(64) },
  ]
  for (const change of changes) await captureOwned(async f => {
    const recorder = createGraphResponseRecorder(f.parent, f.binding); await beforeForward(recorder, f.binding)
    await expect(recorder.beforePaidRequest(changeDeclaredIntent(declaredIntent(f.binding), change), captureSignal())).rejects.toThrow("graph_cogs_capture_refused")
    expect(existsSync(join(f.dir, "forward.json"))).toBe(false)
    expect(() => recorder.close()).toThrow("graph_cogs_capture_refused")
  })
})
test("a forward intent error or post-sync deadline retains its file without acknowledgement or continuation", async () => {
  for (const fault of ["throw", "abort", "deadline", "reentry"] as const) await captureOwned(async f => {
    let time = Date.now(), recorder: GraphResponseRecorder
    const controller = new AbortController()
    recorder = createGraphResponseRecorder(f.parent, f.binding, { now: () => time, afterForwardSync() {
      if (fault === "throw") throw Error("private storage error")
      if (fault === "abort") controller.abort()
      if (fault === "deadline") time += 5000
      if (fault === "reentry") try { recorder.close() } catch { /* injected reentry */ }
    } })
    await beforeForward(recorder, f.binding)
    await expect(recorder.beforePaidRequest(declaredIntent(f.binding), controller.signal)).rejects.toThrow(/^graph_cogs_capture_refused$/)
    expect(existsSync(join(f.dir, "forward.json"))).toBe(true)
    expect(existsSync(join(f.dir, ".claim"))).toBe(true)
    const readback = readGraphResponseCapture(f.parent, f.binding)
    expect(readback.forwardIntent?.responsesBefore).toBe(3); expect(readback.summary.receiptProof).toBe("not_checked")
    await expect(recorder.observe(observation(f.binding, "paid"), captureSignal())).rejects.toThrow()
    expect(() => recorder.close()).toThrow()
  })
})
test("an unrelated post-intent RPC cannot stand in for the next paid response", () => captureOwned(async f => {
  const recorder = createGraphResponseRecorder(f.parent, f.binding); await beforeForward(recorder, f.binding)
  await recorder.beforePaidRequest(declaredIntent(f.binding), captureSignal())
  await expect(recorder.observe(observation(f.binding, "rpc"), captureSignal())).rejects.toThrow("graph_cogs_capture_refused")
  expect(existsSync(join(f.dir, "response-04.json"))).toBe(false)
  expect(() => recorder.close()).toThrow()
}))
test("altered forward bytes, prefix hashes and times refuse readback even with a recomputed envelope hash", async () => {
  for (const fault of ["prefix", "time", "payer", "count", "hardlink"] as const) await captureOwned(async f => {
    const recorder = createGraphResponseRecorder(f.parent, f.binding); await beforeForward(recorder, f.binding)
    await recorder.beforePaidRequest(declaredIntent(f.binding), captureSignal()); recorder.close()
    const path = join(f.dir, "forward.json")
    if (fault === "hardlink") linkSync(path, join(f.parent, "linked-forward.json"))
    else rewriteCapture(path, row => {
      if (fault === "prefix") row.responsePrefixHash = hash("wrong prefix")
      if (fault === "time") row.observedAt = Date.now() + 60000
      if (fault === "count") row.responsesBefore = 2
      if (fault === "payer") row.intent = changeDeclaredIntent(row.intent as GraphPaymentIntent, v => { (v.authorization as Record<string, unknown>).from = GRAPH_COGS_POLICY.merchant })
    })
    expect(() => readGraphResponseCapture(f.parent, f.binding)).toThrow("graph_cogs_capture_refused")
  })
})
test("actual synthetic-payer mismatch stops the real client before paid forwarding without relaxing the fixed owner policy", () => captureOwned(async f => {
  const recorder = createGraphResponseRecorder(f.parent, f.binding); let calls = 0, paid = 0
  const requirement = { x402Version: 2, resource: { url: "http://mainnet-thegraph-arbitrum-04-asia-east1.thegraph.com/subgraphs/id/" + AGENT0_BASE_SUBGRAPH_ID },
    accepts: [{ scheme: "exact", network: "eip155:8453", asset: f.binding.token, amount: "10000", payTo: f.binding.merchant,
      maxTimeoutSeconds: 300, extra: { assetTransferMethod: "eip3009", name: "USD Coin", version: "2" } }] }
  const net = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls++
    if (String(input) === f.binding.endpoint) {
      if (new Headers(init?.headers).has("payment-signature")) { paid++; throw Error("fixture paid forwarding forbidden") }
      return new Response(null, { status: 402, headers: { "payment-required": Buffer.from(JSON.stringify(requirement)).toString("base64") } })
    }
    expect(String(input)).toBe(GRAPH_COGS_RPC)
    const rpc = JSON.parse(String(init?.body))
    expect(["eth_chainId", "eth_getBlockByNumber"]).toContain(rpc.method)
    return Response.json({ jsonrpc: "2.0", id: rpc.id, result: rpc.method === "eth_chainId" ? "0x2105" :
      { number: "0x29", hash: "0x" + "b".repeat(64), timestamp: "0x" + Math.floor(Date.now() / 1000).toString(16) } })
  }, { preconnect() {} })
  const query = makePaidQuery("0x" + "11".repeat(32), { fetch: net, observeResponse: recorder.observe, beforePaidRequest: recorder.beforePaidRequest })
  await expect(query(identityQuery())).rejects.toThrow(/^graph query could not be completed$/)
  await expect(query(identityQuery())).rejects.toThrow()
  expect(calls).toBe(3); expect(paid).toBe(0)
  expect(existsSync(join(f.dir, "forward.json"))).toBe(false)
  expect(readGraphResponseCapture(f.parent, f.binding).summary.responses).toBe(3)
  expect(() => recorder.close()).toThrow()
}))
test("actual child exit after forward-file sync retains the declared intent and claim without a paid response", () => captureOwned(async f => {
  const source = resolve(import.meta.dir, "e2e-graph-cogs.ts"), responses = [observation(f.binding), observation(f.binding, "rpc"), observation(f.binding, "rpc")]
  const code = `import {readGraphSourceManifest,bindGraphQuery,createGraphResponseRecorder} from ${JSON.stringify(source)};
    const binding=bindGraphQuery(${JSON.stringify(identityQuery())},readGraphSourceManifest(${JSON.stringify(f.source)}));
    const recorder=createGraphResponseRecorder(${JSON.stringify(f.parent)},binding,{afterForwardSync(){process.exit(31)}});
    for(const value of ${JSON.stringify(responses)})await recorder.observe(value,new AbortController().signal);
    await recorder.beforePaidRequest(${JSON.stringify(declaredIntent(f.binding))},new AbortController().signal);process.exit(99)`
  const child = spawnSync(process.execPath, ["--no-env-file", "-e", code], { cwd: tmpdir(), env: { PATH: "" }, encoding: "utf8", timeout: 3000, maxBuffer: 32768 })
  expect(child.status).toBe(31); expect(child.stdout).toBe(""); expect(child.stderr).toBe("")
  const result = readGraphResponseCapture(f.parent, f.binding)
  expect(result.claimPresent).toBe(true); expect(result.forwardIntent).not.toBeNull()
  expect(result.summary).toMatchObject({ responses: 3, paidResponses: 0, receiptProof: "not_checked" })
  expect(() => createGraphResponseRecorder(f.parent, f.binding)).toThrow()
}))
test("pre-aborted or mismatched intent digests refuse before the forward file exists", async () => {
  for (const fault of ["abort", "digest", "getter"] as const) await captureOwned(async f => {
    const recorder = createGraphResponseRecorder(f.parent, f.binding); await beforeForward(recorder, f.binding)
    const controller = new AbortController(); let invoked = false
    let intent = declaredIntent(f.binding)
    if (fault === "abort") controller.abort()
    if (fault === "digest") intent = { ...intent, authorizationSha256: hash("wrong digest") }
    if (fault === "getter") intent = { ...intent, get authorizationSha256() { invoked = true; return hash("getter") } }
    await expect(recorder.beforePaidRequest(intent, controller.signal)).rejects.toThrow("graph_cogs_capture_refused")
    expect(invoked).toBe(false); expect(existsSync(join(f.dir, "forward.json"))).toBe(false)
    expect(() => recorder.close()).toThrow()
  })
})
test("expired historical intent remains inspectable at its captured time without becoming fresh authority", () => captureOwned(async f => {
  const past = Date.now() - 3600000, recorder = createGraphResponseRecorder(f.parent, f.binding, { now: () => past })
  await beforeForward(recorder, f.binding)
  const intent = changeDeclaredIntent(declaredIntent(f.binding), value => {
    (value.authorization as Record<string, unknown>).validBefore = String(Math.floor(past / 1000) + 300)
  })
  await recorder.beforePaidRequest(intent, captureSignal()); recorder.close()
  const readback = readGraphResponseCapture(f.parent, f.binding)
  expect(readback.forwardIntent?.observedAt).toBe(past)
  expect(readback.forwardIntent?.intent.authorization.validBefore).toBe(intent.authorization.validBefore)
  expect(readback.summary).toMatchObject({ paidResponses: 0, receiptProof: "not_checked" })
}))
test("active forward-file corruption cannot be followed by recording a paid response", () => captureOwned(async f => {
  const recorder = createGraphResponseRecorder(f.parent, f.binding); await beforeForward(recorder, f.binding)
  await recorder.beforePaidRequest(declaredIntent(f.binding), captureSignal())
  writeFileSync(join(f.dir, "forward.json"), "{}\n")
  await expect(recorder.observe(observation(f.binding, "paid"), captureSignal())).rejects.toThrow("graph_cogs_capture_refused")
  expect(existsSync(join(f.dir, "response-04.json"))).toBe(false)
  expect(() => recorder.close()).toThrow()
}))
