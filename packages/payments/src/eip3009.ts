import { Effect, Schedule, Layer } from "effect"
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  http,
  keccak256,
  toHex,
  type Account,
  type Hex
} from "viem"
import {
  AuthorizationExpired,
  GATEWAY_MIN_VALIDITY_SECONDS,
  InsufficientFunds,
  InvalidSignature,
  NonceAlreadyUsed,
  RECEIPT_POLL_INTERVAL_MS,
  RpcFailure,
  RpcRateLimited,
  SettlementFailed,
  loadChainConfig,
  toViemChain,
  type ChainConfig
} from "@arcade/core"
import { PaymentRequirements, type PaymentPayload, type SettledPayment, type VerifiedPayment } from "./types.ts"
import type { ChallengeInput, Rail, SettleTree } from "./rail.ts"
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

const eip712DomainFor = (chain: ChainConfig) => ({
  name: chain.usdc.eip712Name,
  version: chain.usdc.eip712Version,
  chainId: chain.chainId,
  verifyingContract: chain.usdc.address
})

/** Compatibility export for callers using the process-selected network. */
export const EIP712_DOMAIN = eip712DomainFor(loadChainConfig())

const authorizationValidityFor = (chain: ChainConfig): number =>
  chain.gateway?.minValiditySeconds ?? GATEWAY_MIN_VALIDITY_SECONDS

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
  /** The network, token and EIP-712 domain used by this rail instance. */
  readonly chain: ChainConfig
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
  /**
   * Override the read client. Exists so the verify path — replay, balance — can be tested
   * without a chain: the replay check was asserted in three documents and implemented in
   * none, and the reason it went unnoticed is that only the in-memory fake was ever
   * exercised against it.
   */
  readonly publicClient?: { readContract: (args: never) => Promise<unknown> }
  /**
   * Override the broadcasting client, for the same reason as `publicClient`: it lets
   * `settle` — the sendTransaction/receipt path — be exercised in the conformance suite
   * without a chain, rather than leaving it the one rail method no test can reach a real
   * success on.
   */
  readonly walletClient?: { sendTransaction: (args: never) => Promise<string> }
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

/**
 * FeeSplitterV2's surface: `settle` (inherited, same as v1) plus `settleWithTree`, which
 * additionally commits the receipt tree's hash, and `version()` so a caller can tell v1 and
 * v2 apart without guessing from behavior.
 */
export const FEE_SPLITTER_V2_ABI = [
  ...FEE_SPLITTER_ABI,
  {
    type: "function",
    name: "settleWithTree",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
      { name: "treeHash", type: "bytes32" },
      { name: "childCount", type: "uint32" },
      { name: "childTotalAtomic", type: "uint256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "version",
    stateMutability: "pure",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }]
  }
] as const

