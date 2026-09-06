import { afterEach, describe, expect, it, vi } from "vitest"
import { loadChainConfig } from "../../../packages/core/src/chain-config.ts"

const tx = `0x${"a1".repeat(32)}`
const address = "0xcf821769ED3c0E55e152745377bb833d7155A78a"
const settled = { network: "arc-testnet", rail: "eip3009", settled: true }
const coercive = { toString: () => { throw new Error("must not coerce display input") } }

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

describe("display helpers", () => {
  // Import inside each test so the initial missing-module run collects and fails cases.
  it("preserves both ends of hashes and addresses without expanding short values", async () => {
    const { shortHash, shortAddr } = await import("../src/lib/format.ts")
    expect(shortHash("0x6366ab12cd34ef567890abcdef1234567890abcdef1234567890abcdef123456"))
      .toBe("0x6366ab…123456")
    expect(shortHash("0xshort")).toBe("0xshort")
    expect(shortHash("abcdefghijklmnop", 3, 2)).toBe("abc…op")
    expect(shortAddr(address)).toBe("0xcf8217…55A78a")
  })

  it("handles missing or non-string display values without coercing them", async () => {
    const { shortHash, shortAddr } = await import("../src/lib/format.ts")
    for (const value of [undefined, null, "", "   ", 123, true, Symbol("hash"), coercive]) {
      expect(shortHash(value)).toBe("unknown")
      expect(shortAddr(value)).toBe("unknown")
    }
  })

  it("bounds custom lengths and falls back for invalid lengths", async () => {
    const { shortHash } = await import("../src/lib/format.ts")
    for (const length of [0, -1, 1.5, NaN, Infinity, "4", coercive, Number.MAX_SAFE_INTEGER + 1]) {
      expect(shortHash(tx, length, length)).toBe(`${tx.slice(0, 8)}…${tx.slice(-6)}`)
    }
    const long = `${"a".repeat(200)}${"b".repeat(200)}`
    expect(shortHash(long, 10_000, 10_000)).toBe(`${"a".repeat(64)}…${"b".repeat(64)}`)
    expect(shortHash(tx, 1, 1)).toBe("0…1")
  })

  it("uses readable elapsed time at minute, hour, and day boundaries", async () => {
    const { ago } = await import("../src/lib/format.ts")
    const now = 1_700_000_000_000
    for (const [elapsed, expected] of [
      [0, "just now"], [5_000, "just now"], [30_000, "just now"],
      [59_999, "just now"], [60_000, "1m ago"], [90_000, "1m ago"],
      [3_599_999, "59m ago"], [3_600_000, "1h ago"], [7_200_000, "2h ago"],
      [86_399_999, "23h ago"], [86_400_000, "1d ago"], [172_800_000, "2d ago"]
    ] as const) expect(ago(now - elapsed, now)).toBe(expected)
  })

  it("marks future timestamps explicitly and accepts the Unix epoch", async () => {
    const { ago } = await import("../src/lib/format.ts")
    expect(ago(1_700_000_000_001, 1_700_000_000_000)).toBe("in the future")
    expect(ago(0, 86_400_000)).toBe("1d ago")
  })

  it("marks unknown, nonfinite, negative, and unsafe timestamps as unknown", async () => {
    const { ago } = await import("../src/lib/format.ts")
    for (const value of [undefined, null, "1700000000000", coercive, NaN, Infinity, -Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(ago(value, 1_700_000_000_000)).toBe("unknown")
      // An omitted clock uses Date.now; other invalid clocks must be rejected.
      if (value !== undefined) expect(ago(0, value)).toBe("unknown")
    }
  })

  it.each(["arc-testnet", "eip155:5042002"])("uses the configured explorer for explicit %s context", async (network) => {
    const { addrLink, txLink } = await import("../src/lib/format.ts")
    const explorer = loadChainConfig("arc-testnet").explorerBaseUrl
    expect(txLink(tx, { ...settled, network })).toBe(`${explorer}/tx/${tx}`)
    expect(addrLink(address, network)).toBe(`${explorer}/address/${address}`)
  })

  it("requires all transaction settlement evidence before linking", async () => {
    const { txLink } = await import("../src/lib/format.ts")
    for (const context of [
      undefined, null, {}, "arc-testnet", [],
      { rail: "eip3009", settled: true },
      { network: "arc-testnet", settled: true },
      { network: "arc-testnet", rail: "eip3009" },
      { ...settled, settled: false }, { ...settled, settled: "true" },
      { ...settled, rail: "gateway" }, { ...settled, rail: "test" },
      { ...settled, rail: "unknown" }, { ...settled, rail: "EIP3009" }
    ]) expect(txLink(tx, context)).toBeNull()
  })

  it("rejects inherited settlement context", async () => {
    const { txLink } = await import("../src/lib/format.ts")
    expect(txLink(tx, Object.create(settled))).toBeNull()
  })

  it.each([undefined, null, "gateway-transfer", "gateway-batch", "test", "unrecognized", "future", 0])(
    "refuses a present non-onchain reference kind: %s", async settleRefKind => {
      const { txLink } = await import("../src/lib/format.ts")
      expect(txLink(tx, { ...settled, settleRefKind })).toBeNull()
    })
  it("keeps true absence and explicit own onchain eligible, without trusting inherited or hidden kinds", async () => {
    const { txLink } = await import("../src/lib/format.ts")
    expect(txLink(tx, settled)).not.toBeNull()
    expect(txLink(tx, { ...settled, settleRefKind: "onchain" })).not.toBeNull()
    expect(txLink(tx, Object.assign(Object.create({ settleRefKind: "onchain" }), settled))).toBeNull()
    expect(txLink(tx, Object.defineProperty({ ...settled }, "settleRefKind", { value: "onchain" }))).toBeNull()
  })
  it("refuses a reference-kind descriptor trap without reflecting its diagnostic", async () => {
    const { txLink } = await import("../src/lib/format.ts")
    const context = new Proxy({ ...settled }, { getOwnPropertyDescriptor(target, key) {
      if (key === "settleRefKind") throw Error("PRIVATE_KIND_DIAGNOSTIC")
      return Reflect.getOwnPropertyDescriptor(target, key)
    } })
    expect(txLink(tx, context)).toBeNull()
  })

  it.each(["network", "rail", "settled", "settleRefKind"])("never invokes an untrusted %s accessor", async key => {
    const { txLink } = await import("../src/lib/format.ts")
    let reads = 0
    const context = { ...settled }
    Object.defineProperty(context, key, { get: () => { reads++; throw new Error("PRIVATE_CONTEXT_DIAGNOSTIC") } })
    expect(txLink(tx, context)).toBeNull()
    expect(reads).toBe(0)
  })

  it("rejects unknown and pending networks, including caller-supplied chain objects", async () => {
    const { addrLink, txLink } = await import("../src/lib/format.ts")
    for (const network of [
      undefined, null, "", "unknown", "arc-mainnet", "eip155:0", "eip155:1",
      "ARC-TESTNET", "arc-testnet ", 5042002, coercive,
      { ...loadChainConfig("arc-mainnet"), status: "ready", explorerBaseUrl: "https://attacker.invalid" }
    ]) {
      expect(txLink(tx, { ...settled, network })).toBeNull()
      expect(addrLink(address, network)).toBeNull()
    }
  })

  it("requires a full nonzero transaction hash and rejects URL fragments and whitespace", async () => {
    const { txLink } = await import("../src/lib/format.ts")
    for (const hash of [
      undefined, null, coercive, 123, "", "0xabc", `0x${"0".repeat(64)}`,
      tx.slice(0, -1), `${tx}0`, `0x${"g".repeat(64)}`, tx.replace("0x", "0X"),
      `${tx}\n`, `${tx}/`, `${tx}?x=1`, `${tx}#fragment`, ` ${tx}`,
      `https://attacker.invalid/${tx}`
    ]) expect(txLink(hash, settled)).toBeNull()
    expect(txLink(`0x${"0".repeat(63)}1`, settled)).not.toBeNull()
  })

  it("requires a full nonzero address before linking", async () => {
    const { addrLink } = await import("../src/lib/format.ts")
    for (const value of [
      undefined, null, coercive, 123, "", "0xdef", `0x${"0".repeat(40)}`,
      address.slice(0, -1), `${address}0`, `0x${"g".repeat(40)}`,
      `${address}\n`, `${address}/`, `${address}?x=1`, ` ${address}`
    ]) expect(addrLink(value, "arc-testnet")).toBeNull()
    expect(addrLink(`0x${"0".repeat(39)}1`, "arc-testnet")).not.toBeNull()
  })

  it("imports and uses explicit context independently of the selected server network", async () => {
    vi.stubEnv("ARCADE_NETWORK", "unknown-network-that-must-not-be-read")
    vi.resetModules()
    const { addrLink, txLink } = await import("../src/lib/format.ts")
    expect(txLink(tx)).toBeNull()
    expect(addrLink(address)).toBeNull()
    expect(txLink(tx, settled)).toBe(`${loadChainConfig("arc-testnet").explorerBaseUrl}/tx/${tx}`)
  })
})
