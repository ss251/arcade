import { afterEach, describe, expect, it } from "bun:test"
import { chmod, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FundingJournalError, finalizeFundingJournal, openFundingJournal, readFundingJournal, type FundingJournalCheckpoint } from "../src/gateway-funding-journal.ts"
import { captureFundingAuthority, operationDigest as fundingDigest } from "../src/gateway-funding.ts"
import * as FundingRuntime from "../src/gateway-funding-runtime.ts"
import { encodeFunctionData, erc20Abi, keccak256, padHex, parseAbi, parseTransaction, stringToHex, type Hex } from "viem"
import { deploymentRuntimeFixtures } from "./fixtures/gateway-deployment.ts"

const account = "0x1111111111111111111111111111111111111111"
const authority = captureFundingAuthority(account)
const operationId = `op_${"22".repeat(16)}`
const request = Object.freeze({ kind: "deposit" as const, mode: "exact" as const, amount: 500000n, gasCapWei: 100000n })
const operationDigest = fundingDigest(authority, request, operationId)
const openInput = { authority, operationId, request, operationDigest }
const dirs: string[] = []
const setup = async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "funding-runtime-test-")))
  dirs.push(root)
  return { root, journalPath: join(root, "operation.jsonl"), io: { testRoot: root } }
}
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }) })

describe("bounded funding response URL equality", () => {
  const responseFetch = (response: Response): typeof fetch => Object.assign(
    async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => response,
    { preconnect: () => {} })
  it("accepts fetch's canonical trailing slash for the same root RPC URL", async () => {
    const response = new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x4cef52" }), { headers: { "content-type": "application/json" } })
    Object.defineProperty(response, "url", { value: "https://rpc.testnet.arc.io/" })
    const result = await FundingRuntime.boundedFundingJson(responseFetch(response),
      "https://rpc.testnet.arc.io", "POST", "{}", new AbortController().signal, performance.now() + 1000)
    expect(result).toEqual({ jsonrpc: "2.0", id: 1, result: "0x4cef52" })
  })
  it("still refuses redirected responses, changed paths, schemes and hosts", async () => {
    for (const url of ["https://rpc.testnet.arc.io/other", "http://rpc.testnet.arc.io/", "https://example.invalid/"]) {
      const response = new Response("{}", { headers: { "content-type": "application/json" } })
      Object.defineProperty(response, "url", { value: url })
      await expect(FundingRuntime.boundedFundingJson(responseFetch(response),
        "https://rpc.testnet.arc.io", "POST", "{}", new AbortController().signal, performance.now() + 1000)).rejects.toThrow()
    }
    const response = new Response("{}", { headers: { "content-type": "application/json" } })
    Object.defineProperty(response, "url", { value: "https://rpc.testnet.arc.io/" })
    Object.defineProperty(response, "redirected", { value: true })
    await expect(FundingRuntime.boundedFundingJson(responseFetch(response),
      "https://rpc.testnet.arc.io", "POST", "{}", new AbortController().signal, performance.now() + 1000)).rejects.toThrow()
  })
})

