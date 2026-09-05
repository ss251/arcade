import { concatHex, keccak256, stringToHex, type Hex } from "viem"
import { FundingFailure, captureFundingAuthority, validateFundingAuthority, fundingRecord, fundingUint, type FundingAuthority } from "./gateway-funding"

// Packed layout from Circle evm-gateway-contracts 1.3.0, pinned
// fd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8 src/lib/{TransferSpec,Attestations,BurnIntents}.
// These pure codecs authorize no signer, API mutation or mint.
const MAX = (1n << 256n) - 1n
const ZERO = "0x0000000000000000000000000000000000000000"
const bad = (): never => { throw new FundingFailure("evidence_unavailable") }
const hex = (value: unknown, bytes: number): Hex => typeof value === "string" && value.length === 2 + bytes * 2 && /^0x[0-9a-fA-F]*$/.test(value) ? value.toLowerCase() as Hex : bad()
const uint = (value: bigint, bytes: number): string => {
  fundingUint(value)
  if (value >= 1n << BigInt(bytes * 8)) return bad()
  return value.toString(16).padStart(bytes * 2, "0")
}
const addressWord = (value: Hex): string => hex(value, 20).slice(2).padStart(64, "0")
const finiteHeight = (input: unknown): bigint => { const n = fundingUint(input, true); return n !== MAX ? n : bad() }

export interface TransferSpec {
  readonly version: 1; readonly sourceDomain: 26; readonly destinationDomain: 26
  readonly sourceContract: Hex; readonly destinationContract: Hex; readonly sourceToken: Hex; readonly destinationToken: Hex
  readonly sourceDepositor: Hex; readonly destinationRecipient: Hex; readonly sourceSigner: Hex; readonly destinationCaller: Hex
  readonly value: bigint; readonly salt: Hex; readonly hookData: "0x"
}
export interface BurnIntent { readonly maxBlockHeight: bigint; readonly maxFee: bigint; readonly spec: TransferSpec }
export const captureTransferSpec = (input: unknown, expectedAuthority: FundingAuthority): TransferSpec => {
  const v = fundingRecord(input, ["version", "sourceDomain", "destinationDomain", "sourceContract", "destinationContract", "sourceToken", "destinationToken", "sourceDepositor", "destinationRecipient", "sourceSigner", "destinationCaller", "value", "salt", "hookData"])
  const a = validateFundingAuthority(expectedAuthority)
  if (v.version !== 1 || v.sourceDomain !== a.domain || v.destinationDomain !== a.domain || v.hookData !== "0x") return bad()
  const expected = { sourceContract: a.wallet, destinationContract: a.minter, sourceToken: a.token, destinationToken: a.token,
    sourceDepositor: a.account, destinationRecipient: a.account, sourceSigner: a.account, destinationCaller: ZERO }
  for (const key of Object.keys(expected) as (keyof typeof expected)[]) if (hex(v[key], 20) !== expected[key]) return bad()
  return Object.freeze({ version: 1, sourceDomain: 26, destinationDomain: 26, ...expected, destinationCaller: ZERO as Hex, value: fundingUint(v.value, true), salt: hex(v.salt, 32), hookData: "0x" })
}
const checkedSpec = (input: TransferSpec): TransferSpec => {
  const v = fundingRecord(input, ["sourceSigner"], ["version", "sourceDomain", "destinationDomain", "sourceContract", "destinationContract", "sourceToken", "destinationToken", "sourceDepositor", "destinationRecipient", "destinationCaller", "value", "salt", "hookData"])
  return captureTransferSpec(v, captureFundingAuthority(v.sourceSigner))
}
export const captureBurnIntent = (input: unknown, authority: FundingAuthority): BurnIntent => {
  const v = fundingRecord(input, ["maxBlockHeight", "maxFee", "spec"]), spec = captureTransferSpec(v.spec, authority), maxFee = fundingUint(v.maxFee)
  if (spec.value + maxFee > MAX) return bad()
  return Object.freeze({ maxBlockHeight: finiteHeight(v.maxBlockHeight), maxFee, spec })
}
export const encodeTransferSpec = (input: TransferSpec): Hex => {
  const s = checkedSpec(input)
  return `0xca85def7${uint(1n, 4)}${uint(26n, 4)}${uint(26n, 4)}${addressWord(s.sourceContract)}${addressWord(s.destinationContract)}${addressWord(s.sourceToken)}${addressWord(s.destinationToken)}${addressWord(s.sourceDepositor)}${addressWord(s.destinationRecipient)}${addressWord(s.sourceSigner)}${addressWord(s.destinationCaller)}${uint(s.value, 32)}${s.salt.slice(2)}00000000`
}
export const hashTransferSpec = (spec: TransferSpec): Hex => keccak256(encodeTransferSpec(spec))
export const encodeBurnIntent = (input: BurnIntent): Hex => {
  const v = fundingRecord(input, ["maxBlockHeight", "maxFee", "spec"])
  const s = checkedSpec(v.spec as TransferSpec), intent = captureBurnIntent(v, captureFundingAuthority(s.sourceSigner))
  return `0x070afbc2${uint(intent.maxBlockHeight, 32)}${uint(intent.maxFee, 32)}00000154${encodeTransferSpec(s).slice(2)}`
}
export const hashBurnIntent = (intent: BurnIntent): Hex => keccak256(encodeBurnIntent(intent))
const field = <N extends string, T extends string>(name: N, type: T) => Object.freeze({ name, type })
const burnTypes = Object.freeze({
  EIP712Domain: Object.freeze([field("name", "string"), field("version", "string")]),
  TransferSpec: Object.freeze([field("version", "uint32"), field("sourceDomain", "uint32"), field("destinationDomain", "uint32"),
    field("sourceContract", "bytes32"), field("destinationContract", "bytes32"), field("sourceToken", "bytes32"), field("destinationToken", "bytes32"),
    field("sourceDepositor", "bytes32"), field("destinationRecipient", "bytes32"), field("sourceSigner", "bytes32"), field("destinationCaller", "bytes32"),
    field("value", "uint256"), field("salt", "bytes32"), field("hookData", "bytes")]),
  BurnIntent: Object.freeze([field("maxBlockHeight", "uint256"), field("maxFee", "uint256"), field("spec", "TransferSpec")])
})
/** Distinct from F2 GatewayWalletBatched: the reviewed domain has ONLY name and
 * version. The source/destination coordinates live in the signed bytes32 spec. */