export const makeEip3009Rail = (config: Eip3009Config): Rail => {
  const chain = defineChain(toViemChain(config.chain))
  const domain = eip712DomainFor(config.chain)
  const token = config.chain.usdc.address
  const transport = http(config.rpcUrl ?? config.chain.rpcHttp[0], { retryCount: 3, retryDelay: 1000 })
  const pub = (config.publicClient ??
    createPublicClient({ chain, transport })) as ReturnType<typeof createPublicClient>
  // Typed off a helper (rather than a bare `ReturnType<typeof createWalletClient>`) so the
  // account bound at construction narrows the type the same way the un-overridden call
  // always did — otherwise `sendTransaction` below would demand an `account` argument the
  // real client already carries.
  const realWallet = () => createWalletClient({ account: config.facilitator, chain, transport })
  const wallet: ReturnType<typeof realWallet> =
    config.walletClient === undefined ? realWallet() : (config.walletClient as unknown as ReturnType<typeof realWallet>)

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

  const challenge = (input: ChallengeInput) => {
    // Per-call ONLY. There is deliberately no process-wide fallback: a global would route
    // the payments of any seller who has not deployed a splitter into whichever splitter
    // the deployment happens to be configured with, and `FeeSplitter.seller` is immutable,
    // so that contract can only ever pay someone else. A seller without a splitter simply
    // collects the full price — which is their choice to make, and not one another
    // seller's configuration can make for them.
    const splitterFor = input.feeSplitter

    return Effect.succeed(
      PaymentRequirements.make({
        scheme: "exact",
        network: config.chain.caip2,
        amount: input.priceAtomic.toString(),
        asset: token,
        // When a splitter is deployed, the buyer pays IT, not the seller — that is what makes
        // the fee collectable on-chain. The buyer signs one ordinary authorization either way,
        // so this is invisible to any standards-compliant x402 client.
        payTo: splitterFor ?? input.payTo,
        resource: input.resource,
        ...(input.description === undefined ? {} : { description: input.description }),
        mimeType: "application/json",
        // Match Gateway's window so a buyer can pay either rail with one signature shape.
        maxTimeoutSeconds: authorizationValidityFor(config.chain),
        /**
         * The token's EIP-712 domain. REQUIRED by the x402 `exact` EVM scheme: without it a
         * client cannot construct the TransferWithAuthorization signature and has to guess.
         *
         * Circle's own CLI rejects a challenge that omits these — "EIP-712 domain parameters
         * (name, version) are required in payment requirements for asset 0x3600…". Our own
         * buyer happened to work because it hardcodes USDC/2, which masked the bug until a
         * third-party client tried to pay.
         */
        // `feeSplitter` here is what tells `settle` to call the contract rather than the
        // token. It is part of the challenge the buyer signs against, so the routing
        // decision is visible to them and cannot be changed afterwards by configuration.
        extra: {
          name: domain.name,
          version: domain.version,
          ...(splitterFor === undefined ? {} : { feeSplitter: splitterFor }),
          // Carries the routing decision into what the buyer signs, so `settle` can decide
          // between `settle` and `settleWithTree` from a fact of the challenge rather than
          // re-reading the splitter's version out-of-band at settlement time.
          ...(input.feeSplitterVersion === undefined ? {} : { feeSplitterVersion: input.feeSplitterVersion })
        }
      })
    )
  }

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
            domain,
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

      // Replay. `transferWithAuthorization` is permissionless and USDC records each
      // (authorizer, nonce) pair once — but nothing stopped a caller replaying the same
      // PAYMENT-SIGNATURE header at the HUB, which dispatched a fresh job every time. The
      // seller burned N× inference and exactly one settle landed on chain. Three documents
      // claimed this check existed; the ABI entry sat unused directly above.
      const used = yield* call("authorizationState", () =>
        pub.readContract({
          address: token,
          abi: TRANSFER_WITH_AUTHORIZATION_ABI,
          functionName: "authorizationState",
          args: [p.from as Hex, p.nonce as Hex]
        })
      )
      if (used === true) {
        return yield* new NonceAlreadyUsed({ nonce: p.nonce, payer: p.from })
      }

      // Balance check — a valid signature over funds that aren't there still can't settle.
      const balance = yield* call("balanceOf", () =>
        pub.readContract({
          address: token,
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

  const settle = (verified: VerifiedPayment, tree?: SettleTree) =>
    Effect.gen(function* () {
      const p = verified.payload.payload.authorization
      const sig = verified.payload.payload.signature as Hex
      const r = sig.slice(0, 66) as Hex
      const s = `0x${sig.slice(66, 130)}` as Hex
      const v = Number.parseInt(sig.slice(130, 132), 16)

      // Two settlement shapes. With a splitter, we call IT and it pulls the payment in and
      // splits atomically; without one, we submit the authorization straight to the token and
      // the seller receives the full amount (fee uncollected).
      //
      // Derived from what the BUYER SIGNED, not from process config. The authorization
      // names its own recipient, so if that recipient is a splitter this must call it — and
      // reading a global here could route a settlement at a contract the buyer never
      // authorised, or miss one they did. `p.to` is the single source of truth for where
      // this specific payment goes.
      // Whether this payment routes through a splitter is a fact about the challenge the
      // buyer signed, so it travels in the requirements rather than being re-derived from
      // process config. Reading a global here could call a contract the buyer never
      // authorised, or miss one they did.
      const target = p.to
      const useSplitter = verified.requirements.extra?.["feeSplitter"] === target
      // Likewise for the splitter's version: it is a fact of the challenge the buyer signed
      // (`extra.feeSplitterVersion`), not something re-derived here by calling `version()`
      // again at settlement time — the same reasoning as `useSplitter` above.
      const useTree =
        useSplitter && tree !== undefined && verified.requirements.extra?.["feeSplitterVersion"] === 2
      const data = useTree
        ? encodeFunctionData({
            abi: FEE_SPLITTER_V2_ABI,
            functionName: "settleWithTree",
            args: [
              p.from as Hex,
              BigInt(p.value),
              BigInt(p.validAfter),
              BigInt(p.validBefore),
              p.nonce as Hex,
              v,
              r,
              s,
              tree.treeHash,
              tree.childCount,
              tree.childTotalAtomic
            ]
          })
        : useSplitter
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
          to: (useSplitter ? target : token) as Hex,
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
        // Broadcast, receipt unreadable: genuinely unknown until someone reconciles.
        Effect.catchAll(() => new SettlementFailed({ reason: "receipt timeout", txHash: hash, settled: "unknown" }))
      )

      if (receipt.status !== "success") {
        // The receipt WAS read. A reverted transferWithAuthorization moves nothing, so the
        // buyer was not charged and the hub is entitled to say so plainly.
        return yield* new SettlementFailed({ reason: `tx reverted (${receipt.status})`, txHash: hash, settled: "reverted" })
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
  /** Defaults to the process-selected chain, matching the compatibility domain export. */
  readonly chain?: ChainConfig
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
    const chain = input.chain ?? loadChainConfig()
    const now = Math.floor(Date.now() / 1000)
    const validBefore = BigInt(now + (input.validForSeconds ?? authorizationValidityFor(chain)))
    const nonce = keccak256(toHex(`arcade-${now}-${Math.trunc(performance.now() * 1e6)}`))

    if (input.account.signTypedData === undefined) {
      return yield* new InvalidSignature({ reason: "account cannot sign typed data" })
    }

    const signature = yield* Effect.tryPromise({
      try: () =>
        input.account.signTypedData!({
          domain: eip712DomainFor(chain),
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
