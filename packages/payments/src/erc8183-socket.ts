/** Lossless public context conversion; parsing is not verification or signing authority. */
import { Schema } from "effect"
import { EscrowContextWire } from "@arcade/core"
import { escrowActionContext } from "./erc8183-actions.ts"
import { EscrowFactsRefused } from "./erc8183-codec.ts"
export function escrowContextToWire(input: unknown): EscrowContextWire {
  try {
    const c = escrowActionContext(input)
    const wire = Schema.decodeUnknownSync(EscrowContextWire)({ ...c, jobId: c.jobId.toString(),
      call: { ...c.call, providerAgentId: c.call.providerAgentId.toString(), amount: c.call.amount.toString() } })
    Object.freeze(wire.call); return Object.freeze(wire)
  } catch { throw new EscrowFactsRefused() }
}
export function escrowContextFromWire(input: unknown) {
  try {
    const c = Schema.decodeUnknownSync(EscrowContextWire)(input)
    return escrowActionContext({ ...c, jobId: BigInt(c.jobId),
      call: { ...c.call, providerAgentId: BigInt(c.call.providerAgentId), amount: BigInt(c.call.amount) } })
  } catch { throw new EscrowFactsRefused() }
}
