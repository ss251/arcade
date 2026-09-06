import { expect, test } from "bun:test"
import { readGatewayBalance } from "../src/gateway-balance.ts"

test("bounded availability reader consumes a real owned HTTP body without paid headers or retries", async () => {
  const account = `0x${"a".repeat(40)}`, requests: Array<{ method: string; headers: Headers; body: unknown }> = [], selectedUrls: string[] = []
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    requests.push({ method: request.method, headers: new Headers(request.headers), body: await request.json() })
    return Response.json({ token: "USDC", balances: [{ depositor: account, domain: 26, balance: "0.010000", pendingBatch: "1.000000" }] })
  } })
  const url = `http://127.0.0.1:${server.port}`
  // Test-only transport maps the fixed provider request to an owned loopback
  // listener and projects the response stream. This is not a Circle live proof.
  const transport: typeof fetch = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    selectedUrls.push(String(input))
    const incoming = await fetch(url, init)
    return new Response(incoming.body, { status: incoming.status, headers: incoming.headers })
  }, { preconnect() { throw Error("No preconnect") } })
  try {
    expect(await readGatewayBalance(account, { fetch: transport })).toBe(10000n)
    expect(selectedUrls).toEqual(["https://gateway-api-testnet.circle.com/v1/balances"])
    expect(requests).toHaveLength(1)
    const request = requests[0]!
    expect(request.method).toBe("POST")
    expect(request.body).toEqual({ token: "USDC", sources: [{ depositor: account, domain: 26 }] })
    for (const header of ["authorization", "cookie", "payment-signature", "x-payment", "x-hire-capability"]) expect(request.headers.has(header)).toBe(false)
  } finally {
    await server.stop(true)
    await expect(fetch(url, { signal: AbortSignal.timeout(1000) })).rejects.toThrow()
  }
})
