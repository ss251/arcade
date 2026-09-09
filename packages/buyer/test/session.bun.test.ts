import { expect, test } from "bun:test"
import { inertFetch, runSessionRuntimeChild, withSessionLoopback } from "./fixtures/session-runtime.ts"

const loadHttp = () => import("../src/session-http.ts")
const url = "https://fixture.invalid/sessions"
const options = (signal = new AbortController().signal, duration = 1000, maxBytes = 1024) =>
  ({ signal, deadlineMs: performance.now() + duration, maxBytes })
const input = () => ({ method: "POST" as const, headers: { "content-type": "application/json", "x-session-token": "a".repeat(32) }, body: '{"input":"original"}' })
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

test("session HTTP native chunked JSON preserves private headers, exact body and status without retry", async () => {
  const { sessionRequest } = await loadHttp()
  let calls = 0
  await withSessionLoopback(async request => {
    calls++
    expect(request.method).toBe("POST")
    expect(request.headers.get("x-session-token")).toBe("a".repeat(32))
    expect(request.headers.get("accept-encoding")).toBe("identity")
    expect(request.headers.get("cookie")).toBeNull()
    expect(await request.text()).toBe('{"input":"original"}')
    const bytes = new TextEncoder().encode('{"message":"λ","pending":true}')
    return new Response(new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 13)); c.enqueue(bytes.slice(13)); c.close() } }),
      { status: 402, headers: { "content-type": "application/json; charset=utf-8" } })
  }, async origin => {
    expect(await sessionRequest(fetch, `${origin}/sessions`, input(), options())).toEqual({ status: 402, body: { message: "λ", pending: true } })
  })
  expect(calls).toBe(1)
})

test("session HTTP native redirect never forwards session or payment capabilities to another origin", async () => {
  const { sessionRequest } = await loadHttp()
  let sourceCalls = 0, foreignCalls = 0
  await withSessionLoopback(() => { foreignCalls++; return Response.json({ unexpected: true }) }, async foreign => {
    await withSessionLoopback(() => { sourceCalls++; return new Response(null, { status: 307, headers: { location: `${foreign}/capture` } }) }, async origin => {
      await expect(sessionRequest(fetch, `${origin}/sessions`, input(), options())).rejects.toMatchObject({ _tag: "SessionHttpFailure" })
    })
  })
  expect(sourceCalls).toBe(1); expect(foreignCalls).toBe(0)
})

test("session HTTP real unfinished body shares the fixed five-second request deadline", async () => {
  const { sessionRequest } = await loadHttp()
  let calls = 0, canceled = false
  await withSessionLoopback(() => {
    calls++
    return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"pending":')) }, cancel() { canceled = true } }),
      { headers: { "content-type": "application/json" } })
  }, async origin => {
    const start = performance.now()
    await expect(sessionRequest(fetch, `${origin}/sessions`, input(), options(undefined, 15_000))).rejects.toMatchObject({ _tag: "SessionHttpFailure" })
    expect(performance.now() - start).toBeGreaterThanOrEqual(4800)
    expect(performance.now() - start).toBeLessThan(6000)
  })
  expect(calls).toBe(1); expect(canceled).toBe(true)
}, 8000)

test("session HTTP snapshots method/body/own headers before any asynchronous work", async () => {
  const { sessionRequest } = await loadHttp()
  const init = input(); let release!: () => void
  const fetcher = inertFetch(async (_url, received) => {
    await new Promise<void>(resolve => { release = resolve })
    expect(received?.method).toBe("POST"); expect(received?.body).toBe('{"input":"original"}')
    expect(new Headers(received?.headers).get("x-session-token")).toBe("a".repeat(32))
    expect(received?.redirect).toBe("error"); expect(received?.credentials).toBe("omit")
    return Response.json({ ok: true })
  })
  const running = sessionRequest(fetcher, url, init, options())
  init.body = "MUTATED"; init.headers["x-session-token"] = "MUTATED"
  release(); expect(await running).toEqual({ status: 200, body: { ok: true } })
})

