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
}

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
        payTo: input.payTo,
        resource: input.resource,
        ...(input.description === undefined ? {} : { description: input.description }),
        mimeType: "application/json",
        // Match Gateway's window so a buyer can pay either rail with one signature shape.
        maxTimeoutSeconds: GATEWAY_MIN_VALIDITY_SECONDS,
        extra: {}
      })
    )

  const verify = (payload: PaymentPayload, requirements: PaymentRequirements) =>
    Effect.gen(function* () {
      const p = payload.payload
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
            signature: p.signature as Hex
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
        network: payload.network,
        payload,
        requirements
      } satisfies VerifiedPayment
    })

  const settle = (verified: VerifiedPayment) =>
    Effect.gen(function* () {
      const p = verified.payload.payload
      const sig = p.signature as Hex
      const r = sig.slice(0, 66) as Hex
      const s = `0x${sig.slice(66, 130)}` as Hex
      const v = Number.parseInt(sig.slice(130, 132), 16)

      const data = encodeFunctionData({
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
        wallet.sendTransaction({ to: USDC_ADDRESS as Hex, data })
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
