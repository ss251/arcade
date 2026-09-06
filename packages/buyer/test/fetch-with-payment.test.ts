import { describe, expect, it, vi } from "vitest"
import { Effect } from "effect"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import { recoverTypedDataAddress } from "viem"
import { ARC_CAIP2, ARC_CHAIN_ID, GATEWAY_WALLET, USDC_ADDRESS, parsePrice } from "@arcade/core"
import { HEADER_PAYMENT_SIGNATURE, decodeHeaderJson, TRANSFER_TYPES } from "@arcade/payments"
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
    // Explicit offline funding observation, separate from the original hub wire.
    if (String(input) === "https://gateway-api-testnet.circle.com/v1/balances") return Response.json({ token: "USDC",
      balances: [{ depositor: account.address, domain: 26, balance: "1.000000" }] })
    const req = new Request(String(input), init)
    calls.push(req)
    return responder(calls.length, req)
  }) as typeof globalThis.fetch
  return { fetch: fn, calls }
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

describe("fetchWithPayment", () => {
  const gateway = (extra: Record<string, unknown> = {}) => {
    const body = challenge(10000n)
    return { ...body, accepts: [{ ...body.accepts[0]!, extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: GATEWAY_WALLET, ...extra } }] }
  }
  it("signs exactly the pinned Gateway domain at the actual request boundary", async () => {
    const { fetch, calls } = recordingFetch(n => n === 1 ? json(gateway(), 402) : json({ ok: true }, 202))
    const signer = { ...account }, spy = vi.spyOn(signer, "signTypedData"), beforeSign = vi.fn(() => null)
    const result = await Effect.runPromise(fetchWithPayment("https://hub.test/x/s/demo", { method: "POST", body: "same-body" },
      { account: signer, fetch, maxAmountAtomic: 10000n, lineage: "cap.fixture", beforeSign }))
    expect(result).toMatchObject({ paid: true, amountAtomic: 10000n }); expect(spy).toHaveBeenCalledTimes(1); expect(beforeSign).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(2)
    const wire = decodeHeaderJson(calls[1]!.headers.get(HEADER_PAYMENT_SIGNATURE)!) as {
      accepted: unknown; payload: { signature: `0x${string}`; authorization: { from: `0x${string}`; to: `0x${string}`; value: string; validAfter: string; validBefore: string; nonce: `0x${string}` } }
    }
    const a = wire.payload.authorization
    expect((await recoverTypedDataAddress({ domain: { name: "GatewayWalletBatched", version: "1", chainId: ARC_CHAIN_ID, verifyingContract: GATEWAY_WALLET },
      types: TRANSFER_TYPES, primaryType: "TransferWithAuthorization", message: { ...a, value: BigInt(a.value), validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore) },
      signature: wire.payload.signature })).toLowerCase()).toBe(account.address.toLowerCase())
    expect(wire.accepted).toEqual(gateway().accepts[0])
    for (const request of calls) { expect(request.redirect).toBe("error"); expect(request.credentials).toBe("omit"); expect(request.headers.get("x-arcade-hire-capability")).toBe("cap.fixture") }
    expect(await calls[1]!.text()).toBe("same-body")
  })
  it.each([
    { name: "GatewayWalletBatched", version: "2", verifyingContract: GATEWAY_WALLET },
    { name: "GatewayWalletBatched", version: "1" },
    { name: "GatewayWalletBatched", version: "1", verifyingContract: SELLER },
    { name: "UnknownDomain", version: "2" },
    { name: "USDC", version: "2", verifyingContract: GATEWAY_WALLET },
    { verifyingContract: GATEWAY_WALLET }, { name: "USDC", version: "wrong" }
  ])("refuses explicit unsupported domains before either signer or paid retry %#", async extra => {
    const body = challenge(10000n); body.accepts[0]!.extra = extra
    const { fetch, calls } = recordingFetch(() => json(body, 402)), signer = { ...account }, spy = vi.spyOn(signer, "signTypedData")
    const result = await Effect.runPromise(Effect.either(fetchWithPayment("https://hub.test/x/s/demo", { method: "POST" }, { account: signer, fetch })))
    expect(result).toMatchObject({ _tag: "Left", left: { _tag: "RpcFailure", method: "402" } })
    expect(spy).not.toHaveBeenCalled(); expect(calls).toHaveLength(1)
  })
  it.each(["", "0", "-1", "01", "1e3", " 1000", "0x10", "x".repeat(1000)])("returns a fixed typed refusal before BigInt on malformed amounts %#", async amount => {
    const body = gateway(); body.accepts[0]!.amount = amount
    const { fetch, calls } = recordingFetch(() => json(body, 402)), signer = { ...account }, spy = vi.spyOn(signer, "signTypedData")
    const result = await Effect.runPromise(Effect.either(fetchWithPayment("https://hub.test/x/s/demo", { method: "POST" }, { account: signer, fetch })))
    expect(result).toMatchObject({ _tag: "Left", left: { method: "402", reason: "Unsupported payment requirements. Nothing was signed." } })
    expect(spy).not.toHaveBeenCalled(); expect(calls).toHaveLength(1)
  })
  it("does not let a beforeSign callback mutate the authority snapshot after its cap was checked", async () => {
    const { fetch, calls } = recordingFetch(n => n === 1 ? json(gateway(), 402) : json({ ok: true }, 202)), signer = { ...account }, spy = vi.spyOn(signer, "signTypedData")
    const result = await Effect.runPromise(Effect.either(fetchWithPayment("https://hub.test/x/s/demo", { method: "POST" }, {
      account: signer, fetch, beforeSign: requirements => { (requirements as { payTo: string }).payTo = `0x${"4".repeat(40)}`; return null }
    })))
    expect(result._tag).toBe("Left"); expect(spy).not.toHaveBeenCalled(); expect(calls).toHaveLength(1)
  })
  it.each([Number.NaN, Infinity, "10000", -1n, 1n << 256n])("rejects a malformed caller cap without a request or signature %#", async cap => {
    const { fetch, calls } = recordingFetch(n => n === 1 ? json(gateway(), 402) : json({ ok: true }, 202)), signer = { ...account }, spy = vi.spyOn(signer, "signTypedData")
    const result = await Effect.runPromise(Effect.either(fetchWithPayment("https://hub.test/x/s/demo", { method: "POST" },
      { account: signer, fetch, maxAmountAtomic: cap as unknown as bigint })))
    expect(result._tag).toBe("Left"); expect(spy).not.toHaveBeenCalled(); expect(calls).toHaveLength(0)
  })
  it("keeps the original URL, body and headers when beforeSign mutates the caller's objects", async () => {
    const { fetch, calls } = recordingFetch(n => n === 1 ? json(gateway(), 402) : json({ ok: true }, 202))
    const input = new URL("https://hub.test/x/s/demo"), headers = new Headers({ "x-original": "yes" })
    const init: RequestInit = { method: "POST", body: "original-body", headers }
    const result = await Effect.runPromise(fetchWithPayment(input, init, { account, fetch, beforeSign: () => {
      input.hostname = "foreign.test"; init.method = "DELETE"; init.body = "changed-body"; headers.set("x-original", "changed"); return null
    } }))
    expect(result.paid).toBe(true); expect(calls).toHaveLength(2)
    for (const request of calls) {
      expect(request.url).toBe("https://hub.test/x/s/demo")
      expect(request.method).toBe("POST")
      expect(request.headers.get("x-original")).toBe("yes")
      expect(await request.text()).toBe("original-body")
    }
  })
  it.each(["view", "arraybuffer", "params"])("snapshots %s body bytes before either request and caller mutation", async kind => {
    const bytes = new Uint8Array([88, 65, 66, 67, 89]), params = new URLSearchParams("value=original")
    const body = kind === "view" ? bytes.subarray(1, 4) : kind === "arraybuffer" ? bytes.buffer : params
    const expected = kind === "view" ? "ABC" : kind === "arraybuffer" ? "XABCY" : "value=original"
    const { fetch, calls } = recordingFetch(n => n === 1 ? json(gateway(), 402) : json({}, 202))
    await Effect.runPromise(fetchWithPayment("https://hub.test/x/s/demo", { method: "POST", body }, { account, fetch, beforeSign: () => {
      bytes.fill(90); params.set("value", "changed"); return null
    } }))
    expect(calls).toHaveLength(2)
    for (const request of calls) {
      expect(await request.text()).toBe(expected)
      if (kind === "params") expect(request.headers.get("content-type")).toBe("application/x-www-form-urlencoded;charset=UTF-8")
    }
  })
  it.each(["string", "bytes", "blob"])("allows the exact1MiB %s replay boundary", async kind => {
    const body = kind === "string" ? "x".repeat(1_048_576) : kind === "bytes" ? new Uint8Array(1_048_576) : new Blob([new Uint8Array(1_048_576)], { type: "application/octet-stream" })
    const { fetch, calls } = recordingFetch(n => n === 1 ? json(gateway(), 402) : json({}, 202))
    const result = await Effect.runPromise(fetchWithPayment("https://hub.test/x/s/demo", { method: "POST", body }, { account, fetch }))
    expect(result.paid).toBe(true); expect(calls).toHaveLength(2)
    for (const request of calls) expect((await request.arrayBuffer()).byteLength).toBe(1_048_576)
  })
  it.each(["string", "unicode", "bytes", "blob", "stream", "form"])("refuses nonreplayable or oversized %s before a probe", async kind => {
    const body = kind === "string" ? "x".repeat(1_048_577) : kind === "unicode" ? "é".repeat(524_289) : kind === "bytes" ? new Uint8Array(1_048_577) :
      kind === "blob" ? new Blob([new Uint8Array(1_048_577)]) : kind === "stream" ? new ReadableStream({ start(controller) { controller.close() } }) : new FormData()
    let calls = 0
    const fetch = Object.assign(async () => { calls++; return json({}, 200) }, { preconnect() { throw Error("No preconnect") } })
    const result = await Effect.runPromise(Effect.either(fetchWithPayment("https://hub.test/x/s/demo", { method: "POST", body }, { account, fetch })))
    expect(result).toMatchObject({ _tag: "Left", left: { _tag: "RpcFailure", reason: "Unsupported payment request. Nothing was signed." } })
    expect(calls).toBe(0)
  })
  it("runs the final beforeSign refusal without producing a signature",async()=>{
    const {fetch,calls}=recordingFetch(()=>json(challenge(10000n),402))
    const signer={...account},signTypedData=vi.spyOn(signer,"signTypedData")
    const result=await Effect.runPromise(Effect.either(fetchWithPayment("https://hub.test/x/s/demo",{method:"POST"},{account:signer,fetch,beforeSign:()=>"ens_payto_mismatch: refused"})))
    expect(result).toMatchObject({_tag:"Left",left:{method:"beforeSign",reason:"ens_payto_mismatch: refused"}})
    expect(calls).toHaveLength(1);expect(signTypedData).not.toHaveBeenCalled()
  })
  it("fails closed on a throwing or malformed beforeSign hook without leaking its exception",async()=>{
    for(const beforeSign of [()=>{throw Error("PRIVATE")},()=>undefined]){
      const {fetch,calls}=recordingFetch(()=>json(challenge(10000n),402)),signer={...account},signTypedData=vi.spyOn(signer,"signTypedData")
      const result=await Effect.runPromise(Effect.either(fetchWithPayment("https://hub.test/x/s/demo",{method:"POST"},{account:signer,fetch,beforeSign:beforeSign as unknown as ()=>string|null})))
      expect(result).toMatchObject({_tag:"Left",left:{method:"beforeSign"}});expect(JSON.stringify(result)).not.toContain("PRIVATE")
      expect(calls).toHaveLength(1);expect(signTypedData).not.toHaveBeenCalled()
    }
  })
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
    // Canonical x402 v2 shape, as verified against Circle's CLI.
    const decoded = decodeHeaderJson(header!) as {
      x402Version: number
      accepted: { network: string; amount: string }
      payload: {
        authorization: { from: string; to: string; value: string }
        signature: string
      }
    }
    expect(decoded.x402Version).toBe(2)
    expect(decoded.accepted.network).toBe(ARC_CAIP2)
    expect(decoded.payload.authorization.from.toLowerCase()).toBe(account.address.toLowerCase())
    expect(decoded.payload.authorization.to).toBe(SELLER)
    expect(decoded.payload.authorization.value).toBe("10000")
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

  it("preserves a hub refusal without trying to sign it as a payment challenge", async () => {
    const { fetch, calls } = recordingFetch(() =>
      json({ error: "lineage_cycle", detail: "loop-probe is already an ancestor" }, 402)
    )
    const failure = await Effect.runPromise(
      fetchWithPayment("https://hub.test/x/s/loop-probe", { method: "POST" }, { account, fetch })
        .pipe(Effect.flip)
    )
    expect(failure).toMatchObject({
      _tag: "RpcFailure",
      method: "402",
      reason: "lineage_cycle: loop-probe is already an ancestor"
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.headers.get(HEADER_PAYMENT_SIGNATURE)).toBeNull()
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

  it("forwards lineage on both the probe and paid retry, and omits it when absent", async () => {
    const withLineage = recordingFetch((n) =>
      n === 1 ? json(challenge(10_000n), 402) : json({ ok: true }, 202)
    )
    await Effect.runPromise(
      fetchWithPayment(
        "https://hub.test/x/s/demo",
        { method: "POST" },
        { account, fetch: withLineage.fetch, lineage: "cap.abc" }
      )
    )
    expect(withLineage.calls).toHaveLength(2)
    for (const req of withLineage.calls) {
      expect(req.headers.get("x-arcade-hire-capability")).toBe("cap.abc")
    }

    const withoutLineage = recordingFetch((n) =>
      n === 1 ? json(challenge(10_000n), 402) : json({ ok: true }, 202)
    )
    await Effect.runPromise(
      fetchWithPayment(
        "https://hub.test/x/s/demo",
        { method: "POST" },
        { account, fetch: withoutLineage.fetch }
      )
    )
    expect(withoutLineage.calls).toHaveLength(2)
    for (const req of withoutLineage.calls) {
      expect(req.headers.get("x-arcade-hire-capability")).toBeNull()
    }
  })
})