describe("F11 account-wide funding journal", () => {
  it("exclusively claims one account even when competing operations select different journal paths", async () => {
    const f = await setup()
    const results = await Promise.allSettled([
      openFundingJournal({ ...openInput, journalPath: f.journalPath }, f.io),
      openFundingJournal({ ...openInput, journalPath: join(f.root, "other.jsonl") }, f.io)
    ])
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
    for (const result of results) if (result.status === "fulfilled") await result.value.close()
  })

  it("retains claim and journal after close; a fresh facade/path is not retry authority", async () => {
    const f = await setup()
    const journal = await openFundingJournal({ ...openInput, journalPath: f.journalPath }, f.io)
    expect((await stat(f.journalPath)).mode & 0o777).toBe(0o600)
    await journal.close()
    const before = await readFile(f.journalPath, "utf8")
    await expect(openFundingJournal({ ...openInput, journalPath: join(f.root, "retry.jsonl") }, f.io)).rejects.toThrow()
    expect(await readFile(f.journalPath, "utf8")).toBe(before)
    expect((await readFundingJournal({ authority, journalPath: f.journalPath }, f.io)).operationDigest).toBe(operationDigest)
  })

  it("refuses symlinked journal parents without creating the target journal", async () => {
    const f = await setup(), other = await setup()
    await symlink(other.root, join(f.root, "link"))
    await expect(openFundingJournal({ ...openInput, journalPath: join(f.root, "link", "x.jsonl") }, f.io)).rejects.toThrow()
    expect(await readdir(other.root)).toEqual([])
  })

  it("refuses a non-private journal directory and malformed authority before claiming", async () => {
    const f = await setup()
    await chmod(f.root, 0o755)
    await expect(openFundingJournal({ ...openInput, journalPath: f.journalPath }, f.io)).rejects.toThrow()
    expect(await readdir(f.root)).toEqual([])
    await chmod(f.root, 0o700)
    await expect(openFundingJournal({ ...openInput, authority: { ...authority, account: "not-an-address" as typeof authority.account }, journalPath: f.journalPath }, f.io)).rejects.toThrow()
    expect(await readdir(f.root)).toEqual([])
  })

  it("never overwrites an existing journal and retains the acquired account claim after creation failure", async () => {
    const f = await setup(), other = await setup()
    await symlink(join(other.root, "never-created"), f.journalPath)
    await expect(openFundingJournal({ ...openInput, journalPath: f.journalPath }, f.io)).rejects.toThrow()
    await expect(openFundingJournal({ ...openInput, journalPath: join(f.root, "retry.jsonl") }, f.io)).rejects.toThrow()
    expect(await readdir(other.root)).toEqual([])
  })

  it("rejects a capability-bearing event without changing the durable journal", async () => {
    const f = await setup(), journal = await openFundingJournal({ ...openInput, journalPath: f.journalPath }, f.io)
    const before = await readFile(f.journalPath, "utf8")
    await expect(journal.append(journal.readHead(), { event: "planned", facts: { operationDigest }, signature: "PRIVATE_TEST_SENTINEL" } as unknown as Parameters<typeof journal.append>[1])).rejects.toThrow()
    expect(await readFile(f.journalPath, "utf8")).toBe(before)
    await journal.close()
  })

  it("normalizes a hostile expected-head getter before any journal append", async () => {
    const f = await setup(), journal = await openFundingJournal({ ...openInput, journalPath: f.journalPath }, f.io)
    const before = await readFile(f.journalPath, "utf8")
    let caught: unknown
    try {
      await journal.append({ get sequence(): number { throw new Error("PRIVATE_HEAD_SENTINEL") }, hash: operationDigest },
        { event: "planned", facts: { operationDigest } })
    } catch (error) { caught = error }
    expect(caught).toBeInstanceOf(FundingJournalError)
    expect(String(caught)).not.toContain("PRIVATE_HEAD_SENTINEL")
    expect(await readFile(f.journalPath, "utf8")).toBe(before)
    await journal.close()
  })

  it("refuses changing a frozen planned amount at the next transaction intent", async () => {
    const f = await setup(), journal = await openFundingJournal({ ...openInput, journalPath: f.journalPath }, f.io)
    await journal.append(journal.readHead(), { event: "planned", facts: { operationDigest, amount: 500000n } })
    const before = await readFile(f.journalPath, "utf8")
    await expect(journal.append(journal.readHead(), { event: "deposit_intent", facts: {
      operationDigest, amount: 700000n, nonce: 1n, calldataHash: operationDigest
    } })).rejects.toThrow(FundingJournalError)
    expect(await readFile(f.journalPath, "utf8")).toBe(before)
    await journal.close()
  })

  it("binds the submitted transaction hash to the actual same-stage prepared hash", async () => {
    const f = await setup(), journal = await openFundingJournal({ ...openInput, journalPath: f.journalPath }, f.io)
    const facts = { operationDigest, amount: 500000n, nonce: 1n, gas: 100000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n, calldataHash: operationDigest }
    try {
      await journal.append(journal.readHead(), { event: "planned", facts })
      await journal.append(journal.readHead(), { event: "deposit_intent", facts })
      await journal.append(journal.readHead(), { event: "deposit_prepared", facts: { ...facts, txHash: operationDigest } })
      await expect(journal.append(journal.readHead(), { event: "deposit_submitted", facts: { ...facts, txHash: `0x${"44".repeat(32)}` } })).rejects.toThrow(FundingJournalError)
    } finally { await journal.close() }
  })

  it("refuses a different operation ID even if the operation digest was copied", async () => {
    const f = await setup(), journal = await openFundingJournal({ ...openInput, journalPath: f.journalPath }, f.io)
    try {
      await expect(journal.append(journal.readHead(), { event: "planned", facts: {
        operationDigest, operationId: `op_${"77".repeat(16)}`, amount: 500000n
      } })).rejects.toThrow(FundingJournalError)
    } finally { await journal.close() }
  })

  it("never calls a refusal unsigned after any prior signer-entry evidence", async () => {
    const f = await setup(), journal = await openFundingJournal({ ...openInput, journalPath: f.journalPath }, f.io)
    try {
      await journal.append(journal.readHead(), { event: "planned", facts: { operationDigest, amount: 500000n, signerEntered: true } })
      await expect(journal.append(journal.readHead(), { event: "refused", facts: {
        operationDigest, terminalKind: "unsigned_refusal", signerEntered: false, submitted: false
      } })).rejects.toThrow(FundingJournalError)
    } finally { await journal.close() }
  })

  for (const point of ["append_write", "append_sync", "close", "witness_write", "witness_sync", "witness_close"] as const)
    it(`retains account ownership and poisons a real journal after ${point} failure`, async () => {
      const f = await setup()
      let injected = false
      const io = { ...f.io, async checkpoint(phase: FundingJournalCheckpoint, file?: import("node:fs/promises").FileHandle) {
        if (phase === point && !injected) {
          injected = true
          if (phase === "append_write") await file!.writeFile('{"partial":')
          throw new Error("PRIVATE_STORAGE_SENTINEL")
        }
      } }
      const journal = await openFundingJournal({ ...openInput, journalPath: f.journalPath }, io)
      const event = { event: "refused" as const, facts: { operationDigest, terminalKind: "unsigned_refusal" as const, signerEntered: false, submitted: false } }
      if (point.startsWith("append")) await expect(journal.append(journal.readHead(), event)).rejects.toThrow(FundingJournalError)
      else await journal.append(journal.readHead(), event)
      await expect(journal.close()).rejects.toThrow(FundingJournalError)
      await expect(journal.append(journal.readHead(), event)).rejects.toThrow(FundingJournalError)
      await expect(openFundingJournal({ ...openInput, journalPath: join(f.root, "retry.jsonl") }, f.io)).rejects.toThrow(FundingJournalError)
      await expect(finalizeFundingJournal({ authority, journalPath: f.journalPath }, async () => ({ event: "finalized", facts: {
        operationDigest, terminalKind: "unsigned_refusal"
      } }), f.io)).rejects.toThrow(FundingJournalError)
      const accountDir = join(f.root, ".arcade-gateway-funding", "v1", "eip155-5042002", authority.account)
      expect(await readdir(accountDir)).toContain("active.claim")
      expect(await readFile(join(accountDir, "poison"), "utf8")).not.toContain("PRIVATE_STORAGE_SENTINEL")
    })

  it("requires a causal main-close witness for unsigned finalization and retires only on explicit finalize", async () => {
    const f = await setup(), journal = await openFundingJournal({ ...openInput, journalPath: f.journalPath }, f.io)
    await journal.append(journal.readHead(), { event: "refused", facts: { operationDigest, terminalKind: "unsigned_refusal", signerEntered: false, submitted: false } })
    const verify = async () => ({ event: "finalized" as const, facts: { operationDigest, terminalKind: "unsigned_refusal" as const } })
    await expect(finalizeFundingJournal({ authority, journalPath: f.journalPath }, verify, f.io)).rejects.toThrow(FundingJournalError)
    await journal.close()
    const original = await readFile(f.journalPath, "utf8")
    const result = await finalizeFundingJournal({ authority, journalPath: f.journalPath }, verify, f.io)
    expect(result.events.at(-1)?.event).toBe("finalized")
    expect((await readFile(f.journalPath, "utf8")).startsWith(original)).toBe(true)
    const next = await openFundingJournal({ ...openInput, operationId: `op_${"66".repeat(16)}`,
      operationDigest: fundingDigest(authority, request, `op_${"66".repeat(16)}`), journalPath: join(f.root, "next.jsonl") }, f.io)
    await next.close()
  })

  it("rejects concurrent stale-head appends rather than reordering their intent", async () => {
    const f = await setup(), journal = await openFundingJournal({ ...openInput, journalPath: f.journalPath }, f.io), head = journal.readHead()
    const results = await Promise.allSettled([
      journal.append(head, { event: "planned", facts: { operationDigest, amount: 500000n } }),
      journal.append(head, { event: "refused", facts: { operationDigest, terminalKind: "unsigned_refusal" } })
    ])
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1)
    expect(journal.snapshot().events).toHaveLength(1)
    await journal.close()
  })

  it("refuses first-burn fee escalation and missing finite intent coordinates", async () => {
    for (const extra of [{ amount: 100n, maxFee: 11n, maxBlockHeight: 1020n, specHash: operationDigest }, {}]) {
      const f = await setup(), withdrawal = { kind: "withdrawal" as const, amount: 100n, maxFee: 10n, maxBurnBlockDelta: 20n, gasCapWei: 1000n }
      const digest = fundingDigest(authority, withdrawal, operationId)
      const journal = await openFundingJournal({ ...openInput, request: withdrawal, operationDigest: digest, journalPath: f.journalPath }, f.io)
      try {
        await journal.append(journal.readHead(), { event: "planned", facts: { operationDigest: digest, amount: 100n, blockNumber: 1000n } })
        const before = await readFile(f.journalPath, "utf8")
        await expect(journal.append(journal.readHead(), { event: "burn_authorization_prepared", facts: { operationDigest: digest, ...extra } })).rejects.toThrow(FundingJournalError)
        expect(await readFile(f.journalPath, "utf8")).toBe(before)
      } finally { await journal.close() }
    }
  })

  it("refuses planned-only finalization before invoking the trusted effect verifier", async () => {
    const f = await setup(), journal = await openFundingJournal({ ...openInput, journalPath: f.journalPath }, f.io)
    await journal.append(journal.readHead(), { event: "planned", facts: { operationDigest, amount: request.amount } })
    await journal.close()
    let calls = 0
    await expect(finalizeFundingJournal({ authority, journalPath: f.journalPath }, async () => {
      calls++; return { event: "finalized", facts: { operationDigest, terminalKind: "credited" } }
    }, f.io)).rejects.toThrow(FundingJournalError)
    expect(calls).toBe(0)
    expect((await readFundingJournal({ authority, journalPath: f.journalPath }, f.io)).events.at(-1)?.event).toBe("planned")
  })

  it("allows exact prepared lost-ack evidence with independent complete proof but no clean-close witness", async () => {
    const f = await setup(), journal = await openFundingJournal({ ...openInput, journalPath: f.journalPath }, f.io)
    const facts = { operationDigest, amount: request.amount, nonce: 1n, gas: 1000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n, calldataHash: operationDigest }
    await journal.append(journal.readHead(), { event: "planned", facts })
    await journal.append(journal.readHead(), { event: "deposit_intent", facts })
    await journal.append(journal.readHead(), { event: "deposit_prepared", facts: { ...facts, txHash: operationDigest } })
    await journal.close()
    // Synthetic missing-witness fixture, not an asserted process-crash experiment.
    await unlink(join(f.root, ".arcade-gateway-funding", "v1", "eip155-5042002", authority.account, `${operationDigest.slice(2)}.clean-close`))
    let calls = 0
    const result = await finalizeFundingJournal({ authority, journalPath: f.journalPath }, async snapshot => {
      calls++; expect(snapshot.events.some(row => row.event === "deposit_submitted")).toBe(false)
      return { event: "finalized", facts: { operationDigest, terminalKind: "credited", amount: request.amount, txHash: operationDigest } }
    }, f.io)
    expect(calls).toBe(1)
    expect(result.events.at(-1)?.event).toBe("finalized")
  })
})

