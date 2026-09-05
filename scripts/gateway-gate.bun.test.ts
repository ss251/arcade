import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import {
  GATE, GatewayGateError, parseGateArgs, parseSupported, parseTransfer,
  makeGatewayPayment, fetchGatewayJson, executeGatewayGate, type GateDependencies, type GateFetch
} from "./gateway-gate.ts"

const buyer = "0x1111111111111111111111111111111111111111"
const payTo = "0x2222222222222222222222222222222222222222"
const nonce = `0x${"ab".repeat(32)}` as const
const txHash = `0x${"cd".repeat(32)}` as const
const blockHash = `0x${"ef".repeat(32)}` as const
const transferId = "3c90c3cc-0d44-4b50-8888-8dd25736052a"
const supported = () => ({ kinds: [{ x402Version: 2, scheme: "exact", network: GATE.network,
  extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: GATE.wallet,
    assets: [{ address: GATE.usdc, symbol: "USDC", decimals: 6 }] } }] })
const options = () => ({ buyer, payTo, depositAtomic: 500000n, paymentAtomic: 1000n,
  journal: "/tmp/gateway-test/probe.jsonl" })
const transfer = () => ({ id: transferId, status: "received", token: "USDC",
  sendingNetwork: GATE.network, recipientNetwork: GATE.network, fromAddress: buyer,
  toAddress: payTo, amount: "1000", nonce, txHash: null })
const fixture = () => {
  const calls: string[] = []
  const checkpoints: Array<Record<string, unknown>> = []
  const deps: GateDependencies = {
    supported: async () => { calls.push("supported"); return supported() },
    claim: async () => { calls.push("claim") },
    checkpoint: async (v) => { checkpoints.push(v) },
    preflight: async () => { calls.push("preflight"); return { buyer, chainId: 5042002,
      decimals: 6, walletAtomic: 20000000n, gatewayAtomic: 0n } },
    deposit: async () => { calls.push("deposit"); return { txHash, blockHash, blockNumber: 99,
      amountAtomic: 500000n, gatewayAtomic: 500000n } },
    sign: async (payment) => { calls.push("sign"); expect(payment.message.to).toBe(payTo);
      return `0x${"12".repeat(65)}` },
    verify: async () => { calls.push("verify"); return { isValid: true, payer: buyer } },
    settle: async () => { calls.push("settle"); return { success: true, payer: buyer,
      network: GATE.network, transaction: transferId } },
    transfer: async () => { calls.push("transfer"); return transfer() },
    afterBalance: async () => { calls.push("afterBalance"); return 499000n },
    now: () => 1788590000,
    nonce: () => nonce
  }
  return { deps, calls, checkpoints }
}

describe("F1 exact owner-gated configuration", () => {
  it("has an explicit keyless supported-only mode", () => {
    expect(parseGateArgs(["--supported"])).toEqual({ mode: "supported" })
  })
  it("has no legacy default-deposit or ambient seller behavior", () => {
    for (const args of [[], ["0.5"], ["--live"], ["--supported", "--live"]])
      expect(() => parseGateArgs(args)).toThrow(GatewayGateError)
  })
  it("requires exact explicit amounts, buyer, distinct recipient and private journal", () => {
    const args = ["--live", "--buyer", buyer, "--pay-to", payTo, "--deposit-usdc", "0.5",
      "--payment-usdc", "0.001", "--journal", "/tmp/gateway-test/probe.jsonl"]
    expect(parseGateArgs(args)).toEqual({ mode: "live", ...options() })
    for (const [from, to] of [["0.5", "1"], ["0.001", "0.002"], [payTo, buyer],
      [buyer, "not-an-address"], ["/tmp/gateway-test/probe.jsonl", "relative.jsonl"]])
      expect(() => parseGateArgs(args.map(v => v === from ? to! : v))).toThrow(GatewayGateError)
    expect(() => parseGateArgs([...args, "--buyer", buyer])).toThrow(GatewayGateError)
    expect(() => parseGateArgs([...args, "--rpc", "https://evil.example"])).toThrow(GatewayGateError)
  })
})

