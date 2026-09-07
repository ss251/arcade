import { describe, expect, it } from "vitest"
import { Effect, Schema } from "effect"
import { decodeHubMessage, decodeRunnerMessage, encodeHubMessage, encodeRunnerMessage, helloDigest } from "../src/protocol.ts"
import { EscrowBudgetRequest, EscrowSubmitRequest, EscrowBudgetSigned, EscrowSubmitSigned,
  EscrowAuthorizationRefused } from "../src/escrow-protocol.ts"
const address = (n: number) => "0x" + n.toString(16).padStart(40, "0")
const hash = (n: number) => "0x" + n.toString(16).padStart(64, "0")
const context = { call: { chainId: 5042002, escrow: address(10), hook: address(4), evaluator: address(3),
  token: "0x3600000000000000000000000000000000000000", provider: address(2), providerAgentId: "8", amount: "300000",
  resource: "https://example.test/x/seller/skill", method: "POST", skillId: "skill", skillVersion: "1.0.0", inputHash: hash(99), timeoutSeconds: 60 },
  jobId: "7", client: address(1), expiredAt: 2000, requestHash: hash(88), treasury: address(5) }
const budget = { _tag: "EscrowBudgetRequest", requestId: hash(1), context }
const submit = { _tag: "EscrowSubmitRequest", requestId: hash(2), context, hubJobId: "job_" + "a".repeat(32), outputHash: hash(9) }
const signed = { _tag: "EscrowBudgetSigned", requestId: hash(1), escrow: address(10), jobId: "7", nonce: "2", deadline: "1600", signature: "0x" + "ab".repeat(65) }
describe("strict escrow-only socket contracts; legacy messages unchanged", () => {
  it("roundtrips budget/submit and both signed replies through the existing unions", async () => {
    expect(await Effect.runPromise(decodeHubMessage(budget))).toEqual(Schema.decodeUnknownSync(EscrowBudgetRequest)(budget))
    expect(await Effect.runPromise(decodeHubMessage(submit))).toEqual(Schema.decodeUnknownSync(EscrowSubmitRequest)(submit))
    expect(await Effect.runPromise(decodeRunnerMessage(signed))).toEqual(Schema.decodeUnknownSync(EscrowBudgetSigned)(signed))
    const s = { ...signed, _tag: "EscrowSubmitSigned", requestId: hash(2) }
    expect(await Effect.runPromise(decodeRunnerMessage(s))).toEqual(Schema.decodeUnknownSync(EscrowSubmitSigned)(s))
    const refused = { _tag: "EscrowAuthorizationRefused", requestId: hash(2), operation: "submit", reason: "authorization_refused" }
    expect(await Effect.runPromise(decodeRunnerMessage(refused))).toEqual(Schema.decodeUnknownSync(EscrowAuthorizationRefused)(refused))
  })
  it("does not let a root decoder silently strip unknown escrow secrets or routing fields", async () => {
    for (const value of [{ ...budget, capability: hash(5) }, { ...budget, context: { ...context, payer: address(9) } },
      { ...budget, context: { ...context, call: { ...context.call, signature: "private" } } }]) {
      expect((await Effect.runPromise(Effect.either(decodeHubMessage(value))))._tag).toBe("Left")
    }
    expect((await Effect.runPromise(Effect.either(decodeRunnerMessage({ ...signed, privateKey: "private" }))))._tag).toBe("Left")
  })
  it.each(["", "01", "-1", "1e3", "9".repeat(79), (1n << 256n).toString()])("rejects malformed job/amount integers %s", value => {
    for (const c of [{ ...context, jobId: value }, { ...context, call: { ...context.call, amount: value } }])
      expect(() => Schema.decodeUnknownSync(EscrowBudgetRequest)({ ...budget, context: c })).toThrow()
  })
  it("bounds nonce, timestamps, signature, request IDs and output commitments", () => {
    for (const s of [{ ...signed, nonce: (1n << 72n).toString() }, { ...signed, nonce: "02" },
      { ...signed, deadline: "0" }, { ...signed, signature: "0x12" }, { ...signed, requestId: hash(0) }])
      expect(() => Schema.decodeUnknownSync(EscrowBudgetSigned)(s)).toThrow()
    for (const s of [{ ...submit, outputHash: hash(0) }, { ...submit, hubJobId: "unknown" },
      { ...submit, context: { ...context, expiredAt: 2 ** 48 } }])
      expect(() => Schema.decodeUnknownSync(EscrowSubmitRequest)(s)).toThrow()
  })
  it("refuses getters and non-JSON objects without executing them", () => {
    let read = false
    const poisoned = { ...budget, context: { ...context, call: { ...context.call } } }
    Object.defineProperty(poisoned.context.call, "amount", { enumerable: true, get() { read = true; return "300000" } })
    expect(() => Schema.decodeUnknownSync(EscrowBudgetRequest)(poisoned)).toThrow(); expect(read).toBe(false)
    expect(() => Schema.decodeUnknownSync(EscrowBudgetRequest)({ ...budget, context: new Date() })).toThrow()
  })
  it("retains Hello v2 and legacy tolerant decoding", async () => {
    expect(await Effect.runPromise(decodeHubMessage({ _tag: "Ping", atMs: 1, ignored: true }))).toMatchObject({ _tag: "Ping", atMs: 1 })
    expect(helloDigest({ runnerId: "r", seller: address(2), nonce: "n", skillIds: ["s"] }))
      .toBe(["arcade-runner-hello", "v2", "r", address(2), "n", "s", "none"].join("\n"))
  })
  it("encodes new messages without precision loss through existing union encoders", async () => {
    const value = { ...budget, context: { ...context, jobId: ((1n << 256n) - 1n).toString() } }
    expect(await Effect.runPromise(encodeHubMessage(await Effect.runPromise(decodeHubMessage(value))))).toEqual(value)
    const reply = { ...signed, nonce: ((1n << 72n) - 1n).toString() }
    expect(await Effect.runPromise(encodeRunnerMessage(await Effect.runPromise(decodeRunnerMessage(reply))))).toEqual(reply)
  })
  it("enforces UTF8 bounds, canonical addresses, fixed token/chain, no cycles or arrays", () => {
    for (const update of [{ resource: "x".repeat(2049) }, { resource: "💥".repeat(513) }, { skillId: "x\n" },
      { chainId: 1 }, { token: address(6) }, { provider: address(0) }, { escrow: "0x" + "AA".repeat(20) },
      { timeoutSeconds: 901 }, { amount: 300000n }]) {
      expect(() => Schema.decodeUnknownSync(EscrowBudgetRequest)({ ...budget, context: { ...context, call: { ...context.call, ...update } } })).toThrow()
    }
    const cycle: Record<string, unknown> = {}; cycle["self"] = cycle
    for (const c of [[], cycle, { ...context, extra: "x".repeat(16385) }])
      expect(() => Schema.decodeUnknownSync(EscrowBudgetRequest)({ ...budget, context: c })).toThrow()
    expect(() => Schema.decodeUnknownSync(EscrowAuthorizationRefused)({ _tag: "EscrowAuthorizationRefused", requestId: hash(1),
      operation: "budget", reason: "private-provider-error" })).toThrow()
  })
})
