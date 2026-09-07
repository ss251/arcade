import { expect, test } from "bun:test"
import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { makeErc8183Rail } from "../src/erc8183.ts"
import { openEscrowActionJournal } from "../src/erc8183-journal.ts"
import { captureEscrowPayment } from "../src/erc8183-wire.ts"
import { rpcFixture } from "./fixtures/erc8183-rpc.ts"
import { hash } from "./fixtures/erc8183-action.ts"

test("actual Effect rail + SQLite submit/complete proof and reopened terminal refusal on fake chain", async () => {
  const submit = await rpcFixture("submit", { capability: hash(77) })
  const complete = await rpcFixture("complete", { capability: hash(77), submittedAt: 1001, timestamp: 1002, blockNumber: 52n, nonce: 4 })
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "arcade-escrow-rail-test-"))); chmodSync(dir, 0o700)
  const path = join(dir, "actions.sqlite"), store = openEscrowActionJournal(path)
  let current = submit
  const fetch = (async (url, init) => current.options.fetch(url, init)) as typeof globalThis.fetch
  const config = { ...submit.options, fetch, journal: store.journal, operationTimeoutMs: 30000, expiresInSeconds: 1800,
    nowSeconds: () => current.f.snapshot.timestamp, acquireSigner: async () => current.options.acquireSigner(),
    providerAuthorization: async () => {
      if (!("nonce" in current.f.input)) throw Error("evaluator-only action requested provider signature")
      return { nonce: current.f.input.nonce, deadline: current.f.input.deadline, signature: current.f.input.signature }
    } }
  try {
    const rail = makeErc8183Rail(config), c = submit.f.context.call
    const requirements = await Effect.runPromise(rail.challenge({ priceAtomic: c.amount, resource: c.resource, payTo: c.provider,
      escrow: { skillId: c.skillId, skillVersion: c.skillVersion, inputHash: c.inputHash,
        providerAgentId: c.providerAgentId, timeoutSeconds: c.timeoutSeconds } }))
    const payment = captureEscrowPayment({ x402Version: 2, accepted: requirements, payload: { jobId: "7", capability: hash(77) } })
    const verified = await Effect.runPromise(rail.verify(payment, requirements))
    const submitted = await Effect.runPromise(rail.submit(verified, hash(9)))
    expect(submitted).toMatchObject({ kind: "submit", submittedAt: 1001, blockNumber: 51n, txHash: submit.f.signed.hash })
    current = complete
    const result = await Effect.runPromise(rail.settle(verified, undefined, { hubJobId: "job_" + "a".repeat(32), outputHash: hash(9) }))
    expect(result).toMatchObject({ settlementKind: "onchain", payer: submit.f.context.client, amountAtomic: 300000n,
      txHash: complete.f.signed.hash, proof: { kind: "complete", sellerAtomic: 285000n, feeAtomic: 15000n, refundAtomic: 0n,
        submittedAt: submitted.submittedAt, blockNumber: 53n } })
    expect(complete.f.action.context).toEqual(verified.context)
    for (const h of [submit, complete]) expect(h.calls.filter(c => c.method === "eth_sendRawTransaction")).toHaveLength(1)
    store.close()
    const reopened = openEscrowActionJournal(path)
    // A stale/funded RPC cannot defeat the durable terminal fence after restart.
    const replay = await rpcFixture("submit", { capability: hash(77) }); current = replay
    try {
      const next = makeErc8183Rail({ ...config, journal: reopened.journal })
      const same = await Effect.runPromise(next.verify(payment, requirements)), reads = replay.calls.length
      expect(await Effect.runPromise(Effect.flip(next.reject(same, "timeout"))))
        .toMatchObject({ reason: "Escrow action refused before dispatch" })
      expect(replay.calls).toHaveLength(reads); expect(replay.acquisitions()).toBe(0)
    } finally { reopened.close(); replay.controller.abort() }
  } finally { store.close(); submit.controller.abort(); complete.controller.abort(); rmSync(dir, { recursive: true, force: true }) }
})
