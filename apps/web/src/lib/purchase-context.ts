/** Passive keyless quote data, never approval or signing authority. No IO or environment reads. */
import testnet from "../../../../config/chains/arc-testnet.json"
import mainnet from "../../../../config/chains/arc-mainnet.json"
import { nameOk } from "./hub-decode.ts"

export type BrowserPurchaseRail = "eip3009" | "gateway" | "test"
export interface BrowserRequirements {
  readonly scheme: "exact"; readonly network: string; readonly amount: string; readonly asset: string
  readonly payTo: string; readonly resource: string; readonly maxTimeoutSeconds: number
  readonly description?: string; readonly mimeType?: string
  readonly extra?: Readonly<{ readonly name: string; readonly version: string; readonly verifyingContract?: string
    readonly feeSplitter?: string; readonly feeSplitterVersion?: 1 | 2 }>
}
export interface BrowserPurchaseContext {
  readonly hubOrigin: string; readonly skillId: string; readonly seller: string
  /** Exact relative ordinary resource. The original requirements contain the absolute URL. */
  readonly resource: string; readonly amountAtomic: string; readonly payTo: string; readonly asset: string
  readonly network: string; readonly rail: BrowserPurchaseRail; readonly requirements: BrowserRequirements
  /** Verified by the quote producer; this pure decoder only validates its bounded syntax. */
  readonly ensName?: string
}

function own(input: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw 0
  const keys = Reflect.ownKeys(input)
  if (keys.length > required.length + optional.length || required.some(key => !Object.hasOwn(input, key))) throw 0
  const out: Record<string, unknown> = Object.create(null)
  for (const key of keys) {
    if (typeof key !== "string" || !required.includes(key) && !optional.includes(key)) throw 0
    const d = Object.getOwnPropertyDescriptor(input, key)
    if (!d?.enumerable || !("value" in d)) throw 0
    out[key] = d.value
  }
  return out
}
function text(value: unknown, max: number): value is string {
  if (typeof value !== "string" || value.length > max) return false
  for (let i = 0; i < value.length; i++) {
    const n = value.charCodeAt(i)
    if (n >= 0xd800 && n <= 0xdbff) {
      const low = value.charCodeAt(++i)
      if (!(low >= 0xdc00 && low <= 0xdfff)) return false
    } else if (n >= 0xdc00 && n <= 0xdfff) return false
  }
  return new TextEncoder().encode(value).byteLength <= max
}
const address = (v: unknown): v is string => typeof v === "string" && v.length === 42 && /^0x[0-9a-fA-F]{40}$/.test(v) && !/^0x0{40}$/i.test(v)
const sameAddress = (a: unknown, b: unknown) => address(a) && address(b) && a.toLowerCase() === b.toLowerCase()
const amount = (v: unknown): v is string => typeof v === "string" && v.length <= 78 && /^[1-9][0-9]{0,77}$/.test(v) && BigInt(v) < 1n << 256n
const origin = (v: unknown): v is string => {
  if (!text(v, 2048) || /[\s\\%?#]/.test(v)) return false
  const u = new URL(v)
  return u.origin === v && !u.username && !u.password &&
    (u.protocol === "https:" || u.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(u.hostname))
}

/** Unknown/unsupported context is unavailable, never stripped into a more permissive one.
 * Fixed manifest profiles establish supported coordinates; quote separately binds its
 * selected configuration and ENS provenance. Every original accepted field is retained.
 */
export function capturePurchaseContext(input: unknown): BrowserPurchaseContext | undefined {
  try {
    const v = own(input, ["hubOrigin", "skillId", "seller", "resource", "amountAtomic", "payTo", "asset", "network", "rail", "requirements"], ["ensName"])
    if (!origin(v.hubOrigin) || typeof v.skillId !== "string" || v.skillId.length > 64 || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(v.skillId) ||
      !address(v.seller) || !address(v.payTo) || !address(v.asset) || !amount(v.amountAtomic) ||
      !["eip3009", "gateway", "test"].includes(v.rail as string) ||
      v.resource !== `/x/${v.seller}/${v.skillId}` || Object.hasOwn(v, "ensName") && (!text(v.ensName, 253) || !nameOk(v.ensName))) return undefined
    const chain = [testnet, mainnet].find(c => c.status === "ready" && c.caip2 === v.network)
    if (!chain || !sameAddress(v.asset, chain.usdc.address)) return undefined
    const r = own(v.requirements, ["scheme", "network", "amount", "asset", "payTo", "resource", "maxTimeoutSeconds"], ["description", "mimeType", "extra"])
    if (r.scheme !== "exact" || r.network !== v.network || r.amount !== v.amountAtomic || r.asset !== v.asset || r.payTo !== v.payTo ||
      r.resource !== v.hubOrigin + v.resource || typeof r.maxTimeoutSeconds !== "number" || !Number.isSafeInteger(r.maxTimeoutSeconds) ||
      r.maxTimeoutSeconds < 1 || r.maxTimeoutSeconds > 604900 ||
      Object.hasOwn(r, "description") && !text(r.description, 2048) ||
      Object.hasOwn(r, "mimeType") && r.mimeType !== "application/json") return undefined
    const gateway = v.rail === "gateway"
    const e = own(r.extra, ["name", "version"], gateway ? ["verifyingContract"] : ["feeSplitter", "feeSplitterVersion"])
    if (gateway) {
      if (!chain.gateway || e.name !== "GatewayWalletBatched" || e.version !== "1" ||
        !sameAddress(e.verifyingContract, chain.gateway.wallet) || r.maxTimeoutSeconds !== chain.gateway.minValiditySeconds) return undefined
    } else {
      if (e.name !== chain.usdc.eip712Name || e.version !== chain.usdc.eip712Version ||
        Object.hasOwn(e, "feeSplitter") && !sameAddress(e.feeSplitter, v.payTo) ||
        Object.hasOwn(e, "feeSplitterVersion") && (!Object.hasOwn(e, "feeSplitter") || e.feeSplitterVersion !== 1 && e.feeSplitterVersion !== 2)) return undefined
    }
    // Closed own-data checks above make these explicit scalar projections exact,
    // including absence (no defaults or case-normalization are introduced).
    const extra = Object.freeze({ name: e.name as string, version: e.version as string,
      ...(Object.hasOwn(e, "verifyingContract") ? { verifyingContract: e.verifyingContract as string } : {}),
      ...(Object.hasOwn(e, "feeSplitter") ? { feeSplitter: e.feeSplitter as string } : {}),
      ...(Object.hasOwn(e, "feeSplitterVersion") ? { feeSplitterVersion: e.feeSplitterVersion as 1 | 2 } : {}) })
    const requirements: BrowserRequirements = Object.freeze({ scheme: "exact", network: r.network as string, amount: r.amount as string,
      asset: r.asset as string, payTo: r.payTo as string, resource: r.resource as string, maxTimeoutSeconds: r.maxTimeoutSeconds,
      ...(Object.hasOwn(r, "description") ? { description: r.description as string } : {}),
      ...(Object.hasOwn(r, "mimeType") ? { mimeType: r.mimeType as string } : {}), extra })
    return Object.freeze({ hubOrigin: v.hubOrigin, skillId: v.skillId, seller: v.seller, resource: v.resource,
      amountAtomic: v.amountAtomic, payTo: v.payTo, asset: v.asset, network: v.network as string,
      rail: v.rail as BrowserPurchaseRail, requirements, ...(Object.hasOwn(v, "ensName") ? { ensName: v.ensName as string } : {}) })
  } catch { return undefined }
}
