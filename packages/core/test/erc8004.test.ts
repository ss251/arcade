import { describe, expect, it } from "vitest"
import { getAbiItem, keccak256, toEventSelector, toFunctionSelector, toHex } from "viem"
import { JobStatus } from "../src/job.ts"
import {
  ARCADE_FEEDBACK_TAG1, ARCADE_SUPPORTED_TRUST, ARCADE_VALIDATION_TAG,
  IDENTITY_REGISTRY_ABI, REPUTATION_REGISTRY_ABI, VALIDATION_REGISTRY_ABI,
  agentRegistrationUrl, validationRequestUrl, validationResponseUrl, feedbackUrl,
  buildAgentRegistration, buildValidationRequest, buildValidationResponse, buildFeedback,
  caip10, docBytes, docHash, hashJson, type AgentRegistrationInput, type ValidationRequestInput
} from "../src/erc8004.ts"

const ORIGIN = "https://hub.example"
const SELLER = "0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF"
const REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e"
const OTHER = "0x1111111111111111111111111111111111111111"
const HASH = `0x${"a".repeat(64)}`
const TIME = 1_760_000_000_000
const registration: AgentRegistrationInput = { origin: ORIGIN, skillId: "diff-triage", serviceName: "Diff triage",
  description: "Reviews a diff", seller: SELLER, chainId: 5042002, identityRegistry: REGISTRY, active: true }
const request: ValidationRequestInput = { origin: ORIGIN, jobId: "job_abc", agentId: "42", skillId: "diff-triage",
  skillVersion: "1.0.0", input: { diff: "PRIVATE_INPUT" }, output: { verdict: "PRIVATE_OUTPUT" },
  outputSchema: { type: "object" }, status: "succeeded", stopReason: "end_turn", settled: true,
  reason: "ok", priceAtomic: 250_000n, settleTx: HASH, createdAtMs: TIME }

describe("pinned ERC-8004 ABI contract", () => {
  it("encodes register(string), ownership and operator approval exactly", () => {
    const register = getAbiItem({ abi: IDENTITY_REGISTRY_ABI, name: "register" })
    expect(register).toMatchObject({ inputs: [{ name: "agentURI", type: "string" }], outputs: [{ name: "agentId", type: "uint256" }] })
    expect(toFunctionSelector(register)).toBe(toFunctionSelector("register(string)"))
    expect(toFunctionSelector(getAbiItem({ abi: IDENTITY_REGISTRY_ABI, name: "ownerOf" }))).toBe(toFunctionSelector("ownerOf(uint256)"))
    expect(toFunctionSelector(getAbiItem({ abi: IDENTITY_REGISTRY_ABI, name: "setApprovalForAll" }))).toBe(toFunctionSelector("setApprovalForAll(address,bool)"))
    expect(getAbiItem({ abi: IDENTITY_REGISTRY_ABI, name: "isApprovedForAll" }).outputs).toEqual([{ name: "", type: "bool" }])
    expect(getAbiItem({ abi: IDENTITY_REGISTRY_ABI, name: "tokenURI" }).outputs).toEqual([{ name: "", type: "string" }])
  })
  it("pins Registered and ERC-721 Transfer topics and indexing", () => {
    const event = getAbiItem({ abi: IDENTITY_REGISTRY_ABI, name: "Registered" })
    expect(toEventSelector(event)).toBe(toEventSelector("Registered(uint256,string,address)"))
    expect(event.inputs.map(i => [i.name, i.type, i.indexed])).toEqual([
      ["agentId", "uint256", true], ["agentURI", "string", false], ["owner", "address", true]
    ])
    const transfer = getAbiItem({ abi: IDENTITY_REGISTRY_ABI, name: "Transfer" })
    expect(toEventSelector(transfer)).toBe(toEventSelector("Transfer(address,address,uint256)"))
    expect(transfer.inputs.every(i => i.indexed)).toBe(true)
  })
  it("pins signed fixed-point feedback, bounded reads and the NewFeedback event", () => {
    expect(toFunctionSelector(getAbiItem({ abi: REPUTATION_REGISTRY_ABI, name: "giveFeedback" })))
      .toBe(toFunctionSelector("giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)"))
    expect(getAbiItem({ abi: REPUTATION_REGISTRY_ABI, name: "readAllFeedback" }).outputs.map(i => i.type))
      .toEqual(["address[]", "uint64[]", "int128[]", "uint8[]", "string[]", "string[]", "bool[]"])
    expect(getAbiItem({ abi: REPUTATION_REGISTRY_ABI, name: "getLastIndex" }).outputs[0].type).toBe("uint64")
    const event = getAbiItem({ abi: REPUTATION_REGISTRY_ABI, name: "NewFeedback" })
    expect(toEventSelector(event)).toBe(toEventSelector("NewFeedback(uint256,address,uint64,int128,uint8,string,string,string,string,string,bytes32)"))
    expect(event.inputs.filter(i => i.indexed).map(i => i.name)).toEqual(["agentId", "clientAddress", "indexedTag1"])
  })
  it("pins validation calls, status outputs and both indexed events", () => {
    expect(toFunctionSelector(getAbiItem({ abi: VALIDATION_REGISTRY_ABI, name: "validationRequest" })))
      .toBe(toFunctionSelector("validationRequest(address,uint256,string,bytes32)"))
    expect(toFunctionSelector(getAbiItem({ abi: VALIDATION_REGISTRY_ABI, name: "validationResponse" })))
      .toBe(toFunctionSelector("validationResponse(bytes32,uint8,string,bytes32,string)"))
    expect(getAbiItem({ abi: VALIDATION_REGISTRY_ABI, name: "getValidationStatus" }).outputs.map(i => i.type))
      .toEqual(["address", "uint256", "uint8", "bytes32", "string", "uint256"])
    expect(getAbiItem({ abi: VALIDATION_REGISTRY_ABI, name: "getAgentValidations" }).outputs[0].type).toBe("bytes32[]")
    const req = getAbiItem({ abi: VALIDATION_REGISTRY_ABI, name: "ValidationRequest" })
    const res = getAbiItem({ abi: VALIDATION_REGISTRY_ABI, name: "ValidationResponse" })
    expect(toEventSelector(req)).toBe(toEventSelector("ValidationRequest(address,uint256,string,bytes32)"))
    expect(toEventSelector(res)).toBe(toEventSelector("ValidationResponse(address,uint256,bytes32,uint8,string,bytes32,string)"))
    for (const event of [req, res]) expect(event.inputs.filter(i => i.indexed).map(i => i.name))
      .toEqual(["validatorAddress", "agentId", "requestHash"])
  })
  it("does not expose unfiltered summary aggregation", () => {
    for (const abi of [REPUTATION_REGISTRY_ABI, VALIDATION_REGISTRY_ABI]) expect(abi.some(i => String(i.name) === "getSummary")).toBe(false)
  })
})

