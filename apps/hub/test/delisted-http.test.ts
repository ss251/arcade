import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Effect } from "effect"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { helloDigest } from "@arcade/core"
import { fetchWithPayment } from "@arcade/buyer"
import { EIP712_DOMAIN, TRANSFER_TYPES, encodeHeader } from "@arcade/payments"

const ROOT = fileURLToPath(new URL("../../..", import.meta.url))
const canaryKey = generatePrivateKey() // Ephemeral, offline test fixture; never funded.
const canary = privateKeyToAccount(canaryKey)
const seller = privateKeyToAccount(generatePrivateKey())
const stranger = privateKeyToAccount(generatePrivateKey())
const makeListing = (id: string) => ({ id, version: "1.0.0", serviceName: id, description: "test listing",
  tags: [], price: "$0.01", bounds: { timeoutSec: 5 }, inputSchema: { type: "object", required: ["text"],
    properties: { text: { type: "string" } } }, outputSchema: { type: "object", required: ["ok"] } })
const listings = [makeListing("dead-listing"), makeListing("live-listing")]
let directory: string
let db: string
let hub: ChildProcessWithoutNullStreams
let ws: WebSocket
let base = ""
let output = ""
let dispatched = 0

const waitFor = async (check: () => Promise<boolean>, what: string) => {
  const end = Date.now() + 10_000
  do {
    if (await check().catch(() => false)) return
    await new Promise((resolve) => setTimeout(resolve, 30))
  } while (Date.now() < end)
  throw new Error(`waiting for ${what}: ${output}`)
}
const bun = (code: string) => {
  const result = spawnSync("bun", ["-e", code], { cwd: ROOT, encoding: "utf8", timeout: 10_000,
    env: { PATH: process.env["PATH"] ?? "", TEST_DB: db, TEST_SELLER: seller.address } })
  if (result.status !== 0) throw new Error(`test database helper failed: ${result.stderr}`)
  return result.stdout
}
const counts = (): { jobs: number; reservations: number; receipts: number } => JSON.parse(bun(`
import { Database } from "bun:sqlite";
const db=new Database(process.env.TEST_DB,{readonly:true});
console.log(JSON.stringify({jobs:db.query("SELECT COUNT(*) AS n FROM jobs").get().n,
reservations:db.query("SELECT COUNT(*) AS n FROM tree_reservations").get().n,
receipts:db.query("SELECT COUNT(*) AS n FROM receipts").get().n}));db.close();`))
const post = (headers: Record<string, string> = {}, input: unknown = { text: "test" }) => fetch(`${base}/x/${seller.address}/dead-listing`, {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(input)
})
const payment = async (account = canary, override: { from?: string; nonce?: `0x${string}` } = {}) => {
  const challenge = await post()
  expect(challenge.status).toBe(402)
  const { accepts: [accepted] } = await challenge.json()
  const authorization = { from: override.from ?? account.address, to: accepted.payTo, value: accepted.amount,
    validAfter: "0", validBefore: String(Math.floor(Date.now() / 1_000) + 900_000),
    nonce: override.nonce ?? `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}` as `0x${string}` }
  const signature = await account.signTypedData({ domain: EIP712_DOMAIN, types: TRANSFER_TYPES,
    primaryType: "TransferWithAuthorization", message: { ...authorization, from: authorization.from as `0x${string}`,
      to: authorization.to as `0x${string}`, value: BigInt(authorization.value), validAfter: 0n,
      validBefore: BigInt(authorization.validBefore) } })
  return encodeHeader({ x402Version: 2, accepted, payload: { authorization, signature } })
}

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "arcade-delist-http-"))
  db = join(directory, "hub.sqlite")
  // Seed real persisted evidence. The boot and signed Hello must retain its verdict.
  bun(`import { Effect } from "./apps/hub/node_modules/effect";
import { openSqliteStore } from "./apps/hub/src/store-sqlite.ts";
const s=openSqliteStore(process.env.TEST_DB,"seed");
for(const atMs of [1,2,3])Effect.runSync(s.store.recordPayTest({skillId:"dead-listing",seller:process.env.TEST_SELLER,
atMs,jobId:"seed_"+atMs,ok:false,reason:"not settled"}));s.close();`)
  hub = spawn("bun", ["run", "--preload", "./apps/hub/test/fixtures/delisted-http-preload.ts", "apps/hub/src/server.ts"], {
    cwd: ROOT, env: { PATH: process.env["PATH"] ?? "", PORT: "0", ARCADE_RAIL: "test",
      ARCADE_CHAIN_CHECK: "0", ARCADE_NETWORK: "arc-testnet", ARCADE_HUB_SECRET: "delisted-http-test-only",
      ARCADE_DB: db, ARCADE_TEST_BALANCE: "$1000", ARCADE_CANARY_KEY: canaryKey,
      ARCADE_CANARY_INTERVAL: "24h", ARCADE_CANARY_TICK: "24h", TEST_VERIFIED_PAYER: stranger.address }
  })
  const record = (chunk: Buffer) => {
    output += String(chunk)
    const port = /\[delist-test-port\] (\d+)/.exec(output)?.[1]
    if (port !== undefined) base = `http://127.0.0.1:${port}`
  }
  hub.stdout.on("data", record); hub.stderr.on("data", record)
  await waitFor(async () => base !== "" && (await fetch(`${base}/healthz`)).ok, "hub")
  ws = new WebSocket(base.replace("http:", "ws:") + "/ws")
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => { void (async () => {
      const runnerId = "rnr_delisted_http_test", nonce = `${Date.now()}-${crypto.randomUUID()}`
      const signature = await seller.signMessage({ message: helloDigest({ runnerId, seller: seller.address, nonce,
        skillIds: listings.map((listing) => listing.id) }) })
      ws.send(JSON.stringify({ _tag: "Hello", runnerId, nonce, seller: seller.address, signature, listings,
        maxConcurrency: 4, agentVersion: "test" }))
    })().catch(reject) })
    ws.addEventListener("error", () => reject(new Error("test runner connection failed")))
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data))
      if (msg._tag === "Ack") { if (msg.ok) resolve(); else reject(new Error(`test Hello refused: ${msg.detail}`)) }
      if (msg._tag === "JobAssignment") {
        dispatched++
        ws.send(JSON.stringify({ _tag: "JobResult", jobId: msg.jobId, outcome: { status: "succeeded", stopReason: "end_turn",
          startedAtMs: Date.now(), finishedAtMs: Date.now(), output: { ok: true } } }))
      }
    })
  })
}, 20_000)

