/** Current public listing capture for request-bound escrow quotes, never a fake discovery input. */
import { Schema } from "effect"
import { Bounds, PublicListing, hashJson, parsePrice, validateJson } from "@arcade/core"
import { escrowAddress, escrowCheck, escrowUint, type ChallengeInput } from "@arcade/payments"
import { escrowEvidenceBytes } from "./escrow-terminal.ts"
function plain(raw: unknown, model: { prototype: object; fields: Record<string, unknown> }): unknown {
  escrowCheck(raw && typeof raw === "object" && [Object.prototype, model.prototype].includes(Object.getPrototypeOf(raw)))
  const out: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(raw)) {
    escrowCheck(typeof key === "string" && Object.hasOwn(model.fields, key))
    const d = Object.getOwnPropertyDescriptor(raw, key); escrowCheck(d && d.enumerable && "value" in d)
    if (d.value !== undefined) out[key] = model === PublicListing && key === "bounds" ? plain(d.value, Bounds) : d.value
  }
  return JSON.parse(escrowEvidenceBytes(out))
}
export function escrowListingChallenge(raw: unknown, input: unknown, resource: string) {
  escrowCheck(raw && typeof raw === "object")
  const fields: Record<string, unknown> = Object.create(null)
  for (const key of ["listing", "seller", "agentId", "agentVerified", "delisted"]) {
    const d = Object.getOwnPropertyDescriptor(raw, key)
    if (d) { escrowCheck(d.enumerable && "value" in d); fields[key] = d.value }
  }
  escrowCheck(fields.agentVerified === true && !fields.delisted && typeof fields.agentId === "string" && /^[1-9][0-9]{0,77}$/.test(fields.agentId))
  const listing = Schema.decodeUnknownSync(PublicListing, { onExcessProperty: "error" })(plain(fields.listing, PublicListing))
  const seller = escrowAddress(fields.seller), agentId = escrowUint(BigInt(fields.agentId))
  const capturedInput: unknown = JSON.parse(escrowEvidenceBytes(input))
  escrowCheck(listing.rails?.includes("erc8183") && agentId > 0n && validateJson(capturedInput, listing.inputSchema))
  const challenge: ChallengeInput = { priceAtomic: parsePrice(listing.price), resource, payTo: seller,
    description: listing.description, escrow: { skillId: listing.id, skillVersion: listing.version,
      inputHash: hashJson(capturedInput), providerAgentId: agentId, timeoutSeconds: listing.bounds.timeoutSec } }
  return { listing, seller, input: capturedInput, challenge }
}
