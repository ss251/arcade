import { expect, test } from "bun:test"
import { Effect } from "effect"
import { privateKeyToAccount } from "viem/accounts"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ARC_CAIP2, GATEWAY_WALLET, USDC_ADDRESS } from "@arcade/core"
import { fetchWithPayment } from "../src/fetch-with-payment.ts"

const account = privateKeyToAccount(`0x${"01".repeat(32)}`)
const endpoint = "https://fixture.invalid/x/seller/fixture", MAX = 1_048_576
const offlineBalance = (input: RequestInfo | URL): Response | undefined => String(input) === "https://gateway-api-testnet.circle.com/v1/balances"
  ? Response.json({ token: "USDC", balances: [{ depositor: account.address, domain: 26, balance: "1.000000" }] }) : undefined
const challenge = (gateway = true) => Response.json({ x402Version: 2, accepts: [{
  scheme: "exact", network: ARC_CAIP2, asset: USDC_ADDRESS,
  payTo: `0x${"2".repeat(40)}`, amount: "1000", resource: endpoint,
  maxTimeoutSeconds: 604900,
  extra: gateway ? { name: "GatewayWalletBatched", version: "1", verifyingContract: GATEWAY_WALLET } : {}
}] }, { status: 402 })

test("Gateway transport diagnostics never reflect the actual issued authorization", async () => {
  let calls = 0, signature = ""
  const fetcher = Object.assign(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const balance = offlineBalance(_input); if (balance) return balance
    calls++
    const header = new Headers(init?.headers).get("payment-signature")
    if (header === null) return challenge()
    signature = header
    throw Error(`PRIVATE_GATEWAY_TRANSPORT ${header}`)
  }, { preconnect() { throw Error("No preconnect") } })
  const result = await Effect.runPromise(Effect.either(fetchWithPayment(endpoint,
    { method: "POST", body: "fixture" }, { account, fetch: fetcher, maxAmountAtomic: 1000n })))
  expect(calls).toBe(2); expect(signature.length > 100).toBe(true)
  expect(result._tag).toBe("Left")
  if (result._tag !== "Left") throw Error("Expected transport refusal")
  const serialized = JSON.stringify(result.left)
  expect(serialized.includes(signature)).toBe(false)
  expect(serialized.includes("PRIVATE_GATEWAY_TRANSPORT")).toBe(false)
  expect(result.left).toMatchObject({ _tag: "RpcFailure", method: "fetch(paid)",
    reason: "Gateway authorization issued; payment outcome unknown. Reconcile before retrying." })
}, 5000)

test("ordinary USDC paid transport behavior is unchanged by the Gateway-only diagnostic fix", async () => {
  let calls = 0
  const fetcher = Object.assign(async () => { if (++calls === 1) return challenge(false); throw Error("legacy-fixture-error") },
    { preconnect() { throw Error("No preconnect") } })
  const result = await Effect.runPromise(Effect.either(fetchWithPayment(endpoint,
    { method: "POST", body: "fixture" }, { account, fetch: fetcher })))
  expect(result).toMatchObject({ _tag: "Left", left: { method: "fetch(paid)", reason: "legacy-fixture-error" } })
  expect(calls).toBe(2)
})

test("native file-backed Blob is eagerly copied before probe and beforeSign mutation", async () => {
  const directory = mkdtempSync(join(tmpdir(), "arcade-gateway-replay-"))
  const file = join(directory, "fixture.txt"), bodies: string[] = [], contentTypes: Array<string | null> = []
  try {
    writeFileSync(file, "ORIGINAL_BODY")
    const body = Bun.file(file, { type: "text/plain" })
    const expectedType = body.type
    expect(body instanceof Blob).toBe(true)
    const fetcher = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      const balance = offlineBalance(input); if (balance) return balance
      const request = new Request(input, init)
      // Snapshot native auto-generated headers before consuming Bun's lazy body.
      contentTypes.push(request.headers.get("content-type")); bodies.push(await request.text())
      return bodies.length === 1 ? challenge() : Response.json({ ok: true })
    }, { preconnect() { throw Error("No preconnect") } })
    const result = await Effect.runPromise(fetchWithPayment(endpoint, { method: "POST", body },
      { account, fetch: fetcher, beforeSign: () => { writeFileSync(file, "MUTATED__BODY"); return null } }))
    expect(result.paid).toBe(true)
    expect(bodies).toEqual(["ORIGINAL_BODY", "ORIGINAL_BODY"])
    expect(contentTypes).toEqual([expectedType, expectedType])
  } finally { rmSync(directory, { recursive: true }) }
}, 5000)

