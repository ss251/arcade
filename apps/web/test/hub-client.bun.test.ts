import { describe, expect, it } from "bun:test"
import { HubUnreachable, tree } from "../src/lib/hub.ts"

const ROOT = "job_abcdefghijklmnop", TOKEN = "a".repeat(32)
const PRIVATE = "PRIVATE_CHILD_JOB_OR_PROVIDER_DIAGNOSTIC"
interface ObservedRequest { readonly url: string; readonly method: string; readonly headers: Headers }
const snapshot = (request: Request): ObservedRequest => ({ url: request.url, method: request.method, headers: new Headers(request.headers) })
const body = () => ({ rootJobId: ROOT, complete: false, evidenceFlags: ["commitment-missing"],
  nodes: [{ nodeId: "0", parentNodeId: null, skillId: "usdc-flow-check", hop: 0, priceAtomic: "10000", price: "$0.01",
    settled: false, reason: "not settled", latencyMs: 0, explorer: null, jobId: PRIVATE, buyer: PRIVATE }] })

/** Only these test-owned loopback listeners exist; no hub, wallet, provider or child is started. */
const fixture = async (work: (a: string, b: string, seen: { a: ObservedRequest[]; b: ObservedRequest[] }, mode: { value: "ok" | "redirect" | "oversize" | "unknown" }) => Promise<void>) => {
  const seen = { a: [] as ObservedRequest[], b: [] as ObservedRequest[] }, mode = { value: "ok" as "ok" | "redirect" | "oversize" | "unknown" }
  const b = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: req => { seen.b.push(snapshot(req)); return Response.json(body()) } })
  let a: ReturnType<typeof Bun.serve> | undefined
  const previous = process.env["ARCADE_HUB"]
  try {
    a = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: req => {
      seen.a.push(snapshot(req))
      if (mode.value === "redirect") return new Response(null, { status: 302, headers: { location: `${b.url.origin}/trees/${ROOT}` } })
      if (mode.value === "oversize") return Response.json({ ...body(), ignored: "x".repeat(131_072) })
      if (mode.value === "unknown") return Response.json({ error: PRIVATE }, { status: 404 })
      return Response.json(body())
    } })
    process.env["ARCADE_HUB"] = a.url.origin
    await work(a.url.origin, b.url.origin, seen, mode)
  } finally {
    if (previous === undefined) delete process.env["ARCADE_HUB"]; else process.env["ARCADE_HUB"] = previous
    const origins = [a?.url.origin, b.url.origin].filter((v): v is string => v !== undefined)
    await a?.stop(true); await b.stop(true)
    for (const origin of origins) {
      // Rejection after owned stop is cleanup evidence, not a sent-signal assertion.
      await expect(fetch(origin, { redirect: "error", credentials: "omit", signal: AbortSignal.timeout(500) })).rejects.toThrow()
    }
  }
}

describe("H4 actual owned HTTP capability boundary", () => {
  it("sends one header-only capability and receives only the decoded public tree", async () => {
    await fixture(async (a, _b, seen) => {
      const result = await tree(ROOT, TOKEN)
      expect(seen.a).toHaveLength(1); expect(seen.b).toHaveLength(0)
      const request = seen.a[0]!
      expect(request.url).toBe(`${a}/trees/${ROOT}`)
      expect(request.method).toBe("GET")
      expect(request.headers.get("x-job-token")).toBe(TOKEN)
      expect(request.headers.get("referer")).toBeNull()
      expect(request.headers.get("cookie")).toBeNull()
      expect(request.headers.get("payment-signature")).toBeNull()
      expect(JSON.stringify(result)).not.toContain(PRIVATE)
      expect(JSON.stringify(result)).not.toContain(TOKEN)
      expect(result.complete).toBe(false)
    })
  })
  it("does not deliver the capability to a second owned origin on redirect", async () => {
    await fixture(async (_a, _b, seen, mode) => {
      mode.value = "redirect"
      await expect(tree(ROOT, TOKEN)).rejects.toThrow(HubUnreachable)
      expect(seen.a).toHaveLength(1); expect(seen.b).toHaveLength(0)
    })
  })
  it("bounds actual response bytes and maps unknown capability responses to fixed unavailability", async () => {
    await fixture(async (_a, _b, seen, mode) => {
      mode.value = "oversize"
      await expect(tree(ROOT, TOKEN)).rejects.toThrow(HubUnreachable)
      mode.value = "unknown"
      const result = await tree(ROOT, TOKEN).then(() => "unexpected success", error => String(error))
      expect(result).toContain("request unavailable or invalid")
      expect(result).not.toContain(PRIVATE); expect(result).not.toContain(TOKEN)
      expect(seen.a).toHaveLength(2); expect(seen.b).toHaveLength(0)
    })
  })
})
