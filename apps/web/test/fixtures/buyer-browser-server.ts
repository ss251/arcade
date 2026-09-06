// Two owned loopback origins, real CORS/readers, simulated receipts only. TTL + parent guard.
import { fileURLToPath } from "node:url"
import { makeBrowserCors } from "../../../hub/src/browser-cors.ts"

let mode = "normal", reads = 0, trees = 0, preflights = 0, posts = 0, capabilityAtWeb = false, leakedUrl = false, ambientHeaders = false
const releases = new Set<() => void>(), token = "b".repeat(32)
let policy: ReturnType<typeof makeBrowserCors> | undefined
const hub = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req): Promise<Response> {
  const url = new URL(req.url)
  if (url.search) leakedUrl = true
  if (["referer", "cookie", "authorization", "payment-signature"].some(h => req.headers.has(h))) ambientHeaders = true
  if (req.method === "OPTIONS") preflights++
  if (req.method === "POST") posts++
  const next = async () => {
    const result = /^\/jobs\/(job_([45])\2{31})\/result$/.exec(url.pathname)
    const tree = /^\/trees\/(job_([45])\2{31})$/.exec(url.pathname)
    const match = result ?? tree
    if (req.method !== "GET" || !match || req.headers.get("x-job-token") !== token) return Response.json({ error: "denied" }, { status: 403 })
    const id = match[1]!, skillId = match[2] === "4" ? "diff-triage" : "flow-check", selectedMode = mode
    if (result) reads++; else trees++
    if (selectedMode === "hold") await new Promise<void>(resolve => {
      const done = () => { releases.delete(done); req.signal.removeEventListener("abort", done); resolve() }
      releases.add(done); req.signal.addEventListener("abort", done, { once: true }); if (req.signal.aborted) done()
    })
    if (selectedMode === "fail") return Response.json({ error: "PRIVATE_FIXTURE_DIAGNOSTIC" }, { status: 503 })
    if (tree) return Response.json({ rootJobId: id, complete: false, evidenceFlags: ["commitment-missing"], nodes: [
      { nodeId: "0", parentNodeId: null, skillId, priceAtomic: "10000", price: "$0.01", settled: false, reason: "runner_lost", latencyMs: 1, hop: 0, explorer: null }
    ] })
    if (selectedMode === "pending") return Response.json({ job_id: id, status: "pending" }, { status: 202 })
    return Response.json({ job_id: id, status: "succeeded", result: { report: "RECOVERED_FIXTURE_RESULT <img src=x onerror=bad>",
      detail: "Synthetic receipt, no chain payment. ".repeat(60) }, receipt: {
      jobId: id, skillId, priceAtomic: selectedMode === "bad-price" ? "20000" : "10000", sellerAtomic: "9500", feeAtomic: "500", feeBps: 500,
      settled: true, rail: selectedMode === "gateway" ? "gateway" : "eip3009", network: "eip155:5042002",
      settleRefKind: selectedMode === "gateway" ? "gateway-transfer" : "onchain",
      settleTx: selectedMode === "gateway" ? "12345678-1234-4234-8234-123456789abc" : `0x${"c".repeat(64)}`
    } })
  }
  try { return policy ? await policy.handle(req, next) : new Response(null, { status: 503 }) }
  catch { return Response.json({ error: "fixture_unavailable" }, { status: 503 }) }
} })
const built = await Bun.build({ entrypoints: [fileURLToPath(new URL("./buyer-browser.tsx", import.meta.url))], target: "browser",
  define: { "process.env": JSON.stringify({ NODE_ENV: "development", ARCADE_NETWORK: "arc-testnet" }) } })
if (!built.success || built.outputs.length !== 1) { hub.stop(true); throw Error("Fixture build unavailable") }
const code = await built.outputs[0]!.text(), css = await Bun.file(fileURLToPath(new URL("../../src/styles.css", import.meta.url))).text()
const html = '<!doctype html><html data-hub="' + hub.url.origin + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>'
const web = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req): Promise<Response> {
  const url = new URL(req.url)
  if (url.search.includes(token) || ["x-job-token", "payment-signature"].some(h => req.headers.has(h))) capabilityAtWeb = true
  if (url.pathname === "/fixture-stats") return Response.json({ reads, trees, preflights, posts, capabilityAtWeb, leakedUrl, ambientHeaders, held: releases.size })
  if (url.pathname === "/fixture-control" && req.method === "POST") {
    const value = await req.json() as { mode?: unknown }
    if (typeof value.mode !== "string" || !["normal", "pending", "hold", "fail", "bad-price", "gateway"].includes(value.mode)) return new Response(null, { status: 400 })
    mode = value.mode; for (const done of releases) done(); return new Response(null, { status: 204 })
  }
  const selected = req.method === "GET" ? ["/", "/buyer"].includes(url.pathname) ? [html, "text/html"]
    : url.pathname === "/fixture.js" ? [code, "text/javascript"] : url.pathname === "/styles.css" ? [css, "text/css"] : undefined : undefined
  return new Response(selected?.[0] ?? "Not found", { status: selected ? 200 : 404, headers: {
    "content-type": selected?.[1] ?? "text/plain", "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self' " + hub.url.origin + "; base-uri 'none'; frame-ancestors 'none'"
  } })
} })
policy = makeBrowserCors(web.url.origin, hub.url.origin)
const parent = process.ppid
const stop = () => { clearTimeout(fuse); clearInterval(watch); for (const done of releases) done(); web.stop(true); hub.stop(true); process.exit(0) }
const fuse = setTimeout(stop, 180000), watch = setInterval(() => { if (process.ppid !== parent) stop() }, 500)
process.once("SIGTERM", stop); process.once("SIGINT", stop)
console.log("[buyer-origin] " + JSON.stringify({ web: web.url.origin, hub: hub.url.origin }))
