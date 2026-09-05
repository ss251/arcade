import { expect } from "bun:test"
import { fileURLToPath } from "node:url"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Store } from "../../../../apps/hub/src/store.ts"
const fixtureNativeFetch = globalThis.fetch

/** Owned literal-loopback listeners only; await shutdown and prove refusal. */
export async function withSessionLoopback<A>(handler: (request: Request) => Response | Promise<Response>,
  work: (origin: string) => Promise<A>): Promise<A> {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler })
  const origin = server.url.origin
  try { return await work(origin) }
  finally {
    await server.stop(true)
    await expect(fixtureNativeFetch(origin, { redirect: "error", credentials: "omit", signal: AbortSignal.timeout(500) })).rejects.toThrow()
  }
}

export const inertFetch = (work: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>): typeof fetch =>
  Object.assign(work, { preconnect() { throw Error("fixture preconnect forbidden") } })

const bounded = async <A>(value: Promise<A>, ms: number): Promise<A> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([value, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("Owned session fixture deadline")), ms) })]) }
  finally { if (timer !== undefined) clearTimeout(timer) }
}

type SessionRuntimeMode = "import-only" | "sdk-import" | "test-success" | "test-release" | "gateway-success"
/** The mode list is private test data, not a production CLI or arbitrary command seam. */
export async function runSessionRuntimeChild(mode: SessionRuntimeMode) {
  const child = Bun.spawn([process.execPath, "--no-env-file", fileURLToPath(import.meta.url), mode], {
    cwd: fileURLToPath(new URL("../../../../", import.meta.url)), env: { PATH: "", ARCADE_NETWORK: "arc-testnet" },
    stdin: "ignore", stdout: "pipe", stderr: "pipe"
  })
  let bytes = 0
  const drain = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader(), chunks: Uint8Array[] = []
    try { for (;;) { const next = await reader.read(); if (next.done) break
      bytes += next.value.length
      if (bytes > 32768) { child.kill("SIGKILL"); throw Error("Owned session fixture output bound") }
      chunks.push(next.value.slice())
    } return Buffer.concat(chunks).toString("utf8") } finally { reader.releaseLock() }
  }
  const drained = Promise.all([drain(child.stdout), drain(child.stderr)])
  // Register immediately so cleanup cannot leave a rejected drain unobserved.
  void drained.catch(() => {})
  try {
    const exitCode = await bounded(child.exited, 8000)
    const [stdout, stderr] = await bounded(drained, 1000)
    return { exitCode, stdout, stderr }
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM")
      try { await bounded(child.exited, 500) } catch { child.kill("SIGKILL"); await bounded(child.exited, 1000) }
    }
    await bounded(drained, 1000)
    if (child.exitCode === null && child.signalCode === null) throw Error("Owned session fixture was not reaped")
  }
}

let phase = "import"
async function sdkImports() {
  let requests = 0, keyReads = 0
  const originalFetch = globalThis.fetch, originalEnv = process.env
  globalThis.fetch = inertFetch(async () => { requests++; throw Error("Fixture forbids external requests") })
  process.env = new Proxy(originalEnv, { get(target, name) {
    if (typeof name === "string" && /(?:KEY|TOKEN|SECRET)/.test(name)) { keyReads++; throw Error("Fixture credential read refused") }
    return Reflect.get(target, name)
  } })
  try {
    const [root, subpath] = await Promise.all([import("@arcade/buyer"), import("@arcade/buyer/session")])
    expect(root.openSession).toBe(subpath.openSession)
    expect(root.openSessionPromise).toBe(subpath.openSessionPromise)
    expect(root.BuyerSessionFailure).toBe(subpath.BuyerSessionFailure)
    expect(requests).toBe(0); expect(keyReads).toBe(0)
    return root
  } finally { globalThis.fetch = originalFetch; process.env = originalEnv }
}

