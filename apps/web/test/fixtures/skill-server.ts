// Owned actual Start/H4 fixture. Synthetic public facts only; no provider or payment authority.
import { createServer as createHttpServer, type ServerResponse } from "node:http"
import { createServer, type ViteDevServer } from "vite"
import chain from "../../../../config/chains/arc-testnet.json"

const seller = `0x${"1".repeat(40)}`, otherSeller = `0x${"2".repeat(40)}`
const tx = `0x${"a".repeat(64)}`, payTx = `0x${"b".repeat(64)}`, registrationTx = `0x${"c".repeat(64)}`
const privateJob = "job_PRIVATECANARY0000000000000001", privateHistory = "job_PRIVATEHISTORY00000000000001"
const modes = new Set(["ok", "detail-down", "receipts-down", "both-down", "empty-receipts", "absent-history",
  "empty-history", "unknown-evidence", "zero-evidence", "stale-evidence", "unverified-evidence", "ens-ok",
  "ens-expired", "ens-down", "ens-seller-mismatch", "ens-skill-mismatch", "redirect", "long",
  "graph-ready", "graph-zero", "graph-invalid", "graph-long"])
let mode = "ok", reads = { detail: 0, receipts: 0, names: 0, other: 0 }
let closing = false, web: ViteDevServer | undefined, startup: Promise<void> | undefined, closeWork: Promise<void> | undefined
let hubOrigin = ""
const parentPid = process.ppid
const json = (res: ServerResponse, value: unknown, status = 200) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" })
  res.end(JSON.stringify(value))
}
function detail() {
  const atMs = Date.now() - 7_200_000
  return {
    id: "diff-triage", version: "0.1.0", serviceName: mode === "long" ? "D".repeat(32) : "Diff Triage", seller,
    price: mode === "long" ? "$115792089237316195423570985008687907853269984665640564039457584007913129.639935" : "$0.12", tags: ["code"],
    description: mode === "long" ? "word".repeat(125) : "Reviews <script>SCHEMA_ESCAPE_PROBE</script> safely.",
    inputSchema: { type: "object", properties: { diff: { type: "string", description: mode === "long"
      ? "bounded-schema-line-".repeat(200) : "<img src=x onerror=SCHEMA_ESCAPE_PROBE>" } } },
    outputSchema: { type: "object", properties: { verdict: { type: "string" } } },
    bounds: { timeoutSec: 60, maxTokens: 4096 }, ratings: { count: 0, average: null }, delisted: false,
    payTested: { atMs, jobId: privateJob, ok: true, settleTx: payTx, secret: "PRIVATE_PAYTEST_EXTRA" },
    ...(mode === "absent-history" ? {} : { payTestHistory: mode === "empty-history" ? [] : [
      { atMs, jobId: privateHistory, ok: false, token: "PRIVATE_HISTORY_TOKEN" },
      { atMs, jobId: privateJob, ok: true, settleTx: payTx }
    ] }),
    ...(mode === "unknown-evidence" ? {} : { erc8004: {
      chain: chain.caip2, registry: chain.erc8004.identity, agentId: "42", registrationTx,
      verified: mode !== "unverified-evidence", stale: mode === "stale-evidence",
      validationPasses: mode === "zero-evidence" ? 0 : 2, validationsRead: mode === "zero-evidence" ? 0 : 3,
      settlementFeedback: mode === "zero-evidence" ? 0 : 7, private: "PRIVATE_IDENTITY_EXTRA"
    } }),
    ...(mode.startsWith("ens-") ? { ensName: "triage.arcade.eth", ensExpired: false } : {}),
    ...(mode.startsWith("graph-") ? { graph: {
      agentId: mode === "graph-invalid" ? "PRIVATE_GRAPH" : mode === "graph-long" ? `5042002:${(1n << 256n) - 1n}` : "5042002:7",
      settlementCount: mode === "graph-zero" ? 0 : mode === "graph-long" ? Number.MAX_SAFE_INTEGER : 11,
      feedbackCount: mode === "graph-zero" ? 0 : 5, validationPassCount: mode === "graph-zero" ? 0 : 4,
      indexedBlock: 99, privateUrl: "PRIVATE_GRAPH"
    } } : {}),
    engine: "PRIVATE_ENGINE", secrets: "PRIVATE_SECRET", jobToken: "PRIVATE_LISTING_TOKEN"
  }
}
function receipts() {
  const root = {
    skillId: "diff-triage", skillVersion: "0.1.0", seller, rail: "eip3009", network: chain.caip2,
    priceAtomic: "120000", sellerAtomic: "114000", feeAtomic: "6000", feeBps: 500,
    price: "$0.12", sellerShare: "$0.114", fee: "$0.006", settled: true, reason: "ok", latencyMs: 123,
    createdAtMs: 1_700_000_000_001, hop: 0, settleTx: tx, settleRefKind: "onchain",
    explorer: `${chain.explorerBaseUrl}/tx/${tx}`, session: true, canary: true,
    // Actual public descendants are flat; no root/parent/hop coordinate may be invented from this list.
    children: ["recorded-child", "recorded-grandchild"].map((skillId, i) => ({
      skillId, priceAtomic: "10000", price: "$0.01", settled: true, explorer: null,
      jobId: `job_PRIVATECHILD000000000000000${i}`, parentJobId: "PRIVATE_PARENT", token: "PRIVATE_CHILD_TOKEN"
    })),
    jobId: "job_PRIVATEROOT00000000000000001", sessionId: "ses_PRIVATESESSION", output: "PRIVATE_OUTPUT"
  }
  return [root, { ...root, rail: "gateway", settleRefKind: "gateway-transfer", canary: false,
    settleTx: "11111111-2222-3333-4444-555555555555", explorer: null, createdAtMs: 1_700_000_000_000,
    sellerAtomic: "120000", feeAtomic: "0", feeBps: 0, sellerShare: "$0.12", fee: "$0.00", children: [] }]
}
const hub = createHttpServer((req, res) => {
  if (closing) { res.destroy(); return }
  const url = new URL(req.url ?? "/", "http://127.0.0.1")
  if (req.method !== "GET") { reads.other++; json(res, {}, 405); return }
  if (url.pathname === "/__fixture") {
    const next = url.searchParams.get("mode")
    if ([...url.searchParams.keys()].some(key => key !== "mode") || url.searchParams.getAll("mode").length > 1 ||
        next !== null && !modes.has(next)) { json(res, {}, 400); return }
    if (next !== null) { mode = next; reads = { detail: 0, receipts: 0, names: 0, other: 0 } }
    json(res, { mode, reads }); return
  }
  if (url.pathname === "/listings/diff-triage" && url.search === "") {
    reads.detail++
    if (mode === "detail-down" || mode === "both-down") { json(res, { error: "PRIVATE_HUB_DIAGNOSTIC" }, 503); return }
    if (mode === "redirect") { res.writeHead(302, { location: "https://example.invalid/PRIVATE_REDIRECT" }); res.end(); return }
    json(res, detail()); return
  }
  if (url.pathname === "/listings/diff-triage/receipts" && url.search === "?limit=20") {
    reads.receipts++
    if (mode === "receipts-down" || mode === "both-down") { json(res, { error: "PRIVATE_RECEIPTS_DIAGNOSTIC" }, 503); return }
    json(res, mode === "empty-receipts" ? [] : receipts()); return
  }
  if (url.pathname === "/names/triage.arcade.eth" && url.search === "") {
    reads.names++
    if (mode === "ens-expired") { json(res, { error: "ens_name_expired", secret: "PRIVATE_ENS_EXTRA" }, 404); return }
    if (mode === "ens-down") { json(res, { error: "PRIVATE_ENS_DIAGNOSTIC" }, 503); return }
    const resolvedSeller = mode === "ens-seller-mismatch" ? otherSeller : seller
    const skillId = mode === "ens-skill-mismatch" ? "different-skill" : "diff-triage"
    json(res, { name: "triage.arcade.eth", skillId, seller: resolvedSeller,
      endpoint: `${hubOrigin}/x/${resolvedSeller}/${skillId}`, payTo: seller, chain: chain.caip2,
      priceAtomic: "120000", expired: false, jobToken: "PRIVATE_NAME_TOKEN" }); return
  }
  // A malformed producer returns the wrong detail id for the requested ENS target.
  if (mode === "ens-skill-mismatch" && url.pathname === "/listings/different-skill" && url.search === "") {
    reads.detail++; json(res, detail()); return
  }
  if (mode === "ens-skill-mismatch" && url.pathname === "/listings/different-skill/receipts" && url.search === "?limit=20") {
    reads.receipts++; json(res, []); return
  }
  reads.other++; json(res, {}, 404)
})
hub.requestTimeout = 5000; hub.headersTimeout = 5000; hub.keepAliveTimeout = 500
hub.on("connection", socket => { socket.setTimeout(5000, () => socket.destroy()); if (closing) socket.destroy() })

