import { expect, test } from "bun:test"
import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createEscrowChain } from "../src/erc8183-chain.ts"
import { createEscrowExecutor } from "../src/erc8183-executor.ts"
import { openEscrowActionJournal } from "../src/erc8183-journal.ts"
import { ESCROW_RPC_URL } from "../src/erc8183-rpc.ts"
import { rpcFixture } from "./fixtures/erc8183-rpc.ts"

test("real loopback HTTP + SQLite + coordinator proves one fake-chain budget action and restart refusal", async () => {
  const h = await rpcFixture("budget"), methods: string[] = []
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "arcade-escrow-chain-test-"))); chmodSync(dir, 0o700)
  const path = join(dir, "actions.sqlite"), journal = openEscrowActionJournal(path)
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: async request => {
    const r = await request.json() as { jsonrpc: string; id: number; method: string; params: unknown[] }
    methods.push(r.method)
    return Response.json({ jsonrpc: "2.0", id: r.id, result: h.answer(r.method, r.params) })
  } })
  // Trusted test seam bridges the fixed public destination to a real owned loopback
  // server. It does not add a configurable production RPC URL or make a live-chain claim.
  const bridge = (async (url, init) => {
    expect(url).toBe(ESCROW_RPC_URL)
    expect(init?.credentials).toBe("omit"); expect(init?.redirect).toBe("error")
    const local = await fetch(`http://127.0.0.1:${server.port}/rpc`, init)
    return new Response(local.body, { status: local.status, headers: local.headers })
  }) as typeof fetch
  const identity = { escrow: h.identity.escrow, hook: h.identity.hook, evaluator: h.identity.evaluator,
    token: h.identity.token, treasury: h.identity.treasury }
  const options = { ...h.options, fetch: bridge }
  const providerAuthorization = async () => {
    if (!("nonce" in h.f.input)) throw Error("budget fixture missing reply")
    return { nonce: h.f.input.nonce, deadline: h.f.input.deadline, signature: h.f.input.signature }
  }
  try {
    const result = await createEscrowExecutor({ ...options, ...createEscrowChain(options), identity,
      journal: journal.journal, providerAuthorization }).execute(h.f.context, { kind: "budget" })
    expect(result.kind).toBe("budget"); expect(result.txHash).toBe(h.f.signed.hash)
    expect(methods.filter(m => m === "eth_sendRawTransaction")).toHaveLength(1)
    journal.close()
    const reopened = openEscrowActionJournal(path), before = methods.length
    try {
      await expect(createEscrowExecutor({ ...options, ...createEscrowChain(options), identity,
        journal: reopened.journal, providerAuthorization }).execute(h.f.context, { kind: "budget" }))
        .rejects.toThrow("escrow_execution_refused")
      expect(methods).toHaveLength(before)
    } finally { reopened.close() }
  } finally { h.controller.abort(); journal.close(); await server.stop(true); rmSync(dir, { recursive: true, force: true }) }
})