describe("F11 explicit runtime construction", () => {
  it("exposes a synchronous no-IO operation facade and refuses already-cancelled execution", async () => {
    const f = await setup(), controller = new AbortController(); controller.abort()
    let reads = 0, signers = 0, sends = 0
    const deps = {
      signal: controller.signal, deadlineMs: performance.now() + 1000, now: () => performance.now(), wallNow: () => Date.now(),
      rpc: async () => { reads++; return null }, gateway: async () => { reads++; return null },
      acquireSigner: async () => { signers++; throw new Error("PRIVATE_SIGNER_SENTINEL") },
      sendRawTransaction: async () => { sends++; return null }, normalTransferPost: async () => { sends++; return null }, journalIO: f.io
    }
    const operation = FundingRuntime.createFundingOperation({ authority, operationId, request, journalPath: f.journalPath }, deps)
    expect(operation.publicState()).toBeUndefined()
    expect(reads + signers + sends).toBe(0)
    const result = await operation.executeDepositOnce()
    expect(result.status).toBe("refused")
    expect(result.code).toBe("cancelled")
    expect(reads + signers + sends).toBe(0)
    expect(await readdir(f.root)).toEqual([])
    await operation.close()
  })
  it("owns a real late-open journal after cancellation and never reports an unresolved opening as cleanly closed", async () => {
    const f = await setup(), controller = new AbortController()
    let release!: () => void, reached!: () => void, main: import("node:fs/promises").FileHandle | undefined, closes = 0
    const paused = new Promise<void>(resolve => { reached = resolve }), held = new Promise<void>(resolve => { release = resolve })
    const deps: FundingRuntime.FundingDependencies = {
      signal: controller.signal, deadlineMs: performance.now() + 5000, now: () => performance.now(), wallNow: () => Date.now(),
      rpc: async () => { throw new Error("fixture forbidden late RPC") }, gateway: async () => { throw new Error("fixture forbidden late Gateway") },
      sendRawTransaction: async () => { throw new Error("fixture forbidden late send") }, normalTransferPost: async () => { throw new Error("fixture forbidden late POST") },
      journalIO: { ...f.io, checkpoint: async (point, file) => {
        if (point === "header_sync") { main = file; reached(); await held }
        if (point === "close") closes++
      } }
    }
    const operation = FundingRuntime.createFundingOperation({ authority, operationId, request, journalPath: f.journalPath }, deps)
    const execution = operation.executeDepositOnce(); await paused; controller.abort()
    expect((await execution).code).toBe("cancelled")
    let cleanup: "resolved" | "uncertain" = "resolved"
    try { await operation.close() } catch { cleanup = "uncertain" }
    release()
    try {
      for (let i = 0; i < 100 && closes === 0; i++) await new Promise(resolve => setTimeout(resolve, 2))
      expect(closes).toBe(1)
      for (let i = 0; i < 100; i++) { try { await main!.stat() } catch { break }; await new Promise(resolve => setTimeout(resolve, 2)) }
      await expect(main!.stat()).rejects.toThrow()
      expect(cleanup).toBe("uncertain")
      await expect(openFundingJournal({ ...openInput, journalPath: join(f.root, "late-retry.jsonl") }, f.io)).rejects.toThrow(FundingJournalError)
    } finally { await main?.close().catch(() => {}) }
  })
})

