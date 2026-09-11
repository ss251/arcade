/** Owned visual fixture: actual Start routes and runner, synthetic public test-account signatures.
 * Explicit invocation only. No environment files, external fetch, live model, or chain payment.
 */
import { createServer } from "vite"
import chain from "../../../../config/chains/arc-testnet.json"
import { marketListing, marketStats } from "./market-data.ts"
import { sellerFixture, SELLER } from "./seller-data.ts"
import { Schema } from "effect"
import { SkillManifest } from "../../../../packages/core/src/manifest.ts"
import { createPublishPreview } from "../../../../packages/runner/src/publish-preview.ts"
import { privateKeyToAccount } from "viem/accounts"
import { recoverTypedDataAddress } from "viem"
import { EIP712_DOMAIN, TRANSFER_TYPES } from "../../../../packages/payments/src/eip3009.ts"
import { deriveSigningRequest } from "../../src/lib/purchase.ts"
import { decodeTree } from "../../src/lib/hub-decode.ts"

// Public, deliberately well-known offline fixture key. Never fund this account.
const account = privateKeyToAccount(`0x${"01".repeat(32)}`)

const now = Date.now(), tx = `0x${"c".repeat(64)}`
const listings = [
  marketListing({ seller: SELLER, stats: {calls:18,settled:16,successRate:16/18,p50LatencyMs:1240,p95LatencyMs:2100}, description: "Review a pull request for bugs, security risks, and missing tests. Get a clear verdict with line-level findings.", tags: ["code", "review"], rails: ["erc8183", "eip3009", "gateway"], payTested: { atMs: now - 7_200_000, ok: true, jobId: "" } }),
  marketListing({ id: "research-brief", serviceName: "Research Brief", seller: SELLER, stats:{calls:8,settled:7,successRate:7/8,p50LatencyMs:2100,p95LatencyMs:5400}, description: "Turn a research question into a concise, sourced brief your next agent can use.", tags: ["research"], price: "$0.08", rails: ["erc8183", "eip3009"] }),
  marketListing({ id: "schema-check", serviceName: "Schema Check", seller: `0x${"4".repeat(40)}`, stats:{calls:5,settled:4,successRate:4/5,p50LatencyMs:210,p95LatencyMs:440}, description: "Validate structured data against your schema and return exact, actionable errors.", tags: ["data", "validation"], price: "$0.02", rails: ["eip3009"] }),
  marketListing({ id: "test-writer", serviceName: "Test Writer", seller: `0x${"4".repeat(40)}`, description: "Generate focused tests from a function and its intended behavior.", tags: ["code", "testing"], price: "$0.06", rails: ["erc8183", "gateway"] }),
]
const detail = { ...listings[0], inputSchema: { type: "object", properties: { diff: { type: "string", description: "Unified diff to review" } }, required: ["diff"] },
  outputSchema: { type: "object", properties: { verdict: { type: "string", enum: ["pass", "revise"] }, findings: { type: "array" } } },
  bounds: { timeoutSec: 60, maxTokens: 4096 }, ratings: { count: 0, average: null },
  payTestHistory: [{ atMs: now - 7_200_000, ok: true, jobId: "", settleTx: tx }],
  erc8004: { chain: chain.caip2, registry: chain.erc8004.identity, agentId: "42", registrationTx: tx, verified: true, stale: false, validationPasses: 12, validationsRead: 14, settlementFeedback: 27 },
  graph: { agentId: "5042002:42", settlementCount: 27, feedbackCount: 12, validationPassCount: 12, indexedBlock: 99 } }
const receipt = { skillId: "diff-triage", skillVersion: "0.1.0", seller: SELLER, rail: "eip3009", network: chain.caip2,
  priceAtomic: "120000", sellerAtomic: "114000", feeAtomic: "6000", feeBps: 500, price: "$0.12", sellerShare: "$0.114", fee: "$0.006",
  settled: true, reason: "ok", latencyMs: 1240, createdAtMs: now - 1_800_000, hop: 0, settleTx: tx, settleRefKind: "onchain",
  explorer: `${chain.explorerBaseUrl}/tx/${tx}`, session: false, canary: false,
  children: [{ skillId: "schema-check", priceAtomic: "20000", price: "$0.02", settled: true, explorer: null }] }
