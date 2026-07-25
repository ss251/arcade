/**
 * Serializing, paced, retrying RPC proxy for Arc testnet.
 *
 * Why this exists: Arc's public RPC enforces an aggressive BURST limit. Individual calls
 * succeed indefinitely, but any client that fires several at once gets
 * `-32011 request limit reached` — including Circle's own `@circle-fin/x402-batching` SDK,
 * which issues balanceOf → allowance → approve → deposit back-to-back during `deposit()`.
 * The SDK exposes only an `rpcUrl`, no transport hook, so the pacing has to live behind
 * that URL. Hence a proxy.
 *
 * It does three things: run one request at a time, keep a minimum gap between them, and
 * retry the ones that still come back rate-limited.
 *
 *   bun run scripts/arc-rpc-proxy.ts &
 *   ARCADE_RPC_URL=http://localhost:8899 bun run scripts/g2c-nanopay.ts
 */

import { ARC_RPC_URL } from "@arcade/core"

const PORT = Number(process.env["ARC_PROXY_PORT"] ?? 8899)
const UPSTREAM = process.env["ARC_UPSTREAM_RPC"] ?? ARC_RPC_URL
const MIN_GAP_MS = Number(process.env["ARC_PROXY_GAP_MS"] ?? 350)
const MAX_RETRIES = 6

let chain: Promise<unknown> = Promise.resolve()
let lastAt = 0
let served = 0
let retried = 0

const isRateLimited = (text: string) => /request limit|-32011/.test(text)

/** Queue every call onto a single chain so exactly one is ever in flight. */
const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = chain.then(fn, fn) as Promise<T>
  chain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

const forward = async (body: string): Promise<Response> => {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const gap = Date.now() - lastAt
    if (gap < MIN_GAP_MS) await Bun.sleep(MIN_GAP_MS - gap)

    const res = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body
    })
    lastAt = Date.now()
    const text = await res.text()

    if (res.ok && !isRateLimited(text)) {
      served++
      return new Response(text, { headers: { "content-type": "application/json" } })
    }

    if (attempt === MAX_RETRIES) {
      return new Response(text, { status: res.status, headers: { "content-type": "application/json" } })
    }
    retried++
    await Bun.sleep(400 * 2 ** attempt)
  }
  return new Response('{"error":"unreachable"}', { status: 500 })
}

Bun.serve({
  port: PORT,
  idleTimeout: 120,
  async fetch(req) {
    if (new URL(req.url).pathname === "/stats") {
      return Response.json({ served, retried, upstream: UPSTREAM, minGapMs: MIN_GAP_MS })
    }
    const body = await req.text()
    return enqueue(() => forward(body))
  }
})

console.log(`[arc-rpc-proxy] :${PORT} -> ${UPSTREAM}`)
console.log(`[arc-rpc-proxy] serialized, ${MIN_GAP_MS}ms min gap, ${MAX_RETRIES} retries on rate limit`)
