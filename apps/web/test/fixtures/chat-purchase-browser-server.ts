// Explicit loopback-only synthetic model/hub. Runs only when invoked, TTL + parent guard.
// Real SDK framing, keyless quote/ENS derivation, production CORS and offline recovery.
// No actual hub rail execution, chain RPC, owner key, payment, or production configuration.
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { recoverTypedDataAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { makeBrowserCors } from "../../../hub/src/browser-cors.ts"
import { EIP712_DOMAIN, TRANSFER_TYPES } from "../../../../packages/payments/src/eip3009.ts"
import { gatewayDomain } from "../../../../packages/payments/src/gateway-sign.ts"
import { PaymentRequirements } from "../../../../packages/payments/src/types.ts"
import chain from "../../../../config/chains/arc-testnet.json"
import { handleQuote } from "../../src/routes/api.quote.ts"
import { handleSettle } from "../../src/routes/api.settle.ts"
import { deriveSigningRequest } from "../../src/lib/purchase.ts"

const SELLER = `0x${"3".repeat(40)}`, ID = "diff-triage", NAME = ID + ".seller.arcade.eth"
const account = privateKeyToAccount(`0x${"01".repeat(32)}`) // PUBLIC offline fixture, never fund.
const resource = "/x/" + SELLER + "/" + ID, jobs = new Map<string, { token: string; receipt: Record<string, unknown> }>()
let mode = "normal", rail = "eip3009", calls = 0, paid = 0, quotes = 0, results = 0, preflights = 0, recoveries = 0
let privateInModel = false, paymentAtWeb = false, wrongOrigin = false, leakedUrl = false
const privateValues: string[] = [], events: { method: string; path: string; headers: string[] }[] = []
let policy: ReturnType<typeof makeBrowserCors> | undefined
const requirements = () => ({ scheme: "exact" as const, network: chain.caip2, amount: "10000", asset: chain.usdc.address,
  payTo: SELLER, resource: hub.url.origin + resource, maxTimeoutSeconds: chain.gateway.minValiditySeconds,
  extra: rail === "gateway" ? { name: "GatewayWalletBatched", version: "1", verifyingContract: chain.gateway.wallet } : { name: "USDC", version: "2" } })
const hub = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req): Promise<Response> {
  const url = new URL(req.url), headers = req.headers
  if (url.search) leakedUrl = true
  if (headers.has("origin") && headers.get("origin") !== web.url.origin) wrongOrigin = true
  if (req.method === "OPTIONS") preflights++
  events.push({ method: req.method, path: url.pathname, headers: ["payment-signature", "x-payment", "x-job-token", "cookie", "authorization", "referer"].filter(h => headers.has(h)) })
  const next = async (): Promise<Response> => {
    if (url.pathname === "/listings/" + ID) return Response.json({ id: ID, seller: SELLER, ensName: NAME,
      version: "1.0.0", serviceName: "Fixture diff triage", description: "Offline fixture", tags: [],
      price: "$0.01", inputSchema: {}, outputSchema: {}, bounds: { timeoutSec: 30 } })
    if (url.pathname === "/names/" + NAME) return Response.json({ name: NAME, skillId: ID, seller: SELLER,
      endpoint: hub.url.origin + resource, payTo: SELLER, chain: chain.caip2, expired: false })
    if (url.pathname === resource && req.method === "POST") {
      const input = await req.json() as { diff?: unknown }
      if (input.diff !== "native fixture input") return Response.json({ error: "wrong_fixture_input" }, { status: 400 })
      const encoded = headers.get("payment-signature")
      if (!encoded) { quotes++; return Response.json({ x402Version: 2, rail, accepts: [requirements()] }, { status: 402 }) }
      paid++
      const payment = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"))
      if (JSON.stringify(payment.accepted) !== JSON.stringify(requirements())) throw Error("Wrong fixture requirements")
      const authorization = payment.payload.authorization
      const domain = rail === "gateway" ? gatewayDomain(PaymentRequirements.make(requirements())) : EIP712_DOMAIN
      const recovered = await recoverTypedDataAddress({ domain, types: TRANSFER_TYPES, primaryType: "TransferWithAuthorization",
        message: { ...authorization, value: BigInt(authorization.value), validAfter: BigInt(authorization.validAfter), validBefore: BigInt(authorization.validBefore) },
        signature: payment.payload.signature })
      if (recovered !== account.address || authorization.to !== SELLER || authorization.value !== "10000") throw Error("Wrong fixture signer")
      recoveries++
      const job = "job_" + crypto.randomUUID().replaceAll("-", ""), token = crypto.randomUUID().replaceAll("-", "")
      privateValues.push(token, payment.payload.signature, authorization.nonce)
      const receipt = { jobId: job, skillId: ID, skillVersion: "1.0.0", buyer: account.address, seller: SELLER,
        priceAtomic: "10000", sellerAtomic: "9500", feeAtomic: "500", feeBps: 500, rail, network: chain.caip2,
        settled: true, settleTx: rail === "gateway" ? crypto.randomUUID() : `0x${"5".repeat(64)}`,
        authorizationNonce: authorization.nonce, latencyMs: 10, createdAtMs: Date.now(), reason: "synthetic fixture" }
      jobs.set(job, { token, receipt })
      return Response.json({ job_id: job, job_token: token, status: "queued", price: "$0.01",
        poll_url: "https://never-follow.invalid/?token=UNTRUSTED" }, { status: 202 })
    }
    const result = /^\/jobs\/(job_[a-z0-9]+)\/result$/.exec(url.pathname)
    if (result) {
      results++
      const job = jobs.get(result[1]!)
      if (!job || headers.get("x-job-token") !== job.token) return Response.json({ error: "denied" }, { status: 403 })
      return Response.json({ job_id: result[1], status: "succeeded", receipt: job.receipt,
        result: { report: "PRIVATE_PAID_RESULT <img src=x onerror=bad>", note: "Synthetic receipt; no chain payment." } })
    }
    return new Response("Not found", { status: 404 })
  }
  try { return policy ? await policy.handle(req, next) : new Response("Starting", { status: 503 }) }
  catch { return Response.json({ error: "fixture_refused" }, { status: 500 }) }
} })
process.env["ARCADE_HUB"] = hub.url.origin
const entry = fileURLToPath(new URL("./chat-purchase-browser.tsx", import.meta.url))
const built = await Bun.build({ entrypoints: [entry], target: "browser", minify: false,
  plugins: [{ name: "fixture-raw-svg", setup(build) {
    build.onResolve({ filter: /\.svg\?raw$/ }, args => ({ path: resolve(dirname(args.importer), args.path.slice(0, -4)), namespace: "raw-svg" }))
    build.onLoad({ filter: /.*/, namespace: "raw-svg" }, async args => ({ contents: "export default " + JSON.stringify(await Bun.file(args.path).text()), loader: "js" }))
  } }], define: { "process.env": JSON.stringify({ NODE_ENV: "development", ARCADE_NETWORK: "arc-testnet" }) } })
