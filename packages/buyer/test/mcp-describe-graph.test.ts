import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js"
import * as mcp from "../src/mcp.ts"

const evidence = { agentId: "5042002:7", settlementCount: 11, feedbackCount: 5, validationPassCount: 4 }
const listing = { id: "diff-triage", serviceName: "Diff Triage", description: "SELLER_COPY",
  price: "$0.12", seller: `0x${"1".repeat(40)}`, inputSchema: {}, outputSchema: {}, bounds: { timeoutSec: 5 },
  stats: { calls: 1 }, ratings: { count: 0 } }
const textOf = (result: Awaited<ReturnType<typeof mcp.handleTool>>) => result.content
  .filter(item => item.type === "text").map(item => item.text).join("\n")
beforeEach(() => { vi.stubEnv("ARCADE_NETWORK", "arc-testnet"); vi.stubEnv("ARCADE_BUYER_KEY", "INVALID_UNUSED_GRAPH_FIXTURE") })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })
const stub = (graph: unknown) => {
  const requests = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    expect(init?.method ?? "GET").toBe("GET")
    const path = new URL(String(input)).pathname
    if (path === "/listings") return Response.json([listing])
    if (path === "/listings/diff-triage") return Response.json({ ...listing, ...(graph === undefined ? {} : { graph }) })
    throw Error("Unexpected offline request")
  })
  vi.stubGlobal("fetch", requests); return requests
}
describe("G9 actual MCP describe contract", () => {
  it("rejects mismatched detail identity before attributing indexed evidence", async () => {
    const requests = stub(evidence)
    requests.mockImplementation(async (input: string | URL | Request) => new URL(String(input)).pathname === "/listings"
      ? Response.json([listing]) : Response.json({ ...listing, id: "different-skill", graph: evidence }))
    const response = await mcp.handleTool("arcade_describe_skill", { skillId: listing.id })
    expect(response.isError).toBe(true)
    expect(response.structuredContent).toBeUndefined()
    expect(textOf(response)).not.toMatch(/11 settlements|different-skill|Graph index/)
    expect(requests).toHaveBeenCalledTimes(2)
  })
  it("uses one qualified line and exactly four fields through the actual SDK without disturbing seller fencing", async () => {
    const requests = stub({ ...evidence, privateUrl: "PRIVATE_GRAPH", nested: { secret: "PRIVATE_GRAPH" } })
    const server = mcp.createServer(), client = new Client({ name: "offline-graph-description", version: "1" })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
      const response = CallToolResultSchema.parse(await client.callTool({ name: "arcade_describe_skill", arguments: { skillId: listing.id } }))
      expect(response.isError).not.toBe(true)
      const text = textOf(response)
      expect(text).toContain("Hub-reported Graph index"); expect(text).toContain("11 settlements")
      expect(text).toContain("5 feedback entries"); expect(text).toContain("4 validations passed")
      expect(text).toContain("not independently verified"); expect(text).toContain("not proven payment-backed")
      expect(text).not.toContain("settlement-backed feedback")
      expect(response.structuredContent?.["skill"]).toEqual({ ...listing, graph: evidence })
      expect(JSON.stringify(response)).not.toMatch(/PRIVATE_GRAPH|INVALID_UNUSED/)
      expect(text.indexOf("SELLER_COPY")).toBeGreaterThan(text.indexOf("<<<UNTRUSTED:"))
      expect(text.indexOf("SELLER_COPY")).toBeLessThan(text.indexOf("<<</UNTRUSTED:"))
      expect(text.indexOf("Hub-reported Graph index")).toBeGreaterThan(text.indexOf("<<</UNTRUSTED:"))
      expect(text).toContain("MEASURED STATS"); expect(text).toContain("SETTLEMENT EVIDENCE")
      expect(requests).toHaveBeenCalledTimes(2)
    } finally { await client.close(); await server.close() }
  })
  it.each([undefined, null, { ...evidence, agentId: "PRIVATE_GRAPH" }, { ...evidence, feedbackCount: -1 }])(
    "omits absent/invalid Graph from both outputs without inventing zero", async raw => {
      const requests = stub(raw), response = await mcp.handleTool("arcade_describe_skill", { skillId: listing.id })
      expect(response.isError).not.toBe(true); expect(response.structuredContent?.["skill"]).toEqual(listing)
      expect(textOf(response)).not.toMatch(/Graph index|0 settlements|PRIVATE_GRAPH/)
      expect(requests).toHaveBeenCalledTimes(2)
    })
})
