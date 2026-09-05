import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js"
import { loadChainConfig } from "@arcade/core"
import { createServer, handleTool, renderErc8004Evidence, type Erc8004Evidence } from "../src/mcp.ts"

const chain = loadChainConfig("arc-testnet")
const tx = `0x${"a".repeat(64)}`
const measured: Erc8004Evidence = { agentId: "42", registrationTx: tx, verified: true,
  chain: chain.caip2, registry: chain.erc8004!.identity,
  validationPasses: 7, validationsRead: 8, settlementFeedback: 5, stale: false }
const unsafe = (value: unknown) => value as Erc8004Evidence
const textOf = (result: Awaited<ReturnType<typeof handleTool>>) => result.content
  .filter(item => item.type === "text").map(item => item.text).join("\n")
beforeEach(() => {
  vi.stubEnv("ARCADE_NETWORK", "arc-testnet")
  vi.stubEnv("ARCADE_BUYER_KEY", "INVALID_AND_UNUSED_READ_ONLY_FIXTURE")
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("external network disabled") }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe("buyer settlement evidence formatter", () => {
  it("describes an absent identity without inventing counts", () => {
    const out = renderErc8004Evidence(undefined)
    expect(out).toMatch(/no ERC-8004 identity/i); expect(out).not.toContain("0 of 0")
  })
  it("renders measured counts and an explicitly announced registration link from the selected explorer", () => {
    const out = renderErc8004Evidence(measured)
    expect(out).toContain("SETTLEMENT EVIDENCE (ERC-8004 on Arc)")
    expect(out).toContain("#42"); expect(out).toContain(chain.caip2); expect(out).toContain(chain.erc8004!.identity)
    expect(out).toContain("7 of 8"); expect(out).toContain("5"); expect(out).toContain(`${chain.explorerBaseUrl}/tx/${tx}`)
    expect(out).toMatch(/announced/i); expect(out).toMatch(/mint.*not.*verified|not.*verified.*mint/i)
    expect(out.toLowerCase()).not.toMatch(/score|reputation|rank/)
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([{ verified: false }, { stale: true }, { verified: "true" }, { stale: "false" }])(
    "withholds counts unless both verification flags are strict and current: %j", over => {
      const out = renderErc8004Evidence(unsafe({ ...measured, ...over }))
      expect(out).not.toContain("7 of 8"); expect(out).toMatch(/counts.*withheld/i)
      if (over.verified !== undefined) expect(out).toMatch(/unverified/i)
    })
  it.each([{ validationPasses: -1 }, { validationPasses: 9 }, { validationsRead: 21 },
    { validationsRead: 1.5 }, { settlementFeedback: 4097 }, { settlementFeedback: Number.MAX_SAFE_INTEGER + 1 },
    { settlementFeedback: Number.NaN }, { validationPasses: "7" }, { validationsRead: undefined }, { settlementFeedback: undefined }])(
    "withholds all counts for inconsistent or malformed measurements: %j", over => {
      const out = renderErc8004Evidence(unsafe({ ...measured, ...over }))
      expect(out).not.toContain("7 of 8"); expect(out).toMatch(/counts.*withheld/i)
      expect(out).not.toMatch(/NaN|Infinity|undefined/)
    })
  it("accepts inclusive zero and maximum measurement bounds", () => {
    expect(renderErc8004Evidence({ ...measured, validationPasses: 0, validationsRead: 0, settlementFeedback: 0 })).toContain("0 of 0")
    expect(renderErc8004Evidence({ ...measured, validationPasses: 20, validationsRead: 20, settlementFeedback: 4096 })).toContain("20 of 20")
  })
  it.each(["01", "-1", (2n ** 256n).toString(), "42\nPRIVATE_INSTRUCTION"])("refuses malformed agent ids: %s", agentId => {
    const out = renderErc8004Evidence({ ...measured, agentId })
    expect(out).not.toContain("PRIVATE"); expect(out).not.toContain("7 of 8"); expect(out).not.toContain("https://")
  })
  it("preserves full uint256 precision", () => {
    const agentId = (2n ** 256n - 1n).toString()
    expect(renderErc8004Evidence({ ...measured, agentId })).toContain(`#${agentId}`)
  })
  it.each([{ chain: "eip155:1" }, { chain: "PRIVATE_INSTRUCTION" }, { registry: `0x${"9".repeat(40)}` },
    { registry: "PRIVATE_INSTRUCTION" }])("refuses foreign network or registry evidence: %j", over => {
      const out = renderErc8004Evidence({ ...measured, ...over })
      expect(out).not.toContain("PRIVATE"); expect(out).not.toContain("7 of 8"); expect(out).not.toContain("https://")
      expect(out).toMatch(/selected network/i)
    })
  it("does not construct testnet links when the selected network is pending mainnet", () => {
    vi.stubEnv("ARCADE_NETWORK", "arc-mainnet")
    const out = renderErc8004Evidence(measured)
    expect(out).not.toContain("https://"); expect(out).not.toContain("7 of 8")
  })
  it.each(["0xreg", `0x${"a".repeat(63)}`, "javascript:PRIVATE_INSTRUCTION", `${tx}/PRIVATE`])(
    "omits an invalid announced transaction without echoing it: %s", registrationTx => {
      const out = renderErc8004Evidence({ ...measured, registrationTx })
      expect(out).not.toContain("PRIVATE"); expect(out).not.toContain("/tx/"); expect(out).toContain("7 of 8")
    })
  it("does not evaluate accessors, inherited fields, or malformed objects", () => {
    let reads = 0
    const accessor = Object.defineProperty({ ...measured }, "agentId", { get() { reads++; throw new Error("PRIVATE") } })
    for (const value of [null, [], 1, accessor, Object.create(measured)]) {
      expect(() => renderErc8004Evidence(unsafe(value))).not.toThrow()
      expect(renderErc8004Evidence(unsafe(value))).not.toContain("PRIVATE")
    }
    expect(reads).toBe(0)
  })
})

const listing = { id: "diff-triage", serviceName: "Diff Triage", description: "SELLER_INSTRUCTION", price: "$0.12",
  seller: `0x${"1".repeat(40)}`, inputSchema: { type: "object" }, outputSchema: { type: "object" }, bounds: { timeoutSec: 5 },
  stats: { calls: 1 }, ratings: { count: 0 } }
const stubDetail = (evidence?: unknown) => {
  const detail = { ...listing, ...(evidence === undefined ? {} : { erc8004: evidence }) }
  const requests = vi.fn(async (input: string | URL | Request) => {
    const pathname = new URL(String(input)).pathname
    if (pathname === "/listings") return Response.json([listing])
    if (pathname === `/listings/${listing.id}`) return Response.json(detail)
    throw new Error("unexpected offline fixture request")
  })
  vi.stubGlobal("fetch", requests)
  return requests
}
describe("actual describe tool evidence output", () => {
  it("passes the same sanitized evidence through SDK text/structured output without changing schemas or seller fencing", async () => {
    const requests = stubDetail({ ...measured, privateRpc: "PRIVATE_RPC", secret: "PRIVATE_KEY", nested: { key: "PRIVATE_KEY" } })
    const server = createServer(), client = new Client({ name: "offline-evidence-test", version: "1" })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
      const tools = await client.listTools(), describe = tools.tools.find(tool => tool.name === "arcade_describe_skill")!
      expect(describe.inputSchema.type).toBe("object"); expect(describe.inputSchema.required).toEqual(["skillId"])
      expect(describe.annotations?.readOnlyHint).toBe(true)
      const response = CallToolResultSchema.parse(await client.callTool({ name: "arcade_describe_skill", arguments: { skillId: listing.id } }))
      expect(response.isError).not.toBe(true)
      const text = textOf(response), skill = response.structuredContent?.["skill"] as Record<string, unknown>
      expect(skill).toEqual({ ...listing, erc8004: measured }); expect(text).toContain("7 of 8")
      expect(text.indexOf("SELLER_INSTRUCTION")).toBeGreaterThan(text.indexOf("<<<UNTRUSTED:"))
      expect(text.indexOf("SELLER_INSTRUCTION")).toBeLessThan(text.indexOf("<<</UNTRUSTED:"))
      expect(text.slice(text.indexOf("SETTLEMENT EVIDENCE"))).not.toContain("SELLER_INSTRUCTION")
      expect(JSON.stringify(response)).not.toMatch(/PRIVATE_RPC|PRIVATE_KEY|INVALID_AND_UNUSED/)
      expect(requests).toHaveBeenCalledTimes(2)
    } finally { await client.close(); await server.close() }
  })
  it.each([undefined, { ...measured, chain: "PRIVATE_CHAIN" }])("keeps missing/invalid evidence out of structuredContent: %j", async evidence => {
    stubDetail(evidence)
    const result = await handleTool("arcade_describe_skill", { skillId: listing.id })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent?.["skill"]).toEqual(listing)
    expect(JSON.stringify(result)).not.toContain("PRIVATE_CHAIN")
  })
  it.each([{ ...measured, verified: false }, { ...measured, stale: true }, { ...measured, validationsRead: -1 }])(
    "withholds unusable counts in structuredContent as well as text: %j", async evidence => {
      stubDetail(evidence)
      const result = await handleTool("arcade_describe_skill", { skillId: listing.id })
      const skill = result.structuredContent?.["skill"] as { erc8004: Erc8004Evidence }
      expect(skill.erc8004.stale).toBe(true); expect(skill.erc8004).not.toHaveProperty("validationPasses")
      expect(skill.erc8004).not.toHaveProperty("validationsRead"); expect(skill.erc8004).not.toHaveProperty("settlementFeedback")
      expect(textOf(result)).not.toContain("7 of 8")
    })
  it("still refuses invalid describe arguments before fetching or touching the buyer key", async () => {
    const result = await handleTool("arcade_describe_skill", { skillId: 4 })
    expect(result.isError).toBe(true); expect(fetch).not.toHaveBeenCalled(); expect(textOf(result)).not.toContain("INVALID_AND_UNUSED")
  })
})