if (!built.success || built.outputs.length !== 1) { hub.stop(true); throw Error("Fixture build unavailable") }
const code = await built.outputs[0]!.text(), css = await Bun.file(fileURLToPath(new URL("../../src/styles.css", import.meta.url))).text()
const html = '<!doctype html><html data-hub="' + hub.url.origin + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/diagnostics.js"></script><script type="module" src="/fixture.js"></script></body></html>'
const web = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req): Promise<Response> {
  const path = new URL(req.url).pathname
  if (req.headers.has("payment-signature") || req.headers.has("x-job-token")) paymentAtWeb = true
  if (path === "/diagnostics.js") return new Response('window.__fixtureErrors=[];addEventListener("error",e=>window.__fixtureErrors.push(String(e.message).slice(0,500)));addEventListener("unhandledrejection",e=>window.__fixtureErrors.push(String(e.reason).slice(0,500)));', { headers: { "content-type": "text/javascript" } })
  if (path === "/api/quote" && req.method === "POST") return handleQuote({ request: req })
  if (path === "/api/settle") return handleSettle({ request: req })
  if (path === "/fixture-stats") return Response.json({ calls, paid, quotes, results, preflights, recoveries, privateInModel, paymentAtWeb, wrongOrigin, leakedUrl, events })
  if (path === "/fixture-control" && req.method === "POST") {
    const value = await req.json() as { mode: string; rail: string }
    if (!["normal", "mismatch", "preliminary", "hold-signature", "sdk-error"].includes(value.mode) || !["eip3009", "gateway"].includes(value.rail)) return new Response(null, { status: 400 })
    mode = value.mode; rail = value.rail; return new Response(null, { status: 204 })
  }
  if (path === "/api/chat" && req.method === "POST") {
    const text = await req.text()
    if (privateValues.some(v => text.includes(v)) || text.includes("PRIVATE_PAID_RESULT")) privateInModel = true
    const body = JSON.parse(text), last = body.messages.at(-1), responded = last?.role === "assistant"
      ? last.parts.find((p: { state?: string }) => p.state === "approval-responded") : undefined
    const chunks: object[] = []
    if (responded) {
      if (mode === "sdk-error") return Response.json({ error: "PRIVATE_FIXTURE_DIAGNOSTIC" }, { status: 500 })
      chunks.push({ type: "start", messageId: last.id })
      if (responded.approval.approved) {
        const derived = await deriveSigningRequest({ ...responded.input, input: JSON.parse(responded.input.input), toolCallId: responded.toolCallId })
        chunks.push({ type: "tool-output-available", toolCallId: responded.toolCallId, preliminary: mode === "preliminary",
          output: { ...derived, awaitingSignature: true, toolCallId: mode === "mismatch" ? "wrong_call" : responded.toolCallId,
            payTo: "UNTRUSTED_OUTPUT_PAYEE", amountAtomic: "999999" } })
        // Genuine SDK duplicate output chunk; no second local permit exists.
        chunks.push(chunks.at(-1)!)
      } else chunks.push({ type: "tool-output-denied", toolCallId: responded.toolCallId })
    } else {
      calls++; const call = "fixture_call_" + calls
      chunks.push({ type: "start", messageId: "fixture_message_" + calls }, { type: "start-step" },
        { type: "tool-input-available", toolCallId: call, toolName: "arcade_call_skill",
          input: { skillId: ID, maxAmountUsd: "$0.02", input: '{"diff":"native fixture input"}' } },
        { type: "tool-approval-request", toolCallId: call, approvalId: "approval_" + call })
    }
    chunks.push({ type: "finish-step" }, { type: "finish", finishReason: responded ? "stop" : "tool-calls" })
    return new Response(chunks.map(c => "data: " + JSON.stringify(c) + "\n\n").join("") + "data: [DONE]\n\n",
      { headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1", "cache-control": "no-store" } })
  }
  const selected = req.method === "GET" ? path === "/" ? [html, "text/html"] : path === "/fixture.js" ? [code, "text/javascript"]
    : path === "/styles.css" ? [css, "text/css"] : undefined : undefined
  return new Response(selected?.[0] ?? "Not found", { status: selected ? 200 : 404, headers: {
    "content-type": selected?.[1] ?? "text/plain", "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' " + hub.url.origin + "; base-uri 'none'; frame-ancestors 'none'"
  } })
} })
policy = makeBrowserCors(web.url.origin, hub.url.origin)
const parent = process.ppid
const stop = () => { clearTimeout(fuse); clearInterval(watch); web.stop(true); hub.stop(true); process.exit(0) }
const fuse = setTimeout(stop, 180000), watch = setInterval(() => { if (process.ppid !== parent) stop() }, 500)
process.once("SIGTERM", stop); process.once("SIGINT", stop)
console.log("[chat-origin] " + JSON.stringify({ web: web.url.origin, hub: hub.url.origin }))
