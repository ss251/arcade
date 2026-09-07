/** Public signing intent, not signing authority. No key lookup, IO or broadcasting. */
import { hashJson } from "@arcade/core"
import { verifyTypedData, type Hex } from "viem"
import { escrowActionContext } from "./erc8183-actions.ts"
import { providerAuthorizationDeadline, setBudgetAuthorization, submitAuthorization } from "./erc8183-auth.ts"
import { escrowBytes32, escrowCheck, escrowRecord, escrowSeconds, escrowUint } from "./erc8183-codec.ts"
import { escrowContextFromWire, escrowContextToWire } from "./erc8183-socket.ts"
export function captureEscrowProviderIntent(input: unknown) {
  const r = escrowRecord(input, ["requestId", "context", "kind", "issuedAt", "nonce", "deadline", "hubJobId", "outputHash"])
  const context = escrowActionContext(r.context), issuedAt = escrowSeconds(r.issuedAt), deadline = escrowUint(r.deadline, 48)
  escrowCheck((r.kind === "budget" || r.kind === "submit") && deadline === providerAuthorizationDeadline(issuedAt) &&
    context.call.provider !== context.client && context.call.provider !== context.call.evaluator)
  escrowCheck(r.kind === "budget" ? r.hubJobId === null && r.outputHash === null :
    typeof r.hubJobId === "string" && /^job_[A-Za-z0-9]{16,128}$/.test(r.hubJobId))
  return Object.freeze({ requestId: escrowBytes32(r.requestId, false), context, kind: r.kind,
    issuedAt, nonce: escrowUint(r.nonce, 72), deadline, hubJobId: r.hubJobId as string | null,
    outputHash: r.kind === "submit" ? escrowBytes32(r.outputHash, false) : null })
}
export type EscrowProviderIntent = ReturnType<typeof captureEscrowProviderIntent>
export function escrowProviderTypedData(input: unknown) {
  const i = captureEscrowProviderIntent(input), c = i.context.call
  const base = { chainId: c.chainId, escrow: c.escrow, signer: c.provider, jobId: i.context.jobId, nonce: i.nonce, deadline: i.deadline }
  return i.kind === "budget" ? setBudgetAuthorization({ ...base, token: c.token, amount: c.amount }, i.issuedAt) :
    submitAuthorization({ ...base, deliverable: i.outputHash! }, i.issuedAt)
}
/** Historical verification uses captured issuance time, never grants validity now. */
export async function assertEscrowProviderSignature(input: unknown, signature: unknown): Promise<Hex> {
  const typed = escrowProviderTypedData(input)
  escrowCheck(typeof signature === "string" && /^0x[0-9a-fA-F]{130}$/.test(signature))
  const captured = signature.toLowerCase() as Hex
  escrowCheck(await verifyTypedData({ ...typed, address: typed.message.signer, signature: captured }))
  return captured
}
export function encodeEscrowProviderIntent(input: unknown): string {
  const i = captureEscrowProviderIntent(input)
  // Validate the actual EIP-712 budget arithmetic and fixed domain as well.
  escrowProviderTypedData(i)
  return JSON.stringify({ protocol: "arcade:erc8183:provider-intent:v1", requestId: i.requestId,
    context: escrowContextToWire(i.context), kind: i.kind, issuedAt: i.issuedAt, nonce: i.nonce.toString(),
    deadline: i.deadline.toString(), hubJobId: i.hubJobId, outputHash: i.outputHash })
}
export function decodeEscrowProviderIntent(json: string): EscrowProviderIntent {
  escrowCheck(typeof json === "string" && json.length <= 32768)
  const r = escrowRecord(JSON.parse(json), ["protocol", "requestId", "context", "kind", "issuedAt", "nonce", "deadline", "hubJobId", "outputHash"])
  escrowCheck(r.protocol === "arcade:erc8183:provider-intent:v1" && typeof r.nonce === "string" &&
    /^(0|[1-9][0-9]{0,21})$/.test(r.nonce) && typeof r.deadline === "string" && /^(0|[1-9][0-9]{0,14})$/.test(r.deadline))
  const i = captureEscrowProviderIntent({ requestId: r.requestId, context: escrowContextFromWire(r.context), kind: r.kind,
    issuedAt: r.issuedAt, nonce: BigInt(r.nonce), deadline: BigInt(r.deadline), hubJobId: r.hubJobId, outputHash: r.outputHash })
  escrowCheck(encodeEscrowProviderIntent(i) === json)
  return i
}
export const escrowProviderContextHash = (input: unknown) => hashJson(escrowContextToWire(input))
export interface EscrowProviderClaim { readonly id: Hex }
export interface EscrowProviderJournal {
  readonly durability: "durable" | "volatile"
  claim(input: unknown): Promise<EscrowProviderClaim | undefined>
  signed(claim: EscrowProviderClaim, signature: unknown): Promise<void>
  uncertain(claim: EscrowProviderClaim): Promise<void>
}