export const burnIntentTypedData = (input: BurnIntent, authority: FundingAuthority) => {
  const intent = captureBurnIntent(input, authority), s = intent.spec
  const word = (a: Hex): Hex => `0x${addressWord(a)}`
  return Object.freeze({ domain: Object.freeze({ name: "GatewayWallet", version: "1" } as const), types: burnTypes, primaryType: "BurnIntent" as const,
    message: Object.freeze({ maxBlockHeight: intent.maxBlockHeight, maxFee: intent.maxFee, spec: Object.freeze({ ...s,
      sourceContract: word(s.sourceContract), destinationContract: word(s.destinationContract), sourceToken: word(s.sourceToken), destinationToken: word(s.destinationToken),
      sourceDepositor: word(s.sourceDepositor), destinationRecipient: word(s.destinationRecipient), sourceSigner: word(s.sourceSigner), destinationCaller: word(s.destinationCaller) }) }) })
}
export type BurnIntentTypedData = ReturnType<typeof burnIntentTypedData>
/** Source acceptance window in blocks; it is not the attestation's destination
 * window. Rechecking never extends or mutates the original captured height. */
export const validateBurnHeight = (maxBlockHeight: bigint, sourceBlock: bigint, withdrawalDelay: bigint, maxBurnBlockDelta: bigint): bigint => {
  const height = finiteHeight(maxBlockHeight), current = fundingUint(sourceBlock), delay = fundingUint(withdrawalDelay), delta = finiteHeight(maxBurnBlockDelta)
  if (current + delay > MAX || current + delta > MAX || height < current + delay || height > current + delta) return bad()
  return height
}
export const encodeWithdrawalAttestation = (spec: TransferSpec, destinationMaxBlockHeight: bigint): Hex => `0xff6fb334${uint(finiteHeight(destinationMaxBlockHeight), 32)}00000154${encodeTransferSpec(spec).slice(2)}`
export const encodeWithdrawalAttestationSet = (spec: TransferSpec, destinationMaxBlockHeight: bigint): Hex => `0x1e12db7100000001${encodeWithdrawalAttestation(spec, destinationMaxBlockHeight).slice(2)}`
export interface BoundWithdrawalAttestation {
  readonly wrapper: "single" | "singleton-set"; readonly spec: TransferSpec; readonly maxBlockHeight: bigint
  readonly specHash: Hex; readonly payloadHash: Hex; readonly attesterMessageHash: Hex
}
/** Structural and exact-spec binding only. Runtime must still recover the
 * canonical ECDSA signature and prove current pinned-Minter signer membership. */
export const decodeAndBindWithdrawalAttestation = (input: unknown, expectedSpec: TransferSpec, destinationBlock: bigint): BoundWithdrawalAttestation => {
  if (typeof input !== "string" || (input.length !== 762 && input.length !== 778)) return bad()
  const payload = hex(input, (input.length - 2) / 2), current = fundingUint(destinationBlock), spec = checkedSpec(expectedSpec)
  const set = payload.length === 778
  if (set && payload.slice(2, 18) !== "1e12db7100000001") return bad()
  const single = set ? `0x${payload.slice(18)}` : payload
  if (single.slice(2, 10) !== "ff6fb334" || single.slice(74, 82) !== "00000154" || `0x${single.slice(82)}` !== encodeTransferSpec(spec)) return bad()
  const maxBlockHeight = finiteHeight(BigInt(`0x${single.slice(10, 74)}`))
  if (maxBlockHeight < current) return bad()
  const payloadHash = keccak256(payload)
  // Mints.sol: ECDSA.recover(keccak(payload).toEthSignedMessageHash()).
  // Prefix the RAW 32-byte hash, never its textual hex or the raw payload.
  const attesterMessageHash = keccak256(concatHex([stringToHex("\x19Ethereum Signed Message:\n32"), payloadHash]))
  return Object.freeze({ wrapper: set ? "singleton-set" : "single", spec, maxBlockHeight, specHash: hashTransferSpec(spec), payloadHash, attesterMessageHash })
}