test("session HTTP rejects unsafe targets, malformed data and accessors without IO or coercion", async () => {
  const { sessionRequest } = await loadHttp()
  let calls = 0, reads = 0
  const fetcher = inertFetch(async () => { calls++; return Response.json({}) })
  const invalidUrls = ["http://example.com/sessions", "https://user:pass@fixture.invalid/sessions", `${url}?token=secret`, `${url}#fragment`,
    "https://fixture.invalid/a/../sessions", "https://fixture.invalid/%73essions", "https://fixture.invalid\\sessions", " https://fixture.invalid/sessions"]
  for (const value of invalidUrls) await expect(sessionRequest(fetcher, value, input(), options())).rejects.toMatchObject({ _tag: "SessionHttpFailure" })
  const accessor = Object.defineProperty({}, "x-session-token", { enumerable: true, get() { reads++; throw Error("PRIVATE_GETTER") } })
  for (const change of [{ headers: accessor }, { headers: { cookie: "PRIVATE_COOKIE" } }, { method: "PUT" }, { body: new ReadableStream() },
    { headers: { "x-session-token": "bad\r\nheader" } }, { unknown: "PRIVATE_EXTRA" }]) {
    await expect(sessionRequest(fetcher, url, { ...input(), ...change } as never, options())).rejects.toMatchObject({ _tag: "SessionHttpFailure" })
  }
  expect(calls).toBe(0); expect(reads).toBe(0)
})

test("session HTTP pre-abort and expired monotonic deadline never invoke fetch", async () => {
  const { sessionRequest } = await loadHttp()
  let calls = 0; const fetcher = inertFetch(async () => { calls++; return Response.json({}) })
  const controller = new AbortController(); controller.abort("PRIVATE_ABORT_REASON")
  for (const opts of [options(controller.signal), options(undefined, -1), { ...options(), deadlineMs: Infinity }, { ...options(), maxBytes: Infinity }]) {
    await expect(sessionRequest(fetcher, url, input(), opts)).rejects.toMatchObject({ _tag: "SessionHttpFailure" })
  }
  expect(calls).toBe(0)
})

test("session HTTP deadline closes a late uncooperative fetch body and cannot retry", async () => {
  const { sessionRequest } = await loadHttp()
  let release!: (response: Response) => void, calls = 0, canceled = false
  const running = sessionRequest(inertFetch(async () => { calls++; return new Promise<Response>(resolve => { release = resolve }) }), url, input(), options(undefined, 30))
  await expect(running).rejects.toMatchObject({ _tag: "SessionHttpFailure" })
  release(new Response(new ReadableStream({ cancel() { canceled = true } }), { headers: { "content-type": "application/json" } }))
  await delay(5); expect(canceled).toBe(true); expect(calls).toBe(1)
})

test("session HTTP interruption with uncooperative cancellation is bounded and never reflects its reason", async () => {
  const { sessionRequest } = await loadHttp()
  const controller = new AbortController(); let canceled = false
  const fetcher = inertFetch(async () => new Response(new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode('{"private":"prefix')) },
    cancel() { canceled = true; return new Promise(() => {}) }
  }), { headers: { "content-type": "application/json" } }))
  const start = performance.now(), running = sessionRequest(fetcher, url, input(), options(controller.signal))
  const timer = setTimeout(() => controller.abort("PRIVATE_ABORT_REASON"), 20)
  try {
    const error = await running.catch(e => e as unknown)
    expect(error).toMatchObject({ _tag: "SessionHttpFailure" }); expect(String(error)).not.toContain("PRIVATE")
    expect(performance.now() - start).toBeLessThan(250); expect(canceled).toBe(true)
  } finally { clearTimeout(timer) }
})

test.each([
  ["type", new TextEncoder().encode('{}'), { "content-type": "text/html" }],
  ["encoding", new TextEncoder().encode('{}'), { "content-type": "application/json", "content-encoding": "gzip" }],
  ["short-length", new TextEncoder().encode('{}'), { "content-type": "application/json", "content-length": "3" }],
  ["long-length", new TextEncoder().encode('{}'), { "content-type": "application/json", "content-length": "1" }],
  ["noncanonical-length", new TextEncoder().encode('{}'), { "content-type": "application/json", "content-length": "02" }],
  ["fatal-utf8", new Uint8Array([0xff]), { "content-type": "application/json" }],
  ["invalid-json", new TextEncoder().encode('{'), { "content-type": "application/json" }],
  ["oversize", new TextEncoder().encode('{"a":"' + 'x'.repeat(1024) + '"}'), { "content-type": "application/json" }]
] as const)("session HTTP rejects %s response without exposing provider bytes", async (_name, bytes, headers) => {
  const { sessionRequest } = await loadHttp()
  await expect(sessionRequest(inertFetch(async () => new Response(bytes, { headers })), url, input(), options())).rejects.toMatchObject({ _tag: "SessionHttpFailure" })
})

