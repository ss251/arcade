import { afterEach, describe, expect, it, vi } from "vitest"
import { Effect, Fiber } from "effect"
import { createServer, type ServerResponse } from "node:http"
import {
  GraphFromEnv,
  GraphOff,
  GraphTag,
  makeGraph,
  type AgentEvidence,
  type GraphStats,
  type TreeView
} from "../src/graph.ts"

const URL_ = "https://graph.example/query/arcade-ledger"
const TREE = `0x${"ab".repeat(32)}`
const ROOT_TX = `0x${"cd".repeat(32)}`
const SPLITTER = `0x${"12".repeat(20)}`

const json = (
  body: unknown,
  status = 200,
  headers: Readonly<Record<string, string>> = {}
): Response => {
  const text = typeof body === "string" ? body : JSON.stringify(body)
  return new Response(text, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-encoding": "identity",
      "content-length": String(Buffer.byteLength(text)),
      ...headers
    }
  })
}

const meta = (number = 4_211) => ({ block: { number }, hasIndexingErrors: false })

const statsBody = (marketplace: Readonly<Record<string, unknown>> = {}) => ({
  data: {
    _meta: meta(),
    marketplace: {
      id: "arcade",
      settlementCount: "12",
      treeCount: "3",
      settledVolumeAtomic: "1250000",
      feeAtomic: "62500",
      childTotalAtomic: "140000",
      agentCount: "4",
      feedbackCount: "9",
      validationPassCount: "7",
      ...marketplace
    }
  }
})

const evidenceBody = (
  listingId = "counterparty-graph",
  listing: Readonly<Record<string, unknown>> = {}
) => ({
  data: {
    _meta: meta(),
    listing: {
      id: listingId,
      agent: {
        id: "5042002:7",
        chainId: "5042002",
        agentId: "7",
        agentURI: "https://hub.example/listings/counterparty-graph/agent-registration.json",
        feedbackCount: "5",
        validationPassCount: "4",
        listing: { id: listingId }
      },
      feeSplitter: {
        id: SPLITTER,
        firstSeenBlock: "4000",
        settlementCount: "11",
        settledVolumeAtomic: "550000",
        listing: { id: listingId }
      },
      ...listing
    }
  }
})

const treeBody = (tree: Readonly<Record<string, unknown>> = {}) => ({
  data: {
    _meta: meta(),
    tree: {
      id: TREE,
      childCount: 2,
      childTotalAtomic: "40000",
      blockNumber: "4100",
      timestamp: "1757000000",
      txHash: ROOT_TX,
      root: { txHash: ROOT_TX, blockNumber: "4100", totalAtomic: "150000" },
      ...tree
    }
  }
})

type Call = { readonly url: string; readonly init: RequestInit; readonly body: Record<string, unknown> }
const recordingFetch = (
  respond: (call: Call, index: number) => Response | Promise<Response>
): { readonly fetch: typeof fetch; readonly calls: Call[] } => {
  const calls: Call[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = {
      url: String(input),
      init: init ?? {},
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
    }
    calls.push(call)
    return respond(call, calls.length - 1)
  }) as typeof fetch
  return { fetch: fetchImpl, calls }
}

const readFrom = <A>(layer: typeof GraphOff, use: (graph: {
  readonly stats: () => Effect.Effect<GraphStats | null>
  readonly evidenceFor: (id: string) => Effect.Effect<AgentEvidence | null>
  readonly treeFor: (hash: string) => Effect.Effect<TreeView | null>
}) => Effect.Effect<A>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* use(yield* GraphTag)
    }).pipe(Effect.provide(layer))
  )