const preview = createPublishPreview("skills/diff-triage", Schema.decodeUnknownSync(SkillManifest)({
  id: "diff-triage", version: "0.1.0", serviceName: "Diff Triage", description: "Review a code change for risks and missing tests.", tags: ["code"], price: "$0.12",
  bounds: { timeoutSec: 60 }, inputSchema: detail.inputSchema, outputSchema: detail.outputSchema,
  engine: { adapter: "skill", credential: "api-key", entry: "SKILL.md", capabilities: [] }, secrets: [], egress: []
}))
const tree = (rootJobId: string) => ({ rootJobId, complete: true, evidenceFlags: [], treeHash: `0x${"d".repeat(64)}`, ceiling: "$0.04", committed: "$0.02", nodes: [
  { nodeId: "0", parentNodeId: null, skillId: "diff-triage", priceAtomic: "120000", price: "$0.12", settled: true, reason: "ok", latencyMs: 1240, hop: 0, settleTx: tx, explorer: receipt.explorer },
  { nodeId: "0.0", parentNodeId: "0", skillId: "schema-check", priceAtomic: "20000", price: "$0.02", settled: true, reason: "ok", latencyMs: 210, hop: 1, settleTx: tx, explorer: receipt.explorer },
  { nodeId: "0.1", parentNodeId: "0", skillId: "research-brief", priceAtomic: "10000", price: "$0.01", settled: false, reason: "validation_failed", latencyMs: 90, hop: 1, explorer: null }
] })
decodeTree(tree(`job_${"4".repeat(32)}`), `job_${"4".repeat(32)}`)
const jobs = new Map<string, {token: string; receipt: Record<string, unknown>}>()
const waiting = new Set<() => void>()
let readMode = "normal", marketMode = "normal", webOrigin = "", requests = 0, refused = 0, signatures = 0, purchases = 0, quotes = 0, modelCalls = 0, receiptReads = 0
const requirements = () => ({ scheme: "exact", network: chain.caip2, amount: "120000", asset: chain.usdc.address, payTo: SELLER,
  resource: hub.url.origin + `/x/${SELLER}/diff-triage`, maxTimeoutSeconds: 60, extra: { name: "USDC", version: "2" } })