test("session HTTP rejects drifted response URLs and raw provider failures without diagnostic reflection", async () => {
  const { sessionRequest } = await loadHttp()
  const response = Response.json({ token: "PRIVATE_BODY" }); Object.defineProperty(response, "url", { value: "https://foreign.invalid/sessions" })
  for (const fetcher of [inertFetch(async () => response), inertFetch(async () => { throw Error("PRIVATE_TOKEN aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") })]) {
    const error = await sessionRequest(fetcher, url, input(), options()).catch(e => e as unknown)
    expect(error).toMatchObject({ _tag: "SessionHttpFailure" }); expect(String(error)).not.toMatch(/PRIVATE|aaaaaaaa/)
  }
})

test("session HTTP bounds exact request-copy bytes and rejects one byte over before fetch", async () => {
  const { sessionRequest } = await loadHttp()
  let calls = 0
  const fetcher = inertFetch(async (_url, init) => { calls++; expect(new TextEncoder().encode(String(init?.body)).length).toBe(1_048_576); return Response.json({}) })
  await sessionRequest(fetcher, url, { ...input(), body: "x".repeat(1_048_576) }, options())
  await expect(sessionRequest(fetcher, url, { ...input(), body: "x".repeat(1_048_577) }, options())).rejects.toMatchObject({ _tag: "SessionHttpFailure" })
  expect(calls).toBe(1)
})

test("session HTTP refuses a consecutive-empty-chunk storm before unbounded per-read work", async () => {
  const { sessionRequest } = await loadHttp()
  let pulls = 0, canceled = false
  const response = new Response(new ReadableStream<Uint8Array>({
    pull(c) { pulls++; c.enqueue(new Uint8Array()) }, cancel() { canceled = true }
  }), { headers: { "content-type": "application/json" } })
  await expect(sessionRequest(inertFetch(async () => response), url, input(), options(undefined, 150))).rejects.toMatchObject({ _tag: "SessionHttpFailure" })
  expect(pulls).toBeLessThanOrEqual(1026)
  expect(canceled).toBe(true)
}, 1000)

test("session native fixture executes in a separate no-env Bun process and is fully reaped", async () => {
  const result = await runSessionRuntimeChild("import-only")
  expect(result.exitCode).toBe(0)
  expect(result.stdout).toBe("SESSION_FIXTURE_IMPORT_READY\n")
  expect(result.stderr).toBe("")
}, 10_000)

test("session actual root and wildcard package imports are key/network inert in a script process", async () => {
  const result = await runSessionRuntimeChild("sdk-import")
  expect(result).toEqual({ exitCode: 0, stdout: "SESSION_SDK_IMPORT_READY\n", stderr: "" })
}, 10_000)

test.each(["test-success", "test-release"] as const)("session Promise SDK crosses real hub/Broker/ledger facades: %s", async mode => {
  const result = await runSessionRuntimeChild(mode)
  expect(result.stderr).toBe(""); expect(result.exitCode).toBe(0)
  const proof = JSON.parse(result.stdout) as Record<string, unknown>
  expect(proof).toMatchObject({ mode, closed: true, settledCalls: mode === "test-success" ? 1 : 0, issuedAtomic: "100000",
    exposureAtomic: mode === "test-success" ? "0" : "100000", dispatches: 1, signatures: 1, externalRequests: 0 })
  expect(proof.polls).toBeGreaterThan(0)
}, 10_000)

test("session actual Gateway signer/verifier crosses SQLite hub facades and reopens one UUID receipt", async () => {
  const result = await runSessionRuntimeChild("gateway-success")
  expect(result.stderr).toBe(""); expect(result.exitCode).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ mode: "gateway-success", closed: true, settledCalls: 1, issuedAtomic: "100000",
    exposureAtomic: "0", dispatches: 1, signatures: 1, externalRequests: 0, facilitatorCalls: 2, reopened: true, settlementKind: "gateway-transfer" })
}, 10_000)
