import { afterEach, describe, expect, it, vi } from "vitest"
import { hasSessionMarker, receiptChildExplorer, receiptExplorer } from "../src/receipt-reference.ts"

const TX = `0x${"a1".repeat(32)}`
const root = (over: Record<string, unknown> = {}) => ({
  settled: true, rail: "eip3009", network: "eip155:5042002", settleTx: TX, ...over
})
const url = (tx = TX) => `https://testnet.arcscan.app/tx/${tx}`
afterEach(() => { vi.unstubAllEnvs(); vi.doUnmock("../../../packages/core/src/chain-config.ts"); vi.resetModules() })

describe("receipt reference authority", () => {
  it("links recorded settled EIP evidence with absent legacy or explicit onchain kind", () => {
    expect(receiptExplorer(root())).toBe(url())
    const upper = `0x${"A1".repeat(32)}`
    expect(receiptExplorer(root({ settleRefKind: "onchain", settleTx: upper }))).toBe(url(upper))
  })

  it.each([
    { rail: "gateway" }, { rail: "test" }, { rail: "unknown" },
    { settled: false }, { settled: "true" },
    { network: "eip155:0" }, { network: "eip155:1" }, { network: "arc-testnet" },
    { network: undefined }, { network: "eip155:05042002" },
    { settleRefKind: "gateway-transfer" }, { settleRefKind: "gateway-batch" },
    { settleRefKind: "test" }, { settleRefKind: "unrecognized" },
    { settleRefKind: "other" }, { settleRefKind: null }, { settleRefKind: undefined }
  ])("refuses ineligible recorded context %j", over => expect(receiptExplorer(root(over))).toBeNull())

  it.each([undefined, "", "0xabc", `0x${"0".repeat(64)}`, `0X${"a".repeat(64)}`,
    TX + "\n", TX + "?extra", `0x${"a".repeat(63)}`, `0x${"a".repeat(65)}`,
    "00000000-0000-4000-8000-000000000001", '\"><script>private-fixture</script>'])
  ("never builds a link from a malformed or opaque reference", settleTx => expect(receiptExplorer(root({ settleTx }))).toBeNull())

  it("does not read getters, coerce objects or trust inherited context", () => {
    let invoked = 0
    const withGetter = root()
    Object.defineProperty(withGetter, "settleRefKind", { enumerable: true, get: () => { invoked++; throw Error("private fixture") } })
    expect(receiptExplorer(withGetter)).toBeNull()
    expect(receiptExplorer(root({ settleTx: { toString: () => { invoked++; return TX } } }))).toBeNull()
    expect(receiptExplorer(Object.create(root()))).toBeNull()
    const inheritedKind = Object.assign(Object.create({ settleRefKind: "gateway-transfer" }), root())
    expect(receiptExplorer(inheritedKind)).toBeNull()
    expect(invoked).toBe(0)
  })

  it("loads without consulting a hostile ambient network selector", async () => {
    vi.stubEnv("ARCADE_NETWORK", "private-fixture-invalid-selector")
    vi.resetModules()
    const module = await import("../src/receipt-reference.ts")
    expect(module.receiptExplorer(root())).toBe(url())
  })

  it.each([
    { status: "pending" }, { chainId: 0 }, { chainId: 5042003 },
    { explorerBaseUrl: "http://unsafe.invalid" }, { explorerBaseUrl: "https://safe.invalid/?query=1" },
    { explorerBaseUrl: "https://user@safe.invalid" }
  ])("rejects a nonready, contradictory or unsafe configured manifest %j", async over => {
    vi.doMock("../../../packages/core/src/chain-config.ts", () => ({ loadChainConfig: () => ({
      status: "ready", chainId: 5042002, caip2: "eip155:5042002", explorerBaseUrl: "https://testnet.arcscan.app", ...over
    }) }))
    vi.resetModules()
    expect((await import("../src/receipt-reference.ts")).receiptExplorer(root())).toBeNull()
  })
})

describe("child reference context", () => {
  it("uses the child settled/hash with the original root context, even when root is released", () => {
    expect(receiptChildExplorer(root({ settled: false }), { settled: true, settleTx: TX })).toBe(url())
    expect(receiptChildExplorer(root(), { settled: false, settleTx: TX })).toBeNull()
  })
  it("ignores forged child rail/network/kind and retains the root kind presence", () => {
    const child = { settled: true, settleTx: TX, rail: "eip3009", network: "eip155:5042002", settleRefKind: "onchain" }
    expect(receiptChildExplorer(root({ rail: "gateway" }), child)).toBeNull()
    expect(receiptChildExplorer(root({ settleRefKind: undefined }), child)).toBeNull()
    expect(receiptChildExplorer(root(), { ...child, rail: "gateway", network: "eip155:1", settleRefKind: "gateway-transfer" })).toBe(url())
  })
})

describe("public session provenance", () => {
  it("recognizes only a canonical own private ID, independent of settlement and canary", () => {
    expect(hasSessionMarker({ sessionId: `ses_${"a".repeat(32)}`, settled: false, canary: true })).toBe(true)
    expect(hasSessionMarker({ session: true })).toBe(false)
  })
  it.each([undefined, null, "", `ses_${"A".repeat(32)}`, `ses_${"a".repeat(31)}`, `ses_${"a".repeat(32)}\n`, 1])
  ("refuses malformed session IDs without coercion", sessionId => expect(hasSessionMarker({ sessionId })).toBe(false))
  it("does not invoke an accessor or inherit another object's private ID", () => {
    let reads = 0
    expect(hasSessionMarker({ get sessionId() { reads++; return `ses_${"a".repeat(32)}` } })).toBe(false)
    expect(hasSessionMarker(Object.create({ sessionId: `ses_${"a".repeat(32)}` }))).toBe(false)
    expect(reads).toBe(0)
  })
})
