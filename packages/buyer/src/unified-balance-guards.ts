import { decodeFunctionData, encodeFunctionData, parseAbi, type Hex } from "viem"
import { fundingRecord, fundingUint, parseFundingAmount } from "./gateway-funding.ts"
import { GATEWAY_BURN_TYPES } from "./gateway-withdrawal.ts"
import { captureCanonicalUnifiedPlan, UnifiedFundingFailure, type UnifiedFundingPlan, type UnifiedSourceChain } from "./unified-balance-funding.ts"

const MAX = (1n << 256n) - 1n
const ZERO_WORD = `0x${"00".repeat(32)}` as Hex
const ARC_TOKEN = "0x3600000000000000000000000000000000000000" as const
const WALLET = "0x0077777d7eba4688bdef3e311b846f25870a19b9" as const
const MINTER = "0x0022222abe238cc2c7bb1f21003f0a260052475b" as const
const fail = (): never => { throw new UnifiedFundingFailure("input_invalid") }
/** Kit1.6.0 chain metadata, cross-checked with the existing Arc chain config.
 * These coordinates authorize neither an RPC override nor a mainnet fallback. */
export const unifiedCoordinates = (source: UnifiedSourceChain) => {
  if (source !== "Arc_Testnet" && source !== "Base_Sepolia") return fail()
  return Object.freeze({ source, chainId: source === "Arc_Testnet" ? 5042002 : 84532,
    domain: source === "Arc_Testnet" ? 26 : 6, wallet: WALLET, minter: MINTER,
    token: source === "Arc_Testnet" ? ARC_TOKEN : "0x036cbd53842c5426634e7929541ec2318f3dcf7e" as const,
    rpc: source === "Arc_Testnet" ? "https://rpc.testnet.arc.io" : "https://sepolia.base.org" })
}
export interface UnifiedBurnLimits {
  readonly maxFeeAtomic: bigint
  readonly sourceBlock: bigint
  readonly withdrawalDelay: bigint
  readonly maxBurnBlockDelta: bigint
}
const hex = (value: unknown, bytes: number): Hex => {
  if (typeof value !== "string" || value.length !== bytes * 2 + 2 || !/^0x[0-9a-fA-F]*$/.test(value)) return fail()
  return value.toLowerCase() as Hex
}
const word = (address: string): Hex => `0x${hex(address, 20).slice(2).padStart(64, "0")}`
const own = (value: unknown, keys: readonly string[]) => {
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).length !== keys.length) return fail()
  const out: Record<string, unknown> = Object.create(null)
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key)
    if (!d || !d.enumerable || !("value" in d)) return fail()
    out[key] = d.value
  }
  return out
}
const assertTypes = (input: unknown) => {
  const types = own(input, Object.keys(GATEWAY_BURN_TYPES))
  for (const [name, fields] of Object.entries(GATEWAY_BURN_TYPES)) {
    const entries = types[name]
    if (!Array.isArray(entries) || entries.length !== fields.length || Reflect.ownKeys(entries).length !== fields.length + 1) return fail()
    for (let i = 0; i < fields.length; i++) {
      const d = Object.getOwnPropertyDescriptor(entries, String(i))
      if (!d || !("value" in d)) return fail()
      const entry = fundingRecord(d.value, ["name", "type"])
      if (entry.name !== fields[i]!.name || entry.type !== fields[i]!.type) return fail()
    }
  }
}
const proven = new WeakSet<object>()
/** Validate the actual final SDK estimate at the signing boundary. Do not edit
 * a signed height/fee to make it fit. This is normal Unified Balance funding,
 * not the separate GatewayWalletBatched payment validity policy. */
