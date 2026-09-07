import { Schema } from "effect"
import type { ListingRail } from "@arcade/core"
import { PaymentRequirements, paymentRequirementsKind } from "@arcade/payments"
import { captureEscrowRequirements } from "../../payments/src/erc8183-wire.ts"

export const DEFAULT_BUYER_RAILS: readonly ListingRail[] = Object.freeze(["gateway", "eip3009", "erc8183"])
export interface PaymentChoice {
  readonly rail: "gateway" | "eip3009" | "erc8183"
  readonly requirements: PaymentRequirements
  readonly amountAtomic: bigint
}
const fail = (): never => { throw Error("Unsupported payment choices") }
const array = (input: unknown, max: number): readonly unknown[] => {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length > max ||
      Reflect.ownKeys(input).length !== input.length + 1) return fail()
  return Array.from({ length: input.length }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(input, String(i))
    return d && "value" in d ? d.value : fail()
  })
}
const record = (input: unknown, requirement = false): Record<string, unknown> => {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return fail()
  const proto = Object.getPrototypeOf(input)
  if (proto !== Object.prototype && proto !== null && !(requirement && proto === PaymentRequirements.prototype)) return fail()
  const names = Reflect.ownKeys(input)
  if (names.length > 32) return fail()
  const result: Record<string, unknown> = Object.create(null)
  for (const name of names) {
    if (typeof name !== "string" || name.length > 128 || name === "__proto__") return fail()
    const d = Object.getOwnPropertyDescriptor(input, name)
    if (!d || !d.enumerable || !("value" in d)) return fail()
    if (d.value !== undefined) result[name] = d.value
  }
  return result
}
/** A preference is an ordered allow-list, not permission to fall back outside it. */
export const captureRailPreference = (input: readonly ListingRail[] = DEFAULT_BUYER_RAILS): readonly ListingRail[] => {
  try {
    const values = array(input, 3)
    if (!values.length || new Set(values).size !== values.length || values.some(v => !DEFAULT_BUYER_RAILS.includes(v as ListingRail))) return fail()
    return Object.freeze(values as ListingRail[])
  } catch { return fail() }
}

/** Offline preparation. Unknown schemes are skipped, but malformed known exact
 * requirements refuse the inventory. Escrow is opt-in and never an exact signer.
 * Keep the existing final ENS/domain gate at the SDK signing edge; Gateway's
 * pinned domain is also checked BEFORE it can be skipped for lack of funds. */
export const paymentChoices = (accepts: readonly unknown[], preferRail?: readonly ListingRail[], escrowEnabled = false): readonly PaymentChoice[] => {
  try {
    const preference = captureRailPreference(preferRail), choices = new Map<ListingRail, PaymentChoice>()
    for (const item of array(accepts, 32)) {
      const raw = record(item, true)
      if (typeof raw.scheme !== "string") return fail()
      if (raw.scheme === "erc8183" && escrowEnabled) {
        if (choices.has("erc8183")) return fail()
        const captured = captureEscrowRequirements(item)
        choices.set("erc8183", Object.freeze({ rail: "erc8183", requirements: captured.requirements, amountAtomic: captured.call.amount }))
        continue
      }
      if (raw.scheme !== "exact") continue
      const extra = raw.extra === undefined ? {} : record(raw.extra)
      // Current exact terms are scalar. Do not retain mutable nested authority.
      for (const value of Object.values(extra)) if (!(typeof value === "string" && value.length <= 2048 ||
        typeof value === "boolean" || typeof value === "number" && Number.isSafeInteger(value) || value === null)) return fail()
      const decoded = Schema.decodeUnknownSync(PaymentRequirements)({ ...raw, extra })
      for (const value of Object.values(decoded)) if (typeof value === "string" && value.length > 8192) return fail()
      if (!/^[1-9][0-9]{0,77}$/.test(decoded.amount) || decoded.amount.endsWith("\n") ||
          BigInt(decoded.amount) >= 1n << 256n || decoded.maxTimeoutSeconds < 1 || decoded.maxTimeoutSeconds > 604900) return fail()
      const requirements = PaymentRequirements.make({ ...decoded, extra: { ...extra } })
      Object.freeze(requirements.extra); Object.freeze(requirements)
      const rail = extra.name === "GatewayWalletBatched" ? "gateway" : "eip3009"
      if (rail === "gateway" && paymentRequirementsKind(requirements) !== "gateway") return fail()
      if (choices.has(rail)) return fail()
      choices.set(rail, Object.freeze({ rail, requirements, amountAtomic: BigInt(requirements.amount) }))
    }
    return Object.freeze(preference.flatMap(rail => choices.has(rail) ? [choices.get(rail)!] : []))
  } catch { return fail() }
}

/** An observation is not a reservation; the facilitator remains authoritative.
 * Absent balance means Gateway cannot be selected, not that the account is empty. */
export const selectAccept = (accepts: readonly unknown[], preferRail?: readonly ListingRail[], gatewayBalanceAtomic?: bigint, escrowEnabled = false): PaymentChoice | undefined => {
  if (gatewayBalanceAtomic !== undefined && (typeof gatewayBalanceAtomic !== "bigint" || gatewayBalanceAtomic < 0n || gatewayBalanceAtomic >= 1n << 256n)) return fail()
  return paymentChoices(accepts, preferRail, escrowEnabled).find(choice => choice.rail !== "gateway" ||
    gatewayBalanceAtomic !== undefined && gatewayBalanceAtomic >= choice.amountAtomic)
}
