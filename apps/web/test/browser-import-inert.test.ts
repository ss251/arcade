import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// A fresh Node-hosted import boundary, not a native browser/bundle assertion.
const ISSUER = "https://hub.example", SELLER = `0x${"1".repeat(40)}`
const ASSET = "0x3600000000000000000000000000000000000000"
const resource = `/x/${SELLER}/diff-triage`
const io = vi.fn((): never => { throw Error("Unexpected passive IO") })
const storage = vi.fn((): never => { throw Error("Unexpected passive storage") })

beforeEach(() => {
  vi.resetModules(); io.mockClear(); storage.mockClear()
  vi.stubEnv("ARCADE_NETWORK", "H10A_IMPORT_SENTINEL")
  vi.stubEnv("ARCADE_HUB", "H10A_ISSUER_SENTINEL")
  vi.stubGlobal("__ARCADE_NETWORK__", undefined)
  vi.stubGlobal("fetch", io)
  vi.stubGlobal("window", Object.defineProperty({}, "localStorage", { get: storage }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules() })
const noIO = () => { expect(io).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled() }

describe("passive browser modules do not select a server environment on fresh import", () => {
  it("imports and captures public context despite an invalid ambient selector", async () => {
    try {
      const { capturePurchaseContext } = await import("../src/lib/purchase-context.ts")
      const requirements = { scheme: "exact", network: "eip155:5042002", amount: "10000", asset: ASSET,
        payTo: SELLER, resource: ISSUER + resource, maxTimeoutSeconds: 604900,
        extra: { name: "USDC", version: "2" } }
      const context = { hubOrigin: ISSUER, skillId: "diff-triage", seller: SELLER, resource,
        amountAtomic: "10000", payTo: SELLER, asset: ASSET, network: "eip155:5042002", rail: "test", requirements }
      const captured = capturePurchaseContext(context)
      expect(captured).toEqual(context)
      expect(captured?.rail).toBe("test")
      expect(captured?.requirements).not.toBe(requirements)
    } finally { noIO() }
  })

  it("imports ordinary retrieval and refuses a pre-aborted read without any IO", async () => {
    try {
      const { readOrdinaryResult, OrdinaryJobHttpFailure } = await import("../src/lib/ordinary-job-http.ts")
      const controller = new AbortController(); controller.abort("not a public diagnostic")
      const row = { jobId: `job_${"a".repeat(32)}`, token: "b".repeat(32), skillId: "diff-triage",
        priceAtomic: "10000", createdAtMs: 0, hubOrigin: ISSUER, realm: "ordinary" }
      await expect(readOrdinaryResult(row, { signal: controller.signal })).rejects.toBeInstanceOf(OrdinaryJobHttpFailure)
    } finally { noIO() }
  })

  it("imports the actual H4 decoder and preserves fixed six-decimal money behavior", async () => {
    try {
      const { decodeStats } = await import("../src/lib/hub-decode.ts")
      const { parsePrice, formatPrice, formatUsdc, splitFee } = await import("../../../packages/core/src/money.ts")
      const input = { listings: 0, sellers: 0, calls: 0, settled: 0, trees: 0,
        volume: "$0.00", volumeAtomic: "0", fees: "$0.00", feesAtomic: "0", source: "hub" }
      expect(decodeStats(input)).toEqual(input)
      expect(parsePrice("$0.123456")).toBe(123456n)
      expect(formatPrice(123456n)).toBe("$0.123456")
      expect(formatPrice(0n)).toBe("$0.00")
      expect(formatUsdc(-1n)).toBe("-0.000001")
      expect(splitFee(101n, 500)).toEqual({ sellerAtomic: 96n, feeAtomic: 5n })
    } finally { noIO() }
  })
})
