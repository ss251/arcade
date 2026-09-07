import { expect, test } from "bun:test"
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { Database } from "bun:sqlite"
const root = new URL("../../..", import.meta.url).pathname, seller = "0x" + "9".repeat(40), path = `/x/${seller}/skill`
async function hub(mode: string, check: (origin: string, output: () => string, stop: (repeat?: boolean) => void, dir: string) => Promise<void>, signal: "SIGTERM" | "SIGINT" = "SIGTERM") {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "arcade-escrow-boot-"))); chmodSync(dir, 0o700)
  const key = generatePrivateKey(), evaluator = privateKeyToAccount(key).address.toLowerCase(), addr = (n: string) => "0x" + n.repeat(40)
  const identity = { chainId: 5042002, escrow: addr("1"), implementation: addr("2"), hook: addr("3"), evaluator, treasury: addr("5"),
    token: "0x3600000000000000000000000000000000000000", proxyCodeHash: "0x" + "6".repeat(64),
    implementationCodeHash: "0x" + "7".repeat(64), hookCodeHash: "0x" + "8".repeat(64) }
  const configPath = join(dir, "public.json"), journalPath = join(dir, "actions.sqlite"), dbPath = join(dir, "hub.sqlite")
  writeFileSync(configPath, JSON.stringify({ identity, gasCapWei: "10000000000000000", expiresInSeconds: 1800, operationTimeoutMs: 30000 }), { mode: 0o600 })
  const child = Bun.spawn([process.execPath, "--no-env-file", "--preload", "./apps/hub/test/fixtures/escrow-boot-preload.ts", "apps/hub/src/server.ts"], {
    cwd: root, env: { PATH: "", PORT: "0", ARCADE_NETWORK: "arc-testnet", ARCADE_RAIL: "eip3009", ARCADE_CHAIN_CHECK: "0",
      ARCADE_HUB_SECRET: "s".repeat(64), ARCADE_PUBLIC_URL: "http://127.0.0.1:8787", ARCADE_FACILITATOR_KEY: mode === "invalid" ? "PRIVATE_BAD_KEY" : key,
      ARCADE_DB: dbPath, ARCADE_ESCROW_CONFIG: configPath, ARCADE_ESCROW_JOURNAL: journalPath, TEST_ESCROW_MODE: mode },
    stdout: "pipe", stderr: "pipe", stdin: "ignore"
  })
  let output = "", origin = ""
  const drain = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader(), decoder = new TextDecoder()
    try { while (true) { const part = await reader.read(); if (part.done) break
      output = (output + decoder.decode(part.value, { stream: true })).slice(-32768)
      const port = /\[escrow-test-port\] (\d+)/.exec(output)?.[1]; if (port) origin = `http://127.0.0.1:${port}`
    } } finally { reader.releaseLock() }
  }
  let stopped = false
  const streams = Promise.all([drain(child.stdout), drain(child.stderr)]), stop = (repeat = false) => { if (!stopped || repeat) { stopped = true; child.kill(signal) } }
  const wait = async (ms: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try { return await Promise.race([child.exited.then(() => true), new Promise<boolean>(r => { timer = setTimeout(() => r(false), ms) })]) }
    finally { clearTimeout(timer) }
  }
  try {
    const deadline = Date.now() + 5000
    while (!origin && child.exitCode === null && child.signalCode === null && Date.now() < deadline) await Bun.sleep(10)
    if (mode !== "invalid") expect(origin.length).toBeGreaterThan(0)
    if (mode !== "invalid") expect(output.match(/\[escrow-journal-closed\]/g)).toBeNull()
    await check(origin, () => output, stop, dir)
    if (child.exitCode === null && child.signalCode === null) stop()
    expect(await wait(4000)).toBe(true); await streams
    expect(child.exitCode).toBe(mode === "invalid" ? 2 : 0)
    expect(output).not.toContain(key); expect(output).not.toContain("PRIVATE_BAD_KEY")
    if (mode !== "invalid") expect(output.match(/\[escrow-journal-closed\]/g)).toHaveLength(1)
    return output
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); if (!await wait(1000)) throw Error("Owned escrow fixture not reaped") }
    await streams
    if (origin) await expect(fetch(origin, { signal: AbortSignal.timeout(500) })).rejects.toThrow()
    rmSync(dir, { recursive: true })
  }
}
const get = (origin: string, endpoint: string, init?: RequestInit) => fetch(origin + endpoint, { ...init, signal: AbortSignal.timeout(3000), redirect: "error", credentials: "omit" })
const until = async (predicate: () => boolean) => {
  const deadline = Date.now() + 2500
  while (!predicate() && Date.now() < deadline) await Bun.sleep(5)
  expect(predicate()).toBe(true)
}
test("actual armed boot constructs one journal, Store and guarded rail without external traffic", async () => {
  await hub("ready", async origin => {
    const health = await (await get(origin, "/healthz")).json()
    expect(health).toMatchObject({ rail: "eip3009", rails: ["eip3009", "gateway", "erc8183"] })
    const response = await get(origin, path, { method: "POST", body: "{}" }); expect(response.status).toBe(402)
    const body = await response.json()
    expect(body.accepts.map((r: { scheme: string }) => r.scheme)).toEqual(["exact", "exact", "erc8183"])
    expect(body.accepts[2].extra.request).toMatchObject({ method: "POST", skillId: "skill", timeoutSeconds: 60 })
    expect(await (await get(origin, "/__escrow_fixture")).json()).toEqual({ networkRequests: 0, constructions: 1, journalOpens: 1, storeCopies: 1 })
  })
}, 10000)
test("actual invalid signer preflight refuses before journal, DB or listener", async () => {
  await hub("invalid", async (origin, output, _stop, dir) => {
    expect(origin).toBe(""); expect(output()).toContain("escrow_hub_configuration_refused")
    expect(existsSync(join(dir, "actions.sqlite"))).toBe(false); expect(existsSync(join(dir, "hub.sqlite"))).toBe(false)
  })
}, 10000)
test.each(["SIGTERM", "SIGINT"] as const)("actual repeated %s awaits request verification cleanup before closing journal", async signal => {
  const output = await hub("verify", async (origin, output, stop) => {
    const challenge = await (await get(origin, path, { method: "POST", body: "{}" })).json(), accepted = challenge.accepts[2]
    const pending = get(origin, path + "/escrow", { method: "POST", body: JSON.stringify({ input: {}, payment: {
      x402Version: 2, accepted, payload: { jobId: "7", capability: "0x" + "a".repeat(64) } } }) }).catch(() => undefined)
    await until(() => output().includes("[escrow-verification-entered]")); stop()
    await until(() => output().includes("[escrow-verification-cleanup-start]")); stop(true); await pending
    await until(() => output().includes("[escrow-journal-closed]"))
  }, signal)
  expect(output.indexOf("[escrow-verification-cleaned]")).toBeGreaterThan(-1)
  expect(output.indexOf("[escrow-journal-closed]")).toBeGreaterThan(output.indexOf("[escrow-verification-cleaned]"))
}, 10000)
test("actual SIGTERM closes admitted tree and records uncertainty before journal close", async () => {
  const output = await hub("root", async (origin, output, stop, dir) => {
    const challenge = await (await get(origin, path, { method: "POST", body: "{}" })).json(), accepted = challenge.accepts[2]
    const payload = { x402Version: 2, accepted, payload: { jobId: "7", capability: "0x" + "b".repeat(64) } }
    const response = await get(origin, path, { method: "POST", body: "{}", headers: { "payment-signature": Buffer.from(JSON.stringify(payload)).toString("base64") } })
    expect(response.status).toBe(202); const body = await response.json()
    await until(() => output().includes("[escrow-job-entered]")); stop()
    await until(() => output().includes("[escrow-journal-closed]"))
    expect(output().match(/\[escrow-(?:job-cleaned|journal-closed)\]/g)).toEqual(["[escrow-job-cleaned]", "[escrow-journal-closed]"])
    const db = new Database(join(dir, "hub.sqlite"), { readonly: true })
    try {
      expect(db.query("SELECT state FROM escrow_admissions WHERE job_id=?").get(body.job_id)).toEqual({ state: "uncertain" })
      expect(db.query("SELECT closed FROM escrow_root_trees WHERE root_job_id=?").get(body.job_id)).toEqual({ closed: 1 })
      expect(db.query("SELECT COUNT(*) AS n FROM receipts").get()).toEqual({ n: 0 })
    } finally { db.close() }
    expect(readFileSync(join(dir, "hub.sqlite")).includes(payload.payload.capability.slice(2))).toBe(false)
  })
  expect(output.indexOf("[escrow-job-cleaned]")).toBeGreaterThan(-1)
  expect(output.indexOf("[escrow-journal-closed]")).toBeGreaterThan(output.indexOf("[escrow-job-cleaned]"))
}, 10000)
test("actual SIGTERM awaits a budget action's cleanup before closing journal", async () => {
  const output = await hub("budget", async (origin, output, stop) => {
    const challenge = await (await get(origin, path, { method: "POST", body: "{}" })).json(), accepted = challenge.accepts[2]
    const pending = get(origin, path + "/escrow", { method: "POST", body: JSON.stringify({ input: {}, payment: {
      x402Version: 2, accepted, payload: { jobId: "7", capability: "0x" + "a".repeat(64) } } }) }).catch(() => undefined)
    await until(() => output().includes("[escrow-budget-entered]")); stop(); await pending
    await until(() => output().includes("[escrow-journal-closed]"))
  })
  expect(output.match(/\[escrow-(?:budget-cleaned|journal-closed)\]/g)).toEqual(["[escrow-budget-cleaned]", "[escrow-journal-closed]"])
}, 10000)
