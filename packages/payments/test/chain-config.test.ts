import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { verifyTypedData } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import type { ChainConfig } from "@arcade/core"
import { makeEip3009Rail, PaymentPayload, signAuthorization, TRANSFER_TYPES } from "../src/index.ts"

// Deliberately differs from the default network in every signing/targeting field. A
// testnet-only fixture would let a rail that still reads module globals pass unnoticed.
const chain = {
  id: "arc-testnet",
  status: "ready",
  chainId: 123456,
  caip2: "eip155:123456",
  rpcHttp: ["https://rpc.invalid"],
  explorerBaseUrl: "https://explorer.invalid",
  usdc: {
    address: "0x1111111111111111111111111111111111111111",
    decimals: 6,
    nativeDecimals: 18,
    eip712Name: "Configured USDC",
    eip712Version: "3"
  },
  gateway: {
    wallet: "0x2222222222222222222222222222222222222222",
    domain: 99,
    facilitatorUrl: "https://gateway.invalid",
    minValiditySeconds: 777777
  }
} as ChainConfig

const buyer = privateKeyToAccount(generatePrivateKey())
const facilitator = privateKeyToAccount(generatePrivateKey())
const seller = "0x3333333333333333333333333333333333333333"
const domain = {
  name: chain.usdc.eip712Name,
  version: chain.usdc.eip712Version,
  chainId: chain.chainId,
  verifyingContract: chain.usdc.address
}

const setup = () => {
  const reads: Array<{ address: string; functionName: string }> = []
  const sent: Array<{ to: string }> = []
  const rail = makeEip3009Rail({
    chain,
    facilitator,
    publicClient: {
      readContract: async (args: { address: string; functionName: string }) => {
        reads.push(args)
        return args.functionName === "authorizationState" ? false : 1_000_000n
      },
      getTransactionReceipt: async () => ({ status: "success" })
    } as never,
    walletClient: {
      sendTransaction: async (args: { to: string }) => {
        sent.push(args)
        return `0x${"ab".repeat(32)}`
      }
    } as never
  })
  return { rail, reads, sent }
}

describe("EIP-3009 configured chain", () => {
  it("advertises the configured network, token, domain and authorization window", async () => {
    const { rail } = setup()
    const req = await Effect.runPromise(
      rail.challenge({ priceAtomic: 250_000n, resource: "/configured", payTo: seller })
    )
    expect(req.network).toBe(chain.caip2)
    expect(req.asset).toBe(chain.usdc.address)
    expect(req.extra).toMatchObject({ name: domain.name, version: domain.version })
    expect(req.maxTimeoutSeconds).toBe(chain.gateway!.minValiditySeconds)
  })

  it("signs against the explicitly selected token domain", async () => {
    const signed = await Effect.runPromise(
      signAuthorization({ account: buyer, to: seller, valueAtomic: 250_000n, chain })
    )
    const valid = await verifyTypedData({
      address: buyer.address,
      domain,
      types: TRANSFER_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: buyer.address,
        to: seller,
        value: BigInt(signed.value),
        validAfter: BigInt(signed.validAfter),
        validBefore: BigInt(signed.validBefore),
        nonce: signed.nonce
      },
      signature: signed.signature
    })
    expect(valid).toBe(true)
    expect(Number(signed.validBefore) - Math.floor(Date.now() / 1000)).toBeGreaterThan(777770)
  })

  it("verifies an independently signed domain and reads/settles the configured token", async () => {
    const { rail, reads, sent } = setup()
    const req = await Effect.runPromise(
      rail.challenge({ priceAtomic: 250_000n, resource: "/configured", payTo: seller })
    )
    const message = {
      from: buyer.address,
      to: seller,
      value: 250_000n,
      validAfter: 0n,
      validBefore: BigInt(Math.floor(Date.now() / 1000) + 600),
      nonce: `0x${"cd".repeat(32)}` as `0x${string}`
    } as const
    const signature = await buyer.signTypedData({ domain, types: TRANSFER_TYPES, primaryType: "TransferWithAuthorization", message })
    const payload = PaymentPayload.make({
      x402Version: 2,
      accepted: req,
      payload: {
        signature,
        authorization: {
          ...message,
          value: String(message.value),
          validAfter: String(message.validAfter),
          validBefore: String(message.validBefore)
        }
      }
    })
    const verified = await Effect.runPromise(rail.verify(payload, req))
    expect(reads).toEqual([
      expect.objectContaining({ address: chain.usdc.address, functionName: "authorizationState" }),
      expect.objectContaining({ address: chain.usdc.address, functionName: "balanceOf" })
    ])
    await Effect.runPromise(rail.settle(verified))
    expect(sent).toEqual([expect.objectContaining({ to: chain.usdc.address })])
  })

  it("rejects an authorization for the default domain before any RPC reads", async () => {
    const { rail, reads } = setup()
    const req = await Effect.runPromise(
      rail.challenge({ priceAtomic: 250_000n, resource: "/configured", payTo: seller })
    )
    const { signature, ...authorization } = await Effect.runPromise(
      signAuthorization({ account: buyer, to: seller, valueAtomic: 250_000n })
    )
    const payload = PaymentPayload.make({ x402Version: 2, accepted: req, payload: { signature, authorization } })
    const exit = await Effect.runPromiseExit(rail.verify(payload, req))
    expect(exit._tag).toBe("Failure")
    expect(reads).toEqual([])
  })
})
