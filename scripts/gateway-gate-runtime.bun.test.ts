import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, readFile, readdir, chmod, stat, symlink, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openGateJournal, readGatewayBalance, createGateRuntime } from "./gateway-gate-runtime.ts"
import { GATE, GatewayGateError } from "./gateway-gate.ts"

const buyer = "0x1111111111111111111111111111111111111111"
const payTo = "0x2222222222222222222222222222222222222222"
const dirs: string[] = []
const dir = async () => { const p = await mkdtemp(join(tmpdir(), "gateway-gate-test-")); dirs.push(p); return p }
afterEach(async () => { for (const p of dirs.splice(0)) await rm(p, { recursive: true, force: true }) })

describe("F1 private one-run journal", () => {
  it("exclusively claims a private file, durably appends safe evidence, retains it after close", async () => {
    const p = join(await dir(), "gate.jsonl"), j = await openGateJournal(p)
    await j.append({ event: "started", buyer, payTo, depositAtomic: "500000" })
    expect((await stat(p)).mode & 0o777).toBe(0o600)
    await expect(openGateJournal(p)).rejects.toThrow(GatewayGateError)
    await j.close()
    expect(JSON.parse((await readFile(p, "utf8")).trim())).toMatchObject({ event: "started", buyer })
    await expect(openGateJournal(p)).rejects.toThrow(GatewayGateError)
  })
  it("never serializes keys, signatures, arbitrary diagnostics or unknown fields", async () => {
    const p = join(await dir(), "gate.jsonl"), j = await openGateJournal(p)
    for (const data of [{ event: "started", privateKey: "dummy-private-material" },
      { event: "started", signature: "dummy-signature" }, { event: "started", error: "private" },
      { event: "unknown" }, { event: "started", buyer: "not-an-address" }])
      await expect(j.append(data)).rejects.toThrow(GatewayGateError)
    await j.close(); expect(await readFile(p, "utf8")).toBe("")
  })
  it("refuses symlinks, nonprivate parent directories and unsafe paths", async () => {
    const p = await dir(), target = await dir()
    await symlink(target, join(p, "link"))
    await expect(openGateJournal(join(p, "link", "gate.jsonl"))).rejects.toThrow(GatewayGateError)
    await chmod(p, 0o755)
    await expect(openGateJournal(join(p, "gate.jsonl"))).rejects.toThrow(GatewayGateError)
    await expect(openGateJournal("relative.jsonl")).rejects.toThrow(GatewayGateError)
    expect(await readdir(target)).toEqual([])
  })
  it("does not permit append after close or a competing claim", async () => {
    const p = join(await dir(), "gate.jsonl")
    const results = await Promise.allSettled([openGateJournal(p), openGateJournal(p)])
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1)
    const j = results.find(r => r.status === "fulfilled")!
    if (j.status !== "fulfilled") throw new Error("fixture")
    await j.value.close()
    await expect(j.value.append({ event: "started", buyer })).rejects.toThrow(GatewayGateError)
  })
})

describe("F1 actual adapter validation before IO", () => {
  it("parses correlated exact decimal Gateway balance, not floats or a different depositor", () => {
    const response = { token: "USDC", balances: [{ depositor: buyer, domain: 26, balance: "0.5" }] }
    expect(readGatewayBalance(response, buyer)).toBe(500000n)
    for (const row of [{ depositor: payTo, domain: 26, balance: "0.5" },
      { depositor: buyer, domain: 1, balance: "0.5" }, { depositor: buyer, domain: 26, balance: "1e6" },
      { depositor: buyer, domain: 26, balance: "0.5000001" }, { depositor: buyer, domain: 26, balance: "-1" }])
      expect(() => readGatewayBalance({ ...response, balances: [row] }, buyer)).toThrow(GatewayGateError)
    expect(() => readGatewayBalance({ ...response, balances: [] }, buyer)).toThrow(GatewayGateError)
  })
  it("rejects an invalid key and refuses ambient network/recipient overrides without IO", () => {
    const o = { buyer, payTo, depositAtomic: GATE.depositAtomic, paymentAtomic: GATE.paymentAtomic,
      journal: "/tmp/gateway-unit/not-created.jsonl" }
    expect(() => createGateRuntime(o, "invalid-key", AbortSignal.timeout(1000))).toThrow(GatewayGateError)
  })
  it("importing the actual legacy entry point no longer reads keys or runs anything", async () => {
    const script = new URL("./g2c-nanopay.ts", import.meta.url).pathname
    const child = Bun.spawn([process.execPath, "--no-env-file", "-e",
      `await import(${JSON.stringify(script)});console.log("IMPORTED_ONLY")`], {
      env: { PATH: process.env.PATH!, LANG: "en_US.UTF-8" }, stdout: "pipe", stderr: "pipe" })
    const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(exit).toBe(0); expect(stdout.trim()).toBe("IMPORTED_ONLY"); expect(stderr).toBe("")
  })
})