afterAll(async () => {
  ws?.close()
  if (hub !== undefined && hub.exitCode === null && hub.signalCode === null) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { hub.kill("SIGKILL"); resolve() }, 2_000)
      hub.once("close", () => { clearTimeout(timer); resolve() })
      hub.kill("SIGTERM")
    })
  }
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true })
})

describe("delisting at the actual paid HTTP endpoint", () => {
  it("hides the persisted verdict from every catalog, not the explanatory detail", async () => {
    const detail = await (await fetch(`${base}/listings/dead-listing`)).json()
    expect(detail).toMatchObject({ delisted: true, payTested: { ok: false }, payTestHistory: [{ ok: false }, { ok: false }, { ok: false }] })
    const catalog = await (await fetch(`${base}/listings`)).json()
    expect(catalog.map((r: { id: string }) => r.id)).toEqual(["live-listing"])
    for (const path of ["/openapi.json", "/.well-known/x402", "/skill.md", "/", "/_feed"]) {
      const response = await fetch(base + path)
      expect(response.ok).toBe(true)
      expect(await response.text(), path).not.toContain("dead-listing")
    }
    expect((await fetch(`${base}/skill/dead-listing`)).status).toBe(200)
  })
  it("keeps input validation first and makes headerless probes challenge-only", async () => {
    expect((await post({}, {})).status).toBe(400)
    const response = await post()
    expect(response.status).toBe(402)
    expect((await response.json()).accepts).toHaveLength(1)
    expect(counts()).toEqual({ jobs: 0, reservations: 0, receipts: 0 })
    expect(dispatched).toBe(0)
  })
  it("refuses a signed stranger after the unchanged buyer's ordinary probe", async () => {
    const paid = await Effect.runPromise(fetchWithPayment(`${base}/x/${seller.address}/dead-listing`,
      { method: "POST", body: JSON.stringify({ text: "test" }) }, { account: stranger }))
    expect(paid.response.status).toBe(403)
    expect((await paid.response.json()).error).toBe("listing_delisted")
    expect(counts()).toEqual({ jobs: 0, reservations: 0, receipts: 0 })
  })
  it("uses modern header precedence and never falls back to a forged legacy canary", async () => {
    const legacyCanary = Buffer.from(JSON.stringify({ payload: { authorization: { from: canary.address } } })).toString("base64")
    for (const modern of [await payment(stranger), "not-json"]) {
      const response = await post({ "payment-signature": modern, "x-payment": legacyCanary })
      expect(response.status).toBe(403)
      expect((await response.json()).error).toBe("listing_delisted")
    }
    expect(counts()).toEqual({ jobs: 0, reservations: 0, receipts: 0 })
  })
  it("does not confuse a claimed canary address with proof of its signature", async () => {
    const response = await post({ "payment-signature": await payment(stranger, { from: canary.address }) })
    expect(response.status).toBe(402)
    expect((await response.json()).error).toBe("payment_invalid")
    expect(counts()).toEqual({ jobs: 0, reservations: 0, receipts: 0 })
  })
  it("rechecks the verified payer before any job, reservation or settlement", async () => {
    const response = await post({ "payment-signature": await payment(canary, { nonce: `0x${"f".repeat(64)}` }) })
    expect(response.status).toBe(403)
    expect((await response.json()).error).toBe("listing_delisted")
    expect(counts()).toEqual({ jobs: 0, reservations: 0, receipts: 0 })
  })
  it("lets the real buyer handshake execute only the verified canary and marks its receipt", async () => {
    const paid = await Effect.runPromise(fetchWithPayment(`${base}/x/${seller.address}/dead-listing`,
      { method: "POST", body: JSON.stringify({ text: "test" }) }, { account: canary }))
    expect(paid.response.status).toBe(202)
    const accepted = await paid.response.json()
    let result: { receipt?: unknown } = {}
    await waitFor(async () => { result = await (await fetch(accepted.poll_url)).json(); return result.receipt !== undefined }, "canary result")
    expect(result.receipt).toMatchObject({ canary: true, settled: true, reason: "ok" })
    expect(dispatched).toBe(1)
    expect(counts()).toEqual({ jobs: 1, reservations: 0, receipts: 1 })
  })
  it("dispatches one job per authorization, however many times its header is replayed", async () => {
    /*
     * The chain cannot stop this. USDC records (authorizer, nonce) once, so a replayed
     * header can only SETTLE once — but settlement is the last thing that happens, and
     * until then the rail's on-chain check honestly answers "unused" for every copy. Before
     * the hub claimed the authorization at acceptance, each copy dispatched a fresh job and
     * the seller's agent ran for all of them while being paid for one.
     */
    const before = counts(), dispatchedBefore = dispatched
    const header = await payment(canary)
    const first = await post({ "payment-signature": header })
    expect(first.status).toBe(202)
    const replays = await Promise.all(Array.from({ length: 5 }, () => post({ "payment-signature": header })))
    for (const replay of replays) {
      expect(replay.status).toBe(402)
      // Either refusal is correct and which one wins is a race: the hub's claim always
      // refuses, and the test rail's in-memory nonce set also refuses once the first job
      // has settled, which here can happen within milliseconds. Against a real chain only
      // the claim can refuse during the window, because the nonce is genuinely unspent
      // until settlement lands. The property under test is the count below, not the label.
      expect(["authorization_already_used", "payment_invalid"]).toContain((await replay.json()).error)
    }
    await waitFor(async () => (await (await fetch((await first.json()).poll_url)).json()).receipt !== undefined, "replay result")
    // One job, one receipt, one execution — not six.
    expect(counts().jobs).toBe(before.jobs + 1)
    expect(counts().receipts).toBe(before.receipts + 1)
    expect(dispatched).toBe(dispatchedBefore + 1)
  })
  it.each([["not json"], ["{"], ["[1,2"], ["\u0000"], ["null"], ["3"], ["[]"], ['"text"']])("answers a malformed ratings body with 400, never a source-bearing 500", async (body) => {
    /*
     * `await req.json()` throws on any non-JSON body and this is the route's first
     * statement — no payment, signature or token needed to reach it. Bun's fallback 500
     * page embeds the error, the offending source lines and absolute filesystem paths,
     * and serves them to whoever asked. This was reproduced against the live deployment.
     */
    const response = await fetch(`${base}/ratings`, { method: "POST", body })
    expect(response.status).toBe(400)
    const text = await response.text()
    expect(JSON.parse(text).error).toBe("invalid_body")
    expect(text).not.toContain("__bunfallback")
    expect(text).not.toContain(ROOT)
  })
  it("treats an empty ratings body as a missing rating, not a parse crash", async () => {
    // "" is not malformed, it is empty. It reaches the receipt gate and is refused there,
    // which is the same answer any well-formed body naming no settled receipt would get.
    const response = await fetch(`${base}/ratings`, { method: "POST", body: "" })
    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain("__bunfallback")
  })
  it.each([["not-json"], [""], ["{"], ["\u0000\u0001"]])("survives a malformed websocket frame (%j) instead of exiting", async (frame) => {
    /*
     * Bun.serve's error boundary covers `fetch` and nothing else, so a throw in the socket
     * handler became an unhandled rejection and killed the process — one frame, from any
     * unauthenticated client, since /ws accepts a socket before a Hello proves anything.
     * The hub answering /healthz afterwards is the whole assertion.
     */
    const socket = new WebSocket(base.replace("http:", "ws:") + "/ws")
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true })
      socket.addEventListener("error", () => reject(new Error("socket did not open")), { once: true })
    })
    const replied = new Promise<string>((resolve) =>
      socket.addEventListener("message", (event) => resolve(String(event.data)), { once: true }))
    socket.send(frame)
    expect(JSON.parse(await replied)).toMatchObject({ _tag: "Ack", ok: false })
    socket.close()
    // Still serving, and the runner that was connected before is still connected.
    expect((await fetch(`${base}/healthz`)).ok).toBe(true)
  })
  it("answers an unhandled route throw with a bare 500 that carries no source", async () => {
    // Defense in depth for the class rather than the instance: whatever throws, the caller
    // gets a bare 500 and the detail goes to the log.
    const response = await fetch(`${base}/ratings`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: "nope", stars: 5 })
    })
    const text = await response.text()
    expect(text).not.toContain("__bunfallback")
    expect(text).not.toContain(ROOT)
  })
})
