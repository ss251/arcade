import { Effect, Schedule, Layer } from "effect"
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  keccak256,
  toHex,
  type Account,
  type Hex
} from "viem"
import { arcTestnet } from "viem/chains"
import {
  ARC_CAIP2,
  ARC_RPC_URL,
  AuthorizationExpired,
  GATEWAY_MIN_VALIDITY_SECONDS,
  InsufficientFunds,
  InvalidSignature,
  RECEIPT_POLL_INTERVAL_MS,
  RpcFailure,
  RpcRateLimited,
  SettlementFailed,
  USDC_ADDRESS,
  USDC_EIP712_NAME,
  USDC_EIP712_VERSION,
  ARC_CHAIN_ID
} from "@arcade/core"
import { PaymentRequirements, type PaymentPayload, type SettledPayment, type VerifiedPayment } from "./types.ts"
import type { ChallengeInput, Rail } from "./rail.ts"
import { RailTag } from "./rail.ts"

/**
 * EIP-3009 `transferWithAuthorization` rail — PROVEN on Arc testnet.
 *
 * Evidence (internal/research/G1-RAIL-VERIFICATION.md): tx 0xc9b77c1e…, block 53480033,
 * 87,153 gas, 0.002179 USDC, 2,173ms submit→confirmed. The buyer signed offline in 5ms and
 * paid ZERO gas; the facilitator broadcast it. That asymmetry is the whole point — a buyer
 * agent never needs a gas balance and never touches the chain.
 */

export const TRANSFER_WITH_AUTHORIZATION_ABI = [
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "authorizationState",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const

export const EIP712_DOMAIN = {
  name: USDC_EIP712_NAME,
  version: USDC_EIP712_VERSION,
  chainId: ARC_CHAIN_ID,
  verifyingContract: USDC_ADDRESS as Hex
} as const

export const TRANSFER_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" }
  ]
} as const

/**
 * Arc's public RPC answers -32011 "request limit reached" under viem's default receipt
 * polling. This is the fix: one call per tick with exponential backoff, never
 * `waitForTransactionReceipt`. Discovered the hard way during G-1.
 */
const isRateLimit = (e: unknown): boolean => {
  const m = String((e as { message?: string })?.message ?? e)
  return m.includes("request limit") || m.includes("-32011")
}

const rpcRetry = Schedule.exponential("750 millis").pipe(
  Schedule.jittered,
  Schedule.compose(Schedule.recurs(6))
)

export interface Eip3009Config {
  /** Account that broadcasts settlements and pays gas (the facilitator role). */
  readonly facilitator: Account
  readonly rpcUrl?: string
  /**
   * Deployed FeeSplitter for this seller. When set, it becomes `payTo` in the 402 challenge
   * and settlement goes through it, so the platform fee is split ON-CHAIN and atomically.
   *
   * Without it the seller is paid the full price directly and the fee is only a number on a
   * receipt — a claim against a wallet we do not control and can never sweep. That was the
   * uncollectable-take-rate bug; this field is the fix.
   */
  readonly feeSplitter?: string
}

/** `settle(address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)` */
export const FEE_SPLITTER_ABI = [
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" }
    ],
    outputs: []
  }
] as const