// Fixed inert vectors generated once offline from the public all-0x11 fixture
// key: Arc5042002, value0, gas21000, maxFee/priority1, amount100 atomic.
// No test reads a key or dynamically signs; injected RPC never sends externally.
const vectors = {
  "approve": "0x02f8aa834cef5280010182520894360000000000000000000000000000000000000080b844095ea7b30000000000000000000000000077777d7eba4688bdef3e311b846f25870a19b90000000000000000000000000000000000000000000000000000000000000064c001a09063cc3d47216cf8389ec6ec5856d11124c586384c5cda626eec10b438a9e765a02a0e31faf94f03c0938af004627b596494509ed61805d08da9ddd911f3133f58",
  "deposit0": "0x02f8aa834cef52800101825208940077777d7eba4688bdef3e311b846f25870a19b980b84447e7ef2400000000000000000000000036000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064c001a09cc950231b223140a17685f9af91910c04564b65c1fa04673cdce22820a66401a01268fc54e3bc5229a982b9bdc0b87c4fac36e77441b34dcb470b7e65c5b2f65b",
  "deposit1": "0x02f8aa834cef52010101825208940077777d7eba4688bdef3e311b846f25870a19b980b84447e7ef2400000000000000000000000036000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064c080a06654176cdddb2db0c0f774ac2b5a16cc0ca5ff52db03de7f28f09162b4a53737a01357d811e44fd63ad98301ae27b140399102443e1068901ea883c17e7ad8384f"
} as const
const withdrawalVectors = {
  "digest": "0x134580c1b42cdb704218f20d7551df4cd67b2dbae8b8f3d225f2ad0d55a3fa15",
  "specHash": "0xcbd5e6af3c550d3357069419d150f4a5dbae83b5abd137e5a2938f778d600d6f",
  "burnSignature": "0xad9907a71c8b3cba69989285050e7119eccc1166214acb42f1feddf7711d122d31d1d8007c23dab7a4923d17df3b2d3f3ac361d273677d2da5b889913c2a41d61b",
  "payload": "0xff6fb33400000000000000000000000000000000000000000000000000000000000003fc00000154ca85def7000000010000001a0000001a0000000000000000000000000077777d7eba4688bdef3e311b846f25870a19b90000000000000000000000000022222abe238cc2c7bb1f21003f0a260052475b0000000000000000000000003600000000000000000000000000000000000000000000000000000000000000360000000000000000000000000000000000000000000000000000000000000019e7e376e7c213b7e7e7e46cc70a5dd086daff2a00000000000000000000000019e7e376e7c213b7e7e7e46cc70a5dd086daff2a00000000000000000000000019e7e376e7c213b7e7e7e46cc70a5dd086daff2a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064e2b11f68708416087e07ea801be445e5d7f1854f0daa71eb43a0e93fd521317f00000000",
  "signature": "0x5fb8ca542f2bb4910466b9d27bd477d3573e5ee94e2ed85bc8018ad43d329ebb270c4250d00c0782a6174ffdabbcccbd3dc5ebd0c3c3bb8b54795403a202ff561b",
  "mint": "0x02f902cb834cef52800101825208940022222abe238cc2c7bb1f21003f0a260052475b80b902649fb01cc5000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000001e0000000000000000000000000000000000000000000000000000000000000017cff6fb33400000000000000000000000000000000000000000000000000000000000003fc00000154ca85def7000000010000001a0000001a0000000000000000000000000077777d7eba4688bdef3e311b846f25870a19b90000000000000000000000000022222abe238cc2c7bb1f21003f0a260052475b0000000000000000000000003600000000000000000000000000000000000000000000000000000000000000360000000000000000000000000000000000000000000000000000000000000019e7e376e7c213b7e7e7e46cc70a5dd086daff2a00000000000000000000000019e7e376e7c213b7e7e7e46cc70a5dd086daff2a00000000000000000000000019e7e376e7c213b7e7e7e46cc70a5dd086daff2a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064e2b11f68708416087e07ea801be445e5d7f1854f0daa71eb43a0e93fd521317f000000000000000000000000000000000000000000000000000000000000000000000000000000415fb8ca542f2bb4910466b9d27bd477d3573e5ee94e2ed85bc8018ad43d329ebb270c4250d00c0782a6174ffdabbcccbd3dc5ebd0c3c3bb8b54795403a202ff561b00000000000000000000000000000000000000000000000000000000000000c080a0176d62d9e5d5c97d9870f8a249f0cfd661d95c43a1026c6586147091b9534c42a02053ad24c5c065e1774d5296a834a4f2a8c4ba59170814b3b66503d351f70b8f",
  "mintHash": "0x4729ba8803780df9691dcd1b7b7b065cc35311bbd037dbdd57cdc831966ce040"
} as const
const syntheticAuthority = captureFundingAuthority("0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a")
const fq = (n: bigint): Hex => `0x${n.toString(16)}`
const word = (n: bigint): Hex => padHex(fq(n), { size: 32 })
const blockHash = (n: bigint): Hex => word(n + 100000n)
const selector = (signature: string) => keccak256(stringToHex(signature)).slice(0, 10)
const walletImplementation = "0x3333333333333333333333333333333333333333" as Hex
const minterImplementation = "0x4444444444444444444444444444444444444444" as Hex
function boundRuntime(role: "GatewayWallet" | "GatewayMinter", address: Hex): Hex {
  const fixture = deploymentRuntimeFixtures[role]
  let value: string = fixture.runtime
  for (const offset of fixture.immutableOffsets) value = value.slice(0, 2 + offset * 2) + padHex(address, { size: 32 }).slice(2) + value.slice(2 + (offset + 32) * 2)
  return value as Hex
}
interface RuntimeFixtureOptions { allowance?: bigint; exactNative?: boolean; creditIncrease?: boolean; historicMismatch?: boolean; minterMismatch?: boolean; withdrawal?: boolean; debit?: boolean }
async function runtimeFixture(options: RuntimeFixtureOptions = {}) {
  const f = await setup(), a = syntheticAuthority, controller = new AbortController(), request = { kind: "deposit" as const, mode: "exact" as const, amount: 100n, gasCapWei: 42000n }
  const sent: Hex[] = [], signed: FundingRuntime.FundingTransaction[] = [], calls: string[] = []
  let acquired = 0, allowance = options.allowance ?? 100n, current = 1000n, normalPosts = 0, member = true
  const txs = new Map<string, { bytes: Hex; block: bigint }>()
  const deposited = () => sent.some(raw => parseTransaction(raw).to?.toLowerCase() === a.wallet)
  const makeBlock = (n: bigint) => ({ number: fq(n), hash: blockHash(n), timestamp: "0x3e8" })
  const burnHash = word(99999n)
  const burnLog = () => ({ transactionHash: burnHash, blockNumber: fq(current), blockHash: blockHash(current), removed: false,
    logIndex: "0x0", address: a.wallet, topics: [keccak256(stringToHex("GatewayBurned(address,address,bytes32,uint32,bytes32,address,uint256,uint256,uint256,uint256)")),
      padHex(a.token, { size: 32 }), padHex(a.account, { size: 32 }), withdrawalVectors.specHash],
    data: `0x${word(26n).slice(2)}${padHex(a.account, { size: 32 }).slice(2)}${padHex(a.account, { size: 32 }).slice(2)}${word(100n).slice(2)}${word(2n).slice(2)}${word(102n).slice(2)}${word(0n).slice(2)}` })
  const deps: FundingRuntime.FundingDependencies = {
    signal: controller.signal, deadlineMs: performance.now() + 10000, now: () => performance.now(), wallNow: () => 1000000,
    journalIO: f.io,
    async rpc(method, params) {
      calls.push(method)
      if (method === "eth_chainId") return "0x4cef52"
      if (method === "eth_getBlockByNumber") return makeBlock(params[0] === "finalized" ? current : BigInt(params[0] as string))
      if (method === "eth_getStorageAt") return padHex(params[0] === a.wallet ? walletImplementation : minterImplementation, { size: 32 })
      if (method === "eth_getCode") {
        if (params[0] === a.wallet || params[0] === a.minter) return deploymentRuntimeFixtures.ERC1967Proxy.runtime
        if (options.historicMismatch && sent.length && BigInt(params[1] as string) < current) return "0x00"
        if (params[0] === walletImplementation) return boundRuntime("GatewayWallet", walletImplementation)
        if (params[0] === minterImplementation) return options.minterMismatch ? "0x00" : boundRuntime("GatewayMinter", minterImplementation)
        throw new Error("fixture unexpected code target")
      }
      if (method === "eth_getBalance") return fq(100n * 10n ** 12n + (options.exactNative ? 42000n : 1000000n) - BigInt(sent.length) * 21000n)
      if (method === "eth_getTransactionCount") return fq(BigInt(sent.length))
      if (method === "eth_gasPrice" || method === "eth_maxPriorityFeePerGas") return "0x1"
      if (method === "eth_estimateGas") {
        const tx = params[0] as { to: string }
        if (tx.to === a.wallet && allowance < 100n) throw new Error("fixture allowance insufficient for deposit estimate")
        return "0x5208"
      }
      if (method === "eth_call") {
        const tx = params[0] as { data: string }, sig = tx.data.slice(0, 10)
        if (sig === selector("decimals()")) return word(6n)
        if (sig === selector("paused()")) return word(0n)
        if (sig === selector("domain()")) return word(26n)
        if (sig === selector("isTokenSupported(address)")) return word(1n)
        if (sig === selector("balanceOf(address)")) return word(1000000n)
        if (sig === selector("allowance(address,address)")) return word(allowance)
        if (sig === selector("totalBalance(address,address)")) return word(deposited() ? 100n : 0n)
        if (sig === selector("withdrawalDelay()")) return word(2n)
        if (sig === selector("isAttestationSigner(address)")) return word(member ? 1n : 0n)
        if (sig === selector("tokenMintAuthority(address)")) return word(0n)
        if (sig === selector("isMinter(address)")) return word(1n)
        throw new Error("fixture unexpected call selector")
      }
      if (method === "eth_getTransactionReceipt" || method === "eth_getTransactionByHash") {
        if (options.debit && params[0] === burnHash) {
          const common = { transactionHash: burnHash, blockNumber: fq(current), blockHash: blockHash(current), from: a.account, to: a.wallet }
          return method === "eth_getTransactionReceipt" ? { ...common, status: "0x1", logs: [burnLog()] }
            : { ...common, hash: burnHash, chainId: fq(5042002n), value: "0x0" }
        }
        const found = txs.get(params[0] as string); if (!found) return null
        const tx = parseTransaction(found.bytes), hash = keccak256(found.bytes), block = found.block
        const common = { transactionHash: hash, blockNumber: fq(block), blockHash: blockHash(block), from: a.account, to: tx.to!.toLowerCase() }
        if (method === "eth_getTransactionByHash") return { ...common, hash, chainId: fq(5042002n), value: "0x0", type: "0x2", nonce: fq(BigInt(tx.nonce!)), gas: fq(tx.gas!), maxFeePerGas: "0x1", maxPriorityFeePerGas: "0x1", input: tx.data }
        const approval = tx.to!.toLowerCase() === a.token
        if (tx.to!.toLowerCase() === a.minter) return { ...common, status: "0x1", logs: [
          { ...common, removed: false, logIndex: "0x0", address: a.token,
            topics: [keccak256(stringToHex("Transfer(address,address,uint256)")), word(0n), padHex(a.account, { size: 32 })], data: word(100n) },
          { ...common, removed: false, logIndex: "0x1", address: a.minter,
            topics: [keccak256(stringToHex("AttestationUsed(address,address,bytes32,uint32,bytes32,bytes32,uint256)")), padHex(a.token, { size: 32 }), padHex(a.account, { size: 32 }), withdrawalVectors.specHash],
            data: `0x${word(26n).slice(2)}${padHex(a.account, { size: 32 }).slice(2)}${padHex(a.account, { size: 32 }).slice(2)}${word(100n).slice(2)}` } ] }
        return { ...common, status: "0x1", logs: [{ ...common, removed: false, logIndex: "0x0", address: a.token,
          topics: [keccak256(stringToHex(approval ? "Approval(address,address,uint256)" : "Transfer(address,address,uint256)")), padHex(a.account, { size: 32 }), padHex(a.wallet, { size: 32 })], data: word(100n) }] }
      }
      if (method === "eth_getLogs") return options.debit ? [burnLog()] : []
      throw new Error("fixture unexpected RPC method")
    },
    async gateway() { return { token: "USDC", balances: [{ depositor: a.account, domain: 26, balance: options.withdrawal ? "0.001" : deposited() && options.creditIncrease ? "0.0001" : "0" }] } },
    async acquireSigner() { acquired++; return { address: a.account, signTransaction: async tx => {
      signed.push(tx); return tx.to === a.minter ? withdrawalVectors.mint : tx.to === a.token ? vectors.approve : tx.nonce === 0 ? vectors.deposit0 : vectors.deposit1
    }, signTypedData: async () => withdrawalVectors.burnSignature } },
    async sendRawTransaction(bytes) {
      const tx = parseTransaction(bytes); sent.push(bytes); current += 2n
      txs.set(keccak256(bytes), { bytes, block: current - 1n }); if (tx.to?.toLowerCase() === a.token) allowance = 100n
      return keccak256(bytes)
    },
    async normalTransferPost() { normalPosts++; return { transferId: "12345678-1234-4234-8234-123456789abc", attestation: withdrawalVectors.payload,
      signature: withdrawalVectors.signature, expirationBlock: "1020", fees: { token: "USDC", total: "0.000002", perIntent: [{ transferSpecHash: withdrawalVectors.specHash, domain: 26, baseFee: "0.000002" }] } } }
  }
  const input = { authority: a, operationId, request, journalPath: f.journalPath }
  return { ...f, a, deps, input, controller, sent, signed, calls, acquired: () => acquired, normalPosts: () => normalPosts, setMember: (value: boolean) => { member = value } }
}
const withdrawalRequest = { kind: "withdrawal" as const, amount: 100n, maxFee: 10n, maxBurnBlockDelta: 20n, gasCapWei: 42000n }
const highS = (signature: Hex): Hex => {
  const order = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
  return `0x${signature.slice(2, 66)}${(order - BigInt(`0x${signature.slice(66, 130)}`)).toString(16).padStart(64, "0")}${signature.endsWith("1b") ? "1c" : "1b"}`
}

