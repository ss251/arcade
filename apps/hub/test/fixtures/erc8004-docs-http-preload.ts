// Seeds an actual durable store, then runs the unchanged production router offline.
import { Effect } from "effect"
import { keccak256, toHex } from "viem"
import { buildValidationRequest, buildValidationResponse, buildFeedback, docHash, docBytes, loadChainConfig } from "@arcade/core"
import { openSqliteStore } from "../../src/store-sqlite.ts"
import type { Erc8004DocKind } from "../../src/store.ts"
if (process.env["TEST_SEED_DOCS"] === "1") {
  const opened = openSqliteStore(process.env["ARCADE_DB"]!, "offline-seed")
  const common = { jobId: "job_http_documents", agentId: "42", skillId: "offline-docs", skillVersion: "1.0.0",
    seller: `0x${"1".repeat(40)}`, buyer: `0x${"2".repeat(40)}`, payTo: `0x${"3".repeat(40)}`,
    origin: "https://hub.example", input: { private: "INPUT_PRIVATE" }, output: { private: "OUTPUT_PRIVATE" },
    outputSchema: { type: "object" }, status: "succeeded", stopReason: "end_turn", settled: true,
    reason: "PRIVATE_REASON", priceAtomic: 10_000n, settleTx: `0x${"a".repeat(64)}`,
    createdAtMs: 1760000000000, chainId: 5042002, identityRegistry: loadChainConfig("arc-testnet").erc8004!.identity }
  const request = buildValidationRequest(common)
  const response = buildValidationResponse({ ...common, requestHash: docHash(request), decidedAtMs: common.createdAtMs })
  const feedback = buildFeedback({ ...common, attester: `0x${"6".repeat(40)}` })
  const docs: [Erc8004DocKind, unknown][] = [["validation-request", request], ["validation-response", response], ["feedback", feedback]]
  try {
    for (const [kind, doc] of docs) {
      const bytes = docBytes(doc)
      await Effect.runPromise(opened.store.putErc8004Doc(common.jobId, kind, bytes))
      console.log("[stored-document] " + JSON.stringify({ kind, hash: keccak256(toHex(bytes)), length: Buffer.byteLength(bytes) }))
    }
    await Effect.runPromise(opened.store.putErc8004Doc("job_whitespace", "feedback", '{ "unicode": "é", "value": 1 }\n'))
  } finally { opened.close() }
}
globalThis.fetch = async () => { throw new Error("external calls disabled in offline documents fixture") }
const serve = Bun.serve
Bun.serve = ((options: Parameters<typeof Bun.serve>[0]) => {
  const server = serve({ ...options, hostname: "127.0.0.1", port: 0 } as Parameters<typeof Bun.serve>[0])
  console.log(`[docs-http-port] ${server.port}`); return server
}) as typeof Bun.serve