export const makeEip3009Rail = (config: Eip3009Config): Rail => {
  const transport = http(config.rpcUrl ?? ARC_RPC_URL, { retryCount: 3, retryDelay: 1000 })
  const pub = createPublicClient({ chain: arcTestnet, transport })
  const wallet = createWalletClient({ account: config.facilitator, chain: arcTestnet, transport })

  const call = <A>(method: string, f: () => Promise<A>) =>
    Effect.tryPromise({
      try: f,
      catch: (e) =>
        isRateLimit(e)
          ? new RpcRateLimited({ method })
          : new RpcFailure({ method, reason: String((e as Error)?.message ?? e) })
    }).pipe(
      Effect.retry({ schedule: rpcRetry, while: (e) => e._tag === "RpcRateLimited" })
    )

  const challenge = (input: ChallengeInput) =>
    Effect.succeed(
      PaymentRequirements.make({
        scheme: "exact",
        network: ARC_CAIP2,
        amount: input.priceAtomic.toString(),
        asset: USDC_ADDRESS,
        // When a splitter is deployed, the buyer pays IT, not the seller — that is what makes
        // the fee collectable on-chain. The buyer signs one ordinary authorization either way,
        // so this is invisible to any standards-compliant x402 client.
        payTo: config.feeSplitter ?? input.payTo,
        resource: input.resource,
        ...(input.description === undefined ? {} : { description: input.description }),
        mimeType: "application/json",
        // Match Gateway's window so a buyer can pay either rail with one signature shape.
        maxTimeoutSeconds: GATEWAY_MIN_VALIDITY_SECONDS,
        /**
         * The token's EIP-712 domain. REQUIRED by the x402 `exact` EVM scheme: without it a
         * client cannot construct the TransferWithAuthorization signature and has to guess.
         *
         * Circle's own CLI rejects a challenge that omits these — "EIP-712 domain parameters
         * (name, version) are required in payment requirements for asset 0x3600…". Our own
         * buyer happened to work because it hardcodes USDC/2, which masked the bug until a
         * third-party client tried to pay.
         */
        extra: { name: USDC_EIP712_NAME, version: USDC_EIP712_VERSION }
      })
    )

  const verify = (payload: PaymentPayload, requirements: PaymentRequirements) =>
    Effect.gen(function* () {
      const p = payload.payload.authorization
      const sig = payload.payload.signature
      const value = BigInt(p.value)
      const required = BigInt(requirements.amount)

      if (value < required) {
        return yield* new InsufficientFunds({
          payer: p.from,
          requiredAtomic: required,
          availableAtomic: value
        })
      }
      if (p.to.toLowerCase() !== requirements.payTo.toLowerCase()) {
        return yield* new InvalidSignature({ reason: "payTo mismatch", payer: p.from })
      }

      const now = Math.floor(Date.now() / 1000)
      const validAfter = BigInt(p.validAfter)
      const validBefore = BigInt(p.validBefore)
      if (BigInt(now) < validAfter || BigInt(now) >= validBefore) {
        return yield* new AuthorizationExpired({ validAfter, validBefore, nowSeconds: now })
      }

      // Recover the signer from the typed data. If this doesn't match `from`, the
      // authorization is forged or the domain is wrong.
      const { verifyTypedData } = yield* Effect.promise(() => import("viem"))
      const ok = yield* Effect.tryPromise({
        try: () =>
          verifyTypedData({
            address: p.from as Hex,
            domain: EIP712_DOMAIN,
            types: TRANSFER_TYPES,
            primaryType: "TransferWithAuthorization",
            message: {
              from: p.from as Hex,
              to: p.to as Hex,
              value,
              validAfter,
              validBefore,
              nonce: p.nonce as Hex
            },
            signature: sig as Hex
          }),
        catch: (e) => new InvalidSignature({ reason: String((e as Error)?.message ?? e), payer: p.from })
      })
      if (!ok) {
        return yield* new InvalidSignature({ reason: "signature does not recover to `from`", payer: p.from })
      }

      // Balance check — a valid signature over funds that aren't there still can't settle.
      const balance = yield* call("balanceOf", () =>
        pub.readContract({
          address: USDC_ADDRESS as Hex,
          abi: TRANSFER_WITH_AUTHORIZATION_ABI,
          functionName: "balanceOf",
          args: [p.from as Hex]
        })
      )
      if ((balance as bigint) < value) {
        return yield* new InsufficientFunds({
          payer: p.from,
          requiredAtomic: value,
          availableAtomic: balance as bigint
        })
      }

      return {
        payer: p.from,
        payTo: p.to,
        amountAtomic: value,
        network: payload.accepted.network,
        payload,
        requirements
      } satisfies VerifiedPayment
    })

  const settle = (verified: VerifiedPayment) =>
    Effect.gen(function* () {
      const p = verified.payload.payload.authorization
      const sig = verified.payload.payload.signature as Hex
      const r = sig.slice(0, 66) as Hex
      const s = `0x${sig.slice(66, 130)}` as Hex
      const v = Number.parseInt(sig.slice(130, 132), 16)

      // Two settlement shapes. With a splitter, we call IT and it pulls the payment in and
      // splits atomically; without one, we submit the authorization straight to the token and
      // the seller receives the full amount (fee uncollected — see Eip3009Config.feeSplitter).
      const useSplitter = config.feeSplitter !== undefined
      const data = useSplitter
        ? encodeFunctionData({
            abi: FEE_SPLITTER_ABI,
            functionName: "settle",
            args: [
              p.from as Hex,
              BigInt(p.value),
              BigInt(p.validAfter),
              BigInt(p.validBefore),
              p.nonce as Hex,
              v,
              r,
              s
            ]
          })
        : encodeFunctionData({
            abi: TRANSFER_WITH_AUTHORIZATION_ABI,
            functionName: "transferWithAuthorization",
            args: [
              p.from as Hex,
              p.to as Hex,
              BigInt(p.value),
              BigInt(p.validAfter),
              BigInt(p.validBefore),
              p.nonce as Hex,
              v,
              r,
              s
            ]
          })

      const hash = yield* call("sendTransaction", () =>
        wallet.sendTransaction({
          to: (useSplitter ? config.feeSplitter! : USDC_ADDRESS) as Hex,
          data
        })
      )

      // One receipt read per tick — the -32011 fix.
      const receipt = yield* call("getTransactionReceipt", () =>
        pub.getTransactionReceipt({ hash })
      ).pipe(
        Effect.retry({
          schedule: Schedule.spaced(`${RECEIPT_POLL_INTERVAL_MS} millis`).pipe(
            Schedule.compose(Schedule.recurs(60))
          )
        }),
        Effect.catchAll(() => new SettlementFailed({ reason: "receipt timeout", txHash: hash }))
      )

      if (receipt.status !== "success") {
        return yield* new SettlementFailed({ reason: `tx reverted (${receipt.status})`, txHash: hash })
      }

      return { txHash: hash, payer: verified.payer, amountAtomic: verified.amountAtomic } satisfies SettledPayment
    })

  return { name: "eip3009", challenge, verify, settle }
}

