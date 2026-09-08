/** I2 offline sanitization only. No listener, CLI wallet, key, signer or writer. */
import { decodeHeaderJson } from "../packages/payments/src/types.ts"

export const CAPTURE_DUMMY_SIGNATURE = "0x" + "11".repeat(65)
const FAIL = "circle_capture_header_refused"
const USDC = "0x3600000000000000000000000000000000000000"
const GATEWAY = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9"
const description = "capture probe"
const mimeType = "application/json"
function check(value: unknown): asserts value { if (!value) throw new Error(FAIL) }
function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  check(value !== null && typeof value === "object" && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)))
  const names = Reflect.ownKeys(value), allowed = [...required, ...optional]
  check(names.length <= allowed.length && names.every(name => typeof name === "string" && allowed.includes(name)) &&
    required.every(name => Object.hasOwn(value, name)))
  const result: Record<string, unknown> = Object.create(null)
  for (const name of names) {
    check(typeof name === "string")
    const field = Object.getOwnPropertyDescriptor(value, name)
    check(field !== undefined && "value" in field && field.enumerable); result[name] = field.value
  }
  return result
}
const address = (value: unknown): value is string => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/.test(value)
const same = (left: unknown, right: unknown) => address(left) && address(right) && left.toLowerCase() === right.toLowerCase()
const uint = (value: unknown): value is string => typeof value === "string" && /^(0|[1-9][0-9]{0,77})$/.test(value) && BigInt(value) < (1n << 256n)
export interface CircleCaptureContext { readonly endpoint: string; readonly payer: string; readonly payTo: string }
function captureContext(value: unknown): CircleCaptureContext {
  const r = record(value, ["endpoint", "payer", "payTo"])
  check(typeof r.endpoint === "string" && /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/x\/demo\/usdc-flow-check$/.test(r.endpoint) &&
    Number(new URL(r.endpoint).port) <= 65535 && address(r.payer) && address(r.payTo))
  return Object.freeze({ endpoint: r.endpoint, payer: r.payer, payTo: r.payTo })
}
function metadata(value: unknown, payTo: string): Record<string, unknown> {
  const r = record(value, [], ["name", "version", "verifyingContract", "assetTransferMethod", "feeSplitter", "feeSplitterVersion"])
  if (Object.keys(r).length === 0) return {}
  check(r.assetTransferMethod === undefined || r.assetTransferMethod === "eip3009")
  if (r.name === "GatewayWalletBatched") {
    check(r.version === "1" && same(r.verifyingContract, GATEWAY) && r.feeSplitter === undefined && r.feeSplitterVersion === undefined)
  } else {
    check(r.name === "USDC" && r.version === "2" && r.verifyingContract === undefined)
    check(r.feeSplitter === undefined ? r.feeSplitterVersion === undefined :
      same(r.feeSplitter, payTo) && (r.feeSplitterVersion === 1 || r.feeSplitterVersion === 2))
  }
  // Every allowed field above has a fixed literal, bounded integer or bound address.
  return Object.fromEntries(Object.entries(r))
}
export interface SanitizedCircleHeader {
  readonly headerName: "payment-signature" | "x-payment"
  readonly signatureScrubbed: true
  readonly authenticated: false
  readonly provenance: "supplied-header-shape-only"
  readonly fixtureJson: string
}
/** Returns only non-bearer, shape-only text. No provenance, signature validity,
 * freshness, payment acceptance or client-version claim follows from sanitizing.
 * It cannot detect secrets deliberately encoded as valid public integer,
 * address or nonce fields; that is not a property of a shape sanitizer. */
