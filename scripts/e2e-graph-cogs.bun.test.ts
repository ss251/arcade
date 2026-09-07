import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtempSync, chmodSync, writeFileSync, readFileSync, rmSync, symlinkSync, linkSync, mkdirSync, realpathSync, existsSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { GRAPH_COGS_POLICY, GRAPH_COGS_POLICY_HASH, decodeGraphReservations, readGraphReservations, checkGraphBalance, initializeGraphReservationState, openGraphReservationWriter, type GraphReservationWriter } from "./e2e-graph-cogs.ts"

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
