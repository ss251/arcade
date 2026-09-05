// The core barrel eagerly selects a network from the environment. Import the explicit
// loader directly so these browser-safe helpers depend only on their supplied context.
import { loadChainConfig } from "../../../../packages/core/src/chain-config.ts"

const displayLength = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? Math.min(value, 64)
    : fallback

/** Elide the middle, retaining both ends for comparison. Invalid input is never coerced. */
export const shortHash = (s: unknown, head: unknown = 8, tail: unknown = 6): string => {
  if (typeof s !== "string" || s.trim() === "") return "unknown"
  const h = displayLength(head, 8)
  const t = displayLength(tail, 6)
  return s.length <= h + t + 1 ? s : `${s.slice(0, h)}…${s.slice(-t)}`
}

export const shortAddr = (a: unknown): string => shortHash(a, 8, 6)

const timestamp = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0

export const ago = (ms: unknown, nowMs: unknown = Date.now()): string => {
  if (!timestamp(ms) || !timestamp(nowMs)) return "unknown"
  if (ms > nowMs) return "in the future"
  const seconds = Math.floor((nowMs - ms) / 1000)
  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86_400)}d ago`
}

const canonicalHex = (value: unknown, digits: number): value is string =>
  typeof value === "string" && value.length === digits + 2 &&
  /^0x[0-9a-fA-F]+$/.test(value) && /[1-9a-fA-F]/.test(value.slice(2))

/** Match only configured network IDs or their exact CAIP-2 IDs, never caller manifests. */
const explorerFor = (network: unknown): string | null => {
  if (typeof network !== "string") return null
  for (const id of ["arc-testnet", "arc-mainnet"] as const) {
    const config = loadChainConfig(id)
    if (config.status === "ready" && (network === config.id || network === config.caip2)) {
      return config.explorerBaseUrl
    }
  }
  return null
}

/** Link only an explicitly reported settled EIP-3009 reference; this does not verify mining. */
export const txLink = (tx: unknown, context?: unknown): string | null => {
  if (!canonicalHex(tx, 64) || typeof context !== "object" || context === null || Array.isArray(context)) return null
  try {
    if (![Object.prototype, null].includes(Object.getPrototypeOf(context))) return null
    const data = (key: string): unknown => {
      const descriptor = Object.getOwnPropertyDescriptor(context, key)
      return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined
    }
    if (data("rail") !== "eip3009" || data("settled") !== true) return null
    const explorer = explorerFor(data("network"))
    return explorer === null ? null : `${explorer}/tx/${tx}`
  } catch { return null }
}

export const addrLink = (address: unknown, network?: unknown): string | null => {
  if (!canonicalHex(address, 40)) return null
  const explorer = explorerFor(network)
  return explorer === null ? null : `${explorer}/address/${address}`
}