export function sanitizeCircleHeader(headerName: unknown, header: unknown, expected: unknown): SanitizedCircleHeader {
  try {
    check(headerName === "payment-signature" || headerName === "x-payment")
    const context = captureContext(expected)
    check(typeof header === "string" && header.length > 0 && header.length <= 32768 &&
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(header))
    const bytes = Buffer.from(header, "base64")
    check(bytes.length <= 16384 && bytes.toString("base64") === header)
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes), parsed = decodeHeaderJson(header)
    check(text === JSON.stringify(parsed)) // Reject duplicates, invisible bytes and ambiguous spellings.
    const raw = record(parsed, ["x402Version", "payload", "accepted"], ["resource"])
    check(raw.x402Version === 2)
    const payload = record(raw.payload, ["authorization", "signature"])
    check(typeof payload.signature === "string" && /^0x[0-9a-fA-F]{130}$/.test(payload.signature))
    const auth = record(payload.authorization, ["from", "to", "value", "validAfter", "validBefore", "nonce"])
    check(same(auth.from, context.payer) && same(auth.to, context.payTo) && auth.value === "10000" &&
      uint(auth.validAfter) && uint(auth.validBefore) && BigInt(auth.validAfter) < BigInt(auth.validBefore) &&
      typeof auth.nonce === "string" && /^0x[0-9a-fA-F]{64}$/.test(auth.nonce))
    const accepted = record(raw.accepted, ["scheme", "network", "amount", "asset", "payTo", "resource", "maxTimeoutSeconds"],
      ["description", "mimeType", "extra"])
    check(accepted.scheme === "exact" && accepted.network === "eip155:5042002" && accepted.amount === "10000" &&
      same(accepted.asset, USDC) && same(accepted.payTo, context.payTo) && accepted.resource === context.endpoint &&
      typeof accepted.maxTimeoutSeconds === "number" && Number.isSafeInteger(accepted.maxTimeoutSeconds) && accepted.maxTimeoutSeconds > 0 &&
      (accepted.description === undefined || accepted.description === description) && (accepted.mimeType === undefined || accepted.mimeType === mimeType))
    const safeAccepted = { scheme: accepted.scheme, network: accepted.network, amount: accepted.amount,
      asset: accepted.asset, payTo: accepted.payTo, resource: accepted.resource,
      maxTimeoutSeconds: accepted.maxTimeoutSeconds,
      ...(accepted.description === undefined ? {} : { description: accepted.description }),
      ...(accepted.mimeType === undefined ? {} : { mimeType: accepted.mimeType }),
      ...(Object.hasOwn(accepted, "extra") ? { extra: metadata(accepted.extra, context.payTo) } : {}) }
    let resource: Record<string, unknown> | undefined
    if (Object.hasOwn(raw, "resource")) {
      const r = record(raw.resource, ["url"], ["description", "mimeType"])
      check(r.url === context.endpoint && (r.description === undefined || r.description === description) &&
        (r.mimeType === undefined || r.mimeType === mimeType))
      resource = { url: r.url, ...(r.description === undefined ? {} : { description: r.description }),
        ...(r.mimeType === undefined ? {} : { mimeType: r.mimeType }) }
    }
    const fixture = { x402Version: 2, payload: { authorization: { from: auth.from, to: auth.to,
      value: auth.value, validAfter: auth.validAfter, validBefore: auth.validBefore, nonce: auth.nonce },
      signature: CAPTURE_DUMMY_SIGNATURE }, accepted: safeAccepted, ...(resource === undefined ? {} : { resource }) }
    const fixtureJson = JSON.stringify(fixture, null, 2) + "\n"
    check(Buffer.byteLength(fixtureJson) <= 16384)
    return Object.freeze({ headerName, signatureScrubbed: true, authenticated: false, provenance: "supplied-header-shape-only", fixtureJson })
  } catch { throw new Error(FAIL) }
}
export function captureHeaderMain(args: readonly string[]): number {
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write("Offline Circle header sanitizer library only. No capture listener, key, signature or file writer.\n")
    return 0
  }
  if (args.length !== 0) { process.stderr.write("circle_capture_arguments_invalid\n"); return 2 }
  process.stdout.write(JSON.stringify({ liveCapture: "NOT_RUN", captureEnabled: false, writes: false }) + "\n")
  return 1
}
if (import.meta.main) process.exitCode = captureHeaderMain(process.argv.slice(2))
