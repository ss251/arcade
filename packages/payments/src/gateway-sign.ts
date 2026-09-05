import { Effect } from "effect"
import { recoverTypedDataAddress, toHex, type Hex } from "viem"
import { GATEWAY_BATCHING_NAME, GATEWAY_BATCHING_VERSION, InvalidSignature, loadChainConfig } from "@arcade/core"
import { TRANSFER_TYPES, type SignInput } from "./eip3009.ts"
import type { PaymentRequirements } from "./types.ts"

const WINDOW_SECONDS = 604900, UINT256_MAX = (1n << 256n) - 1n
// Keep the canonical type separate from exported mutable objects and from every
// wallet request. A wallet callback is not authority to alter the signed fields.
const canonicalTypes = () => Object.freeze({ TransferWithAuthorization: Object.freeze(
  TRANSFER_TYPES.TransferWithAuthorization.map(field => Object.freeze({ ...field }))
) })
function refuse(): never { throw new Error("Unsupported payment requirements") }
/** Read only own data: neither schema-shaped accessors nor string coercions are authority. */
const own = (value: unknown, key: string): unknown => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return refuse()
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (descriptor === undefined) return undefined
  if (!("value" in descriptor)) return refuse()
  return descriptor.value
}
const address = (value: unknown): value is Hex => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/.test(value)
const sameAddress = (a: unknown, b: unknown): boolean => address(a) && address(b) && a.toLowerCase() === b.toLowerCase()
const extraOf = (requirements: unknown): object => {
  const extra = own(requirements, "extra")
  if (extra === undefined) return {}
  if (extra === null || typeof extra !== "object" || Array.isArray(extra) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(extra))) return refuse()
  return extra
}
/** A named but malformed Gateway request must reach refusal, never ordinary USDC. */
export const isGatewayRequirements = (requirements: PaymentRequirements): boolean => {
  try { return own(extraOf(requirements), "name") === GATEWAY_BATCHING_NAME } catch { return false }
}

const checked = (requirements: PaymentRequirements) => {
  const chain = loadChainConfig(), gateway = chain.gateway
  if (chain.status !== "ready" || !Number.isSafeInteger(chain.chainId) || chain.chainId <= 0 ||
    chain.caip2 !== `eip155:${chain.chainId}` || !address(chain.usdc.address)) return refuse()
  const scheme = own(requirements, "scheme"), network = own(requirements, "network"), asset = own(requirements, "asset")
  const payTo = own(requirements, "payTo"), amount = own(requirements, "amount")
  if (scheme !== "exact" || network !== chain.caip2 || !sameAddress(asset, chain.usdc.address) || !address(payTo) ||
    typeof amount !== "string" || !/^[1-9][0-9]{0,77}$/.test(amount)) return refuse()
  const amountAtomic = BigInt(amount)
  if (amountAtomic > UINT256_MAX) return refuse()
  const extra = extraOf(requirements), name = own(extra, "name"), version = own(extra, "version"), contract = own(extra, "verifyingContract")
  const kind: "gateway" | "usdc" = name === GATEWAY_BATCHING_NAME ? "gateway" : "usdc"
  if (kind === "gateway") {
    if (version !== GATEWAY_BATCHING_VERSION || gateway === null || !address(gateway.wallet) ||
      gateway.minValiditySeconds !== WINDOW_SECONDS || !sameAddress(contract, gateway.wallet) ||
      own(requirements, "maxTimeoutSeconds") !== WINDOW_SECONDS) return refuse()
  } else if (name !== undefined && name !== chain.usdc.eip712Name ||
    version !== undefined && version !== chain.usdc.eip712Version ||
    contract !== undefined && !sameAddress(contract, chain.usdc.address)) return refuse()
  return { chain, kind, payTo, amountAtomic }
}

