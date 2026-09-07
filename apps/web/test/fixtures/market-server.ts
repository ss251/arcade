import { createServer as httpServer } from "node:http"
import { createServer } from "vite"
import { marketListing, marketStats } from "./market-data.ts"

let mode = "ok", reads = { listings: 0, stats: 0, other: 0 }
const modes = new Set(["ok", "empty", "stats-down", "listings-down", "both-down", "malformed-stats", "malformed-listings", "long", "rails"])
const json = (res: import("node:http").ServerResponse, body: unknown, status = 200) => {
  res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body))
}
const hub = httpServer((req, res) => {
  const url = new URL(req.url!, "http://127.0.0.1")
  if (url.pathname === "/__fixture") {
    const next = url.searchParams.get("mode")
    if (next && modes.has(next)) { mode = next; reads = { listings: 0, stats: 0, other: 0 } }
    json(res, { mode, reads }); return
  }
  if (req.method !== "GET") { reads.other++; json(res, {}, 405); return }
  if (url.pathname === "/listings") {
    reads.listings++
    if (mode === "listings-down" || mode === "both-down") { json(res, { error: "PRIVATE_HUB_DIAGNOSTIC" }, 503); return }
    if (mode === "rails") {
      json(res, [marketListing({ rails: ["erc8183", "gateway", "eip3009"] }),
        marketListing({ id: "exact-skill", serviceName: "Exact Skill", rails: ["eip3009"] }),
        marketListing({ id: "legacy-skill", serviceName: "Legacy Skill" })]); return
    }
    json(res, mode === "empty" ? [] : mode === "malformed-listings" ? [{ ...marketListing(), seller: "INVALID_PRIVATE_SELLER" }] : [marketListing(mode === "long"
      ? { ensName: `${"a".repeat(63)}.${"b".repeat(63)}.arcade.eth`, price: "$999999999999999999999999.999999", description: "word".repeat(125) }
      : { payTested: { atMs: Date.now() - 7_200_000, jobId: "", ok: true } })]); return
  }
  if (url.pathname === "/stats") {
    reads.stats++
    if (mode === "stats-down" || mode === "both-down") { json(res, { error: "PRIVATE_HUB_DIAGNOSTIC" }, 503); return }
    json(res, mode === "empty" ? marketStats({ listings: 0, sellers: 0, calls: 0, settled: 0, trees: 0, volume: "$0.00", volumeAtomic: "0", fees: "$0.00", feesAtomic: "0" })
      : mode === "malformed-stats" ? { ...marketStats(), volume: "$999.00" } : marketStats()); return
  }
  reads.other++; json(res, {}, 404)
})
await new Promise<void>(resolve => hub.listen(0, "127.0.0.1", resolve))
const h = hub.address(); if (!h || typeof h === "string") throw Error("fixture failed")
const hubOrigin = `http://127.0.0.1:${h.port}`
process.env["ARCADE_HUB"] = hubOrigin
const nativeFetch = globalThis.fetch
globalThis.fetch = Object.assign(((input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (url.origin !== hubOrigin) return Promise.reject(Error("Offline fixture request refused"))
  return nativeFetch(input, init)
}) as typeof fetch, { preconnect() { throw Error("Offline fixture preconnect refused") } })
const web = await createServer({ root: new URL("../..", import.meta.url).pathname, envDir: false,
  server: { host: "127.0.0.1", port: 0 }, clearScreen: false })
await web.listen()
const w = web.httpServer!.address(); if (!w || typeof w === "string") throw Error("fixture failed")
console.log(`[h6-origins] ${JSON.stringify({ web: `http://127.0.0.1:${w.port}`, hub: hubOrigin })}`)
let closing = false
const hard = setTimeout(() => process.exit(1), 300_000)
async function close() { if (closing) return; closing = true; await web.close(); hub.closeAllConnections();
  await new Promise<void>(resolve => hub.close(() => resolve())); clearTimeout(hard); process.exit(0) }
process.once("SIGTERM", () => { void close() }); process.once("SIGINT", () => { void close() })