// The fence is installed before starting Vite; redirects are denied even if a caller forgets the option.
const nativeFetch = globalThis.fetch
globalThis.fetch = Object.assign(((input: string | URL | Request, init?: RequestInit) => {
  try {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = init?.method ?? (input instanceof Request ? input.method : "GET")
    if (closing || !hubOrigin || url.origin !== hubOrigin || url.username || url.password || url.hash ||
        method !== "GET" || !/^\/(?:listings\/(?:diff-triage|different-skill)(?:\/receipts)?|names\/triage\.arcade\.eth)$/.test(url.pathname)) {
      reads.other++; return Promise.reject(Error("Owned fixture request refused"))
    }
    return nativeFetch(input, { ...init, redirect: "error", credentials: "omit" })
  } catch { reads.other++; return Promise.reject(Error("Owned fixture request refused")) }
}) as typeof fetch, { preconnect() { reads.other++; throw Error("Owned fixture preconnect refused") } })

const hard = setTimeout(() => { void close(1) }, 300_000)
const parentWatch = setInterval(() => { if (process.ppid !== parentPid) void close(1) }, 1000)
function close(code: number): Promise<void> {
  if (closeWork !== undefined) return closeWork
  closing = true
  // Also bounds an uncooperative startup/close. The owning test independently awaits process exit and both ports.
  const fuse = setTimeout(() => process.exit(1), 2500)
  closeWork = (async () => {
    await startup?.catch(() => {})
    let exitCode = code
    try { await web?.close() } catch { exitCode = 1 } finally {
      hub.closeAllConnections()
      await new Promise<void>(resolve => hub.close(() => resolve()))
      clearTimeout(hard); clearInterval(parentWatch); clearTimeout(fuse)
      process.exit(exitCode)
    }
  })()
  return closeWork
}
process.once("SIGTERM", () => { void close(0) }); process.once("SIGINT", () => { void close(0) })
startup = (async () => {
  await new Promise<void>((resolve, reject) => { hub.once("error", reject); hub.listen(0, "127.0.0.1", resolve) })
  const h = hub.address(); if (!h || typeof h === "string") throw Error("Owned fixture startup failed")
  hubOrigin = `http://127.0.0.1:${h.port}`
  process.env["ARCADE_HUB"] = hubOrigin
  if (closing) return
  const priorTermListeners = new Set(process.listeners("SIGTERM"))
  web = await createServer({ root: new URL("../..", import.meta.url).pathname, envDir: false,
    server: { host: "127.0.0.1", port: 0 }, clearScreen: false })
  // Installed Vite's parentSigtermCallback exits the entire process after closing only Vite.
  // This fixture also owns a hub: retire only that newly installed callback so our existing
  // handler awaits BOTH resources. Vite.close still performs its normal internal teardown.
  for (const listener of process.listeners("SIGTERM")) {
    if (!priorTermListeners.has(listener) && listener.name === "parentSigtermCallback") {
      process.off("SIGTERM", listener); process.stdin.off("end", listener)
    }
  }
  if (closing) return
  await web.listen()
  if (closing) return
  const w = web.httpServer?.address(); if (!w || typeof w === "string") throw Error("Owned fixture startup failed")
  console.log(`[h8-origins] ${JSON.stringify({ web: `http://127.0.0.1:${w.port}`, hub: hubOrigin })}`)
})()
void startup.catch(() => { console.error("Owned H8 fixture startup failed"); void close(1) })