describe("F11 offline production predicates", () => {
  it("decodes actual Wallet deployment identity and distinguishes unavailable balance categories", async () => {
    const f = await runtimeFixture({ minterMismatch: true }), result = await FundingRuntime.inspectFunding(f.a, f.deps)
    expect(result.status).toBe("observed"); expect(result.facts.pending).toBeNull()
    expect(f.acquired()).toBe(0); expect(f.sent).toHaveLength(0)
  })
  it("rejects current Minter mismatch before withdrawal signer acquisition or normal POST", async () => {
    const f = await runtimeFixture({ minterMismatch: true })
    const operation = FundingRuntime.createFundingOperation({ ...f.input, request: { kind: "withdrawal", amount: 100n, maxFee: 10n, maxBurnBlockDelta: 20n, gasCapWei: 42000n } }, f.deps)
    try {
      const result = await operation.requestWithdrawalOnce()
      expect(result.code).toBe("deployment_identity_unavailable"); expect(f.acquired()).toBe(0)
    } finally { await operation.close() }
  })
  it("never promotes an unrelated available increase to transaction-correlated deposit credit", async () => {
    const f = await runtimeFixture({ creditIncrease: true }), operation = FundingRuntime.createFundingOperation(f.input, f.deps)
    try {
      const result = await operation.executeDepositOnce()
      expect(result.status).toBe("credit_pending"); expect(result.facts.availableAfter).toBe(100n)
      expect(result.facts.terminalKind).toBeUndefined(); expect(f.sent).toHaveLength(1)
    } finally { await operation.close() }
  })
  it("uses remaining authorized gas after approval with exact initial native affordability", async () => {
    const f = await runtimeFixture({ allowance: 0n, exactNative: true }), operation = FundingRuntime.createFundingOperation(f.input, f.deps)
    try {
      const result = await operation.executeDepositOnce()
      expect(result.status).toBe("credit_pending"); expect(f.sent).toHaveLength(2)
      expect(f.signed.map(tx => tx.nonce)).toEqual([0, 1])
    } finally { await operation.close() }
  })
  it("refuses deposit proof when Wallet implementation at the receipt block mismatches pinned source", async () => {
    const f = await runtimeFixture({ historicMismatch: true }), operation = FundingRuntime.createFundingOperation(f.input, f.deps)
    try {
      const result = await operation.executeDepositOnce()
      expect(result.status).toBe("uncertain"); expect(f.sent).toHaveLength(1)
    } finally { await operation.close() }
  })
  it("keeps actual destination delivery separate from unobserved source debit", async () => {
    const f = await runtimeFixture({ withdrawal: true }), operation = FundingRuntime.createFundingOperation({ ...f.input, request: withdrawalRequest }, f.deps)
    try {
      expect((await operation.requestWithdrawalOnce()).status).toBe("mint_ready")
      expect((await operation.mintWithdrawalOnce()).status).toBe("source_debit_pending")
      expect(f.sent).toHaveLength(1); expect(f.normalPosts()).toBe(1)
      expect((await operation.mintWithdrawalOnce()).code).toBe("operation_consumed")
    } finally { await operation.close() }
  })
  it("requires receipt-block Minter identity for destination delivery even when current identity is valid", async () => {
    const f = await runtimeFixture({ withdrawal: true, historicMismatch: true }), operation = FundingRuntime.createFundingOperation({ ...f.input, request: withdrawalRequest }, f.deps)
    try {
      expect((await operation.requestWithdrawalOnce()).status).toBe("mint_ready")
      expect((await operation.mintWithdrawalOnce()).status).toBe("uncertain")
      expect(f.sent).toHaveLength(1)
    } finally { await operation.close() }
  })
  it("correlates separate delivery and source debit before explicit keyless retirement", async () => {
    const f = await runtimeFixture({ withdrawal: true, debit: true }), operation = FundingRuntime.createFundingOperation({ ...f.input, request: withdrawalRequest }, f.deps)
    expect((await operation.requestWithdrawalOnce()).status).toBe("mint_ready")
    const result = await operation.mintWithdrawalOnce()
    expect(result.status).toBe("confirmed"); expect(result.facts.actualFee).toBe(2n)
    await operation.close()
    const before = await readFile(f.journalPath, "utf8"), count = f.sent.length
    const keyless = { ...f.deps, acquireSigner: async () => { throw new Error("fixture forbidden reconciliation key") } }
    expect((await FundingRuntime.reconcileFundingOperation({ authority: f.a, journalPath: f.journalPath }, keyless)).status).toBe("confirmed")
    expect(await readFile(f.journalPath, "utf8")).toBe(before)
    expect((await FundingRuntime.finalizeFundingOperation({ authority: f.a, journalPath: f.journalPath }, keyless)).status).toBe("confirmed")
    expect(f.sent).toHaveLength(count); expect(f.normalPosts()).toBe(1)
  })
  it("retains prepared lost-ack ownership and reconciles the exact deposit without signing or re-sending", async () => {
    const f = await runtimeFixture()
    const deps = { ...f.deps, sendRawTransaction: async (bytes: Hex, signal: AbortSignal) => { await f.deps.sendRawTransaction(bytes, signal); throw new Error("PRIVATE_SEND_ACK") } }
    const operation = FundingRuntime.createFundingOperation(f.input, deps)
    expect((await operation.executeDepositOnce()).status).toBe("uncertain")
    expect((await operation.executeDepositOnce()).code).toBe("operation_consumed")
    await operation.close()
    const before = await readFile(f.journalPath, "utf8"), acquired = f.acquired()
    expect(before).toContain('"deposit_prepared"'); expect(before).not.toContain('"deposit_submitted"'); expect(before).not.toContain("PRIVATE_SEND_ACK")
    expect((await FundingRuntime.reconcileFundingOperation({ authority: f.a, journalPath: f.journalPath }, f.deps)).status).toBe("credit_pending")
    expect((await FundingRuntime.finalizeFundingOperation({ authority: f.a, journalPath: f.journalPath }, f.deps)).status).toBe("refused")
    expect(await readFile(f.journalPath, "utf8")).toBe(before); expect(f.sent).toHaveLength(1); expect(f.acquired()).toBe(acquired)
  })
  it("owns one concurrent execution and never enters a late signing result's send boundary", async () => {
    const f = await runtimeFixture(); let entered!: () => void, release!: (bytes: Hex) => void
    const started = new Promise<void>(resolve => { entered = resolve })
    const deps = { ...f.deps, acquireSigner: async (signal: AbortSignal) => { const signer = await f.deps.acquireSigner!(signal); return { ...signer,
      signTransaction: async () => { entered(); return new Promise<Hex>(resolve => { release = resolve }) } } } }
    const operation = FundingRuntime.createFundingOperation(f.input, deps), pending = operation.executeDepositOnce()
    await started
    expect((await operation.executeDepositOnce()).code).toBe("operation_consumed")
    f.controller.abort(new Error("PRIVATE_CANCEL_REASON"))
    expect((await pending).status).toBe("uncertain")
    release(vectors.deposit0); await new Promise(resolve => setTimeout(resolve, 5))
    expect(f.sent).toHaveLength(0); expect(JSON.stringify(operation.publicState(), (_key, value) => typeof value === "bigint" ? value.toString() : value)).not.toContain("PRIVATE_CANCEL_REASON")
    await operation.close()
  })
  it("validates retained-UUID nested read-only recovery without resetting an uncertain mint or advancing the journal", async () => {
    const f = await runtimeFixture({ withdrawal: true }); let gets = 0, wrongFee = false
    const deps = { ...f.deps,
      acquireSigner: async (signal: AbortSignal) => { const signer = await f.deps.acquireSigner!(signal); return { ...signer,
        signTransaction: async () => { throw new Error("PRIVATE_SIGNING_REPLY_LOST") } } },
      gateway: async (path: string, method: "GET" | "POST", body: string | undefined, signal: AbortSignal) => {
        if (method === "POST") return f.deps.gateway(path, method, body, signal)
        gets++; expect(path).toBe("/v1/transfer/12345678-1234-4234-8234-123456789abc")
        return { destinationDomain: 26, status: "pending", forwardingDetails: { forwardingEnabled: false },
          burnIntents: [{ transferSpecHash: withdrawalVectors.specHash, maxBlockHeight: "1020", maxFee: wrongFee ? "11" : "10" }],
          attestation: { payload: withdrawalVectors.payload, signature: withdrawalVectors.signature, expirationBlock: "1020" },
          fees: { token: "USDC", total: "0.000002", perIntent: [{ transferSpecHash: withdrawalVectors.specHash, domain: 26, baseFee: "0.000002" }] } }
      }
    }
    const operation = FundingRuntime.createFundingOperation({ ...f.input, request: withdrawalRequest }, deps)
    try {
      expect((await operation.requestWithdrawalOnce()).status).toBe("mint_ready")
      expect((await operation.mintWithdrawalOnce()).status).toBe("uncertain")
      const before = await readFile(f.journalPath, "utf8")
      const recovered = await operation.reconcileOperationReadOnly()
      expect(recovered.status).toBe("observed"); expect(recovered.facts.specHash).toBe(withdrawalVectors.specHash)
      expect(gets).toBe(1); expect(operation.publicState()?.status).toBe("uncertain")
      expect((await operation.mintWithdrawalOnce()).code).toBe("operation_consumed")
      wrongFee = true; expect((await operation.reconcileOperationReadOnly()).status).toBe("uncertain")
      expect(await readFile(f.journalPath, "utf8")).toBe(before); expect(before).not.toContain("12345678-1234-4234-8234-123456789abc")
      expect(f.sent).toHaveLength(0); expect(f.normalPosts()).toBe(1)
    } finally { await operation.close() }
  })
  for (const lane of ["burn", "attester"] as const) it(`rejects high-s flip-v ${lane} signatures despite equivalent recovered signer`, async () => {
    const f = await runtimeFixture({ withdrawal: true })
    const deps = { ...f.deps,
      acquireSigner: async (signal: AbortSignal) => { const signer = await f.deps.acquireSigner!(signal); return { ...signer, signTypedData: async () => lane === "burn" ? highS(withdrawalVectors.burnSignature) : withdrawalVectors.burnSignature } },
      normalTransferPost: async (body: string, signal: AbortSignal) => { const result = await f.deps.normalTransferPost(body, signal) as Record<string, unknown>; return { ...result, signature: lane === "attester" ? highS(withdrawalVectors.signature) : result.signature } }
    }
    const operation = FundingRuntime.createFundingOperation({ ...f.input, request: withdrawalRequest }, deps)
    try {
      expect((await operation.requestWithdrawalOnce()).status).toBe("uncertain")
      expect(f.normalPosts()).toBe(lane === "burn" ? 0 : 1); expect(f.sent).toHaveLength(0)
    } finally { await operation.close() }
  })
  for (const phase of ["pre-sign", "pre-send"] as const) it(`rechecks current attester membership at the ${phase} mint gate`, async () => {
    const f = await runtimeFixture({ withdrawal: true })
    let estimates = 0
    const deps = { ...f.deps,
      rpc: async (method: string, params: readonly unknown[], signal: AbortSignal) => {
        const result = await f.deps.rpc(method, params, signal)
        if (method === "eth_estimateGas" && ++estimates === 1 && phase === "pre-sign") f.setMember(false)
        return result
      },
      acquireSigner: async (signal: AbortSignal) => { const signer = await f.deps.acquireSigner!(signal); return { ...signer, signTransaction: async (tx: FundingRuntime.FundingTransaction, activeSignal: AbortSignal) => {
        const result = await signer.signTransaction(tx, activeSignal); if (phase === "pre-send") f.setMember(false); return result
      } } }
    }
    const operation = FundingRuntime.createFundingOperation({ ...f.input, request: withdrawalRequest }, deps)
    try {
      expect((await operation.requestWithdrawalOnce()).status).toBe("mint_ready")
      expect((await operation.mintWithdrawalOnce()).status).toBe("uncertain")
      expect(f.signed).toHaveLength(phase === "pre-sign" ? 0 : 1); expect(f.sent).toHaveLength(0)
    } finally { await operation.close() }
  })
})