describe("F1 untrusted Circle response boundaries", () => {
  it("matches the exact v2 Arc Gateway domain and six-decimal USDC", () => {
    expect(parseSupported(supported())).toEqual({ network: GATE.network, wallet: GATE.wallet })
    for (const patch of [{ verifyingContract: payTo }, { name: "USDC" }, { version: "2" },
      { assets: [{ address: GATE.usdc, symbol: "USDC", decimals: 18 }] }]) {
      const input = supported(); Object.assign(input.kinds[0]!.extra, patch)
      expect(() => parseSupported(input)).toThrow(GatewayGateError)
    }
  })
  it("distinguishes observed unsupported from malformed or ambiguous data", () => {
    try { parseSupported({ kinds: [] }); throw new Error("accepted") }
    catch (e) { expect(e).toMatchObject({ stage: "supported", reason: "unsupported" }) }
    for (const input of [null, {}, { kinds: [{}] }, { kinds: [supported().kinds[0], supported().kinds[0]] }])
      expect(() => parseSupported(input)).toThrow(GatewayGateError)
  })
  it("constructs only the pinned Gateway domain, exact value and bounded time window", () => {
    const p = makeGatewayPayment(options(), 1788590000, nonce)
    expect(p.domain).toEqual({ name: "GatewayWalletBatched", version: "1", chainId: 5042002,
      verifyingContract: GATE.wallet })
    expect(p.message).toEqual({ from: buyer, to: payTo, value: 1000n,
      validAfter: 1788589400n, validBefore: 1789194900n, nonce })
    expect(p.requirements.amount).toBe("1000")
    expect(p.requirements.asset).toBe(GATE.usdc)
    expect(() => makeGatewayPayment(options(), NaN, nonce)).toThrow(GatewayGateError)
    expect(() => makeGatewayPayment(options(), 1788590000, "0x12")).toThrow(GatewayGateError)
  })
  it("binds the exact transfer; an opaque transfer UUID is not a mined transaction", () => {
    expect(parseTransfer(transfer(), options(), nonce, transferId)).toEqual({ transferId,
      status: "received", batchTxHash: null, settlementKind: "gateway-transfer" })
    for (const patch of [{ fromAddress: payTo }, { toAddress: buyer }, { amount: "1001" },
      { nonce: txHash }, { recipientNetwork: "eip155:8453" }, { token: "OTHER" },
      { status: "failed" }, { id: "bad" }, { txHash: "not-a-hash" }])
      expect(() => parseTransfer({ ...transfer(), ...patch }, options(), nonce, transferId)).toThrow(GatewayGateError)
    expect(parseTransfer({ ...transfer(), status: "confirmed", txHash }, options(), nonce, transferId))
      .toMatchObject({ batchTxHash: txHash, settlementKind: "gateway-transfer" })
  })
})

describe("F1 finite single-attempt transport", () => {
  it("pins URL and no-redirect credentials policy; returns parsed bounded JSON", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = []
    const f = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), init: init! }); return Response.json(supported())
    }) satisfies GateFetch
    expect(await fetchGatewayJson("/v1/x402/supported", undefined, f, AbortSignal.timeout(1000)))
      .toEqual(supported())
    expect(seen).toHaveLength(1)
    expect(seen[0]!.url).toBe("https://gateway-api-testnet.circle.com/v1/x402/supported")
    expect(seen[0]!.init).toMatchObject({ method: "GET", redirect: "error", credentials: "omit" })
    expect(new Headers(seen[0]!.init.headers).get("authorization")).toBeNull()
    await expect(fetchGatewayJson("https://evil.example", undefined, f)).rejects.toThrow(GatewayGateError)
    expect(seen).toHaveLength(1)
  })
  it("never retries a paid POST or reflects provider bodies", async () => {
    let requests = 0
    const f = (async () => { requests++; return new Response("private-provider-secret", { status: 503 }) }) satisfies GateFetch
    await expect(fetchGatewayJson("/v1/x402/settle", { secret: "dummy-signature" }, f))
      .rejects.toThrow("Gateway gate transport refused")
    expect(requests).toBe(1)
  })
  it("rejects oversized, invalid and truncated successful responses", async () => {
    for (const response of [new Response("x".repeat(65537)), new Response("{"),
      new Response('{"ok":true}', { headers: { "content-length": "999" } })]) {
      await expect(fetchGatewayJson("/v1/x402/supported", undefined,
        async () => response)).rejects.toThrow(GatewayGateError)
    }
  })
  it("cancels a response body that never finishes", async () => {
    let cancelled = false
    const response = new Response(new ReadableStream({ cancel() { cancelled = true } }))
    await expect(fetchGatewayJson("/v1/x402/supported", undefined,
      async () => response, AbortSignal.timeout(20))).rejects.toThrow(GatewayGateError)
    expect(cancelled).toBe(true)
  })
})