const hub = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
  requests++
  const url = new URL(req.url), cors = { "access-control-allow-origin": webOrigin, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "x-job-token, payment-signature, content-type", "cache-control": "no-store" }
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: cors })
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors })
  if (url.pathname === "/__visual-state" && req.method === "GET") {
    const mode = url.searchParams.get("result"), market = url.searchParams.get("market")
    if (mode !== null && ["normal", "hold", "pending", "fail"].includes(mode)) {
      readMode = mode
      if (mode !== "hold") { for (const release of waiting) release(); waiting.clear() }
    }
    if (market !== null && ["normal", "empty", "fail"].includes(market)) marketMode = market
    return json({ readMode, marketMode, signatures, purchases, quotes, modelCalls, receiptReads, requests, refused, held: waiting.size })
  }
  if (url.pathname === `/x/${SELLER}/diff-triage` && req.method === "POST") {
    const encoded = req.headers.get("payment-signature")
    if (!encoded) { quotes++; return json({ x402Version: 2, rail: "eip3009", accepts: [requirements()] }, 402) }
    try {
      const payment = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")), auth = payment.payload.authorization
      if (JSON.stringify(payment.accepted) !== JSON.stringify(requirements())) throw Error()
      const recovered = await recoverTypedDataAddress({ domain: EIP712_DOMAIN, types: TRANSFER_TYPES, primaryType: "TransferWithAuthorization",
        message: { ...auth, value: BigInt(auth.value), validAfter: BigInt(auth.validAfter), validBefore: BigInt(auth.validBefore) }, signature: payment.payload.signature })
      if (recovered !== account.address || auth.to !== SELLER || auth.value !== "120000") throw Error()
      const id = "job_" + crypto.randomUUID().replaceAll("-", ""), token = crypto.randomUUID().replaceAll("-", "")
      jobs.set(id, { token, receipt: { ...receipt, jobId: id, buyer: account.address, authorizationNonce: auth.nonce, createdAtMs: Date.now() } }); purchases++
      return json({ job_id: id, job_token: token, status: "queued", price: "$0.12", poll_url: `${hub.url.origin}/jobs/${id}/result` }, 202)
    } catch { refused++; return json({ error: "fixture_signature_invalid" }, 403) }
  }
  if (req.method !== "GET") { refused++; return json({ error: "read_only" }, 405) }
  if (url.pathname === "/listings") return marketMode === "fail" ? json({ error: "fixture_unavailable" }, 503) : json(marketMode === "empty" ? [] : listings)
  if (url.pathname === "/stats") return marketMode === "fail" ? json({ error: "fixture_unavailable" }, 503) : json(marketStats())
  if (url.pathname === "/receipts") { receiptReads++; return json([receipt]) }
  if (url.pathname === "/listings/diff-triage") return json(detail)
  if (url.pathname === "/listings/diff-triage/receipts") return json([receipt, { ...receipt, createdAtMs: now - 3_600_000, settled: false, reason: "validation_failed", settleTx: undefined, explorer: null, children: [] }])
  if (url.pathname === `/sellers/${SELLER}/summary`) { const summary=sellerFixture(); return json({...summary,listings:summary.listings.map(listing=>({...listing,payTestedAtMs:now-7_200_000}))}) }
  const result = /^\/jobs\/(job_[a-z0-9]+)\/result$/.exec(url.pathname), treeRead = /^\/trees\/(job_[a-z0-9]+)$/.exec(url.pathname)
  const selected = result ?? treeRead
  if (selected) {
    const id = selected[1]!, saved = id === `job_${"4".repeat(32)}` ? { token: "b".repeat(32), receipt: { ...receipt, jobId: id } } : jobs.get(id)
    if (!saved || req.headers.get("x-job-token") !== saved.token) return json({ error: "fixture_access_denied" }, 403)
    if (readMode === "hold") await new Promise<void>(resolve => waiting.add(resolve))
    if (readMode === "fail") return json({ error: "fixture_result_unavailable" }, 503)
    if (treeRead) return json(tree(id))
    if (readMode === "pending") return json({ job_id: id, status: "pending" }, 202)
    return json({ job_id: id, status: "succeeded", result: { verdict: "pass", findings: [], summary: "No blocking issues found in this diff. Synthetic fixture result." }, receipt: saved.receipt })
  }
  refused++; return json({ error: "fixture_not_found" }, 404)
} })
process.env["ARCADE_HUB"] = hub.url.origin
process.env["ARCADE_PUBLISH_LOCAL"] = "1"
process.env["ARCADE_MODEL"] = "anthropic:claude-sonnet-4-20250514"
// Presence marker only. The local middleware below answers every /api/chat request.
process.env["ANTHROPIC_API_KEY"] = "OFFLINE_VISUAL_FIXTURE_NOT_A_KEY"
const nativeFetch = globalThis.fetch
globalThis.fetch = Object.assign(((input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (url.origin !== hub.url.origin) { refused++; return Promise.reject(Error("Offline visual fixture refuses external requests")) }
  return nativeFetch(input, { ...init, redirect: "error" })
}) as typeof fetch, { preconnect() { throw Error("Offline visual fixture refuses preconnect") } })
const previous = new Set(process.listeners("SIGTERM"))
const web = await createServer({ root: new URL("../..", import.meta.url).pathname, envDir: false,
  server: { host: "127.0.0.1", port: 0 }, clearScreen: false, plugins: [{ name: "owned-ui-visual-fixture", configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === "/api/publish-preview") {
        req.resume()
        req.once("end", () => { res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(preview)) })
        return
      }
      if (req.url !== "/api/chat" && req.url !== "/__visual-sign") return next()
      if (req.method !== "POST") { res.writeHead(405); res.end(); return }
      let body = ""
      req.on("data", chunk => { body += String(chunk); if (body.length > 131072) req.destroy() })
      req.once("end", () => { void (async () => {
        try {
          const value = JSON.parse(body)
          if (req.url === "/__visual-sign") {
            const typed = value.typedData, message = typed.message
            if (value.account !== account.address || typed.primaryType !== "TransferWithAuthorization" || Number(typed.domain.chainId) !== chain.chainId ||
              typed.domain.verifyingContract.toLowerCase() !== chain.usdc.address.toLowerCase() || message.from !== account.address || message.to !== SELLER || message.value !== "120000") throw Error()
            const signature = await account.signTypedData(typed)
            signatures++; res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify({ signature })); return
          }
          const last = value.messages.at(-1), responded = last?.role === "assistant" ? last.parts.find((part: {state?: string}) => part.state === "approval-responded") : undefined
          modelCalls++
          const chunks: object[] = []
          if (responded) {
            chunks.push({ type: "start", messageId: last.id })
            if (responded.approval.approved) {
              const output = await deriveSigningRequest({ ...responded.input, input: JSON.parse(responded.input.input), toolCallId: responded.toolCallId })
              chunks.push({ type: "tool-output-available", toolCallId: responded.toolCallId, output: { ...output, awaitingSignature: true } })
            } else chunks.push({ type: "tool-output-denied", toolCallId: responded.toolCallId })
          } else {
            chunks.push({ type: "start", messageId: "visual_assistant" }, { type: "start-step" },
              { type: "text-start", id: "intro" }, { type: "text-delta", id: "intro", delta: "Diff Triage is a good fit for this change. It reviews code for bugs, security risks, and missing tests." }, { type: "text-end", id: "intro" },
              { type: "tool-input-available", toolCallId: "visual_quote", toolName: "arcade_quote", input: { skillId: "diff-triage", input: {} } },
              { type: "tool-output-available", toolCallId: "visual_quote", output: { skillId: "diff-triage", price: "$0.12" } },
              { type: "tool-input-available", toolCallId: "visual_call", toolName: "arcade_call_skill", input: { skillId: "diff-triage", maxAmountUsd: "$0.12", input: '{"diff":"Review the pending change."}' } },
              { type: "tool-approval-request", toolCallId: "visual_call", approvalId: "visual_approval" })
          }
          chunks.push({ type: "finish-step" }, { type: "finish", finishReason: responded ? "stop" : "tool-calls" })
          res.writeHead(200, { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1", "cache-control": "no-store" })
          res.end(chunks.map(chunk => "data: " + JSON.stringify(chunk) + "\n\n").join("") + "data: [DONE]\n\n")
        } catch { res.writeHead(503, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "fixture_refused" })) }
      })()
      })
    })
  } }] })
for (const listener of process.listeners("SIGTERM")) if (!previous.has(listener) && listener.name === "parentSigtermCallback") {
  process.off("SIGTERM", listener); process.stdin.off("end", listener)
}
await web.listen()
const address = web.httpServer!.address()
if (!address || typeof address === "string") throw Error("Visual fixture listener unavailable")
webOrigin = `http://127.0.0.1:${address.port}`
const parent = process.ppid
let closing = false
async function close() {
  if (closing) return
  closing = true; clearTimeout(fuse); clearInterval(watch)
  for (const release of waiting) release(); waiting.clear()
  await web.close(); hub.stop(true)
  console.log(JSON.stringify({ event: "visual-fixture-stopped", requests, refused, signatures, purchases })); process.exit(0)
}
const fuse = setTimeout(() => { void close() }, 600_000), watch = setInterval(() => { if (process.ppid !== parent) void close() }, 500)
process.once("SIGTERM", () => { void close() }); process.once("SIGINT", () => { void close() })
console.log(JSON.stringify({ event: "visual-fixture-ready", web: webOrigin, hub: hub.url.origin, seller: SELLER, buyer: account.address, usdc: chain.usdc.address }))
