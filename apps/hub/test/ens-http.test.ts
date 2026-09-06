import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { privateKeyToAccount } from "viem/accounts"
import { HEADER_PAYMENT_SIGNATURE, signAuthorization } from "@arcade/payments"

const root = fileURLToPath(new URL("../../..", import.meta.url))
const seller = `0x${"2".repeat(40)}`, name = "ens-live.demo-seller.arcade.eth"
const stop = async (child: ChildProcessWithoutNullStreams) => {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>(resolve => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 1500)
    child.once("close", () => { clearTimeout(timer); resolve() }); child.kill("SIGTERM")
  })
}
const request = (url: string, init?: RequestInit) => fetch(url, { ...init, signal: AbortSignal.timeout(5000) })
const eventually = async (predicate: () => Promise<boolean>) => {
  const until = Date.now() + 5000
  while (Date.now() < until) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 25)) }
  expect(await predicate()).toBe(true)
}
const withHub = async (enabled: boolean, check: (base: string) => Promise<void>, held = false) => {
  const child = spawn("bun", ["--no-env-file", "--preload", "./apps/hub/test/fixtures/ens-http-preload.ts", "apps/hub/src/server.ts"], {
    cwd: root, env: { PATH: process.env["PATH"] ?? "", PORT: "0", ARCADE_NETWORK: "arc-testnet",
      ARCADE_RAIL: "gateway", ARCADE_CHAIN_CHECK: "0", ARCADE_HUB_SECRET: "offline-ens-only",
      ...(held ? { TEST_ENS_HELD: "1" } : {}),
      ...(enabled ? { ARCADE_ENS_ROOT: "arcade.eth", ARCADE_ENS_CHECK_MS: held ? "60000" : "1000",
        ARCADE_ENS_SELLER_LABELS: JSON.stringify({ [seller]: "demo-seller" }) } : {}) }
  })
  let output = "", base = ""
  const record = (part: Buffer) => { output = (output + String(part)).slice(-65_536)
    const port = /\[ens-http-port\] (\d+)/.exec(output)?.[1]; if (port) base = `http://127.0.0.1:${port}` }
  child.stdout.on("data", record); child.stderr.on("data", record)
  try {
    const until = Date.now() + 10_000
    while (!base && child.exitCode === null && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20))
    if (!base) throw Error(`ENS fixture failed to boot: ${output}`)
    await check(base); expect(output).not.toContain("PRIVATE_")
  } finally { await stop(child) }
}

describe("actual hub ENS discovery (offline simulation)", () => {
  it("serves verified public names, preserves canary filtering and reverses observed absence", async () => {
    await withHub(true, async base => {
      const response = await request(`${base}/names/${name}`)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ name, skillId: "ens-live", seller, endpoint: `${base}/x/${seller}/ens-live`,
        payTo: `0x${"3".repeat(40)}`, chain: "eip155:5042002", priceAtomic: "10000", expired: false })
      expect((await request(`${base}/names/ens-gone.demo-seller.arcade.eth`)).status).toBe(404)
      const down = await request(`${base}/names/ens-down.demo-seller.arcade.eth`)
      expect(down.status).toBe(503); expect(JSON.stringify(await down.json())).not.toContain("PRIVATE")
      await eventually(async () => (await (await request(`${base}/listings/ens-gone`)).json()).ensExpired === true)
      expect((await (await request(`${base}/listings`)).json()).map((row: { id: string }) => row.id)).toEqual(["ens-live", "ens-down"])
      const detail = await (await request(`${base}/listings/ens-live`)).json()
      expect(detail).toMatchObject({ ensName: name, ensExpired: false, delisted: false, payTested: null })
      const doc = await (await request(`${base}/listings/ens-live/agent-registration.json`)).json()
      expect(doc.ens).toBe(name)
      const missingDoc = await (await request(`${base}/listings/ens-gone/agent-registration.json`)).json()
      expect(missingDoc.ens).toBeUndefined()
      await request(`${base}/__ens_fixture/missing`)
      await eventually(async () => (await (await request(`${base}/listings/ens-live`)).json()).ensExpired === true)
      await request(`${base}/__ens_fixture/live`)
      await eventually(async () => (await (await request(`${base}/listings/ens-live`)).json()).ensExpired === false)
    })
  }, 20_000)
  it("does no ENS work without a configured root", async () => {
    await withHub(false, async base => {
      const rows = await (await request(`${base}/listings`)).json()
      expect(rows).toHaveLength(3); expect(rows.every((row: object) => !("ensName" in row))).toBe(true)
      expect(await (await request(`${base}/listings/ens-live`)).json()).toMatchObject({ ensName: null, ensExpired: false })
      expect(await (await request(`${base}/__ens_fixture/status`)).json()).toMatchObject({ reads: 0, metadataWrites: 0 })
    })
  }, 15_000)
  it("never annotates a newer publication with an old in-flight resolution", async () => {
    await withHub(true, async base => {
      await eventually(async () => (await (await request(`${base}/__ens_fixture/status`)).json()).pending === 4)
      await request(`${base}/__ens_fixture/replace`)
      // The watcher has advanced past the first name only after its current-check.
      await eventually(async () => (await (await request(`${base}/__ens_fixture/status`)).json()).reads > 4)
      expect(await (await request(`${base}/__ens_fixture/status`)).json()).toMatchObject({ metadataWrites: 0 })
      const document = await (await request(`${base}/listings/ens-live/agent-registration.json`)).json()
      expect(document.ens).toBeUndefined()
    }, true)
  }, 15_000)
  it("a stalled ENS read does not delay an ordinary signed paid job", async () => {
    await withHub(true, async base => {
      const before = await (await request(`${base}/__ens_fixture/stuck`)).json()
      await eventually(async () => (await (await request(`${base}/__ens_fixture/status`)).json()).reads > before.reads)
      const url = `${base}/x/${seller}/ens-live`
      const probe = await request(url, { method: "POST", body: "{}" })
      expect(probe.status).toBe(402)
      const accepted = (await probe.json()).accepts[0]
      expect(accepted.extra.name).toBe("GatewayWalletBatched")
      expect(accepted.payTo).toBe(seller)
      // Fixed unfunded offline fixture: simulated rail only, no external transport.
      const signed = await Effect.runPromise(signAuthorization({ account: privateKeyToAccount(`0x${"1".repeat(64)}`), to: accepted.payTo, valueAtomic: 10_000n }))
      const { signature, ...authorization } = signed
      const response = await request(url, { method: "POST", body: "{}", headers: {
        [HEADER_PAYMENT_SIGNATURE]: Buffer.from(JSON.stringify({ x402Version: 2, accepted, payload: { authorization, signature } })).toString("base64") } })
      expect(response.status).toBe(202)
      const queued = await response.json()
      const result = await (await request(queued.poll_url)).json()
      expect(result).toMatchObject({ job_id: queued.job_id, status: "succeeded", receipt: { settled: true } })
      expect((await request(`${base}/healthz`)).status).toBe(200)
    })
  }, 15_000)
})