const savedGraphEnv = {
  url: process.env["ARCADE_GRAPH_URL"],
  key: process.env["ARCADE_GRAPH_KEY"],
  ttl: process.env["ARCADE_GRAPH_TTL_MS"]
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  for (const [name, value] of [
    ["ARCADE_GRAPH_URL", savedGraphEnv.url],
    ["ARCADE_GRAPH_KEY", savedGraphEnv.key],
    ["ARCADE_GRAPH_TTL_MS", savedGraphEnv.ttl]
  ] as const) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe("hub Graph service", () => {
  it("reads exact marketplace aggregates through a fixed credential-minimal request", async () => {
    const { fetch, calls } = recordingFetch(() => json(statsBody()))
    const graph = makeGraph({ url: URL_, apiKey: "fixture-key", fetchImpl: fetch })

    await expect(Effect.runPromise(graph.stats())).resolves.toEqual({
      settlementCount: 12,
      treeCount: 3,
      settledVolumeAtomic: 1_250_000n,
      feeAtomic: 62_500n,
      childTotalAtomic: 140_000n,
      agentCount: 4,
      feedbackCount: 9,
      validationPassCount: 7,
      indexedBlock: 4_211
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(URL_)
    expect(calls[0]!.init).toMatchObject({ method: "POST", redirect: "error", credentials: "omit" })
    const headers = new Headers(calls[0]!.init.headers)
    expect(headers.get("authorization")).toBe("Bearer fixture-key")
    expect(headers.get("accept-encoding")).toBe("identity")
    expect(headers.get("cookie")).toBeNull()
    expect(calls[0]!.body["variables"]).toEqual({})
    expect(String(calls[0]!.body["query"])).toContain("marketplace(id: \"arcade\")")
    expect(String(calls[0]!.body["query"])).toContain("hasIndexingErrors")
  })

  it("binds listing, Arc agent, splitter and counters exactly", async () => {
    const { fetch, calls } = recordingFetch(() => json(evidenceBody()))
    const graph = makeGraph({ url: URL_, fetchImpl: fetch })

    await expect(Effect.runPromise(graph.evidenceFor("counterparty-graph"))).resolves.toEqual({
      agentId: "5042002:7",
      agentUrl: "https://hub.example/listings/counterparty-graph/agent-registration.json",
      settlementCount: 11,
      settledVolumeAtomic: 550_000n,
      feedbackCount: 5,
      validationPassCount: 4
    })
    expect(calls[0]!.body["variables"]).toEqual({ id: "counterparty-graph" })
    expect(String(calls[0]!.body["query"])).not.toContain("counterparty-graph")
    expect(String(calls[0]!.body["query"])).toContain("_meta")
  })

  it("binds a canonical tree hash to one coherent root settlement", async () => {
    const { fetch, calls } = recordingFetch(() => json(treeBody()))
    const graph = makeGraph({ url: URL_, fetchImpl: fetch })

    await expect(Effect.runPromise(graph.treeFor(TREE.toUpperCase().replace("0X", "0x")))).resolves.toEqual({
      treeHash: TREE,
      childCount: 2,
      childTotalAtomic: 40_000n,
      rootTxHash: ROOT_TX,
      totalAtomic: 150_000n,
      timestampMs: 1_757_000_000_000
    })
    expect(calls[0]!.body["variables"]).toEqual({ id: TREE })
    expect(String(calls[0]!.body["query"])).not.toContain(TREE)
    expect(String(calls[0]!.body["query"])).toContain("_meta")
  })

  it("returns null rather than manufacturing zero from malformed counts or money", async () => {
    const malformed = [
      { settlementCount: undefined },
      { settlementCount: "01" },
      { settlementCount: "9007199254740992" },
      { settledVolumeAtomic: undefined },
      { settledVolumeAtomic: -1 },
      { settledVolumeAtomic: "-1" },
      { feeAtomic: "1250001" },
      { treeCount: "13" }
    ]
    for (const patch of malformed) {
      const graph = makeGraph({ url: URL_, fetchImpl: recordingFetch(() => json(statsBody(patch))).fetch })
      expect(await Effect.runPromise(graph.stats())).toBeNull()
    }

    // Child work is paid by the hiring seller's wallet, so it is not bounded by the
    // buyer-to-root volume. Preserve the exact indexed aggregate even when it is larger.
    const graph = makeGraph({
      url: URL_,
      fetchImpl: recordingFetch(() => json(statsBody({ childTotalAtomic: "1250001" }))).fetch
    })
    await expect(Effect.runPromise(graph.stats())).resolves.toMatchObject({ childTotalAtomic: 1_250_001n })
  })

  it("returns null for missing or incoherent metadata on every query", async () => {
    for (const body of [
      { ...statsBody(), data: { ...statsBody().data, _meta: undefined } },
      { ...statsBody(), data: { ...statsBody().data, _meta: { block: { number: 4_211 }, hasIndexingErrors: true } } },
      { ...statsBody(), data: { ...statsBody().data, _meta: { block: { number: Number.NaN }, hasIndexingErrors: false } } },
      { ...statsBody(), data: { ...statsBody().data, _meta: { block: { number: 0 }, hasIndexingErrors: false } } }
    ]) {
      const graph = makeGraph({ url: URL_, fetchImpl: recordingFetch(() => json(body)).fetch })
      expect(await Effect.runPromise(graph.stats())).toBeNull()
    }

    const evidence = evidenceBody()
    const noEvidenceMeta = { data: { ...evidence.data, _meta: undefined } }
    expect(await Effect.runPromise(makeGraph({ url: URL_, fetchImpl: recordingFetch(() => json(noEvidenceMeta)).fetch })
      .evidenceFor("counterparty-graph"))).toBeNull()

    const tree = treeBody()
    const badTreeMeta = { data: { ...tree.data, _meta: { block: { number: 4_000 }, hasIndexingErrors: false } } }
    expect(await Effect.runPromise(makeGraph({ url: URL_, fetchImpl: recordingFetch(() => json(badTreeMeta)).fetch })
      .treeFor(TREE))).toBeNull()

    const oversizedMetaInt = { data: { ...statsBody().data, _meta: { block: { number: 2_147_483_648 }, hasIndexingErrors: false } } }
    expect(await Effect.runPromise(makeGraph({ url: URL_, fetchImpl: recordingFetch(() => json(oversizedMetaInt)).fetch })
      .stats())).toBeNull()
  })

  it("returns null for mismatched listing, relationship, agent and tree identities", async () => {
    const wrongListings = [
      evidenceBody("another-listing"),
      evidenceBody("counterparty-graph", { agent: { ...evidenceBody().data.listing.agent, id: "1:7" } }),
      evidenceBody("counterparty-graph", { agent: { ...evidenceBody().data.listing.agent, agentId: "07" } }),
      evidenceBody("counterparty-graph", { agent: { ...evidenceBody().data.listing.agent, feedbackCount: 5 } }),
      evidenceBody("counterparty-graph", { agent: { ...evidenceBody().data.listing.agent, listing: { id: "other" } } }),
      evidenceBody("counterparty-graph", { feeSplitter: null }),
      evidenceBody("counterparty-graph", { feeSplitter: { ...evidenceBody().data.listing.feeSplitter, settlementCount: undefined } }),
      evidenceBody("counterparty-graph", { feeSplitter: { ...evidenceBody().data.listing.feeSplitter, settledVolumeAtomic: -1 } }),
      evidenceBody("counterparty-graph", { feeSplitter: { ...evidenceBody().data.listing.feeSplitter, listing: { id: "other" } } })
    ]
    for (const body of wrongListings) {
      const graph = makeGraph({ url: URL_, fetchImpl: recordingFetch(() => json(body)).fetch })
      expect(await Effect.runPromise(graph.evidenceFor("counterparty-graph"))).toBeNull()
    }

    const wrongTrees = [
      treeBody({ id: `0x${"ef".repeat(32)}` }),
      treeBody({ childCount: -1 }),
      treeBody({ childCount: 2_147_483_648 }),
      treeBody({ childTotalAtomic: undefined }),
      treeBody({ blockNumber: "4212" }),
      treeBody({ txHash: `0x${"ef".repeat(32)}` }),
      treeBody({ root: { ...treeBody().data.tree.root, totalAtomic: 1 } }),
      treeBody({ timestamp: "9007199254741" })
    ]
    for (const body of wrongTrees) {
      const graph = makeGraph({ url: URL_, fetchImpl: recordingFetch(() => json(body)).fetch })
      expect(await Effect.runPromise(graph.treeFor(TREE))).toBeNull()
    }
  })

  it("fails soft on HTTP, GraphQL, network, framing and body failures", async () => {
    const failures: Array<typeof fetch> = [
      recordingFetch(() => json({}, 503)).fetch,
      recordingFetch(() => json({ errors: [{ message: "provider detail" }], data: statsBody().data })).fetch,
      recordingFetch(() => json(statsBody(), 200, { "content-length": "1" })).fetch,
      recordingFetch(() => json(statsBody(), 200, { "content-encoding": "gzip" })).fetch,
      recordingFetch(() => json(statsBody(), 200, { "x-oversized": "x".repeat(16_385) })).fetch,
      recordingFetch(() => json({ ...statsBody(), padding: "x".repeat(65_536) })).fetch,
      recordingFetch(() => new Response("x".repeat(65_537), {
        headers: { "content-type": "application/json", "content-encoding": "identity" }
      })).fetch,
      recordingFetch(() => json("{" )).fetch,
      (async () => { throw new Error("provider URL and credential detail") }) as typeof fetch
    ]
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {})
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    for (const fetchImpl of failures) {
      expect(await Effect.runPromise(makeGraph({ url: URL_, apiKey: "must-not-log", fetchImpl }).stats())).toBeNull()
    }
    expect(stderr).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it("accepts bounded chunked JSON when content-length is absent", async () => {
    const text = JSON.stringify(statsBody())
    const fetchImpl = recordingFetch(() => new Response(text, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-encoding": "identity"
      }
    })).fetch

    await expect(Effect.runPromise(makeGraph({ url: URL_, fetchImpl }).stats()))
      .resolves.toMatchObject({ indexedBlock: 4_211, settlementCount: 12 })
  })

  it("caches bounded snapshots, refetches at ttl, and evicts beyond 256 keys", async () => {
    let now = 1_000
    vi.spyOn(Date, "now").mockImplementation(() => now)
    const stats = recordingFetch(() => json(statsBody()))
    const graph = makeGraph({ url: URL_, fetchImpl: stats.fetch, ttlMs: 10 })
    await Effect.runPromise(graph.stats())
    now = 1_009
    await Effect.runPromise(graph.stats())
    expect(stats.calls).toHaveLength(1)
    now = 1_010
    await Effect.runPromise(graph.stats())
    expect(stats.calls).toHaveLength(2)

    const evidence = recordingFetch((call) => {
      const id = (call.body["variables"] as { id: string }).id
      return json(evidenceBody(id, {
        agent: { ...evidenceBody().data.listing.agent, agentURI: null, listing: { id } },
        feeSplitter: { ...evidenceBody().data.listing.feeSplitter, listing: { id } }
      }))
    })
    const many = makeGraph({ url: URL_, fetchImpl: evidence.fetch, ttlMs: 300_000 })
    for (let n = 0; n < 257; n++) await Effect.runPromise(many.evidenceFor(`listing-${n}`))
    await Effect.runPromise(many.evidenceFor("listing-0"))
    expect(evidence.calls).toHaveLength(258)
  })

  it("singleflights identical reads and refuses work beyond the global inflight cap", async () => {
    let releaseStats!: (response: Response) => void
    const stats = recordingFetch(() => new Promise<Response>((resolve) => { releaseStats = resolve }))
    const graph = makeGraph({ url: URL_, fetchImpl: stats.fetch })
    const first = Effect.runPromise(graph.stats())
    const second = Effect.runPromise(graph.stats())
    await vi.waitFor(() => expect(stats.calls).toHaveLength(1))
    releaseStats(json(statsBody()))
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ indexedBlock: 4_211 }),
      expect.objectContaining({ indexedBlock: 4_211 })
    ])

    const releases: Array<() => void> = []
    const bounded = recordingFetch((call) => new Promise<Response>((resolve) => {
      const id = (call.body["variables"] as { id: string }).id
      releases.push(() => resolve(json(evidenceBody(id, {
        agent: { ...evidenceBody().data.listing.agent, listing: { id } },
        feeSplitter: { ...evidenceBody().data.listing.feeSplitter, listing: { id } }
      }))))
    }))
    const capped = makeGraph({ url: URL_, fetchImpl: bounded.fetch })
    const active = Array.from({ length: 8 }, (_, n) => Effect.runPromise(capped.evidenceFor(`active-${n}`)))
    await vi.waitFor(() => expect(bounded.calls).toHaveLength(8))
    await expect(Effect.runPromise(capped.evidenceFor("over-cap"))).resolves.toBeNull()
    expect(bounded.calls).toHaveLength(8)
    for (const release of releases) release()
    await expect(Promise.all(active)).resolves.toHaveLength(8)
  })

  it("aborts and cancels an unfinished body when the Effect is interrupted", async () => {
    let cancelled = false
    let requestSignal: AbortSignal | undefined
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{"))
      },
      cancel() {
        cancelled = true
      }
    })
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined
      return new Response(body, {
        headers: {
          "content-type": "application/json",
          "content-encoding": "identity",
          "content-length": "100"
        }
      })
    }) as typeof fetch
    const fiber = Effect.runFork(makeGraph({ url: URL_, fetchImpl }).stats())
    await vi.waitFor(() => expect(requestSignal).toBeDefined())
    await Effect.runPromise(Fiber.interrupt(fiber))
    await vi.waitFor(() => expect(cancelled).toBe(true))
    expect(requestSignal?.aborted).toBe(true)
  })

  it("cancels a late response body when a non-cooperative fetch resolves after interruption", async () => {
    let release!: (response: Response) => void
    let requestStarted = false
    let cancelled = false
    const fetchImpl = (async () => {
      requestStarted = true
      return await new Promise<Response>((resolve) => { release = resolve })
    }) as typeof fetch
    const fiber = Effect.runFork(makeGraph({ url: URL_, fetchImpl }).stats())
    await vi.waitFor(() => expect(requestStarted).toBe(true))
    await Effect.runPromise(Fiber.interrupt(fiber))

    release(new Response(new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true
      }
    }), {
      headers: {
        "content-type": "application/json",
        "content-encoding": "identity"
      }
    }))
    await vi.waitFor(() => expect(cancelled).toBe(true))
  })

  it("refuses a loopback redirect and times out an unfinished loopback body", async () => {
    const paths: string[] = []
    let hangingResponse: ServerResponse | undefined
    const server = createServer((request, response) => {
      paths.push(request.url ?? "")
      if (request.url === "/redirect") {
        response.writeHead(302, { location: "/followed" })
        response.end()
        return
      }
      if (request.url === "/hang") {
        hangingResponse = response
        response.writeHead(200, {
          "content-type": "application/json",
          "content-encoding": "identity"
        })
        response.write("{")
        return
      }
      response.writeHead(500)
      response.end()
    })
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", () => {
        server.removeListener("error", reject)
        resolve()
      })
    })
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("loopback server has no TCP address")

    try {
      const origin = `http://127.0.0.1:${address.port}`
      await expect(Effect.runPromise(makeGraph({ url: `${origin}/redirect` }).stats())).resolves.toBeNull()
      expect(paths).toEqual(["/redirect"])

      const startedAt = Date.now()
      await expect(Effect.runPromise(makeGraph({ url: `${origin}/hang` }).stats())).resolves.toBeNull()
      const elapsedMs = Date.now() - startedAt
      expect(elapsedMs).toBeGreaterThanOrEqual(4_500)
      expect(elapsedMs).toBeLessThan(7_500)
      expect(paths).toEqual(["/redirect", "/hang"])
    } finally {
      hangingResponse?.destroy()
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }, 8_000)

  it("disables invalid URLs, keys and environment TTLs without transport", async () => {
    const fetchImpl = vi.fn(async () => json(statsBody())) as unknown as typeof fetch
    for (const url of [
      "http://graph.example/query",
      "https://user:password@graph.example/query",
      "https://graph.example/query?token=secret",
      "https://graph.example/query#fragment"
    ]) {
      expect(await Effect.runPromise(makeGraph({ url, fetchImpl }).stats())).toBeNull()
    }
    expect(await Effect.runPromise(makeGraph({ url: URL_, apiKey: "bad\nkey", fetchImpl }).stats())).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()

    process.env["ARCADE_GRAPH_URL"] = URL_
    process.env["ARCADE_GRAPH_TTL_MS"] = "NaN"
    vi.stubGlobal("fetch", fetchImpl)
    await expect(readFrom(GraphFromEnv(), (graph) => graph.stats())).resolves.toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("allows explicit loopback configuration and GraphOff always remains unknown", async () => {
    const { fetch } = recordingFetch(() => json(statsBody()))
    await expect(Effect.runPromise(makeGraph({ url: "http://127.0.0.1:8787/graphql", fetchImpl: fetch }).stats()))
      .resolves.toMatchObject({ indexedBlock: 4_211 })
    await expect(readFrom(GraphOff, (graph) => graph.stats())).resolves.toBeNull()
    await expect(readFrom(GraphOff, (graph) => graph.evidenceFor("counterparty-graph"))).resolves.toBeNull()
    await expect(readFrom(GraphOff, (graph) => graph.treeFor(TREE))).resolves.toBeNull()
  })
})
