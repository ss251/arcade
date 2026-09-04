import { decodeHeaderJson, HEADER_PAYMENT_LEGACY, HEADER_PAYMENT_SIGNATURE } from "@arcade/payments"

const isAddress = (value: unknown): value is string =>
  typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)

/** Only the hub's configured canary may buy a delisted listing to prove recovery. */
export const delistRefusal = (
  rec: { readonly delisted?: boolean | undefined },
  payer: string,
  canaryAddress: string | undefined
): { readonly error: "listing_delisted"; readonly detail: string } | null => {
  if (rec.delisted !== true) return null
  if (isAddress(payer) && isAddress(canaryAddress) && payer.toLowerCase() === canaryAddress.toLowerCase()) return null
  return {
    error: "listing_delisted",
    detail: "this listing failed three consecutive pay-tests and is hidden until the hub's canary buys it successfully again — you were not charged"
  }
}

const ownValue = (value: unknown, key: string): unknown => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined
}

/**
 * An unverified claim, useful only for an early refusal. The paid route must recheck the
 * payer returned by rail.verify before creating a job or reserving an authorization.
 */
export const claimedPayerOf = (req: Request): string => {
  // Nullish precedence matches verification: a malformed modern header must not make
  // the legacy header authoritative, including when the modern header is empty.
  const header = req.headers.get(HEADER_PAYMENT_SIGNATURE) ?? req.headers.get(HEADER_PAYMENT_LEGACY)
  if (header === null) return ""
  try {
    const payment = decodeHeaderJson(header)
    const from = ownValue(ownValue(ownValue(payment, "payload"), "authorization"), "from")
    return isAddress(from) ? from : ""
  } catch {
    return ""
  }
}
