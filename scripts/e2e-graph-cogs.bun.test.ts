import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtempSync, chmodSync, writeFileSync, readFileSync, rmSync, symlinkSync, linkSync, mkdirSync, realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { GRAPH_COGS_POLICY, GRAPH_COGS_POLICY_HASH, decodeGraphReservations, readGraphReservations, checkGraphBalance } from "./e2e-graph-cogs.ts"

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