describe("F1 full-loop orchestration (simulated IO only)", () => {
  it("claims once, confirms deposit, verifies then settles once and correlates transfer", async () => {
    const f = fixture()
    const result = await Effect.runPromise(executeGatewayGate(options(), f.deps))
    expect(f.calls).toEqual(["supported", "claim", "preflight", "deposit", "sign", "verify",
      "settle", "transfer", "afterBalance"])
    expect(result).toMatchObject({ decision: "PASS", depositTxHash: txHash, transferId,
      settlementKind: "gateway-transfer", gatewayAfterAtomic: "499000" })
    expect(JSON.stringify(f.checkpoints)).not.toContain("12".repeat(65))
    expect(f.checkpoints.some(c => c.event === "settle-intent" && c.nonce === nonce)).toBe(true)
  })
  it("refuses self-payment before even reading supported", async () => {
    const f = fixture()
    await expect(Effect.runPromise(executeGatewayGate({ ...options(), payTo: buyer }, f.deps))).rejects.toThrow()
    expect(f.calls).toEqual([])
  })
  it("stops before deposit for unsupported, wrong signer/chain/decimals or nonempty Gateway", async () => {
    for (const fault of ["unsupported", "buyer", "chainId", "decimals", "gatewayAtomic"] as const) {
      const f = fixture()
      if (fault === "unsupported") f.deps.supported = async () => ({ kinds: [] })
      else { const original = f.deps.preflight; f.deps.preflight = async () => ({ ...await original(),
        [fault]: fault === "buyer" ? payTo : fault === "gatewayAtomic" ? 1n : 1 }) }
      await expect(Effect.runPromise(executeGatewayGate(options(), f.deps))).rejects.toThrow()
      expect(f.calls).not.toContain("deposit")
      expect(f.calls).not.toContain("sign")
    }
  })
  it("stops after a journal failure and never retries an uncertain deposit", async () => {
    for (const fault of ["claim", "checkpoint", "deposit"] as const) {
      const f = fixture(); let attempts = 0
      f.deps[fault] = async () => { attempts++; throw new Error("private-provider-key") }
      await expect(Effect.runPromise(executeGatewayGate(options(), f.deps)))
        .rejects.not.toThrow("private-provider-key")
      expect(attempts).toBe(1); expect(f.calls).not.toContain("sign")
    }
  })
  it("cannot turn rejected/invalid verify into a settle", async () => {
    for (const response of [null, { isValid: false }, { isValid: true, payer: payTo },
      { isValid: true, payer: buyer, invalidReason: "bad" }]) {
      const f = fixture(); f.deps.verify = async () => response
      await expect(Effect.runPromise(executeGatewayGate(options(), f.deps))).rejects.toThrow()
      expect(f.calls).not.toContain("settle")
    }
  })
  it("never retries an uncertain settle or declares PASS without correlated transfer", async () => {
    for (const fault of ["uncertain", "reference", "transfer", "balance"]) {
      const f = fixture(); let settles = 0
      f.deps.settle = async () => { settles++;
        if (fault === "uncertain") throw new Error("secret")
        return { success: true, payer: buyer, network: GATE.network,
          transaction: fault === "reference" ? txHash : transferId } }
      if (fault === "transfer") f.deps.transfer = async () => ({ ...transfer(), amount: "1001" })
      if (fault === "balance") f.deps.afterBalance = async () => 500000n
      await expect(Effect.runPromise(executeGatewayGate(options(), f.deps))).rejects.toThrow()
      expect(settles).toBe(1)
    }
  })
})
