import { afterEach, describe, expect, vi } from "vitest"
import { it } from "@effect/vitest"
import { Deferred, Effect, Fiber, TestClock } from "effect"
import { encodeAbiParameters, encodeEventTopics, zeroAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { IDENTITY_REGISTRY_ABI, loadChainConfig, RECEIPT_POLL_INTERVAL_MS } from "@arcade/core"
import {
  agentIdFromLogs, approveOperator, gasCheck, IdentityFailed, makeViemIdentityClient,
  MIN_GAS_WEI, registerAgent, UnfundedSeller, type IdentityClient
} from "../src/identity.ts"

// Public, unfunded fixture material. No environment or Keychain key is ever resolved.
const FIXTURE_KEY = `0x${"11".repeat(32)}` as const
const SELLER = privateKeyToAccount(FIXTURE_KEY).address
const OTHER = `0x${"22".repeat(20)}` as const
const REGISTRY = loadChainConfig("arc-testnet").erc8004!.identity
const HASH = `0x${"ab".repeat(32)}`
const URI = "https://hub.example/listings/diff-triage/agent-registration.json?label=✓"
const PRIVATE_DIAGNOSTIC = "PRIVATE_RPC_DIAGNOSTIC_DO_NOT_EXPOSE"

const registered = (agentId = 42n, owner = SELLER, address = REGISTRY) => ({
  address,
  topics: encodeEventTopics({ abi: IDENTITY_REGISTRY_ABI, eventName: "Registered", args: { agentId, owner } }),
  data: encodeAbiParameters([{ type: "string" }], [URI])
})
const transfer = (tokenId = 42n, from: string = zeroAddress, to = SELLER, address = REGISTRY) => ({
  address,
  topics: encodeEventTopics({ abi: IDENTITY_REGISTRY_ABI, eventName: "Transfer", args: {
    from: from as `0x${string}`, to, tokenId
  } }),
  data: "0x" as const
})

const client = (over: Partial<IdentityClient> = {}) => ({
  address: SELLER,
  getBalance: vi.fn(async () => MIN_GAS_WEI),
  writeContract: vi.fn(async (_args: unknown) => HASH),
  getTransactionReceipt: vi.fn(async (_args: { hash: string }) => ({ status: "success", logs: [registered()] })),
  readContract: vi.fn(async (args: unknown): Promise<unknown> => {
    const name = (args as { functionName: string }).functionName
    return name === "ownerOf" ? SELLER : name === "tokenURI" ? URI : false
  }),
  ...over
}) satisfies IdentityClient

const failure = async <A, E>(effect: Effect.Effect<A, E>): Promise<E> => {
  const result = await Effect.runPromise(Effect.either(effect))
  expect(result._tag).toBe("Left")
  if (result._tag !== "Left") throw new Error("expected failure")
  return result.left
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe("native gas preflight", () => {
  it("uses 18-decimal units and accepts the threshold inclusively", async () => {
    expect(MIN_GAS_WEI).toBe(50_000_000_000_000_000n)
    await Effect.runPromise(gasCheck(client(), SELLER))
  })
  it("reports a genuinely low balance without broadcasting", async () => {
    const c = client({ getBalance: async () => MIN_GAS_WEI - 1n })
    const error = await failure(registerAgent({ client: c, registry: REGISTRY, agentURI: URI }))
    expect(error).toBeInstanceOf(UnfundedSeller)
    expect(error).toMatchObject({ address: SELLER, balanceWei: MIN_GAS_WEI - 1n })
    expect(c.writeContract).not.toHaveBeenCalled()
  })
  it("does not fabricate a funded balance or expose an RPC diagnostic", async () => {
    const c = client({ getBalance: async () => { throw new Error(PRIVATE_DIAGNOSTIC) } })
    const error = await failure(registerAgent({ client: c, registry: REGISTRY, agentURI: URI }))
    expect(error).toBeInstanceOf(IdentityFailed)
    expect(error).toMatchObject({ op: "getBalance", broadcast: "not-sent" })
    expect(JSON.stringify(error)).not.toContain(PRIVATE_DIAGNOSTIC)
    expect(c.writeContract).not.toHaveBeenCalled()
  })
  it("refuses malformed balance values rather than interpreting them as funding", async () => {
    const error = await failure(gasCheck(client({ getBalance: async () => -1n }), SELLER))
    expect(error).toBeInstanceOf(IdentityFailed)
  })
})

describe("mint log extraction", () => {
  it("decodes a long UTF-8 registration and an agreeing mint into one decimal id", () => {
    expect(agentIdFromLogs([registered(), transfer()], SELLER, REGISTRY)).toBe("42")
    expect(agentIdFromLogs([registered()], SELLER)).toBe("42")
  })
  it("accepts only mint-from-zero Transfer as the fallback", () => {
    expect(agentIdFromLogs([transfer(7n)], SELLER, REGISTRY)).toBe("7")
    expect(agentIdFromLogs([transfer(7n, OTHER)], SELLER, REGISTRY)).toBeUndefined()
  })
  it("ignores real matching events emitted by another contract", () => {
    expect(agentIdFromLogs([registered(8n, SELLER, OTHER), transfer(9n, zeroAddress, SELLER, OTHER)], SELLER, REGISTRY)).toBeUndefined()
  })
  it("does not claim somebody else's registration or mint", () => {
    expect(agentIdFromLogs([registered(8n, OTHER), transfer(8n, zeroAddress, OTHER)], SELLER, REGISTRY)).toBeUndefined()
  })
  it("decodes log bytes rather than trusting forged decoded args", () => {
    expect(agentIdFromLogs([{ ...registered(8n, OTHER), args: { owner: SELLER, agentId: 42n } }], SELLER, REGISTRY)).toBeUndefined()
  })
  it.each([
    [registered(1n), registered(2n)], [transfer(1n), transfer(2n)], [registered(1n), transfer(2n)]
  ])("refuses conflicting minted ids", (...logs) => {
    expect(agentIdFromLogs(logs, SELLER, REGISTRY)).toBeUndefined()
  })
  it("ignores removed/malformed logs and compares address case insensitively", () => {
    expect(agentIdFromLogs([null, {}, { ...registered(), removed: true }, { ...registered(), data: "0x" }], SELLER, REGISTRY)).toBeUndefined()
    expect(agentIdFromLogs([registered()], SELLER.toLowerCase(), REGISTRY.toLowerCase())).toBe("42")
  })
})

describe("single-broadcast seller registration", () => {
  it("journals the hash before polling, then verifies the confirmed token's owner", async () => {
    const events: string[] = []
    const c = client({
      writeContract: vi.fn(async () => { events.push("broadcast"); return HASH }),
      getTransactionReceipt: vi.fn(async () => { events.push("receipt"); return { status: "success", logs: [registered()] } }),
      readContract: vi.fn(async (args: unknown) => {
        const name = (args as { functionName: string }).functionName
        events.push(name)
        return name === "ownerOf" ? SELLER : URI
      })
    })
    const result = await Effect.runPromise(registerAgent({ client: c, registry: REGISTRY, agentURI: URI,
      onBroadcast: async (hash) => { expect(hash).toBe(HASH); events.push("journal") }
    }))
    expect(result).toEqual({ agentId: "42", txHash: HASH })
    expect(events).toEqual(["broadcast", "journal", "receipt", "ownerOf", "tokenURI"])
    expect(c.writeContract).toHaveBeenCalledExactlyOnceWith({ address: REGISTRY, abi: IDENTITY_REGISTRY_ABI, functionName: "register", args: [URI] })
    expect(c.readContract).toHaveBeenCalledWith({ address: REGISTRY, abi: IDENTITY_REGISTRY_ABI, functionName: "ownerOf", args: [42n] })
  })
  it("returns the known hash and does not poll/rebroadcast when journaling fails", async () => {
    const c = client()
    const error = await failure(registerAgent({ client: c, registry: REGISTRY, agentURI: URI,
      onBroadcast: () => { throw new Error(PRIVATE_DIAGNOSTIC) }
    }))
    expect(error).toMatchObject({ txHash: HASH, phase: "journal", broadcast: "submitted" })
    expect(JSON.stringify(error)).not.toContain(PRIVATE_DIAGNOSTIC)
    expect(c.writeContract).toHaveBeenCalledTimes(1)
    expect(c.getTransactionReceipt).not.toHaveBeenCalled()
  })
  it("never retries a rate-limited broadcast whose outcome is unknown", async () => {
    const write = vi.fn(async () => { throw new Error(`-32011 request limit ${PRIVATE_DIAGNOSTIC}`) })
    const c = client({ writeContract: write })
    const error = await failure(registerAgent({ client: c, registry: REGISTRY, agentURI: URI }))
    expect(error).toMatchObject({ phase: "broadcast", broadcast: "unknown" })
    expect(JSON.stringify(error)).not.toContain(PRIVATE_DIAGNOSTIC)
    expect(write).toHaveBeenCalledTimes(1)
    expect(c.getTransactionReceipt).not.toHaveBeenCalled()
  })
  it("resumes a known hash without gas checks, journaling, or another write", async () => {
    const c = client()
    const onBroadcast = vi.fn()
    expect(await Effect.runPromise(registerAgent({ client: c, registry: REGISTRY, agentURI: URI,
      resumeTxHash: HASH, onBroadcast
    }))).toEqual({ agentId: "42", txHash: HASH })
    expect(c.getBalance).not.toHaveBeenCalled()
    expect(c.writeContract).not.toHaveBeenCalled()
    expect(onBroadcast).not.toHaveBeenCalled()
    expect(c.getTransactionReceipt).toHaveBeenCalledExactlyOnceWith({ hash: HASH })
  })
  it.each(["0xregtx", PRIVATE_DIAGNOSTIC])("refuses malformed resume hashes before any IO", async (resumeTxHash) => {
    const c = client()
    expect(await failure(registerAgent({ client: c, registry: REGISTRY, agentURI: URI, resumeTxHash }))).toMatchObject({ broadcast: "not-sent" })
    expect(c.writeContract).not.toHaveBeenCalled()
    expect(c.getTransactionReceipt).not.toHaveBeenCalled()
  })
  it.each(["reverted", "pending", "0x1"])("does not confuse receipt status %s with success", async (status) => {
    const c = client({ getTransactionReceipt: async () => ({ status, logs: [registered()] }) })
    expect(await failure(registerAgent({ client: c, registry: REGISTRY, agentURI: URI }))).toMatchObject({ txHash: HASH })
    expect(c.readContract).not.toHaveBeenCalled()
    expect(c.writeContract).toHaveBeenCalledTimes(1)
  })
  it("retains the hash when a confirmed transaction has no trustworthy mint", async () => {
    const c = client({ getTransactionReceipt: async () => ({ status: "success", logs: [registered(1n), transfer(2n)] }) })
    expect(await failure(registerAgent({ client: c, registry: REGISTRY, agentURI: URI }))).toMatchObject({ txHash: HASH, phase: "logs" })
    expect(c.readContract).not.toHaveBeenCalled()
  })
  it.each([OTHER, undefined, true])("refuses a confirmed mint without verified current seller ownership", async (owner) => {
    const c = client({ readContract: async () => owner })
    expect(await failure(registerAgent({ client: c, registry: REGISTRY, agentURI: URI }))).toMatchObject({ txHash: HASH, phase: "ownership" })
  })
  it("sanitizes an ownership read error while retaining its recovery hash", async () => {
    const c = client({ readContract: async () => { throw new Error(PRIVATE_DIAGNOSTIC) } })
    const error = await failure(registerAgent({ client: c, registry: REGISTRY, agentURI: URI }))
    expect(error).toMatchObject({ txHash: HASH, phase: "ownership" })
    expect(JSON.stringify(error)).not.toContain(PRIVATE_DIAGNOSTIC)
  })
  it.each([[registered()], [transfer()]])("does not adopt a resumed mint for another skill's URI", async (...logs) => {
    const c = client({
      getTransactionReceipt: async () => ({ status: "success", logs: logs.flat() }),
      readContract: async (args) => (args as { functionName: string }).functionName === "ownerOf" ? SELLER : "https://hub.example/another-skill"
    })
    const error = await failure(registerAgent({ client: c, registry: REGISTRY, agentURI: URI, resumeTxHash: HASH }))
    expect(error).toMatchObject({ txHash: HASH, phase: "uri" })
    expect(c.writeContract).not.toHaveBeenCalled()
  })
  it("does not adopt a resumed mint when its token URI is unreadable", async () => {
    const c = client({ readContract: async (args) => {
      if ((args as { functionName: string }).functionName === "ownerOf") return SELLER
      throw new Error(PRIVATE_DIAGNOSTIC)
    } })
    const error = await failure(registerAgent({ client: c, registry: REGISTRY, agentURI: URI, resumeTxHash: HASH }))
    expect(error).toMatchObject({ txHash: HASH, phase: "uri" })
    expect(JSON.stringify(error)).not.toContain(PRIVATE_DIAGNOSTIC)
  })
  it.effect("polls a known hash once per backoff tick without broadcasting again", () => Effect.gen(function* () {
    const first = yield* Deferred.make<void>()
    let reads = 0
    const c = client({ getTransactionReceipt: async ({ hash }) => {
      expect(hash).toBe(HASH)
      reads += 1
      if (reads === 1) { Effect.runSync(Deferred.succeed(first, undefined)); throw new Error("pending") }
      return { status: "success", logs: [registered()] }
    } })
    const fiber = yield* Effect.fork(registerAgent({ client: c, registry: REGISTRY, agentURI: URI }))
    yield* Deferred.await(first)
    yield* TestClock.adjust(RECEIPT_POLL_INTERVAL_MS - 1)
    expect(reads).toBe(1)
    yield* TestClock.adjust(1)
    expect(yield* Fiber.join(fiber)).toEqual({ agentId: "42", txHash: HASH })
    expect(reads).toBe(2)
    expect(c.writeContract).toHaveBeenCalledTimes(1)
  }))
  it.effect("bounds receipt retries and exposes only the known recovery hash", () => Effect.gen(function* () {
    const c = client({ getTransactionReceipt: vi.fn(async () => { throw new Error(PRIVATE_DIAGNOSTIC) }) })
    const fiber = yield* Effect.fork(Effect.either(registerAgent({ client: c, registry: REGISTRY, agentURI: URI })))
    yield* TestClock.adjust("2 minutes")
    const result = yield* Fiber.join(fiber)
    expect(result._tag).toBe("Left")
    if (result._tag === "Left") expect(result.left).toMatchObject({ txHash: HASH, phase: "receipt", broadcast: "submitted" })
    expect(JSON.stringify(result)).not.toContain(PRIVATE_DIAGNOSTIC)
    expect(c.getTransactionReceipt).toHaveBeenCalledTimes(5)
    expect(c.writeContract).toHaveBeenCalledTimes(1)
  }))
})

describe("operator approval", () => {
  it("skips a genuinely existing approval", async () => {
    const c = client({ readContract: async () => true })
    expect(await Effect.runPromise(approveOperator({ client: c, registry: REGISTRY, operator: OTHER }))).toEqual({ txHash: "", alreadyApproved: true })
    expect(c.writeContract).not.toHaveBeenCalled()
  })
  it.each(["false", 1, {}, null, undefined])("refuses an unknown approval response", async (value) => {
    const c = client({ readContract: async () => value })
    expect(await failure(approveOperator({ client: c, registry: REGISTRY, operator: OTHER }))).toBeInstanceOf(IdentityFailed)
    expect(c.writeContract).not.toHaveBeenCalled()
  })
  it("reports approval only after a successful receipt", async () => {
    const c = client()
    expect(await Effect.runPromise(approveOperator({ client: c, registry: REGISTRY, operator: OTHER }))).toEqual({ txHash: HASH, alreadyApproved: false })
    expect(c.writeContract).toHaveBeenCalledExactlyOnceWith({ address: REGISTRY, abi: IDENTITY_REGISTRY_ABI, functionName: "setApprovalForAll", args: [OTHER, true] })
    expect(c.getTransactionReceipt).toHaveBeenCalledExactlyOnceWith({ hash: HASH })
  })
  it("retains a reverted approval hash and does not retry its broadcast", async () => {
    const c = client({ getTransactionReceipt: async () => ({ status: "reverted", logs: [] }) })
    expect(await failure(approveOperator({ client: c, registry: REGISTRY, operator: OTHER }))).toMatchObject({ txHash: HASH, phase: "reverted" })
    expect(c.writeContract).toHaveBeenCalledTimes(1)
  })
  it("rejects zero/self operators before any contract call", async () => {
    for (const operator of [zeroAddress, SELLER]) {
      const c = client()
      await failure(approveOperator({ client: c, registry: REGISTRY, operator }))
      expect(c.readContract).not.toHaveBeenCalled()
      expect(c.writeContract).not.toHaveBeenCalled()
    }
  })
})

describe("real Viem client, offline HTTP boundary", () => {
  it("normalizes the same optional key prefix accepted by seller wallet resolution", () => {
    expect(makeViemIdentityClient({ privateKey: FIXTURE_KEY.slice(2) }).address).toBe(SELLER)
  })
  it("refuses a pending mainnet configuration without touching HTTP", () => {
    vi.stubEnv("ARCADE_NETWORK", "arc-mainnet")
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    expect(() => makeViemIdentityClient({ privateKey: FIXTURE_KEY })).toThrow(IdentityFailed)
    expect(fetch).not.toHaveBeenCalled()
  })
  it("refuses a mismatched RPC chain before transaction preparation or broadcast", async () => {
    const methods: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
      const req = JSON.parse(String(init.body)) as { id: number; method: string }
      methods.push(req.method)
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: "0x1" }))
    }))
    const c = makeViemIdentityClient({ privateKey: FIXTURE_KEY })
    await expect(c.writeContract({ address: REGISTRY, abi: IDENTITY_REGISTRY_ABI, functionName: "register", args: [URI] })).rejects.toMatchObject({ broadcast: "not-sent", phase: "preflight" })
    expect(methods).toEqual(["eth_chainId"])
  })
  it("does not retry an unreadable chain preflight or leak its RPC diagnostic", async () => {
    const fetch = vi.fn(async () => { throw new Error(PRIVATE_DIAGNOSTIC) })
    vi.stubGlobal("fetch", fetch)
    const c = makeViemIdentityClient({ privateKey: FIXTURE_KEY })
    const error = await c.writeContract({}).catch((error: unknown) => error)
    expect(error).toBeInstanceOf(IdentityFailed)
    expect(JSON.stringify(error)).not.toContain(PRIVATE_DIAGNOSTIC)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it("forbids transport redirects for key-consuming requests", async () => {
    const redirects: Array<RequestRedirect | undefined> = []
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
      redirects.push(init.redirect)
      throw new Error("offline redirect sentinel")
    }))
    const c = makeViemIdentityClient({ privateKey: FIXTURE_KEY })
    await c.writeContract({}).catch(() => {})
    expect(redirects).toEqual(["error"])
  })
  it.each(["writeContract", "getBalance", "readContract", "getTransactionReceipt"])("sanitizes direct real-client %s failures", async (method) => {
    const methods: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
      const req = JSON.parse(String(init.body)) as { id: number; method: string }
      methods.push(req.method)
      return new Response(JSON.stringify(req.method === "eth_chainId"
        ? { jsonrpc: "2.0", id: req.id, result: "0x4cef52" }
        : { jsonrpc: "2.0", id: req.id, error: { code: -32000, message: PRIVATE_DIAGNOSTIC } }))
    }))
    const c = makeViemIdentityClient({ privateKey: FIXTURE_KEY })
    const error = await (method === "getBalance" ? c.getBalance({ address: SELLER })
      : method === "getTransactionReceipt" ? c.getTransactionReceipt({ hash: HASH })
      : method === "readContract" ? c.readContract({ address: REGISTRY, abi: IDENTITY_REGISTRY_ABI, functionName: "ownerOf", args: [42n] })
      : c.writeContract({ address: REGISTRY, abi: IDENTITY_REGISTRY_ABI, functionName: "register", args: [URI] })).catch((error: unknown) => error)
    expect(error).toBeInstanceOf(IdentityFailed)
    expect(JSON.stringify(error)).not.toContain(PRIVATE_DIAGNOSTIC)
    expect(methods.some((method) => method !== "eth_chainId")).toBe(true)
  })
  it("accepts a matching receipt without changing the public receipt interface", async () => {
    const methods: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
      const req = JSON.parse(String(init.body)) as { id: number; method: string; params: string[] }
      methods.push(req.method)
      expect(req.params).toEqual([HASH])
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id,
        result: { transactionHash: HASH, status: "0x1", logs: [registered()] }
      }))
    }))
    const receipt = await makeViemIdentityClient({ privateKey: FIXTURE_KEY }).getTransactionReceipt({ hash: HASH })
    expect(receipt).toMatchObject({ status: "success", logs: [{ address: REGISTRY }] })
    expect(Object.keys(receipt).sort()).toEqual(["logs", "status"])
    expect(methods).toEqual(["eth_getTransactionReceipt"])
  })
  it("rejects a successful RPC receipt for a different transaction hash", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => {
      const req = JSON.parse(String(init.body)) as { id: number }
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id,
        result: { transactionHash: `0x${"cd".repeat(32)}`, status: "0x1", logs: [] }
      }))
    }))
    const c = makeViemIdentityClient({ privateKey: FIXTURE_KEY })
    await expect(c.getTransactionReceipt({ hash: HASH })).rejects.toMatchObject({ txHash: HASH, phase: "receipt" })
  })
})
