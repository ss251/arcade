import { loadChainConfig } from "@arcade/core"

// This preload is used only by isolated identity CLI subprocess tests. Any unexpected
// HTTP request fails locally; it can never fall through to a real RPC or hub.
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input) !== "https://hub.example/erc8004" || init?.redirect !== "error") throw new Error("unexpected offline request")
  const marker = process.env["ARCADE_IDENTITY_FETCH_MARKER"]
  if (marker) await Bun.write(marker, "fetch")
  const mode = process.env["ARCADE_IDENTITY_TEST_MODE"]
  const chain = loadChainConfig("arc-testnet")
  const doc = { armed: true, caip2: chain.caip2, registries: chain.erc8004,
    operator: `0x${"22".repeat(20)}`, validator: `0x${"33".repeat(20)}`, attester: `0x${"44".repeat(20)}` }
  if (mode === "http-error") return new Response("PRIVATE_BODY", { status: 500 })
  if (mode === "redirect") return new Response("PRIVATE_BODY", { status: 302, headers: { location: "https://elsewhere.example" } })
  if (mode === "malformed") return new Response("PRIVATE_BODY")
  if (mode === "oversized") return new Response("x".repeat(65_537))
  if (mode === "unarmed") return Response.json({ armed: false })
  if (mode === "wrong-chain") return Response.json({ ...doc, caip2: "eip155:1" })
  if (mode === "invalid-role") return Response.json({ ...doc, attester: "0x1" })
  return Response.json(doc)
}) as typeof fetch
