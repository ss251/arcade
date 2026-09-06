import { afterEach, describe, expect, it, vi } from "vitest"
import { createPurchaseApprovalScope } from "../src/lib/purchase-approval.ts"
import chain from "../../../config/chains/arc-testnet.json"

const SELLER = `0x${"1".repeat(40)}`, ORIGIN = "https://hub.example"
const resource = `/x/${SELLER}/diff-triage`
const context = () => ({ hubOrigin: ORIGIN, skillId: "diff-triage", seller: SELLER, resource,
  amountAtomic: "10000", payTo: SELLER, asset: chain.usdc.address, network: chain.caip2, rail: "eip3009",
  requirements: { scheme: "exact", network: chain.caip2, amount: "10000", asset: chain.usdc.address,
    payTo: SELLER, resource: ORIGIN + resource, maxTimeoutSeconds: 604900,
    extra: { name: "USDC", version: "2" } } })
const binding = () => ({ approvalId: "approval_1", toolCallId: "call_1", toolName: "arcade_call_skill",
  skillId: "diff-triage", maxAmountUsd: "$0.02", input: { diff: "owned input", nested: { z: 1, a: [true, null] } } })
const approval = () => ({ ...binding(), context: context() })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe("fresh one-use browser approval scope", () => {
  it("captures an immutable canonical request and consumes it exactly once", () => {
    const scope = createPurchaseApprovalScope(() => 0), input = approval(), token = scope.approve(input)!
    const result = scope.consume(token, binding())!
    expect(result).toMatchObject({ approvalId: "approval_1", toolCallId: "call_1", toolName: "arcade_call_skill",
      skillId: "diff-triage", ceilingAtomic: "20000", inputJson: '{"diff":"owned input","nested":{"a":[true,null],"z":1}}',
      context: input.context })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.context)).toBe(true)
    expect(Object.isFrozen(result.context.requirements.extra)).toBe(true)
    expect(scope.consume(token, binding())).toBeUndefined()
    expect(scope.approve(input)).toBeUndefined()
  })
  it("holds opaque authority, not a token reproducible through JSON or property copying", () => {
    const scope = createPurchaseApprovalScope(() => 0), token = scope.approve(approval())!
    expect(Object.isFrozen(token)).toBe(true)
    expect(Reflect.ownKeys(token)).toEqual([])
    expect(JSON.stringify(token)).toBe("{}")
    for (const fake of [{ ...token }, JSON.parse(JSON.stringify(token)), {}, null, "approval_1"]) {
      expect(scope.consume(fake, binding())).toBeUndefined()
    }
    expect(scope.consume(token, binding())).toBeDefined()
  })
  it("never shares authority between scopes", () => {
    const a = createPurchaseApprovalScope(() => 0), b = createPurchaseApprovalScope(() => 0)
    const token = a.approve(approval())!
    expect(b.consume(token, binding())).toBeUndefined()
    expect(a.consume(token, binding())).toBeDefined()
  })
  it("captures source input/context before either can be mutated", () => {
    const scope = createPurchaseApprovalScope(() => 0), input = approval(), token = scope.approve(input)!
    input.input.diff = "changed"; input.context.requirements.extra.name = "changed"
    const consumed = scope.consume(token, binding())!
    expect(consumed.inputJson).toContain("owned input")
    expect(consumed.context.requirements.extra?.name).toBe("USDC")
  })
  it.each([
    { approvalId: "other" }, { toolCallId: "other" }, { toolName: "arcade_quote" },
    { skillId: "other-skill" }, { maxAmountUsd: "$0.03" }, { input: { diff: "different" } }, { extra: true }
  ])("burns the permit before refusing a changed binding %j", mutation => {
    const scope = createPurchaseApprovalScope(() => 0), token = scope.approve(approval())!
    expect(scope.consume(token, { ...binding(), ...mutation })).toBeUndefined()
    expect(scope.consume(token, binding())).toBeUndefined()
    expect(scope.approve(approval())).toBeUndefined()
  })
  it("accepts equivalent JSON order and text with the same positive ceiling", () => {
    const scope = createPurchaseApprovalScope(() => 0), token = scope.approve(approval())!
    expect(scope.consume(token, { ...binding(), maxAmountUsd: "0.020000",
      input: '{"nested":{"z":1,"a":[true,null]},"diff":"owned input"}' })).toBeDefined()
  })
  it("expires at five monotonic minutes and never rearms after expiry", () => {
    let now = 100
    const scope = createPurchaseApprovalScope(() => now), token = scope.approve(approval())!
    now += 300000
    expect(scope.consume(token, binding())).toBeUndefined()
    now -= 1
    expect(scope.consume(token, binding())).toBeUndefined()
  })
  it("permits consumption immediately before its expiry", () => {
    let now = 0
    const scope = createPurchaseApprovalScope(() => now), token = scope.approve(approval())!
    now = 299999.5
    expect(scope.consume(token, binding())).toBeDefined()
  })
  it.each([NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1])("refuses invalid monotonic time %s", now => {
    expect(createPurchaseApprovalScope(() => now).approve(approval())).toBeUndefined()
  })
  it("refuses a backwards/throwing clock without leaking diagnostics", () => {
    let now = 10
    const scope = createPurchaseApprovalScope(() => now), token = scope.approve(approval())!
    now = 9
    expect(scope.consume(token, binding())).toBeUndefined()
    expect(createPurchaseApprovalScope(() => { throw Error("private") }).approve(approval())).toBeUndefined()
  })
  it("close discards unused authority permanently without implying signature revocation", () => {
    const scope = createPurchaseApprovalScope(() => 0), token = scope.approve(approval())!
    scope.close(); scope.close()
    expect(scope.consume(token, binding())).toBeUndefined()
    expect(scope.approve({ ...approval(), approvalId: "new" })).toBeUndefined()
  })
  it("retains all128 tombstones without eviction even after consumption", () => {
    const scope = createPurchaseApprovalScope(() => 0)
    for (let i = 0; i < 128; i++) {
      const value = { ...approval(), approvalId: `approval_${i}`, toolCallId: `call_${i}` }
      const token = scope.approve(value)!
      expect(token).toBeDefined()
      const { context: _context, ...bound } = value
      expect(scope.consume(token, bound)).toBeDefined()
    }
    expect(scope.approve({ ...approval(), approvalId: "new", toolCallId: "new" })).toBeUndefined()
    expect(scope.approve(approval())).toBeUndefined()
  })
  it.each([
    { approvalId: "" }, { approvalId: "x".repeat(513) }, { toolCallId: "" }, { toolName: "arcade_quote" },
    { skillId: "other-skill" }, { maxAmountUsd: "$0.001" }, { maxAmountUsd: "$0" }, { maxAmountUsd: "1e3" },
    { maxAmountUsd: 1 }, { input: [] }, { context: { ...context(), rail: "test" } }, { context: undefined }, { token: "private" }
  ])("rejects unsupported approval %j without minting", mutation => {
    expect(createPurchaseApprovalScope(() => 0).approve({ ...approval(), ...mutation })).toBeUndefined()
  })
  it("supports actual Gateway domain context without relabelling the rail", () => {
    const scope = createPurchaseApprovalScope(() => 0), value = approval()
    const gateway = { ...value.context, rail: "gateway", requirements: { ...value.context.requirements,
      extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: chain.gateway.wallet } } }
    expect(scope.consume(scope.approve({ ...value, context: gateway }), binding())?.context.rail).toBe("gateway")
  })
  it("rejects hooks, symbols, exotic inputs and revoked proxies without invoking them", () => {
    let hooks = 0
    const getter = Object.defineProperty({}, "diff", { enumerable: true, get() { hooks++; return "private" } })
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic
    const revoked = Proxy.revocable({}, {}); revoked.revoke()
    const scope = createPurchaseApprovalScope(() => 0)
    for (const input of [getter, { toJSON() { hooks++; return {} } }, { [Symbol("hidden")]: 1 }, cyclic,
      new Date(), { n: NaN }, { n: Infinity }, { n: 1n }, { n: undefined }, { x: "\ud800" }, revoked.proxy]) {
      expect(() => scope.approve({ ...approval(), input })).not.toThrow()
      expect(scope.approve({ ...approval(), input })).toBeUndefined()
    }
    expect(scope.approve(Object.defineProperty(approval(), "context", { get() { hooks++; return context() } }))).toBeUndefined()
    expect(hooks).toBe(0)
    expect(scope.approve(approval())).toBeDefined()
  })
  it("bounds JSON bytes, depth and nodes while retaining exact zero/null/false values", () => {
    const scope = () => createPurchaseApprovalScope(() => 0)
    const exact = { x: "x".repeat(131064) } // eight JSON framing bytes
    expect(scope().approve({ ...approval(), input: exact })).toBeDefined()
    expect(scope().approve({ ...approval(), input: { x: exact.x + "x" } })).toBeUndefined()
    expect(scope().approve({ ...approval(), input: { x: "é".repeat(65533) } })).toBeUndefined()
    let deep: unknown = 0
    for (let i = 0; i < 34; i++) deep = { x: deep }
    expect(scope().approve({ ...approval(), input: deep })).toBeUndefined()
    expect(scope().approve({ ...approval(), input: { x: Array(16385).fill(0) } })).toBeUndefined()
    const s = scope(), bound = { ...binding(), input: { z: 0, n: null, f: false } }
    expect(s.consume(s.approve({ ...bound, context: context() }), bound)?.inputJson).toBe('{"f":false,"n":null,"z":0}')
  })
  it("has no storage, fetch, provider or server-environment dependency", () => {
    const forbidden = vi.fn(() => { throw Error("unexpected IO") })
    vi.stubGlobal("fetch", forbidden)
    vi.stubGlobal("window", Object.defineProperty({}, "localStorage", { get: forbidden }))
    vi.stubGlobal("ethereum", { request: forbidden })
    vi.stubEnv("ARCADE_NETWORK", "INVALID_UNUSED_SELECTOR")
    const scope = createPurchaseApprovalScope(() => 0)
    expect(scope.consume(scope.approve(approval()), binding())).toBeDefined()
    expect(forbidden).not.toHaveBeenCalled()
  })
  it("freshly imports despite an invalid ambient network selector", async () => {
    vi.resetModules(); vi.stubEnv("ARCADE_NETWORK", "UNUSED_APPROVAL_IMPORT_SENTINEL")
    vi.stubGlobal("__ARCADE_NETWORK__", undefined)
    try {
      const fresh = await import("../src/lib/purchase-approval.ts")
      const scope = fresh.createPurchaseApprovalScope(() => 0)
      expect(scope.consume(scope.approve(approval()), binding())).toBeDefined()
    } finally { vi.resetModules() }
  })
  it("retains the oldest unused permit when the scope reaches capacity", () => {
    const scope = createPurchaseApprovalScope(() => 0), oldest = scope.approve(approval())!
    for (let i = 2; i <= 128; i++) expect(scope.approve({ ...approval(), approvalId: `a${i}`, toolCallId: `c${i}` })).toBeDefined()
    expect(scope.approve({ ...approval(), approvalId: "overflow" })).toBeUndefined()
    expect(scope.consume(oldest, binding())).toBeDefined()
  })
  it("burns a token on accessor/revoked binding without invoking getters", () => {
    let reads = 0
    const scope = createPurchaseApprovalScope(() => 0), token = scope.approve(approval())!
    expect(scope.consume(token, Object.defineProperty(binding(), "input", { get() { reads++; return {} } }))).toBeUndefined()
    expect(scope.consume(token, binding())).toBeUndefined()
    const revoked = Proxy.revocable({}, {}); revoked.revoke()
    const other = { ...approval(), approvalId: "new" }, fresh = scope.approve(other)!
    expect(() => scope.consume(fresh, revoked.proxy)).not.toThrow()
    expect(reads).toBe(0)
  })
  it("does not conflate delimiter-containing SDK identifiers", () => {
    const scope = createPurchaseApprovalScope(() => 0)
    const a = { ...binding(), approvalId: "a\nb", toolCallId: "c" }
    const b = { ...binding(), approvalId: "a", toolCallId: "b\nc" }
    const one = scope.approve({ ...a, context: context() }), two = scope.approve({ ...b, context: context() })
    expect(one).toBeDefined(); expect(two).toBeDefined()
    expect(scope.consume(one, a)).toBeDefined(); expect(scope.consume(two, b)).toBeDefined()
  })
  it("accepts null-prototype JSON and ignores inherited toJSON without invoking it", () => {
    let hooks = 0
    const prototype = Object.getOwnPropertyDescriptor(Object.prototype, "toJSON")
    try {
      Object.defineProperty(Object.prototype, "toJSON", { configurable: true, value: () => { hooks++; return "changed" } })
      const input = Object.assign(Object.create(null), { x: [false, 0, null] })
      const scope = createPurchaseApprovalScope(() => 0), bound = { ...binding(), input }
      const result = scope.consume(scope.approve({ ...bound, context: context() }), bound)
      // Save scalar facts before assertions that may themselves inspect objects.
      const encoded = result?.inputJson, hookCount = hooks
      expect(encoded).toBe('{"x":[false,0,null]}'); expect(hookCount).toBe(0)
    } finally {
      if (prototype) Object.defineProperty(Object.prototype, "toJSON", prototype)
      else Reflect.deleteProperty(Object.prototype, "toJSON")
    }
  })
  it("enforces the exact node limit and rejects sparse or extended arrays", () => {
    const scope = () => createPurchaseApprovalScope(() => 0)
    expect(scope().approve({ ...approval(), input: { x: Array(16382).fill(0) } })).toBeDefined()
    expect(scope().approve({ ...approval(), input: { x: Array(16383).fill(0) } })).toBeUndefined()
    const sparse = Array(2); sparse[1] = 1
    const extended = Object.assign([1], { extra: "private" })
    expect(scope().approve({ ...approval(), input: { sparse } })).toBeUndefined()
    expect(scope().approve({ ...approval(), input: { extended } })).toBeUndefined()
  })
})