async function realSession(mode: "test-success" | "test-release" | "gateway-success", providedStore?: Store, facilitatorOrigin?: string) {
  const sdk = await sdkImports()
  const [{ Effect, Ref }, core, payments, accounts, stores, brokerModule, sessionsModule, railsModule, lifecycleModule, callModule] = await Promise.all([
    import("effect"), import("@arcade/core"), import("@arcade/payments"), import("viem/accounts"),
    import("../../../../apps/hub/src/store.ts"), import("../../../../apps/hub/src/broker.ts"),
    import("../../../../apps/hub/src/sessions.ts"), import("../../../../apps/hub/src/rails.ts"),
    import("../../../../apps/hub/src/server-sessions.ts"), import("../../../../apps/hub/src/server-session-calls.ts")
  ])
  // Public deterministic, unfunded fixture identity; never fetched from env/Keychain.
  const account = accounts.privateKeyToAccount(`0x${"01".repeat(32)}`), seller = `0x${"b".repeat(40)}`
  const chain = core.loadChainConfig("arc-testnet"), secret = "owned-session-sdk-test-secret"
  const store = providedStore ?? await Effect.runPromise(stores.StoreTag.pipe(Effect.provide(stores.StoreLive)))
  const broker = await Effect.runPromise(brokerModule.BrokerTag.pipe(Effect.provide(brokerModule.BrokerLive)))
  const railState = Effect.runSync(Ref.make(payments.makeTestState({}, 1_000_000n)))
  const gateway = mode === "gateway-success", succeeds = mode !== "test-release"
  const rail = gateway ? payments.makeGatewayRail({ facilitatorUrl: facilitatorOrigin! }) : payments.makeTestRail(railState)
  const rails = railsModule.makeRails(rail, [])
  const sessions = sessionsModule.makeSessions({ store, rails, chain })
  const listing = core.PublicListing.make({ id: "demo", serviceName: "demo", version: "1.0.0", description: "Owned fixture only", tags: [],
    price: "$0.10", inputSchema: { type: "object" }, outputSchema: { type: "object" }, bounds: core.Bounds.make({ timeoutSec: 2 }) })
  await Effect.runPromise(store.putListing({ listing, seller, runnerId: "runner_fixture", publishedAtMs: Date.now() }))
  let dispatches = 0, signatures = 0, externalRequests = 0
  const completions: Promise<void>[] = []
  await Effect.runPromise(broker.register({ runnerId: "runner_fixture", seller, close() {}, send(message) {
    if (message._tag !== "JobAssignment") return
    dispatches++
    expect(message.input).toEqual({ fixture: "original" })
    expect(Object.hasOwn(message, "sessionId")).toBe(false); expect(Object.hasOwn(message, "sessionToken")).toBe(false)
    const at = Date.now()
    completions.push(Effect.runPromise(broker.complete(message.jobId, core.JobOutcome.make({
      status: succeeds ? "succeeded" : "failed", output: { text: "UNTRUSTED_SELLER_OUTPUT" }, startedAtMs: at, finishedAtMs: at
    }))))
  } }, ["demo"]))
  const lifecycle = lifecycleModule.makeSessionRoutes({ sessions, rails, sessionStorage: store.sessionStorage, hubSecret: secret, configuredHubSecret: secret })
  const paid = callModule.makeSessionCallRoutes({ store, sessions, rails, chain, broker, hubSecret: secret, configuredHubSecret: secret, publicOrigin: u => u.origin })
  const nativeFetch = globalThis.fetch, requests: Request[] = []
  globalThis.fetch = inertFetch(async (input, init) => {
    const target = new URL(input instanceof Request ? input.url : String(input))
    if (gateway && target.origin === facilitatorOrigin) return nativeFetch(input, init)
    externalRequests++; throw Error("Owned fixture forbids external requests")
  })
  try {
    return await withSessionLoopback(async request => {
      const path = new URL(request.url).pathname
      if (path === "/listings/demo" && request.method === "GET") {
        const record = await Effect.runPromise(store.getListing("demo"))
        return Response.json({ ...record.listing, seller: record.seller })
      }
      return await lifecycle(request) ?? await paid(request) ?? Response.json({ error: "not_found" }, { status: 404 })
    }, async origin => {
      const fetcher = inertFetch(async (input, init) => {
        phase = "fetch-construct"
        const request = new Request(input, init), target = new URL(request.url)
        if (target.origin !== origin || target.search !== "" || target.hash !== "") { externalRequests++; throw Error("Owned target refused") }
        requests.push(request.clone())
        phase = "fetch-policy"
        // Bun's Request constructor reports credentials:"include" even when
        // explicitly given omit. Assert the actual fetch boundary, not that shim.
        expect(init?.redirect).toBe("error"); expect(init?.credentials).toBe("omit")
        phase = "fetch-native"
        const response = await nativeFetch(input, init)
        phase = `fetch-response-${response.status}`
        return response
      })
      const signer = { ...account, signTypedData: ((args: Parameters<typeof account.signTypedData>[0]) => {
        signatures++; return account.signTypedData(args)
      }) as typeof account.signTypedData }
      phase = "open"
      const session = await sdk.openSessionPromise({ hubUrl: origin, account: signer, budgetUsd: "0.50", rail: gateway ? "gateway" : "test", fetch: fetcher })
      expect(Object.isFrozen(session)).toBe(true); expect(session.buyer).toBe(account.address.toLowerCase())
      phase = "quote"
      const quote = await session.quote({ seller: "demo", skillId: "demo", input: { fixture: "original" }, maxWaitMs: 2000 })
      expect(quote).toEqual({ priceAtomic: 100000n, rail: gateway ? "gateway" : "test", network: chain.caip2,
        serviceName: "demo", skillId: "demo", skillVersion: "1.0.0", seller })
      expect(signatures).toBe(0); expect(dispatches).toBe(0)
      expect((await session.status()).localIssuedAtomic).toBe(0n)
      expect(await Effect.runPromise(store.allReceipts)).toHaveLength(0)
      phase = "call"
      const result = await session.call({ seller: "demo", skillId: "demo", input: { fixture: "original" }, maxAmountAtomic: 100000n, maxWaitMs: 2000, pollIntervalMs: 5 })
      expect(result.authorizedAmountAtomic).toBe(100000n)
      expect(result.status).toBe(succeeds ? "succeeded" : "rejected")
      expect(result.result).toEqual(succeeds ? { text: "UNTRUSTED_SELLER_OUTPUT" } : null)
      expect(result.receipt.settled).toBe(succeeds)
      expect(result.receipt.explorer).toBeNull()
      if (succeeds) { expect(result.receipt.settleRefKind).toBe(gateway ? "gateway-transfer" : "test"); expect(result.fencedResult).toContain("UNTRUSTED") }
      phase = "status"
      const status = await session.status()
      expect(status.localIssuedAtomic).toBe(100000n)
      expect(status.localConfirmedAtomic).toBe(succeeds ? 100000n : 0n)
      expect(status.localExposureAtomic).toBe(succeeds ? 0n : 100000n)
      expect(status.heldAtomic).toBe(0n)
      phase = "close"
      const receipt = await session.close()
      expect(receipt.complete).toBe(true); expect(receipt.settledCalls).toBe(succeeds ? 1 : 0)
      expect(receipt.spentAtomic).toBe(succeeds ? "100000" : "0")
      phase = "closed-status"
      expect((await session.status()).localIssuedAtomic).toBe(100000n)
      const posts = requests.filter(r => r.method === "POST" && new URL(r.url).pathname === "/x/demo/demo")
      const polls = requests.filter(r => new URL(r.url).pathname.startsWith("/jobs/"))
      expect(posts).toHaveLength(3); expect(polls.length).toBeGreaterThan(0)
      expect(posts[0]!.headers.has("payment-signature")).toBe(false)
      expect(posts[1]!.headers.has("payment-signature")).toBe(false)
      expect(posts[2]!.headers.has("payment-signature")).toBe(true)
      for (const request of [...posts, ...polls]) {
        expect(request.headers.get("x-arcade-session")).toBe(session.id)
        expect(request.headers.get("x-session-token")).toMatch(/^[0-9a-f]{32}$/)
      }
      for (const request of polls) expect(request.headers.get("x-job-token")).toMatch(/^[0-9a-f]{32}$/)
      for (const request of posts) expect(await request.text()).toBe('{"fixture":"original"}')
      const serialized = JSON.stringify(session, (_key, v) => typeof v === "bigint" ? String(v) : v)
      expect(serialized).not.toContain(posts[0]!.headers.get("x-session-token")!)
      expect(dispatches).toBe(1); expect(signatures).toBe(1); expect(externalRequests).toBe(0)
      expect((await Effect.runPromise(store.allReceipts))).toHaveLength(1)
      return { mode, closed: receipt.complete, settledCalls: receipt.settledCalls, issuedAtomic: status.localIssuedAtomic.toString(),
        exposureAtomic: status.localExposureAtomic.toString(), dispatches, signatures, polls: polls.length, externalRequests }
    })
  } finally {
    globalThis.fetch = nativeFetch
    await Effect.runPromise(broker.unregister("runner_fixture"))
    await bounded(Promise.allSettled(completions), 1000)
  }
}

