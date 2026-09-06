// Actual Start route/hydration against synthetic H2/H4 data; no live endpoint or wallet.
import { createServer as httpServer } from "node:http"
import { createServer } from "vite"
import { sellerFixture, type SellerMode } from "./seller-data.ts"

let mode = "normal", reads = 0, other = 0
const modes = new Set(["normal", "negative", "unknown-cost", "unknown-spend", "empty", "historical", "zero", "fail", "wrong-seller"])
const json = (res: import("node:http").ServerResponse, body: unknown, status = 200) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" }); res.end(JSON.stringify(body))
}
const hub = httpServer((req, res) => {
  const url = new URL(req.url!, "http://127.0.0.1"), match = /^\/sellers\/(0x[0-9a-fA-F]{40})\/summary$/.exec(url.pathname)
  if (req.method === "GET" && url.pathname === "/__seller-fixture") {
    const selected = url.searchParams.get("mode")
    if (selected !== null) { if (!modes.has(selected)) { json(res, {}, 400); return }; mode = selected; reads = 0; other = 0 }
    json(res, { mode, reads, other }); return
  }
  if (req.method !== "GET" || !match || url.search) { other++; json(res, { error: "unavailable" }, 404); return }
  reads++
  if (mode === "fail") { json(res, { error: "PRIVATE_FIXTURE_DIAGNOSTIC" }, 503); return }
  const summary = sellerFixture(mode === "wrong-seller" ? "normal" : mode as SellerMode, match[1]!)
  json(res, mode === "wrong-seller" ? { ...summary, seller: `0x${"7".repeat(40)}` } : summary)
})
await new Promise<void>(resolve => hub.listen(0, "127.0.0.1", resolve))
const h = hub.address(); if (!h || typeof h === "string") throw Error("Fixture unavailable")
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
const w = web.httpServer!.address(); if (!w || typeof w === "string") throw Error("Fixture unavailable")
console.log(`[seller-origins] ${JSON.stringify({ web: `http://127.0.0.1:${w.port}`, hub: hubOrigin })}`)
let closing = false
const parent = process.ppid
async function close() {
  if (closing) return
  closing = true; clearTimeout(fuse); clearInterval(watch); await web.close(); hub.closeAllConnections()
  await new Promise<void>(resolve => hub.close(() => resolve())); process.exit(0)
}
const fuse = setTimeout(() => { void close() }, 180000), watch = setInterval(() => { if (process.ppid !== parent) void close() }, 500)
process.once("SIGTERM", () => { void close() }); process.once("SIGINT", () => { void close() })