export const captureUnifiedBurn = (input: unknown, inputPlan: UnifiedFundingPlan, inputLimits: UnifiedBurnLimits) => {
  try {
    const plan = captureCanonicalUnifiedPlan(inputPlan), c = unifiedCoordinates(plan.sourceChain)
    const raw = own(input, ["domain", "types", "primaryType", "message"])
    const domain = fundingRecord(raw.domain, ["name", "version"])
    if (domain.name !== "GatewayWallet" || domain.version !== "1" || raw.primaryType !== "BurnIntent") return fail()
    assertTypes(raw.types)
    const bounds = fundingRecord(inputLimits, ["maxFeeAtomic", "sourceBlock", "withdrawalDelay", "maxBurnBlockDelta"])
    const feeCap = fundingUint(bounds.maxFeeAtomic), block = fundingUint(bounds.sourceBlock)
    const delay = fundingUint(bounds.withdrawalDelay), delta = fundingUint(bounds.maxBurnBlockDelta, true)
    if (delta < delay || block + delta >= MAX) return fail()
    const message = fundingRecord(raw.message, ["maxBlockHeight", "maxFee", "spec"])
    const maxBlockHeight = fundingUint(message.maxBlockHeight, true), maxFee = fundingUint(message.maxFee)
    if (maxBlockHeight === MAX || maxBlockHeight < block + delay || maxBlockHeight > block + delta || maxFee > feeCap) return fail()
    const spec = fundingRecord(message.spec, ["version", "sourceDomain", "destinationDomain", "sourceContract", "destinationContract", "sourceToken", "destinationToken",
      "sourceDepositor", "destinationRecipient", "sourceSigner", "destinationCaller", "value", "salt", "hookData"])
    if (spec.version !== 1 || spec.sourceDomain !== c.domain || spec.destinationDomain !== 26 || spec.hookData !== "0x") return fail()
    const expected = { sourceContract: word(c.wallet), destinationContract: word(MINTER), sourceToken: word(c.token), destinationToken: word(ARC_TOKEN),
      sourceDepositor: word(plan.owner), destinationRecipient: word(plan.recipient), sourceSigner: word(plan.recipient), destinationCaller: ZERO_WORD }
    for (const [key, value] of Object.entries(expected)) if (hex(spec[key], 32) !== value) return fail()
    const amount = fundingUint(spec.value, true), salt = hex(spec.salt, 32)
    if (amount !== parseFundingAmount(plan.amount) || amount + maxFee > MAX || salt === ZERO_WORD) return fail()
    const result = Object.freeze({ domain: Object.freeze({ name: "GatewayWallet", version: "1" } as const), types: GATEWAY_BURN_TYPES,
      primaryType: "BurnIntent" as const, message: Object.freeze({ maxBlockHeight, maxFee, spec: Object.freeze({ version: 1, sourceDomain: c.domain,
        destinationDomain: 26, ...expected, value: amount, salt, hookData: "0x" as const }) }) })
    proven.add(result)
    return result
  } catch { return fail() }
}
export type UnifiedBurn = ReturnType<typeof captureUnifiedBurn>
const uint = (value: bigint, bytes: number): string => {
  if (value < 0n || value >= 1n << BigInt(bytes * 8)) return fail()
  return value.toString(16).padStart(bytes * 2, "0")
}
/** Same pinned TransferSpec encoding as F11, with validated owner/delegate and
 * optional Base Sepolia source. Only an in-memory validated intent is accepted. */
export const encodeUnifiedTransferSpec = (burn: UnifiedBurn): Hex => {
  if (!proven.has(burn)) return fail()
  const s = burn.message.spec
  return `0xca85def7${uint(1n, 4)}${uint(BigInt(s.sourceDomain), 4)}${uint(26n, 4)}${s.sourceContract.slice(2)}${s.destinationContract.slice(2)}${s.sourceToken.slice(2)}${s.destinationToken.slice(2)}${s.sourceDepositor.slice(2)}${s.destinationRecipient.slice(2)}${s.sourceSigner.slice(2)}${s.destinationCaller.slice(2)}${uint(s.value, 32)}${s.salt.slice(2)}00000000`
}
export const UNIFIED_MINT_ABI = parseAbi(["function gatewayMint(bytes attestationPayload, bytes attestationSignature)"])
/** This binds mint effects/calldata; the Minter and independent readback still
 * verify the attester/receipt. It is not a claim of deployed-code verification. */
export const assertUnifiedMint = (input: unknown, burn: UnifiedBurn, currentBlock: bigint) => {
  try {
    const raw = fundingRecord(input, ["to", "data", "value"])
    const to = hex(raw.to, 20)
    if (to !== MINTER || fundingUint(raw.value) !== 0n || typeof raw.data !== "string" || raw.data.length > 2048) return fail()
    const data = hex(raw.data, (raw.data.length - 2) / 2)
    const decoded = decodeFunctionData({ abi: UNIFIED_MINT_ABI, data })
    if (decoded.functionName !== "gatewayMint" || encodeFunctionData({ abi: UNIFIED_MINT_ABI, functionName: decoded.functionName, args: decoded.args }) !== data) return fail()
    const [payload, signature] = decoded.args
    if (signature.length !== 132 || /^0x0{130}$/.test(signature) || payload.length !== 762 && payload.length !== 778) return fail()
    const set = payload.length === 778
    if (set && payload.slice(2, 18) !== "1e12db7100000001") return fail()
    const single = set ? `0x${payload.slice(18)}` : payload
    if (single.slice(2, 10) !== "ff6fb334" || single.slice(74, 82) !== "00000154" || `0x${single.slice(82)}` !== encodeUnifiedTransferSpec(burn)) return fail()
    const height = BigInt(`0x${single.slice(10, 74)}`)
    if (height === 0n || height === MAX || height < fundingUint(currentBlock)) return fail()
    return Object.freeze({ to, data, value: 0n, payload, signature, maxBlockHeight: height })
  } catch { return fail() }
}
