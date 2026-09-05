import { Effect, Layer } from "effect"
import { recoverTypedDataAddress, type Hex } from "viem"
import { GATEWAY_BATCHING_NAME, GATEWAY_BATCHING_VERSION, InvalidSignature, RpcFailure,
  SettlementFailed, loadChainConfig } from "@arcade/core"
import { PaymentPayload, PaymentRequirements, type SettledPayment, type VerifiedPayment } from "./types.ts"
import type { ChallengeInput, Rail, SettleTree } from "./rail.ts"
import { RailTag } from "./rail.ts"
import { TRANSFER_TYPES } from "./eip3009.ts"
import { gatewayDomain } from "./gateway-sign.ts"
import { gatewayJson } from "./gateway-http.ts"

/** An accepted transfer is not a mined batch or withdrawable credit. This process-local
 * duplicate guard does NOT replace durable hub reservations/reconciliation after a crash. */
export interface GatewayConfig {
  readonly facilitatorUrl?: string
  readonly apiKey?: string
  /** Equality assertions against the selected pinned config, never deployment overrides. */
  readonly wallet?: string
  readonly chainId?: number
  readonly minValiditySeconds?: number
}
export interface GatewaySupportedKind {
  readonly x402Version: 1 | 2; readonly scheme: string; readonly network: string
  readonly extra?: { readonly name: string; readonly version: string; readonly verifyingContract: string;
    readonly assets: ReadonlyArray<{ readonly address: string; readonly symbol: string; readonly decimals: number }> }
}
export interface GatewaySupported { readonly kinds: ReadonlyArray<GatewaySupportedKind> }
export type GatewayRail = Rail & { readonly supported: () => Effect.Effect<GatewaySupported, RpcFailure> }
const MAX_UINT = (1n << 256n) - 1n
const refuse = (): never => { throw new Error("Gateway input refused") }
const address = (v: unknown): v is Hex => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v) && !/^0x0{40}$/i.test(v)
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const text = (v: unknown, limit: number): v is string => typeof v === "string" && v.length > 0 &&
  Buffer.byteLength(v) <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)
const data = (v: unknown, allowed?: readonly string[]): Record<string, unknown> => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return refuse()
  const keys = Reflect.ownKeys(v)
  if (keys.length > 32) return refuse()
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const key of keys) {
    if (typeof key !== "string" || allowed !== undefined && !allowed.includes(key)) return refuse()
    const d = Object.getOwnPropertyDescriptor(v, key)
    if (d === undefined || !d.enumerable || !("value" in d)) return refuse()
    result[key] = d.value
  }
  return result
}
const integer = (v: unknown, positive = false): bigint => {
  if (typeof v !== "string" || !(positive ? /^[1-9][0-9]{0,77}$/ : /^(0|[1-9][0-9]{0,77})$/).test(v)) return refuse()
  const n = BigInt(v)
  return n <= MAX_UINT ? n : refuse()
}
const freeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
const reqKeys = ["scheme", "network", "asset", "amount", "payTo", "maxTimeoutSeconds", "extra", "resource", "description", "mimeType"]
const uuid = (v: unknown): v is string => typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)