// Only replaces this test's native Blob stream boundary; restores it in finally.
// No request is made by the injected fetcher until pre-probe snapshot succeeds.
async function streamCase(mode: "stall" | "abort" | "error" | "growth" | "truncated" | "oversize" | "chunks") {
  const descriptor = Object.getOwnPropertyDescriptor(Blob.prototype, "stream")!
  const controller = new AbortController()
  let stream: ReadableStream<Uint8Array> | undefined, calls = 0, streams = 0, cancels = 0, signs = 0
  const chunks: number[] = []
  const signer = { ...account, signTypedData: ((args: Parameters<typeof account.signTypedData>[0]) => {
    signs++; return account.signTypedData(args)
  }) as typeof account.signTypedData }
  const body = new Blob([new Uint8Array(mode === "oversize" ? MAX + 1 : mode === "chunks" ? MAX : 2)], { type: "application/octet-stream" })
  let abortTimer: ReturnType<typeof setTimeout> | undefined
  Object.defineProperty(Blob.prototype, "stream", { ...descriptor, value() {
    streams++
    stream = new ReadableStream<Uint8Array>({
      start(c) {
        if (mode === "error") c.error(Error("PRIVATE_BLOB_READ"))
        else if (mode === "growth") { c.enqueue(new Uint8Array(MAX + 1)); c.close() }
        else if (mode === "truncated") { c.enqueue(new Uint8Array(1)); c.close() }
        else if (mode === "chunks") { c.enqueue(new Uint8Array(MAX / 2)); c.enqueue(new Uint8Array(MAX / 2)); c.close() }
        else if (mode === "abort") abortTimer = setTimeout(() => controller.abort(), 5)
      },
      cancel() { cancels++; return mode === "abort" ? new Promise<void>(() => {}) : undefined }
    })
    return stream
  } })
  try {
    const fetcher = Object.assign(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const balance = offlineBalance(_input); if (balance) return balance
      calls++
      if (mode === "chunks") chunks.push((await (init?.body as Blob).arrayBuffer()).byteLength)
      return calls === 1 ? challenge() : Response.json({ ok: true })
    }, { preconnect() { throw Error("No preconnect") } })
    const result = await Effect.runPromise(Effect.either(fetchWithPayment(endpoint,
      { method: "POST", body, signal: controller.signal }, { account: signer, fetch: fetcher })))
    return { result, calls, streams, cancels, signs, chunks, locked: stream?.locked ?? false }
  } finally {
    if (abortTimer !== undefined) clearTimeout(abortTimer)
    controller.abort()
    Object.defineProperty(Blob.prototype, "stream", descriptor)
  }
}

test("native Blob snapshot has a finite total deadline and cancels/releases a stalled reader", async () => {
  const at = performance.now(), result = await streamCase("stall")
  expect(result.result._tag).toBe("Left"); expect(result.calls).toBe(0); expect(result.signs).toBe(0)
  expect(result.streams).toBe(1); expect(result.cancels).toBe(1); expect(result.locked).toBe(false)
  expect(performance.now() - at).toBeLessThan(6000)
}, 7000)

test("caller cancellation cannot hang on an uncooperative cancel promise or leave a reader locked", async () => {
  const at = performance.now(), result = await streamCase("abort")
  expect(result.result._tag).toBe("Left"); expect(result.calls).toBe(0); expect(result.signs).toBe(0)
  expect(result.cancels).toBe(1); expect(result.locked).toBe(false)
  expect(performance.now() - at).toBeLessThan(1000)
}, 3000)

for (const mode of ["error", "growth", "truncated", "oversize"] as const) {
  test(`native Blob ${mode} refuses before any request/signature with fixed diagnostics`, async () => {
    const result = await streamCase(mode)
    expect(result.result).toMatchObject({ _tag: "Left", left: { _tag: "RpcFailure", method: "fetch",
      reason: "Unsupported payment request. Nothing was signed." } })
    expect(result.calls).toBe(0); expect(result.signs).toBe(0); expect(result.locked).toBe(false)
    expect(result.streams).toBe(mode === "oversize" ? 0 : 1)
  })
}

test("native Blob chunk snapshot accepts exactly 1 MiB and independently replays it", async () => {
  const result = await streamCase("chunks")
  expect(result.result._tag).toBe("Right"); expect(result.calls).toBe(2); expect(result.signs).toBe(1)
  expect(result.streams).toBe(1); expect(result.locked).toBe(false)
  expect(result.chunks).toEqual([MAX, MAX])
})