/** Shared authority/no-fallback check. Callers must map its fixed throw into their typed error. */
export const paymentRequirementsKind = (requirements: PaymentRequirements): "gateway" | "usdc" => {
  try { return checked(requirements).kind } catch { return refuse() }
}
export interface GatewayDomain {
  readonly name: typeof GATEWAY_BATCHING_NAME
  readonly version: typeof GATEWAY_BATCHING_VERSION
  readonly chainId: number
  readonly verifyingContract: Hex
}
const domainOf = (value: ReturnType<typeof checked>, chainId?: number): GatewayDomain => {
  if (value.kind !== "gateway" || value.chain.gateway === null ||
    chainId !== undefined && chainId !== value.chain.chainId) return refuse()
  return { name: GATEWAY_BATCHING_NAME, version: GATEWAY_BATCHING_VERSION,
    chainId: value.chain.chainId, verifyingContract: value.chain.gateway.wallet }
}
/** Only the selected pinned config is supported; challenge metadata cannot redeploy it. */
export const gatewayDomain = (requirements: PaymentRequirements, chainId?: number): GatewayDomain => {
  try { return domainOf(checked(requirements), chainId) } catch { return refuse() }
}
export interface GatewaySignInput extends SignInput {
  readonly requirements: PaymentRequirements
  /** Compatibility assertion, not an untrusted network selector. */
  readonly chainId?: number
}
const prepare = (input: GatewaySignInput) => {
  const requirements = own(input, "requirements") as PaymentRequirements
  const value = checked(requirements), explicitChain = own(input, "chain")
  // An explicit SignInput.chain may assert these same selected coordinates, not
  // introduce a custom network, token, deployment or authorization lifetime.
  if (explicitChain !== undefined) {
    for (const key of ["id", "status", "chainId", "caip2"] as const) if (own(explicitChain, key) !== value.chain[key]) return refuse()
    const usdc = own(explicitChain, "usdc"), gateway = own(explicitChain, "gateway")
    if (!sameAddress(own(usdc, "address"), value.chain.usdc.address) ||
      own(usdc, "eip712Name") !== value.chain.usdc.eip712Name || own(usdc, "eip712Version") !== value.chain.usdc.eip712Version ||
      !sameAddress(own(gateway, "wallet"), value.chain.gateway?.wallet) || own(gateway, "minValiditySeconds") !== WINDOW_SECONDS) return refuse()
  }
  const chainId = own(input, "chainId"), validForSeconds = own(input, "validForSeconds")
  if (chainId !== undefined && chainId !== value.chain.chainId || validForSeconds !== undefined && validForSeconds !== WINDOW_SECONDS ||
    !sameAddress(own(input, "to"), value.payTo) || own(input, "valueAtomic") !== value.amountAtomic) return refuse()
  const account = own(input, "account"), from = own(account, "address"), signer = own(account, "signTypedData")
  if (!address(from) || typeof signer !== "function") return refuse()
  const nowMs = Date.now()
  if (!Number.isSafeInteger(nowMs) || nowMs < 600_000) return refuse()
  const now = BigInt(Math.floor(nowMs / 1000)), nonce = toHex(crypto.getRandomValues(new Uint8Array(32)))
  return { account, signer, domain: Object.freeze(domainOf(value)), types: canonicalTypes(),
    message: Object.freeze({ from, to: value.payTo, value: value.amountAtomic,
      validAfter: now - 600n, validBefore: now + BigInt(WINDOW_SECONDS), nonce }) }
}

/** Offline, one attempt. Installed Circle3.2.0 client uses these six EIP-3009 fields
 * with a600-second backdate (dist/client/index.js:211–223,281–307). Its unbounded
 * Math.max lifetime and challenge-selected contract are deliberately not copied. */
export const signGatewayAuthorization = (input: GatewaySignInput) => Effect.gen(function* () {
  const prepared = yield* Effect.try({ try: () => prepare(input), catch: () => new InvalidSignature({ reason: "Unsupported payment requirements" }) })
  const request = Object.freeze({ domain: Object.freeze({ ...prepared.domain }), types: canonicalTypes(),
    primaryType: "TransferWithAuthorization" as const, message: Object.freeze({ ...prepared.message }) })
  const signature: unknown = yield* Effect.tryPromise({
    try: () => Promise.resolve(prepared.signer.call(prepared.account, request)),
    catch: () => new InvalidSignature({ reason: "Gateway authorization signing failed" })
  })
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature) || /^0x0{130}$/.test(signature)) {
    return yield* new InvalidSignature({ reason: "Gateway authorization signing failed" })
  }
  const recovered = yield* Effect.tryPromise({
    try: () => recoverTypedDataAddress({ domain: prepared.domain, types: prepared.types,
      primaryType: "TransferWithAuthorization", message: prepared.message, signature: signature as Hex }),
    catch: () => new InvalidSignature({ reason: "Gateway authorization signing failed" })
  })
  if (recovered.toLowerCase() !== prepared.message.from.toLowerCase()) {
    return yield* new InvalidSignature({ reason: "Gateway authorization signing failed" })
  }
  const m = prepared.message
  return { from: m.from, to: m.to, value: m.value.toString(), validAfter: m.validAfter.toString(),
    validBefore: m.validBefore.toString(), nonce: m.nonce, signature: signature as Hex }
})
