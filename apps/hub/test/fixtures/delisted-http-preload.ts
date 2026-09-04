// Test-only rail instrumentation. Never imported by production entry points.
import { mock } from "bun:test"
import { Effect, Layer, Ref } from "effect"
import { InvalidSignature } from "@arcade/core"
import { recoverTypedDataAddress } from "viem"
const payments = { ...await import("@arcade/payments") }

// RailTest intentionally does not recover signers. Add real offline recovery for this
// HTTP security test, while keeping balances/settlement entirely in memory.
mock.module("@arcade/payments", () => ({
  ...payments,
  RailTest: (_initial: unknown, balance: bigint) => Layer.effect(payments.RailTag, Effect.gen(function* () {
    const rail = payments.makeTestRail(yield* Ref.make(payments.makeTestState({}, balance)))
    return { ...rail, verify: (payload: Parameters<typeof rail.verify>[0], requirements: Parameters<typeof rail.verify>[1]) =>
      Effect.gen(function* () {
        const auth = payload.payload.authorization
        const recovered = yield* Effect.tryPromise({
          try: () => recoverTypedDataAddress({ domain: payments.EIP712_DOMAIN, types: payments.TRANSFER_TYPES,
            primaryType: "TransferWithAuthorization", signature: payload.payload.signature as `0x${string}`,
            message: { from: auth.from as `0x${string}`, to: auth.to as `0x${string}`, value: BigInt(auth.value),
              validAfter: BigInt(auth.validAfter), validBefore: BigInt(auth.validBefore), nonce: auth.nonce as `0x${string}` } }),
          catch: () => new InvalidSignature({ reason: "test recovery failed" })
        })
        if (recovered.toLowerCase() !== auth.from.toLowerCase()) return yield* new InvalidSignature({ reason: "test signer mismatch" })
        const verified = yield* rail.verify(payload, requirements)
        // Deliberately disagree with the claimed payer to prove the server's SECOND gate.
        return auth.nonce === `0x${"f".repeat(64)}`
          ? { ...verified, payer: process.env["TEST_VERIFIED_PAYER"]! } : verified
      }) }
  }))
}))

const serve = Bun.serve
Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
  const server = serve({ ...options, hostname: "127.0.0.1", port: 0 } as Parameters<typeof Bun.serve>[0])
  console.log(`[delist-test-port] ${server.port}`)
  return server
}) as typeof Bun.serve