export const makeGatewayRail = (config: GatewayConfig = {}): GatewayRail => {
  let chain: ReturnType<typeof loadChainConfig>, base: string, apiKey: string | undefined
  try {
    const c = data(config, ["facilitatorUrl", "apiKey", "wallet", "chainId", "minValiditySeconds"])
    chain = loadChainConfig()
    const gateway = chain.gateway
    if (chain.status !== "ready" || !Number.isSafeInteger(chain.chainId) || chain.chainId <= 0 ||
      chain.caip2 !== "eip155:" + chain.chainId || !address(chain.usdc.address) || gateway === null ||
      !address(gateway.wallet) || gateway.minValiditySeconds !== 604900 || chain.usdc.decimals !== 6 ||
      c["wallet"] !== undefined && (!address(c["wallet"]) || !same(c["wallet"], gateway.wallet)) ||
      c["chainId"] !== undefined && c["chainId"] !== chain.chainId ||
      c["minValiditySeconds"] !== undefined && c["minValiditySeconds"] !== gateway.minValiditySeconds) refuse()
    const rawBase = c["facilitatorUrl"] ?? gateway!.facilitatorUrl
    if (!text(rawBase, 2048) || !/^https?:\/\/[^/?#\s]+\/?$/.test(rawBase as string)) refuse()
    const url = new URL(rawBase as string)
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      !(url.protocol === "https:" || url.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname))) refuse()
    base = url.origin
    const rawKey = c["apiKey"]
    if (rawKey !== undefined && (typeof rawKey !== "string" || !/^[\x21-\x7e]{1,4096}$/.test(rawKey))) refuse()
    apiKey = rawKey as string | undefined
  } catch { throw new Error("Gateway configuration unavailable") }
  const cfg = chain!, gateway = cfg.gateway!
  let lastNow = 0n
  const now = () => {
    const ms = Date.now()
    if (!Number.isSafeInteger(ms) || ms < 600_000) return refuse()
    const current = BigInt(Math.floor(ms / 1000))
    // A backwards clock cannot reopen an authorization whose attempt was pruned.
    if (current < lastNow) return refuse()
    lastNow = current
    return current
  }
  const requirementsOf = (input: unknown) => {
    const r = data(input, reqKeys), extra = data(r["extra"], ["name", "version", "verifyingContract"])
    if (r["scheme"] !== "exact" || r["network"] !== cfg.caip2 || !address(r["asset"]) || !same(r["asset"], cfg.usdc.address) ||
      !address(r["payTo"]) || r["maxTimeoutSeconds"] !== 604900 || !text(r["resource"], 2048) ||
      r["description"] !== undefined && !text(r["description"], 2048) || !text(r["mimeType"], 128) ||
      extra["name"] !== GATEWAY_BATCHING_NAME || extra["version"] !== GATEWAY_BATCHING_VERSION ||
      !address(extra["verifyingContract"]) || !same(extra["verifyingContract"], gateway.wallet)) return refuse()
    const amount = integer(r["amount"], true)
    return PaymentRequirements.make({ scheme: "exact", network: cfg.caip2, asset: cfg.usdc.address.toLowerCase(),
      amount: String(amount), payTo: r["payTo"].toLowerCase(), maxTimeoutSeconds: 604900,
      resource: r["resource"], mimeType: r["mimeType"], ...(r["description"] === undefined ? {} : { description: r["description"] }),
      extra: { name: GATEWAY_BATCHING_NAME, version: GATEWAY_BATCHING_VERSION, verifyingContract: gateway.wallet.toLowerCase() } })
  }
  const timeOk = (authorization: PaymentPayload["payload"]["authorization"], current: bigint) => {
    const after = integer(authorization.validAfter), before = integer(authorization.validBefore)
    if (after >= before || after > current || before <= current || before - after > 605500n || before > current + 604900n) refuse()
    return before
  }
  const prepare = (input: unknown, required: unknown) => {
    const r = requirementsOf(required), p = data(input, ["x402Version", "payload", "accepted", "resource"])
    const accepted = requirementsOf(p["accepted"])
    if (p["x402Version"] !== 2 || JSON.stringify(accepted) !== JSON.stringify(r)) return refuse()
    if (p["resource"] !== undefined) {
      const resource = data(p["resource"], ["url", "description", "mimeType"])
      if (resource["url"] !== r.resource || resource["description"] !== undefined && resource["description"] !== r.description ||
        resource["mimeType"] !== undefined && resource["mimeType"] !== r.mimeType) return refuse()
    }
    const inner = data(p["payload"], ["authorization", "signature"])
    const a = data(inner["authorization"], ["from", "to", "value", "validAfter", "validBefore", "nonce"])
    if (!address(a["from"]) || !address(a["to"]) || !same(a["to"], r.payTo) || integer(a["value"], true) !== BigInt(r.amount) ||
      typeof a["nonce"] !== "string" || !/^0x[0-9a-f]{64}$/i.test(a["nonce"]) || /^0x0{64}$/i.test(a["nonce"]) ||
      typeof inner["signature"] !== "string" || !/^0x[0-9a-f]{130}$/i.test(inner["signature"]) || /^0x0{130}$/i.test(inner["signature"])) return refuse()
    const auth = { from: a["from"].toLowerCase(), to: a["to"].toLowerCase(), value: String(integer(a["value"], true)),
      validAfter: String(integer(a["validAfter"])), validBefore: String(integer(a["validBefore"])), nonce: a["nonce"].toLowerCase() }
    const expires = timeOk(auth, now())
    const signature = inner["signature"].toLowerCase() as Hex
    const payload = PaymentPayload.make({ x402Version: 2, accepted: r, payload: { authorization: auth, signature },
      resource: { url: r.resource, mimeType: r.mimeType, ...(r.description === undefined ? {} : { description: r.description }) } })
    const signingDomain = gatewayDomain(r, cfg.chainId)
    const message = { from: auth.from as Hex, to: auth.to as Hex, value: BigInt(auth.value), validAfter: BigInt(auth.validAfter),
      validBefore: BigInt(auth.validBefore), nonce: auth.nonce as Hex }
    const wireReq = { scheme: r.scheme, network: r.network, asset: r.asset, amount: r.amount, payTo: r.payTo,
      maxTimeoutSeconds: r.maxTimeoutSeconds, extra: r.extra }
    const body = { paymentPayload: { x402Version: 2, accepted: wireReq, payload: payload.payload, resource: payload.resource },
      paymentRequirements: wireReq }
    if (Buffer.byteLength(JSON.stringify(body)) > 16_384) refuse()
    return freeze({ payload, requirements: r, body, message, domain: signingDomain, signature, expires })
  }
  type Prepared = ReturnType<typeof prepare>
  const proven = new WeakMap<VerifiedPayment, Prepared>()
  const attempts = new Map<string, { expires: bigint; active: boolean }>()
  const verifyFailure = () => new InvalidSignature({ reason: "Gateway authorization refused" })
  const settleFailure = () => new SettlementFailed({ reason: "Gateway settlement refused before dispatch" })
  const uncertain = () => new SettlementFailed({ reason: "Gateway settlement outcome uncertain; reconciliation required" })
  // The async finalizer awaits bounded transport cleanup on fiber interruption too.
  const http = <E>(path: "/v1/x402/supported" | "/v1/x402/verify" | "/v1/x402/settle", body: unknown,
    failure: () => E) => Effect.async<unknown, E>((resume, signal) => {
      const pending = gatewayJson(base, path, body, apiKey, signal)
      void pending.then(value => resume(Effect.succeed(value)), () => resume(Effect.fail(failure())))
      return Effect.promise(() => pending.then(() => undefined, () => undefined))
    })
  const request = (path: "/v1/x402/supported" | "/v1/x402/verify", body?: unknown) =>
    http(path, body, () => new RpcFailure({ method: path, reason: "Gateway request unavailable" }))
  const challenge = (input: ChallengeInput) => Effect.sync(() => {
    try {
      const value = data(input, ["priceAtomic", "resource", "payTo", "description", "feeSplitter", "feeSplitterVersion"])
      if (typeof value["priceAtomic"] !== "bigint" || value["priceAtomic"] <= 0n || value["priceAtomic"] > MAX_UINT ||
        !address(value["payTo"]) || !text(value["resource"], 2048) ||
        value["description"] !== undefined && !text(value["description"], 2048)) return refuse()
      return PaymentRequirements.make({ scheme: "exact", network: cfg.caip2, amount: String(value["priceAtomic"]),
        asset: cfg.usdc.address, payTo: value["payTo"], resource: value["resource"], mimeType: "application/json",
        ...(value["description"] === undefined ? {} : { description: value["description"] }), maxTimeoutSeconds: 604900,
        extra: { name: GATEWAY_BATCHING_NAME, version: GATEWAY_BATCHING_VERSION, verifyingContract: gateway.wallet } })
    } catch { throw new Error("Gateway challenge refused") }
  })
  const verify = (payload: PaymentPayload, requirements: PaymentRequirements) => Effect.gen(function* () {
    const prepared = yield* Effect.try({ try: () => prepare(payload, requirements), catch: verifyFailure })
    const recovered = yield* Effect.tryPromise({ try: () => recoverTypedDataAddress({ domain: prepared.domain, types: TRANSFER_TYPES,
      primaryType: "TransferWithAuthorization", message: prepared.message, signature: prepared.signature }), catch: verifyFailure })
    if (!same(recovered, prepared.message.from)) return yield* verifyFailure()
    const raw = yield* request("/v1/x402/verify", prepared.body)
    yield* Effect.try({ try: () => {
      const reply = data(raw)
      if (reply["isValid"] !== true || !address(reply["payer"]) || !same(reply["payer"], prepared.message.from) ||
        reply["invalidReason"] !== undefined && reply["invalidReason"] !== "") refuse()
      timeOk(prepared.payload.payload.authorization, now())
    }, catch: verifyFailure })
    const result: VerifiedPayment = freeze({ payer: prepared.message.from, payTo: prepared.message.to, amountAtomic: prepared.message.value,
      network: cfg.caip2, payload: prepared.payload, requirements: prepared.requirements })
    proven.set(result, prepared)
    return result
  })
  const settle = (verified: VerifiedPayment, _tree?: SettleTree) => Effect.gen(function* () {
    const admitted = yield* Effect.try({ try: () => {
      const p = proven.get(verified)
      if (p === undefined || verified.payer !== p.message.from || verified.payTo !== p.message.to || verified.amountAtomic !== p.message.value ||
        verified.network !== cfg.caip2 || verified.payload !== p.payload || verified.requirements !== p.requirements) return refuse()
      const current = now()
      timeOk(p.payload.payload.authorization, current)
      for (const [key, entry] of attempts) if (!entry.active && entry.expires <= current) attempts.delete(key)
      const key = cfg.caip2 + ":" + gateway.wallet.toLowerCase() + ":" + p.message.from + ":" + p.message.nonce
      if (attempts.has(key) || attempts.size >= 10_000) return refuse()
      const entry = { expires: p.expires, active: true }
      attempts.set(key, entry) // Before any await or POST; never removed on ambiguous failure.
      return { prepared: p, entry }
    }, catch: settleFailure })
    return yield* http("/v1/x402/settle", admitted.prepared.body, uncertain).pipe(Effect.flatMap(raw => Effect.try({ try: () => {
        const reply = data(raw)
        if (reply["success"] !== true || !address(reply["payer"]) || !same(reply["payer"], verified.payer) ||
          reply["network"] !== cfg.caip2 || !uuid(reply["transaction"]) ||
          reply["errorReason"] !== undefined && reply["errorReason"] !== "") return refuse()
        return freeze({ txHash: reply["transaction"].toLowerCase(), payer: verified.payer, amountAtomic: verified.amountAtomic,
          settlementKind: "gateway-transfer" as const }) satisfies SettledPayment
      }, catch: uncertain })), Effect.ensuring(Effect.sync(() => { admitted.entry.active = false })))
  })
  const supported = () => Effect.gen(function* () {
    const raw = yield* request("/v1/x402/supported")
    return yield* Effect.try({ try: () => {
      const rows = data(raw)["kinds"]
      if (!Array.isArray(rows) || rows.length === 0 || rows.length > 100) return refuse()
      const kinds = rows.map(value => {
        const row = data(value)
        if ((row["x402Version"] !== 1 && row["x402Version"] !== 2) || !text(row["scheme"], 80) || !text(row["network"], 80)) return refuse()
        const x402Version: 1 | 2 = row["x402Version"]
        return { x402Version, scheme: row["scheme"], network: row["network"], original: row }
      })
      const matching = kinds.filter(kind => kind.network === cfg.caip2 && kind.x402Version === 2)
      if (matching.length !== 1 || matching[0]!.scheme !== "exact") return refuse()
      const extra = data(matching[0]!.original["extra"])
      if (extra["name"] !== GATEWAY_BATCHING_NAME || extra["version"] !== GATEWAY_BATCHING_VERSION ||
        !address(extra["verifyingContract"]) || !same(extra["verifyingContract"], gateway.wallet) ||
        !Array.isArray(extra["assets"]) || extra["assets"].length === 0 || extra["assets"].length > 20) return refuse()
      const assets = extra["assets"].map(value => {
        const asset = data(value)
        if (!address(asset["address"]) || !text(asset["symbol"], 32) || typeof asset["decimals"] !== "number" ||
          !Number.isSafeInteger(asset["decimals"]) || asset["decimals"] < 0 || asset["decimals"] > 36) return refuse()
        return { address: asset["address"].toLowerCase(), symbol: asset["symbol"], decimals: asset["decimals"] }
      })
      const usdc = assets.filter(asset => same(asset.address, cfg.usdc.address))
      if (usdc.length !== 1 || usdc[0]!.symbol !== "USDC" || usdc[0]!.decimals !== 6) return refuse()
      return freeze({ kinds: kinds.map(kind => ({ x402Version: kind.x402Version, scheme: kind.scheme, network: kind.network,
        ...(kind === matching[0] ? { extra: { name: GATEWAY_BATCHING_NAME, version: GATEWAY_BATCHING_VERSION,
          verifyingContract: gateway.wallet.toLowerCase(), assets } } : {}) })) }) satisfies GatewaySupported
    }, catch: () => new RpcFailure({ method: "/v1/x402/supported", reason: "Gateway support unavailable" }) })
  })
  return { name: "gateway", challenge, verify, settle, supported }
}

export const GatewayLive = (config: GatewayConfig = {}): Layer.Layer<RailTag> => Layer.succeed(RailTag, makeGatewayRail(config))
