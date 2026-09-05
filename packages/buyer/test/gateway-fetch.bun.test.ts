import { expect, test } from "bun:test"
import { Effect } from "effect"
import { recoverTypedDataAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { ARC_CAIP2, ARC_CHAIN_ID, GATEWAY_WALLET, USDC_ADDRESS } from "@arcade/core"
import { decodeHeaderJson, HEADER_PAYMENT_SIGNATURE, TRANSFER_TYPES } from "@arcade/payments"
import { fetchWithPayment } from "../src/fetch-with-payment.ts"

const account = privateKeyToAccount(`0x${"01".repeat(32)}`)
const PAYEE = `0x${"2".repeat(40)}` as const
const challenge = (resource: string) => ({ x402Version: 2, error: "payment required", accepts: [{
  scheme: "exact", network: ARC_CAIP2, asset: USDC_ADDRESS, payTo: PAYEE, amount: "1000", resource,
  maxTimeoutSeconds: 604900, extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: GATEWAY_WALLET }
}] })

/** Only owned loopbacks. Abort the requests and await the exact listeners' close. */
async function fixture(mode: "repeat402" | "redirect" | "signer-failure") {
  const requests: Array<{ url: string; signature: string | null; lineage: string | null; body: string }> = []
  let foreignRequests = 0, signatures = 0
  const servers: Array<ReturnType<typeof Bun.serve>> = []
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 2500)
  const signer = { ...account, signTypedData: ((args: Parameters<typeof account.signTypedData>[0]) => {
    signatures++
    if (mode === "signer-failure") return Promise.reject(Error("PRIVATE_SIGNER_DIAGNOSTIC"))
    return account.signTypedData(args)
  }) as typeof account.signTypedData }
  let url = ""
  let result
  try {
    const foreign = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() { foreignRequests++; return new Response("unused") } })
    servers.push(foreign)
    const hub = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
      const signature = req.headers.get(HEADER_PAYMENT_SIGNATURE)
      requests.push({ url: req.url, signature, lineage: req.headers.get("x-arcade-hire-capability"), body: await req.text() })
      if (!signature) return Response.json(challenge(req.url), { status: 402 })
      return mode === "redirect" ? new Response(null, { status: 307, headers: { location: `${foreign.url}untrusted` } }) : Response.json(challenge(req.url), { status: 402 })
    } })
    servers.push(hub); url = `${hub.url}x/seller/fixture`
    result = await Effect.runPromise(Effect.either(fetchWithPayment(url, { method: "POST", body: "original-input", signal: controller.signal },
      { account: signer, maxAmountAtomic: 1000n, lineage: "cap.loopback-fixture" })).pipe(Effect.timeout("3 seconds")))
  } finally {
    controller.abort(); clearTimeout(timer)
    await Promise.all(servers.map(server => server.stop(true)))
  }
  for (const stopped of servers.map(server => server.url)) {
    await expect(fetch(stopped, { signal: AbortSignal.timeout(500), redirect: "error", credentials: "omit" })).rejects.toThrow()
  }
  return { result, requests, signatures, foreignRequests, url }
}

test("real HTTP Gateway retry has the exact signature, original request and no automatic repeat after another402", async () => {
  const f = await fixture("repeat402")
  expect(f.result).toMatchObject({ _tag: "Right", right: { paid: true, amountAtomic: 1000n, response: { status: 402 } } })
  expect(f.requests).toHaveLength(2); expect(f.signatures).toBe(1); expect(f.foreignRequests).toBe(0)
  expect(f.requests[0]!.signature).toBeNull()
  for (const request of f.requests) expect(request).toMatchObject({ url: f.url, body: "original-input", lineage: "cap.loopback-fixture" })
  const wire = decodeHeaderJson(f.requests[1]!.signature!) as {
    accepted: { amount: string; payTo: string }; payload: { signature: `0x${string}`; authorization: {
      from: `0x${string}`; to: `0x${string}`; value: string; validAfter: string; validBefore: string; nonce: `0x${string}`
    } }
  }
  expect(wire.accepted).toMatchObject({ amount: "1000", payTo: PAYEE })
  const a = wire.payload.authorization
  expect((await recoverTypedDataAddress({ domain: { name: "GatewayWalletBatched", version: "1", chainId: ARC_CHAIN_ID, verifyingContract: GATEWAY_WALLET },
    types: TRANSFER_TYPES, primaryType: "TransferWithAuthorization", message: { ...a, value: BigInt(a.value), validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore) },
    signature: wire.payload.signature })).toLowerCase()).toBe(account.address.toLowerCase())
}, 5000)

test("real paid307 cannot forward the signature or lineage to another owned origin", async () => {
  const f = await fixture("redirect")
  expect(f.result).toMatchObject({ _tag: "Left", left: { _tag: "RpcFailure", method: "fetch(paid)" } })
  expect(f.requests).toHaveLength(2); expect(f.signatures).toBe(1); expect(f.foreignRequests).toBe(0)
}, 5000)

test("real HTTP signer rejection is fixed, once only, and never makes a paid request", async () => {
  const f = await fixture("signer-failure")
  expect(f.result).toMatchObject({ _tag: "Left", left: { _tag: "InvalidSignature", reason: "Gateway authorization signing failed" } })
  expect(f.requests).toHaveLength(1); expect(f.signatures).toBe(1); expect(f.foreignRequests).toBe(0)
  expect(JSON.stringify(f.result)).not.toContain("PRIVATE_SIGNER_DIAGNOSTIC")
}, 5000)
