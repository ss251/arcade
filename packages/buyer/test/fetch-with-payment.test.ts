import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import { ARC_CAIP2, USDC_ADDRESS, parsePrice } from "@arcade/core"
import { HEADER_PAYMENT_SIGNATURE, decodeHeaderJson } from "@arcade/payments"
import { fetchWithPayment } from "../src/fetch-with-payment.ts"

/**
 * Buyer-side safety. Two properties here protect real money:
 *
 *  - the DOUBLE-PAYMENT GUARD: a server that keeps answering 402 must not be able to
 *    extract a second signature, or it could drain a buyer one authorization at a time.
 *  - the MAX-AMOUNT CAP: Circle's own agent spending policies are mainnet-only, so on
 *    testnet this client-side cap is the only spend guardrail that exists.
 */

const account = privateKeyToAccount(generatePrivateKey())
const SELLER = "0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF"

const challenge = (amountAtomic: bigint) => ({
  x402Version: 2 as const,
  error: "payment required",
  accepts: [
    {
      scheme: "exact",
      network: ARC_CAIP2,
      amount: amountAtomic.toString(),
      asset: USDC_ADDRESS,
      payTo: SELLER,
      resource: "https://hub.test/x/s/demo",
      mimeType: "application/json",
      maxTimeoutSeconds: 604900,
      extra: {}
    }
  ]
})

/** Records every request so we can assert what the buyer actually sent. */
const recordingFetch = (
  responder: (n: number, req: Request) => Response
): { fetch: typeof globalThis.fetch; calls: Array<Request> } => {
  const calls: Array<Request> = []
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(String(input), init)
    calls.push(req)
    return responder(calls.length, req)
  }) as typeof globalThis.fetch
  return { fetch: fn, calls }
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

describe("fetchWithPayment", () => {
  it("passes through a 200 without signing anything", async () => {
    const { fetch, calls } = recordingFetch(() => json({ free: true }, 200))
    const res = await Effect.runPromise(
      fetchWithPayment("https://hub.test/x/s/demo", { method: "POST" }, { account, fetch })
    )
    expect(res.paid).toBe(false)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.headers.get(HEADER_PAYMENT_SIGNATURE)).toBeNull()
  })

  it("signs and retries exactly once on a 402", async () => {
    const { fetch, calls } = recordingFetch((n) =>
      n === 1 ? json(challenge(10_000n), 402) : json({ job_id: "job_x" }, 202)
    )
    const res = await Effect.runPromise(
      fetchWithPayment("https://hub.test/x/s/demo", { method: "POST" }, { account, fetch })
    )

    expect(res.paid).toBe(true)
    expect(res.amountAtomic).toBe(10_000n)
    expect(calls).toHaveLength(2)

    // The retry must carry a well-formed authorization for the right payee and amount.
    const header = calls[1]?.headers.get(HEADER_PAYMENT_SIGNATURE)
    expect(header).toBeTruthy()
    const decoded = decodeHeaderJson(header!) as {
      network: string
      payload: { from: string; to: string; value: string; signature: string }
    }
    expect(decoded.network).toBe(ARC_CAIP2)
    expect(decoded.payload.from.toLowerCase()).toBe(account.address.toLowerCase())
    expect(decoded.payload.to).toBe(SELLER)
    expect(decoded.payload.value).toBe("10000")
    expect(decoded.payload.signature).toMatch(/^0x[0-9a-f]{130}$/i)
  })

  it("REFUSES to sign when a payment header is already present — the drain guard", async () => {
    const { fetch, calls } = recordingFetch(() => json(challenge(10_000n), 402))
    const exit = await Effect.runPromiseExit(
      fetchWithPayment(
        "https://hub.test/x/s/demo",
        { method: "POST", headers: { [HEADER_PAYMENT_SIGNATURE]: "already-paid" } },
        { account, fetch }
      )
    )
    expect(exit._tag).toBe("Failure")
    // It must not even probe — no request should leave.
    expect(calls).toHaveLength(0)
  })

  it("never signs above max-amount", async () => {
    const { fetch, calls } = recordingFetch(() => json(challenge(parsePrice("$1.00")), 402))
    const exit = await Effect.runPromiseExit(
      fetchWithPayment(
        "https://hub.test/x/s/demo",
        { method: "POST" },
        { account, fetch, maxAmountAtomic: parsePrice("$0.05") }
      )
    )
    expect(exit._tag).toBe("Failure")
    // Probed once, then refused — crucially no second (paying) request.
    expect(calls).toHaveLength(1)
  })

  it("signs when the price is exactly at max-amount", async () => {
    const { fetch } = recordingFetch((n) =>
      n === 1 ? json(challenge(parsePrice("$0.05")), 402) : json({ ok: true }, 202)
    )
    const res = await Effect.runPromise(
      fetchWithPayment(
        "https://hub.test/x/s/demo",
        { method: "POST" },
        { account, fetch, maxAmountAtomic: parsePrice("$0.05") }
      )
    )
    expect(res.paid).toBe(true)
  })

  it("fails on a 402 with no acceptable requirements instead of guessing", async () => {
    const { fetch } = recordingFetch(() => json({ x402Version: 2, accepts: [] }, 402))
    const exit = await Effect.runPromiseExit(
      fetchWithPayment("https://hub.test/x/s/demo", { method: "POST" }, { account, fetch })
    )
    expect(exit._tag).toBe("Failure")
  })

  it("fails on a malformed 402 body rather than signing blind", async () => {
    const { fetch } = recordingFetch(() => json({ nonsense: true }, 402))
    const exit = await Effect.runPromiseExit(
      fetchWithPayment("https://hub.test/x/s/demo", { method: "POST" }, { account, fetch })
    )
    expect(exit._tag).toBe("Failure")
  })

  it("preserves the caller's body and headers across the retry", async () => {
    const { fetch, calls } = recordingFetch((n) =>
      n === 1 ? json(challenge(10_000n), 402) : json({ ok: true }, 202)
    )
    await Effect.runPromise(
      fetchWithPayment(
        "https://hub.test/x/s/demo",
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-trace": "abc" },
          body: JSON.stringify({ address: "0xdead" })
        },
        { account, fetch }
      )
    )
    const retry = calls[1]!
    expect(retry.headers.get("x-trace")).toBe("abc")
    expect(await retry.text()).toBe(JSON.stringify({ address: "0xdead" }))
  })
})
