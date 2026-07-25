import { Schema } from "effect"
import { ARC_CAIP2, USDC_ADDRESS } from "@arcade/core"

/**
 * x402 wire types.
 *
 * Field names follow the v2 line (`amount`, CAIP-2 `network`) which is what Circle's
 * Nanopayments requirements use. The Gateway variant is distinguished purely by
 * `extra.name === "GatewayWalletBatched"`, so one challenge shape serves both rails.
 */

export class PaymentRequirements extends Schema.Class<PaymentRequirements>("PaymentRequirements")({
  scheme: Schema.Literal("exact"),
  /** CAIP-2, e.g. eip155:5042002 */
  network: Schema.String,
  /** Atomic units (6-dec USDC) as a decimal string — bigints don't survive JSON. */
  amount: Schema.String,
  asset: Schema.String,
  payTo: Schema.String,
  resource: Schema.String,
  description: Schema.optional(Schema.String),
  mimeType: Schema.optionalWith(Schema.String, { default: () => "application/json" }),
  maxTimeoutSeconds: Schema.Int,
  /** Gateway sets { name: "GatewayWalletBatched", version: "1", verifyingContract }. */
  extra: Schema.optionalWith(Schema.Record({ key: Schema.String, value: Schema.Unknown }), {
    default: () => ({})
  })
}) {}

/** The body of a 402 response. */
export class PaymentRequired402 extends Schema.Class<PaymentRequired402>("PaymentRequired402")({
  x402Version: Schema.Literal(2),
  error: Schema.String,
  accepts: Schema.Array(PaymentRequirements)
}) {}

/**
 * An EIP-3009 TransferWithAuthorization, signed offline by the buyer.
 *
 * A Struct rather than a Class: this is a pure wire shape with no behaviour, and keeping it
 * structural means callers can build one from a plain object (which is what signing returns).
 */
export const ExactEvmPayload = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  value: Schema.String,
  validAfter: Schema.String,
  validBefore: Schema.String,
  /** 32-byte hex. */
  nonce: Schema.String,
  /** 65-byte hex signature. */
  signature: Schema.String
})
export type ExactEvmPayload = typeof ExactEvmPayload.Type

export class PaymentPayload extends Schema.Class<PaymentPayload>("PaymentPayload")({
  x402Version: Schema.Literal(2),
  scheme: Schema.Literal("exact"),
  network: Schema.String,
  payload: ExactEvmPayload
}) {}

/** Result of verifying a payment, before any work is done. */
export interface VerifiedPayment {
  readonly payer: string
  readonly payTo: string
  readonly amountAtomic: bigint
  readonly network: string
  readonly payload: PaymentPayload
  readonly requirements: PaymentRequirements
}

/** Result of settling. `txHash` is what lands on the receipt and in the explorer link. */
export interface SettledPayment {
  readonly txHash: string
  readonly payer: string
  readonly amountAtomic: bigint
}

export const ARC_DEFAULTS = {
  network: ARC_CAIP2,
  asset: USDC_ADDRESS
} as const

export const encodePayment = Schema.encode(PaymentPayload)
export const decodePayment = Schema.decodeUnknown(PaymentPayload)
export const decodeRequirements = Schema.decodeUnknown(PaymentRequirements)

/** Header names. v2 uses PAYMENT-*; X-PAYMENT is accepted for v1 clients. */
export const HEADER_PAYMENT_REQUIRED = "payment-required"
export const HEADER_PAYMENT_SIGNATURE = "payment-signature"
export const HEADER_PAYMENT_LEGACY = "x-payment"
export const HEADER_PAYMENT_RESPONSE = "payment-response"

/** Payment headers are base64(JSON) on the wire. */
export const encodeHeader = (payload: PaymentPayload): string =>
  Buffer.from(JSON.stringify(Schema.encodeSync(PaymentPayload)(payload)), "utf8").toString("base64")

export const decodeHeaderJson = (header: string): unknown =>
  JSON.parse(Buffer.from(header, "base64").toString("utf8"))
