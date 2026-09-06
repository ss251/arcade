import { afterEach, describe, expect, it, vi } from "vitest"
import { readOrdinaryResult, readOrdinaryTree, OrdinaryJobHttpFailure, ORDINARY_BODY_LIMIT } from "../src/lib/ordinary-job-http.ts"

const ORIGIN = "https://hub.example", ID = `job_${"a".repeat(32)}`, TOKEN = "b".repeat(32)
const row = () => ({ jobId: ID, token: TOKEN, skillId: "diff-triage", priceAtomic: "10000", createdAtMs: 1,
  hubOrigin: ORIGIN, realm: "ordinary" })
const tree = () => ({ rootJobId: ID, complete: false, evidenceFlags: ["commitment-missing"], nodes: [
  { nodeId: "0", parentNodeId: null, skillId: "diff-triage", hop: 0, priceAtomic: "10000", price: "$0.01",
    settled: false, reason: "runner_lost", latencyMs: 1, explorer: null }
] })
const json = (text: string, headers: Record<string, string> = {}) => new Response(text, { headers: { "content-type": "application/json", ...headers } })
const finish = (p: Promise<unknown>) => p.then(() => "accepted", e => {
  expect(e).toBeInstanceOf(OrdinaryJobHttpFailure)
  expect(e).toMatchObject({ message: "Ordinary job request unavailable", code: "ordinary_job_unavailable" })
  return "refused"
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe("ordinary browser capability reads", () => {
  it("sends only captured header authority to a fixed result path without storage, cookies or Referer", async () => {
    let storageReads = 0
    vi.stubGlobal("window", Object.defineProperty({}, "localStorage", { get() { storageReads++; throw Error("private") } }))
    const fetcher = vi.fn(async () => Response.json({ job_id: ID, status: "succeeded", result: { arbitrary: true } }))
    expect(await readOrdinaryResult(row(), {}, fetcher)).toEqual({ status: 200,
      body: { job_id: ID, status: "succeeded", result: { arbitrary: true } } })
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${ORIGIN}/jobs/${ID}/result`)
    expect(init).toMatchObject({ method: "GET", credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer" })
    expect([...new Headers(init.headers)]).toEqual([["accept", "application/json"], ["x-job-token", TOKEN]])
    expect(init.body).toBeUndefined()
    expect(Object.isFrozen(init)).toBe(true)
    expect(Object.isFrozen(init.headers)).toBe(true)
    expect(storageReads).toBe(0)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it("does not call a raw result a receipt or follow its attacker-chosen URL", async () => {
    const raw = { poll_url: `https://evil.example/?token=${TOKEN}`, status: "succeeded", receipt: { settled: true } }
    const fetcher = vi.fn(async () => Response.json(raw, { status: 202 }))
    expect(await readOrdinaryResult(row(), {}, fetcher)).toEqual({ status: 202, body: raw })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it("uses the actual H4 tree decoder and strips unrecognized injected fields", async () => {
    const fetcher = vi.fn(async () => Response.json({ ...tree(), token: TOKEN }))
    const expected = tree()
    expected.nodes[0]!.reason = "not settled"
    expect(await readOrdinaryTree(row(), {}, fetcher)).toEqual(expected)
    expect((fetcher.mock.calls[0] as unknown as [string])[0]).toBe(`${ORIGIN}/trees/${ID}`)
  })
  it.each([404, 503])("does not reinterpret tree HTTP%s as an empty or complete tree", async status => {
    expect(await finish(readOrdinaryTree(row(), {}, async () => Response.json({ error: TOKEN }, { status })))).toBe("refused")
  })
  it("binds the decoded tree root to the captured ordinary job", async () => {
    expect(await finish(readOrdinaryTree(row(), {}, async () => Response.json({ ...tree(), rootJobId: `job_${"c".repeat(32)}` })))).toBe("refused")
  })
  it.each([
    { hubOrigin: "http://localhost:8787" }, { hubOrigin: "https://hub.example/" }, { hubOrigin: "https://u:p@hub.example" },
    { hubOrigin: "https://hub.example?token=private" }, { jobId: `${ID}/result?token=private` }, { token: "" },
    { token: `${TOKEN}\n` }, { realm: "session" }, { sessionId: `ses_${"a".repeat(32)}` }, { priceAtomic: "01" }
  ])("refuses invalid row %j before any fetch", async mutation => {
    const fetcher = vi.fn(async () => Response.json({}))
    expect(await finish(readOrdinaryResult({ ...row(), ...mutation }, {}, fetcher))).toBe("refused")
    expect(fetcher).not.toHaveBeenCalled()
  })
  it("captures row/options once before awaiting and never consults replacement global fetch", async () => {
    const input = row(), options = { timeoutMs: 500 }, late = vi.fn(async () => Response.json({}))
    let release!: (v: Response) => void
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { release = resolve }))
    const result = readOrdinaryResult(input, options, fetcher)
    input.hubOrigin = "https://evil.example"; input.token = "c".repeat(32); options.timeoutMs = 1
    vi.stubGlobal("fetch", late)
    release(Response.json({ ok: true }))
    expect(await result).toEqual({ status: 200, body: { ok: true } })
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${ORIGIN}/jobs/${ID}/result`)
    expect(new Headers(init.headers).get("x-job-token")).toBe(TOKEN)
    expect(late).not.toHaveBeenCalled()
  })
  it("refuses accessors/revoked inputs and options without invoking getters or fetch", async () => {
    let invoked = 0
    const fetcher = vi.fn(async () => Response.json({})), proxy = Proxy.revocable({}, {}); proxy.revoke()
    const v = { ...row(), get token() { invoked++; return TOKEN } }
    expect(await finish(readOrdinaryResult(v, {}, fetcher))).toBe("refused")
    expect(await finish(readOrdinaryResult(proxy.proxy, {}, fetcher))).toBe("refused")
    expect(await finish(readOrdinaryResult(row(), { get timeoutMs() { invoked++; return 1 } }, fetcher))).toBe("refused")
    expect(await finish(readOrdinaryResult(row(), proxy.proxy, fetcher))).toBe("refused")
    expect(invoked).toBe(0); expect(fetcher).not.toHaveBeenCalled()
  })
  it.each([0, -1, 90_001, 0.1, Infinity, NaN])("rejects invalid result timeout %s before IO", async timeoutMs => {
    const f = vi.fn(async () => Response.json({}))
    expect(await finish(readOrdinaryResult(row(), { timeoutMs }, f))).toBe("refused")
    expect(f).not.toHaveBeenCalled()
  })
  it("rejects a tree timeout exceeding ten seconds and unsupported options", async () => {
    const f = vi.fn(async () => Response.json(tree()))
    expect(await finish(readOrdinaryTree(row(), { timeoutMs: 10_001 }, f))).toBe("refused")
    expect(await finish(readOrdinaryTree(row(), { retry: 1 } as never, f))).toBe("refused")
    expect(f).not.toHaveBeenCalled()
  })
  it("accepts an exact byte cap, rejects cap+1, and checks declared versus actual length", async () => {
    const body = `"${"x".repeat(ORDINARY_BODY_LIMIT - 2)}"`
    expect((await readOrdinaryResult(row(), {}, async () => json(body, { "content-length": String(ORDINARY_BODY_LIMIT) }))).body).toHaveLength(ORDINARY_BODY_LIMIT - 2)
    expect(await finish(readOrdinaryResult(row(), {}, async () => json(`${body} `)))).toBe("refused")
    expect(await finish(readOrdinaryResult(row(), {}, async () => json("{}", { "content-length": "3" })))).toBe("refused")
  })
  it.each([
    { "content-type": "text/plain" }, { "content-type": "application/json; charset=latin1" },
    { "content-encoding": "gzip" }, { "content-length": "01" }, { "content-length": "-1" },
    { "content-length": "999999999999999999999999" }, { "content-length": "2", "transfer-encoding": "chunked" }
  ])("refuses unsupported response framing %j", async headers => {
    const cancel = vi.fn()
    const response = new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json", ...headers } })
    expect(await finish(readOrdinaryResult(row(), {}, async () => response))).toBe("refused")
    expect(cancel).toHaveBeenCalled()
  })
  it("uses fatal streamed UTF8 including the final decoder flush", async () => {
    const response = new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([0x22, 0xc3])); c.close() } }),
      { headers: { "content-type": "application/json" } })
    expect(await finish(readOrdinaryResult(row(), {}, async () => response))).toBe("refused")
    const valid = new Response(new ReadableStream({ start(c) {
      c.enqueue(new Uint8Array([0x22, 0xc3])); c.enqueue(new Uint8Array([0xa9, 0x22])); c.close()
    } }), { headers: { "content-type": "application/json" } })
    expect((await readOrdinaryResult(row(), {}, async () => valid)).body).toBe("é")
  })
  it.each(["", "{bad", "{} {}"])("refuses malformed or empty JSON %j", async body => {
    expect(await finish(readOrdinaryResult(row(), {}, async () => json(body)))).toBe("refused")
  })
  it("refuses redirects and response URL drift without following any URL", async () => {
    const cancel = vi.fn(), response = new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } })
    Object.defineProperty(response, "url", { value: "https://evil.example/result" })
    expect(await finish(readOrdinaryResult(row(), {}, async () => response))).toBe("refused")
    expect(cancel).toHaveBeenCalled()
    expect(await finish(readOrdinaryResult(row(), {}, async () => Response.redirect("https://evil.example")))).toBe("refused")
  })
  it("maps thrown provider/capability prose to fixed errors and never retries", async () => {
    const f = vi.fn(async () => { throw Error(`provider ${TOKEN}`) })
    expect(await finish(readOrdinaryResult(row(), {}, f))).toBe("refused")
    expect(f).toHaveBeenCalledTimes(1)
  })
  it("aborts before fetch, or during stalled headers, and cancels any late body", async () => {
    const controller = new AbortController(), f = vi.fn(async () => Response.json({}))
    controller.abort(TOKEN)
    expect(await finish(readOrdinaryResult(row(), { signal: controller.signal }, f))).toBe("refused")
    expect(f).not.toHaveBeenCalled()
    const active = new AbortController(), cancel = vi.fn()
    let release!: (v: Response) => void
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { release = resolve }))
    const pending = finish(readOrdinaryResult(row(), { signal: active.signal }, fetcher))
    active.abort(TOKEN)
    expect(await pending).toBe("refused")
    release(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } }))
    await Promise.resolve(); await Promise.resolve()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each([["result", 90_000], ["tree", 10_000]] as const)("bounds %s headers and full body to its default %i ms", async (kind, duration) => {
    vi.useFakeTimers()
    const cancel = vi.fn(), f = vi.fn(async () => new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } }))
    let done = false
    const p = finish((kind === "tree" ? readOrdinaryTree : readOrdinaryResult)(row(), {}, f)).then(v => { done = true; return v })
    await vi.advanceTimersByTimeAsync(duration - 1)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await p).toBe("refused")
    expect(cancel).toHaveBeenCalled()
    expect(f).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it("bounds uncooperative reader cancellation and releases the lock", async () => {
    vi.useFakeTimers()
    const response = new Response(new ReadableStream({ cancel: () => new Promise(() => {}) }), { headers: { "content-type": "application/json" } })
    const p = finish(readOrdinaryResult(row(), { timeoutMs: 10 }, async () => response))
    await vi.advanceTimersByTimeAsync(60)
    expect(await p).toBe("refused")
    expect(response.body?.locked).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
  it("expires stalled headers using one captured relative timeout, then cancels a late response", async () => {
    vi.useFakeTimers()
    let release!: (v: Response) => void
    const cancel = vi.fn(), fetcher = vi.fn(() => new Promise<Response>(resolve => { release = resolve }))
    const p = finish(readOrdinaryResult(row(), { timeoutMs: 20 }, fetcher))
    await vi.advanceTimersByTimeAsync(20)
    expect(await p).toBe("refused")
    release(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } }))
    await vi.advanceTimersByTimeAsync(0)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it("caller abort during a pending body read cancels and unlocks without reflecting its reason", async () => {
    const signal = new AbortController(), cancel = vi.fn()
    const response = new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } })
    const p = finish(readOrdinaryResult(row(), { signal: signal.signal }, async () => response))
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    signal.abort(`private ${TOKEN}`)
    expect(await p).toBe("refused")
    expect(cancel).toHaveBeenCalled()
    expect(response.body?.locked).toBe(false)
  })
  it("counts UTF8 bytes rather than text characters at the response boundary", async () => {
    const text = `"${"é".repeat(ORDINARY_BODY_LIMIT / 2)}"`
    expect(text.length).toBeLessThan(ORDINARY_BODY_LIMIT)
    expect(await finish(readOrdinaryResult(row(), {}, async () => json(text)))).toBe("refused")
  })
  it("refuses excessive headers before reading a body", async () => {
    const cancel = vi.fn()
    const response = new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json", "x-padding": "x".repeat(16_384) } })
    expect(await finish(readOrdinaryResult(row(), {}, async () => response))).toBe("refused")
    expect(cancel).toHaveBeenCalled()
  })
  it("bounds an immediate empty-chunk storm without starving the deadline event loop", async () => {
    let pulls = 0
    const cancel = vi.fn(), response = new Response(new ReadableStream({ pull(c) { pulls++; c.enqueue(new Uint8Array()) }, cancel }),
      { headers: { "content-type": "application/json" } })
    expect(await finish(readOrdinaryResult(row(), { timeoutMs: 100 }, async () => response))).toBe("refused")
    expect(pulls).toBeLessThanOrEqual(1027)
    expect(cancel).toHaveBeenCalled()
  })
  it("cleans up successful reads and does not reuse a completed read as a polling loop", async () => {
    vi.useFakeTimers()
    const response = Response.json({}), f = vi.fn(async () => response)
    const controller = new AbortController(), add = vi.spyOn(controller.signal, "addEventListener"), remove = vi.spyOn(controller.signal, "removeEventListener")
    await readOrdinaryResult(row(), { signal: controller.signal }, f)
    expect(response.body?.locked).toBe(false)
    expect(add).toHaveBeenCalledTimes(1); expect(remove).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0); expect(f).toHaveBeenCalledTimes(1)
  })
})
