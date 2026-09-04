import { hmac } from "@noble/hashes/hmac"
import { sha256 } from "@noble/hashes/sha2"
import { bytesToUtf8, utf8ToBytes } from "@noble/hashes/utils"
import { Data, Schema } from "effect"

/**
 * Lineage — how the hub knows a call is a sub-hire and of what.
 *
 * The client presents ONLY an opaque capability naming its parent job; the hub verifies the
 * MAC and derives root, hop and ancestors from the persisted parent. A forged header buys
 * nothing, and an omitted header is simply a root call from a new customer.
 *
 * The HMAC here is `@noble/hashes` rather than `node:crypto`, for the same reason
 * `untrusted.ts`'s fence nonce is `crypto.getRandomValues` rather than `randomBytes`:
 * `index.ts` re-exports every sibling module with `export *`, so a Node-only import
 * ANYWHERE in `@arcade/core` is import-fatal the moment a browser component pulls in any
 * core symbol (see the repo-hygiene test "keeps @arcade/core importable in a browser").
 * `node:crypto`'s `createHmac`/`timingSafeEqual` are synchronous; the Web Crypto
 * `crypto.subtle` equivalents are Promise-only, which would force `mintHireCapability` and
 * `verifyHireCapability` to become async and break every caller's assumption of a
 * synchronous capability check. `@noble/hashes` is synchronous, dependency-free, isomorphic,
 * and already present transitively (viem pins the exact same `@noble/hashes@1.8.0` for its
 * own signing), so declaring it directly costs nothing new in the tree.
 */

export const HIRE_CAPABILITY_HEADER = "x-arcade-hire-capability"
export const DEFAULT_MAX_HOP = 3

export class Lineage extends Schema.Class<Lineage>("Lineage")({
  rootJobId: Schema.String,
  parentJobId: Schema.optional(Schema.String),
  hop: Schema.Int,
  ancestors: Schema.Array(Schema.String)
}) {}

export class LineageInvalid extends Data.TaggedError("LineageInvalid")<{ readonly reason: string }> {}
export class LineageCycle extends Data.TaggedError("LineageCycle")<{ readonly skillId: string }> {}
export class LineageDepth extends Data.TaggedError("LineageDepth")<{ readonly hop: number; readonly max: number }> {}
export class TreeBudgetExceeded extends Data.TaggedError("TreeBudgetExceeded")<{
  readonly rootJobId: string
  readonly ceilingAtomic: bigint
  readonly wouldBeAtomic: bigint
}> {}

export const ROOT_LINEAGE = (jobId: string): Lineage =>
  Lineage.make({ rootJobId: jobId, hop: 0, ancestors: [] })

export const childLineage = (
  parent: { readonly rootJobId: string; readonly hop: number; readonly ancestors: ReadonlyArray<string>; readonly skillId: string },
  parentJobId: string
): Lineage =>
  Lineage.make({
    rootJobId: parent.rootJobId,
    parentJobId,
    hop: parent.hop + 1,
    ancestors: [...parent.ancestors, parent.skillId]
  })

interface CapabilityPayload {
  readonly v: 1
  readonly aud: "arcade-hire"
  readonly parentJobId: string
  readonly expiresAtMs: number
}

const canonical = (p: CapabilityPayload): string =>
  JSON.stringify({ v: p.v, aud: p.aud, parentJobId: p.parentJobId, expiresAtMs: p.expiresAtMs })

/** Raw HMAC-SHA256 digest bytes over the canonical payload, domain-separated. */
const mac = (secret: string, payloadJson: string): Uint8Array =>
  hmac(sha256, utf8ToBytes(secret), utf8ToBytes(`arcade-hire-v1:${payloadJson}`))

/**
 * URL-safe base64, unpadded — RFC 4648 §5, written by hand because `Buffer` (Node-only) and
 * `@noble/hashes` (no base64 export) both leave a gap here. Plain bytes in, plain bytes out;
 * no cryptographic property depends on this beyond "round-trips exactly".
 */
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

const base64UrlEncode = (bytes: Uint8Array): string => {
  let out = ""
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]
    out += B64URL[b0 >> 2]
    out += B64URL[((b0 & 0x03) << 4) | (b1 === undefined ? 0 : b1 >> 4)]
    if (b1 !== undefined) out += B64URL[((b1 & 0x0f) << 2) | (b2 === undefined ? 0 : b2 >> 6)]
    if (b2 !== undefined) out += B64URL[b2 & 0x3f]
  }
  return out
}

const base64UrlDecode = (s: string): Uint8Array => {
  const clean = s.replace(/[^A-Za-z0-9\-_]/g, "")
  const bytes: Array<number> = []
  let buffer = 0
  let bits = 0
  for (const ch of clean) {
    const value = B64URL.indexOf(ch)
    if (value === -1) continue
    buffer = (buffer << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }
  return new Uint8Array(bytes)
}

/** Constant-time equality — no early return on the first differing byte. */
const timingSafeEqualBytes = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

export const mintHireCapability = (secret: string, parentJobId: string, expiresAtMs: number): string => {
  const payload = canonical({ v: 1, aud: "arcade-hire", parentJobId, expiresAtMs })
  return `${base64UrlEncode(utf8ToBytes(payload))}.${base64UrlEncode(mac(secret, payload))}`
}

export const verifyHireCapability = (
  secret: string,
  token: string,
  nowMs: number
): { readonly parentJobId: string } | LineageInvalid => {
  const [p, m] = token.split(".")
  if (p === undefined || m === undefined) return new LineageInvalid({ reason: "malformed capability" })
  let parsed: CapabilityPayload
  try {
    parsed = JSON.parse(bytesToUtf8(base64UrlDecode(p))) as CapabilityPayload
  } catch {
    return new LineageInvalid({ reason: "capability payload is not JSON" })
  }
  if (parsed.v !== 1 || parsed.aud !== "arcade-hire" || typeof parsed.parentJobId !== "string") {
    return new LineageInvalid({ reason: "capability payload shape" })
  }
  const expected = mac(secret, canonical(parsed))
  const presented = base64UrlDecode(m)
  if (!timingSafeEqualBytes(expected, presented)) {
    return new LineageInvalid({ reason: "bad mac" })
  }
  if (typeof parsed.expiresAtMs !== "number" || parsed.expiresAtMs <= nowMs) {
    return new LineageInvalid({ reason: "capability expired" })
  }
  return { parentJobId: parsed.parentJobId }
}