export const Eip3009Live = (config: Eip3009Config): Layer.Layer<RailTag> =>
  Layer.succeed(RailTag, makeEip3009Rail(config))

// ── Buyer-side signing (used by packages/buyer and the conformance suite) ────

export interface SignInput {
  readonly account: Account
  readonly to: string
  readonly valueAtomic: bigint
  readonly validForSeconds?: number
}

/**
 * Produce a signed authorization. Pure offline work — no chain interaction, no gas.
 * Measured at ~5ms during G-1.
 */
export const signAuthorization = (input: SignInput) =>
  Effect.gen(function* () {
    const now = Math.floor(Date.now() / 1000)
    const validBefore = BigInt(now + (input.validForSeconds ?? GATEWAY_MIN_VALIDITY_SECONDS))
    const nonce = keccak256(toHex(`arcade-${now}-${Math.trunc(performance.now() * 1e6)}`))

    if (input.account.signTypedData === undefined) {
      return yield* new InvalidSignature({ reason: "account cannot sign typed data" })
    }

    const signature = yield* Effect.tryPromise({
      try: () =>
        input.account.signTypedData!({
          domain: EIP712_DOMAIN,
          types: TRANSFER_TYPES,
          primaryType: "TransferWithAuthorization",
          message: {
            from: input.account.address,
            to: input.to as Hex,
            value: input.valueAtomic,
            validAfter: 0n,
            validBefore,
            nonce
          }
        }),
      catch: (e) => new InvalidSignature({ reason: String((e as Error)?.message ?? e) })
    })

    return {
      from: input.account.address,
      to: input.to,
      value: input.valueAtomic.toString(),
      validAfter: "0",
      validBefore: validBefore.toString(),
      nonce,
      signature
    }
  })