async function gatewaySession() {
  const { openSqliteStore } = await import("../../../../apps/hub/src/store-sqlite.ts")
  const { Effect } = await import("effect")
  const directory = mkdtempSync(join(tmpdir(), "arcade-session-sdk-")), path = join(directory, "ledger.sqlite")
  let closeDisk = () => {}
  const calls: string[] = []
  try {
    const disk = openSqliteStore(path, "session_sdk_fixture"); closeDisk = disk.close
    const proof = await withSessionLoopback(async request => {
      const path = new URL(request.url).pathname
      expect(request.method).toBe("POST"); expect(request.headers.get("authorization")).toBeNull()
      expect(["/v1/x402/verify", "/v1/x402/settle"]).toContain(path)
      calls.push(path)
      const body = await request.json() as { paymentPayload: { payload: { signature: string; authorization: { from: string; value: string } } }; paymentRequirements: { amount: string } }
      expect(body.paymentPayload.payload.signature).toMatch(/^0x[0-9a-f]{130}$/)
      expect(body.paymentPayload.payload.authorization.value).toBe("100000"); expect(body.paymentRequirements.amount).toBe("100000")
      const payer = body.paymentPayload.payload.authorization.from
      return Response.json(path.endsWith("/verify") ? { isValid: true, payer } : {
        success: true, payer, network: "eip155:5042002", transaction: "12345678-1234-4123-8123-123456789abc"
      })
    }, origin => realSession("gateway-success", disk.store, origin))
    expect(calls).toEqual(["/v1/x402/verify", "/v1/x402/settle"])
    disk.close()
    const reopened = openSqliteStore(path, "session_sdk_reopened")
    try {
      const rows = await Effect.runPromise(reopened.store.allReceipts)
      expect(rows).toHaveLength(1); expect(rows[0]!.settleRefKind).toBe("gateway-transfer")
      expect(rows[0]!.settleTx).toBe("12345678-1234-4123-8123-123456789abc")
      const snapshot = await Effect.runPromise(reopened.store.getSessionSnapshot(rows[0]!.sessionId!))
      if (snapshot === undefined) throw Error("Owned persisted session is missing")
      expect(snapshot.session.closedAtMs).toBeDefined(); expect(snapshot.calls).toHaveLength(1)
      expect(snapshot.session.spentAtomic).toBe(100000n)
    } finally { reopened.close() }
    return { ...proof, facilitatorCalls: calls.length, reopened: true, settlementKind: "gateway-transfer" }
  } finally { try { closeDisk() } finally { rmSync(directory, { recursive: true }) } }
}

