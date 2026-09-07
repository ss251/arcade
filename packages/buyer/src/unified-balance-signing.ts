import { hashTypedData, recoverTypedDataAddress, type Hex } from "viem"
import { fundingRecord, parseFundingUint } from "./gateway-funding.ts"
import { captureCanonicalUnifiedPlan, type UnifiedFundingPlan } from "./unified-balance-funding.ts"
import { captureUnifiedBurn, type UnifiedBurn, type UnifiedBurnLimits } from "./unified-balance-guards.ts"

const fail = (): never => { throw Error("unified_signing_refused") }
export interface UnifiedBurnSigner {
  readonly address: string
  readonly signTypedData: (burn: UnifiedBurn) => Promise<Hex>
}
export interface UnifiedSigningDependencies {
  /** Includes live source identity/delegation/balance checks. Never signs. */
  readonly limits: () => Promise<UnifiedBurnLimits>
  readonly acquireSigner: () => Promise<UnifiedBurnSigner>
  readonly active: () => void
}
/** One final signature, no rewriting or signing fallback. Construct only after
 * the owned journal has durably recorded spend_intent. Raw signatures stay in
 * this closure and the pinned SDK; they are not evidence/output fields. */
export const createUnifiedSigningBoundary = (input: UnifiedFundingPlan, deps: UnifiedSigningDependencies) => {
  const plan = captureCanonicalUnifiedPlan(input)
  let signingClaimed = false, transferClaimed = false
  let signed: { burn: UnifiedBurn; signature: Hex } | undefined
  return Object.freeze({
    async sign(input: unknown): Promise<Hex> {
      try {
        deps.active()
        if (signingClaimed) return fail()
        signingClaimed = true
        // This dedicated codec handles EIP-712 type arrays; fundingRecord is
        // deliberately scalar-record-only and cannot capture the type schema.
        const captured = captureUnifiedBurn(input, plan, await deps.limits())
        deps.active()
        const signer = await deps.acquireSigner()
        deps.active()
        if (typeof signer.address !== "string" || signer.address.toLowerCase() !== plan.recipient) return fail()
        const refreshed = captureUnifiedBurn(captured, plan, await deps.limits())
        deps.active()
        const signature = await signer.signTypedData(refreshed)
        deps.active()
        if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature) ||
          (await recoverTypedDataAddress({ ...refreshed, signature })).toLowerCase() !== plan.recipient) return fail()
        deps.active()
        signed = { burn: refreshed, signature: signature.toLowerCase() as Hex }
        return signed.signature
      } catch { return fail() }
    },
    async beforeTransfer(body: string): Promise<void> {
      try {
        deps.active()
        if (!signed || transferClaimed || typeof body !== "string" || body.length > 16384) return fail()
        transferClaimed = true
        const rows: unknown = JSON.parse(body)
        if (!Array.isArray(rows) || rows.length !== 1) return fail()
        const row = fundingRecord(rows[0], ["burnIntent", "signature"])
        if (row.signature !== signed.signature) return fail()
        const burn = fundingRecord(row.burnIntent, ["maxBlockHeight", "maxFee", "spec"])
        const spec = fundingRecord(burn.spec, ["version", "sourceDomain", "destinationDomain", "sourceContract", "destinationContract",
          "sourceToken", "destinationToken", "sourceDepositor", "destinationRecipient", "sourceSigner", "destinationCaller", "value", "salt"], ["hookData"])
        const candidate = captureUnifiedBurn({ domain: signed.burn.domain, types: signed.burn.types, primaryType: signed.burn.primaryType,
          message: { maxBlockHeight: parseFundingUint(burn.maxBlockHeight), maxFee: parseFundingUint(burn.maxFee),
            spec: { ...spec, value: parseFundingUint(spec.value), hookData: spec.hookData ?? "0x" } } }, plan, await deps.limits())
        deps.active()
        if (hashTypedData(candidate) !== hashTypedData(signed.burn)) return fail()
      } catch { return fail() }
    },
    burn(): UnifiedBurn {
      deps.active()
      if (!signed || !transferClaimed) return fail()
      return signed.burn
    }
  })
}