describe("F11 bounded production transport", () => {
  for (const length of ["1", "99"]) it(`refuses actual body bytes differing from declared length ${length}`, async () => {
    const controller = new AbortController()
    const deps = FundingRuntime.createFundingDependencies({ signal: controller.signal, deadlineMs: performance.now() + 1000,
      fetch: Object.assign(async () => new Response('{"jsonrpc":"2.0","id":1,"result":"0x4cef52"}', { headers: { "content-type": "application/json", "content-length": length } }), { preconnect() {} }) })
    await expect(deps.rpc("eth_chainId", [], controller.signal)).rejects.toThrow()
  })
  it("cancels a late response body after its uncooperative fetch missed the deadline", async () => {
    const controller = new AbortController(); let release!: (response: Response) => void, cancelled = 0
    const deps = FundingRuntime.createFundingDependencies({ signal: controller.signal, deadlineMs: performance.now() + 30,
      fetch: Object.assign(() => new Promise<Response>(resolve => { release = resolve }), { preconnect() {} }) })
    await expect(deps.rpc("eth_chainId", [], controller.signal)).rejects.toThrow()
    release(new Response(new ReadableStream({ cancel() { cancelled++ } }), { headers: { "content-type": "application/json" } }))
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(cancelled).toBe(1)
  })
})