if (import.meta.main) {
  const fuse = setTimeout(() => process.exit(91), 7000)
  try {
    const mode = process.argv[2]
    if (mode === "import-only") console.log("SESSION_FIXTURE_IMPORT_READY")
    else if (mode === "sdk-import") {
      const sdk = await sdkImports()
      let requests = 0
      const error = await sdk.openSessionPromise({ hubUrl: "javascript:refused", budgetUsd: "1", account: {} as never,
        fetch: inertFetch(async () => { requests++; throw Error("PRIVATE_PROVIDER") }) }).catch(e => e as unknown)
      expect(error).toBeInstanceOf(sdk.BuyerSessionFailure)
      expect(error).toMatchObject({ code: "input_invalid", phase: "unsigned", authorizedAmountAtomic: 0n })
      expect(String(error)).not.toMatch(/PRIVATE|FiberFailure/); expect(requests).toBe(0)
      console.log("SESSION_SDK_IMPORT_READY")
    }
    else if (mode === "test-success" || mode === "test-release") console.log(JSON.stringify(await realSession(mode)))
    else if (mode === "gateway-success") console.log(JSON.stringify(await gatewaySession()))
    else throw Error("Owned fixture mode refused")
  } catch (error) {
    const code = error !== null && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[a-z_]{1,40}$/.test(error.code) ? error.code : "fixture_assertion"
    console.error(`SESSION_FIXTURE_FAILED:${phase}:${code}`); process.exitCode = 1
  }
  finally { clearTimeout(fuse) }
}