describe("public document URIs", () => {
  it("uses the actual routes and normalizes trailing origin slashes", () => {
    expect(agentRegistrationUrl(`${ORIGIN}///`, "diff-triage")).toBe(`${ORIGIN}/listings/diff-triage/agent-registration.json`)
    expect(validationRequestUrl(ORIGIN, "job_abc")).toBe(`${ORIGIN}/receipts/job_abc/validation-request.json`)
    expect(validationResponseUrl(ORIGIN, "job_abc")).toBe(`${ORIGIN}/receipts/job_abc/validation-response.json`)
    expect(feedbackUrl(ORIGIN, "job_abc")).toBe(`${ORIGIN}/receipts/job_abc/feedback.json`)
    expect(feedbackUrl("http://127.0.0.1:8787/", "job_abc")).toContain("http://127.0.0.1:8787/receipts/")
  })
  it.each(["", "javascript:alert(1)", "ftp://host", "https://PRIVATE_KEY@host", `${ORIGIN}/private`, `${ORIGIN}?secret=PRIVATE_KEY`, `${ORIGIN}#PRIVATE_KEY`])(
    "rejects unsafe or non-origin URL input", origin => {
      expect(() => feedbackUrl(origin, "job_abc")).toThrow()
      try { feedbackUrl(origin, "job_abc") } catch (e) { expect(String(e)).not.toContain("PRIVATE_KEY") }
    }
  )
  it.each(["", ".", "..", "../PRIVATE", "a/b", "a\\b", "%2fPRIVATE", "x?y", "x#y", "x\nPRIVATE"])(
    "refuses path traversal or delimiter-bearing identifiers", id => {
      for (const url of [agentRegistrationUrl, validationRequestUrl, validationResponseUrl, feedbackUrl]) expect(() => url(ORIGIN, id)).toThrow()
    }
  )
  it("validates CAIP-10 chain and EVM address fields without changing address case", () => {
    expect(caip10(5042002, SELLER)).toBe(`eip155:5042002:${SELLER}`)
    for (const chain of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(() => caip10(chain, SELLER)).toThrow()
    for (const addr of ["PRIVATE_ADDRESS", `${SELLER} `, "0x1234"]) expect(() => caip10(5042002, addr)).toThrow()
  })
})

describe("registration metadata", () => {
  it("uses the current registration-v1 fields plus backwards-compatible aliases, without fake MCP or image URLs", () => {
    const doc = buildAgentRegistration(registration)
    expect(doc.type).toBe("https://eips.ethereum.org/EIPS/eip-8004#registration-v1")
    expect(doc.active).toBe(true); expect(doc.x402Support).toBe(true)
    expect(doc.services).toEqual(doc.endpoints)
    expect(doc.services.map(e => e.name)).toEqual(["x402", "openapi", "web"])
    expect(doc.services.map(e => e.endpoint)).toEqual([`${ORIGIN}/x/${SELLER}/diff-triage`, `${ORIGIN}/openapi.json`, `${ORIGIN}/skill/diff-triage`])
    expect(doc.supportedTrust).toEqual([ARCADE_SUPPORTED_TRUST]); expect(doc.supportedTrusts).toEqual(doc.supportedTrust)
    expect(doc.registrations).toEqual([])
    expect(docBytes(doc)).not.toMatch(/\/mcp|"image"/)
  })
  it("adds only a known minted agent id and keeps uint256 precision", () => {
    const agentId = ((1n << 256n) - 1n).toString()
    expect(buildAgentRegistration({ ...registration, agentId }).registrations)
      .toEqual([{ agentId, agentRegistry: caip10(5042002, REGISTRY) }])
    for (const agentId of ["", "-1", "1.2", "PRIVATE_ID", (1n << 256n).toString()])
      expect(() => buildAgentRegistration({ ...registration, agentId })).toThrow()
  })
  it("retains rebuilding input non-enumerably and never exposes extra caller fields", () => {
    const input = { ...registration, ens: "diff.example.eth", private: "PRIVATE_INPUT" }
    const doc = buildAgentRegistration(input)
    expect(doc.input).toBe(input)
    expect(Object.getOwnPropertyDescriptor(doc, "input")?.enumerable).toBe(false)
    expect(doc.ens).toBe(input.ens)
    expect(docBytes(doc)).not.toContain("PRIVATE_INPUT")
    expect("ens" in buildAgentRegistration({ ...doc.input, ens: undefined })).toBe(false)
  })
})

describe("strict JSON commitments", () => {
  it("hashes exactly compact served bytes, preserving JSON property order and escaping", () => {
    const doc = buildAgentRegistration(registration)
    expect(docBytes(doc)).toBe(JSON.stringify(doc))
    expect(docHash(doc)).toBe(keccak256(toHex(docBytes(doc))))
    const data = JSON.parse('{"__proto__":{"x":1},"text":"a\\n雪","array":[false,null,1.25]}')
    expect(docBytes(data)).toBe(JSON.stringify(data))
    expect(docHash(data)).toBe(hashJson(data))
    expect(hashJson({ a: 1, b: 2 })).not.toBe(hashJson({ b: 2, a: 1 }))
  })
  it("intentionally treats only a top-level absent private payload as JSON null", () => {
    expect(hashJson(undefined)).toBe(hashJson(null))
    expect(() => docBytes(undefined)).toThrow()
    expect(() => hashJson({ absent: undefined })).toThrow()
    expect(() => hashJson([undefined])).toThrow()
  })
  it.each([NaN, Infinity, -Infinity, 1n, Symbol("PRIVATE"), () => "PRIVATE", new Date(), new Map(), new Set(), new Uint8Array([1])])(
    "rejects non-JSON values instead of losing their content", value => { expect(() => hashJson(value)).toThrow() }
  )
  it("never invokes toJSON, own getters or inherited serialization methods", () => {
    let calls = 0
    const callable = { toJSON() { calls++; return "PRIVATE" } }
    const getter = Object.defineProperty({}, "secret", { enumerable: true, get() { calls++; return "PRIVATE" } })
    const getterToJson = Object.defineProperty({}, "toJSON", { enumerable: true, get() { calls++; return () => "PRIVATE" } })
    const inherited = Object.create({ toJSON() { calls++; return "PRIVATE" } })
    const hiddenToJson = Object.defineProperty({}, "toJSON", { value() { calls++; return "PRIVATE" } })
    for (const value of [callable, getter, getterToJson, inherited, hiddenToJson]) expect(() => hashJson(value)).toThrow()
    expect(calls).toBe(0)
  })
  it("bounds array traversal before enumerating its keys and rejects oversized bytes", () => {
    let enumerated = false
    const huge = new Proxy(Array(100_001), { ownKeys() { enumerated = true; throw new Error("PRIVATE") } })
    expect(() => hashJson(huge)).toThrow()
    expect(enumerated).toBe(false)
    expect(() => docBytes("x".repeat(8_388_609))).toThrow()
    expect(() => docBytes("\n".repeat(4_194_305))).toThrow()
  })
  it("rejects sparse/extended arrays, symbol keys, cycles and hostile depth without raw values in errors", () => {
    const sparse = Array(1), extended = Object.assign([1], { extra: "PRIVATE" })
    const cyclic: Record<string, unknown> = { secret: "PRIVATE" }; cyclic["cycle"] = cyclic
    let deep: unknown = null; for (let n = 0; n < 100; n++) deep = { child: deep }
    for (const value of [sparse, extended, { [Symbol("PRIVATE")]: true }, cyclic, deep, Array(100_001).fill(null)]) {
      expect(() => hashJson(value)).toThrow()
      try { hashJson(value) } catch (error) { expect(String(error)).not.toContain("PRIVATE") }
    }
  })
  it("allows repeated non-cyclic references without mutating them", () => {
    const shared = Object.freeze({ value: 1 }), value = Object.freeze([shared, shared])
    expect(docBytes(value)).toBe('[{"value":1},{"value":1}]')
  })
})

describe("validation and feedback documents", () => {
  it("can represent every current job status, including all non-settling outcomes", () => {
    for (const status of JobStatus.literals) {
      const doc = buildValidationRequest({ ...request, status, settled: false, settleTx: undefined })
      expect(doc.outcome).toMatchObject({ status, settled: false, reason: "not settled" })
    }
  })
  it("publishes hashes only, not private input, output, schema or arbitrary provider diagnostics", () => {
    const doc = buildValidationRequest({ ...request, reason: "PRIVATE_REASON", stopReason: "PRIVATE_STOP_REASON" })
    const flat = docBytes(doc)
    expect(flat).not.toMatch(/PRIVATE|verdict|"diff"/)
    expect(doc.inputHash).toBe(hashJson(request.input)); expect(doc.outputHash).toBe(hashJson(request.output))
    expect(doc.outputSchemaHash).toBe(hashJson(request.outputSchema))
    expect(doc.priceAtomic).toBe("250000"); expect(doc.createdAt).toBe("2025-10-09T08:53:20.000Z")
    expect(doc.receipt).toBe(`${ORIGIN}/jobs/job_abc/result`)
    expect(doc.outcome).toEqual({ status: "succeeded", stopReason: null, settled: true, reason: "ok" })
  })
  it("preserves known stop classifications and gives binary settlement responses under one tag", () => {
    expect(buildValidationRequest(request).outcome.stopReason).toBe("end_turn")
    for (const settled of [false, true]) {
      const doc = buildValidationResponse({ jobId: "job_abc", requestHash: HASH, settled, reason: "PRIVATE_REASON", decidedAtMs: TIME })
      expect(doc.response).toBe(settled ? 100 : 0); expect(doc.tag).toBe(ARCADE_VALIDATION_TAG)
      expect(doc.reason).toBe(settled ? "ok" : "not settled"); expect(docBytes(doc)).not.toContain("PRIVATE_REASON")
    }
  })
  it("rejects misleading typed boundary values and malformed hashes", () => {
    for (const over of [{ agentId: "-1" }, { status: "PRIVATE_STATUS" }, { priceAtomic: -1n },
      { createdAtMs: NaN }, { settleTx: "PRIVATE_HASH" }]) expect(() => buildValidationRequest({ ...request, ...over })).toThrow()
    expect(() => buildValidationResponse({ jobId: "job_abc", requestHash: "PRIVATE_HASH", settled: false, reason: "x", decidedAtMs: TIME })).toThrow()
  })
  it("carries the actual payment destination and chain in proofOfPayment without private job contents", () => {
    const doc = buildFeedback({ origin: ORIGIN, jobId: "job_abc", agentId: "42", skillId: "diff-triage", seller: SELLER,
      buyer: OTHER, payTo: REGISTRY, settleTx: HASH, chainId: 5042002, identityRegistry: REGISTRY, attester: OTHER, createdAtMs: TIME })
    expect(doc).toMatchObject({ agentId: "42", agentRegistry: caip10(5042002, REGISTRY), clientAddress: caip10(5042002, OTHER),
      value: 1, valueDecimals: 0, tag1: ARCADE_FEEDBACK_TAG1, tag2: "diff-triage", endpoint: `${ORIGIN}/x/${SELLER}/diff-triage` })
    expect(doc.proofOfPayment).toEqual({ fromAddress: OTHER, toAddress: REGISTRY, chainId: "5042002", txHash: HASH })
  })
})
