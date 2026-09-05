import { Context, Effect, Layer } from "effect"

/**
 * Read-only evidence from ARCADE's ledger subgraph.
 *
 * The hub's Store remains authoritative for jobs, receipts, budgets and settlement. Every
 * failure here becomes `null`, including malformed provider data and configuration, so this
 * service cannot change a payment outcome. The configured endpoint is never logged.
 */

export interface GraphStats {
  readonly settlementCount: number
  readonly treeCount: number
  readonly settledVolumeAtomic: bigint
  readonly feeAtomic: bigint
  readonly childTotalAtomic: bigint
  readonly agentCount: number
  readonly feedbackCount: number
  readonly validationPassCount: number
  readonly indexedBlock: number
}

export interface AgentEvidence {
  readonly agentId: string
  readonly agentUrl: string | null
  readonly settlementCount: number
  readonly settledVolumeAtomic: bigint
  readonly feedbackCount: number
  readonly validationPassCount: number
}

export interface TreeView {
  readonly treeHash: string
  readonly childCount: number
  readonly childTotalAtomic: bigint
  readonly rootTxHash: string
  readonly totalAtomic: bigint
  readonly timestampMs: number
}

export interface Graph {
  readonly stats: () => Effect.Effect<GraphStats | null>
  readonly evidenceFor: (listingId: string) => Effect.Effect<AgentEvidence | null>
  readonly treeFor: (treeHash: string) => Effect.Effect<TreeView | null>
}

export class GraphTag extends Context.Tag("@arcade/hub/Graph")<GraphTag, Graph>() {}

const STATS_QUERY = `query Stats {
  _meta { block { number } hasIndexingErrors }
  marketplace(id: "arcade") {
    id settlementCount treeCount settledVolumeAtomic feeAtomic childTotalAtomic
    agentCount feedbackCount validationPassCount
  }
}`

const EVIDENCE_QUERY = `query Evidence($id: ID!) {
  _meta { block { number } hasIndexingErrors }
  listing(id: $id) {
    id
    agent {
      id chainId agentId agentURI feedbackCount validationPassCount
      listing { id }
    }
    feeSplitter {
      id firstSeenBlock settlementCount settledVolumeAtomic
      listing { id }
    }
  }
}`

const TREE_QUERY = `query TreeByHash($id: Bytes!) {
  _meta { block { number } hasIndexingErrors }
  tree(id: $id) {
    id childCount childTotalAtomic blockNumber timestamp txHash
    root { txHash blockNumber totalAtomic }
  }
}`

const ARC_CHAIN_ID = "5042002"
const UINT256_MAX = (1n << 256n) - 1n
const GRAPHQL_INT_MAX = 2_147_483_647
const MAX_REQUEST_BYTES = 16_384
const MAX_RESPONSE_HEADER_BYTES = 16_384
const MAX_RESPONSE_BYTES = 65_536
const REQUEST_TIMEOUT_MS = 5_000
const MAX_CACHE_ENTRIES = 256
const MAX_INFLIGHT = 8
const MAX_TTL_MS = 300_000
const REFUSED = Symbol("graph-read-refused")

type JsonRecord = Record<string, unknown>
type GraphValue = GraphStats | AgentEvidence | TreeView

interface CacheEntry {
  readonly atMs: number
  readonly value: GraphValue | null
}

interface Pending {
  readonly controller: AbortController
  promise: Promise<GraphValue | null>
  waiters: number
  settled: boolean
}

const record = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null

const uint = (value: unknown): bigint | null => {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(value)) return null
  try {
    const parsed = BigInt(value)
    return parsed <= UINT256_MAX ? parsed : null
  } catch {
    return null
  }
}

const count = (value: unknown): number | null => {
  const parsed = uint(value)
  return parsed !== null && parsed <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(parsed) : null
}

const int = (value: unknown, positive = false): number | null =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= (positive ? 1 : 0) &&
  value <= GRAPHQL_INT_MAX
    ? value
    : null

const hash = (value: unknown): value is string =>
  typeof value === "string" && /^0x[0-9a-f]{64}$/.test(value)

const address = (value: unknown): value is string =>
  typeof value === "string" && /^0x[0-9a-f]{40}$/.test(value) && !/^0x0{40}$/.test(value)

const listingId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9][a-z0-9-]{1,63}$/.test(value)

const configuredUrl = (raw: unknown): string | null => {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2_048 || /[\s\\\u0000-\u001f\u007f]/.test(raw)) {
    return null
  }
  try {
    const parsed = new URL(raw)
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
    if (
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback))
    ) {
      return null
    }
    return parsed.href
  } catch {
    return null
  }
}

const publicAgentUrl = (raw: unknown): string | null | undefined => {
  if (raw === null) return null
  if (typeof raw !== "string") return undefined
  return configuredUrl(raw) ?? undefined
}

const validApiKey = (value: string | undefined): boolean =>
  value === undefined || value === "" || (value.length <= 4_096 && !/[\u0000-\u001f\u007f]/.test(value))

const validTtl = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 1 && value <= MAX_TTL_MS

const envelope = (value: unknown): { readonly data: JsonRecord; readonly indexedBlock: number } | null => {
  const outer = record(value)
  if (outer === null) return null
  const errors = outer["errors"]
  if (errors !== undefined && (!Array.isArray(errors) || errors.length !== 0)) return null
  const data = record(outer["data"])
  const meta = data === null ? null : record(data["_meta"])
  const block = meta === null ? null : record(meta["block"])
  const indexedBlock = block === null ? null : int(block["number"], true)
  if (data === null || meta?.["hasIndexingErrors"] !== false || indexedBlock === null) return null
  return { data, indexedBlock }
}

const decodeStats = (value: unknown): GraphStats | null => {
  const decoded = envelope(value)
  const marketplace = decoded === null ? null : record(decoded.data["marketplace"])
  if (decoded === null || marketplace === null || marketplace["id"] !== "arcade") return null

  const settlementCount = count(marketplace["settlementCount"])
  const treeCount = count(marketplace["treeCount"])
  const settledVolumeAtomic = uint(marketplace["settledVolumeAtomic"])
  const feeAtomic = uint(marketplace["feeAtomic"])
  const childTotalAtomic = uint(marketplace["childTotalAtomic"])
  const agentCount = count(marketplace["agentCount"])
  const feedbackCount = count(marketplace["feedbackCount"])
  const validationPassCount = count(marketplace["validationPassCount"])
  if (
    settlementCount === null ||
    treeCount === null ||
    settledVolumeAtomic === null ||
    feeAtomic === null ||
    childTotalAtomic === null ||
    agentCount === null ||
    feedbackCount === null ||
    validationPassCount === null ||
    treeCount > settlementCount ||
    feeAtomic > settledVolumeAtomic
  ) {
    return null
  }
  return Object.freeze({
    settlementCount,
    treeCount,
    settledVolumeAtomic,
    feeAtomic,
    childTotalAtomic,
    agentCount,
    feedbackCount,
    validationPassCount,
    indexedBlock: decoded.indexedBlock
  })
}

const decodeEvidence = (value: unknown, expectedListingId: string): AgentEvidence | null => {
  const decoded = envelope(value)
  const listing = decoded === null ? null : record(decoded.data["listing"])
  const agent = listing === null ? null : record(listing["agent"])
  const splitter = listing === null ? null : record(listing["feeSplitter"])
  const agentListing = agent === null ? null : record(agent["listing"])
  const splitterListing = splitter === null ? null : record(splitter["listing"])
  if (
    decoded === null ||
    listing === null ||
    agent === null ||
    splitter === null ||
    agentListing === null ||
    splitterListing === null ||
    listing["id"] !== expectedListingId ||
    agentListing["id"] !== expectedListingId ||
    splitterListing["id"] !== expectedListingId ||
    agent["chainId"] !== ARC_CHAIN_ID ||
    !address(splitter["id"])
  ) {
    return null
  }

  const rawAgentId = agent["agentId"]
  const parsedAgentId = uint(rawAgentId)
  const firstSeenBlock = count(splitter["firstSeenBlock"])
  const settlementCount = count(splitter["settlementCount"])
  const settledVolumeAtomic = uint(splitter["settledVolumeAtomic"])
  const feedbackCount = count(agent["feedbackCount"])
  const validationPassCount = count(agent["validationPassCount"])
  const agentUrl = publicAgentUrl(agent["agentURI"])
  if (
    parsedAgentId === null ||
    typeof rawAgentId !== "string" ||
    agent["id"] !== `${ARC_CHAIN_ID}:${rawAgentId}` ||
    firstSeenBlock === null ||
    firstSeenBlock < 1 ||
    firstSeenBlock > decoded.indexedBlock ||
    settlementCount === null ||
    settledVolumeAtomic === null ||
    feedbackCount === null ||
    validationPassCount === null ||
    agentUrl === undefined
  ) {
    return null
  }
  return Object.freeze({
    agentId: `${ARC_CHAIN_ID}:${rawAgentId}`,
    agentUrl,
    settlementCount,
    settledVolumeAtomic,
    feedbackCount,
    validationPassCount
  })
}

const decodeTree = (value: unknown, expectedTreeHash: string): TreeView | null => {
  const decoded = envelope(value)
  const tree = decoded === null ? null : record(decoded.data["tree"])
  const root = tree === null ? null : record(tree["root"])
  if (decoded === null || tree === null || root === null || tree["id"] !== expectedTreeHash) return null

  const childCount = int(tree["childCount"])
  const childTotalAtomic = uint(tree["childTotalAtomic"])
  const blockNumber = count(tree["blockNumber"])
  const rootBlockNumber = count(root["blockNumber"])
  const totalAtomic = uint(root["totalAtomic"])
  const timestamp = uint(tree["timestamp"])
  const treeTxHash = tree["txHash"]
  const rootTxHash = root["txHash"]
  if (
    childCount === null ||
    childTotalAtomic === null ||
    (childCount === 0 && childTotalAtomic !== 0n) ||
    blockNumber === null ||
    rootBlockNumber !== blockNumber ||
    blockNumber < 1 ||
    blockNumber > decoded.indexedBlock ||
    totalAtomic === null ||
    timestamp === null ||
    timestamp < 1n ||
    timestamp > BigInt(Math.floor(Number.MAX_SAFE_INTEGER / 1_000)) ||
    !hash(treeTxHash) ||
    !hash(rootTxHash) ||
    treeTxHash !== rootTxHash
  ) {
    return null
  }
  return Object.freeze({
    treeHash: expectedTreeHash,
    childCount,
    childTotalAtomic,
    rootTxHash,
    totalAtomic,
    timestampMs: Number(timestamp) * 1_000
  })
}

const graphOff: Graph = {
  stats: () => Effect.succeed(null),
  evidenceFor: () => Effect.succeed(null),
  treeFor: () => Effect.succeed(null)
}

export { graphOff }

export const makeGraph = (opts: {
  readonly url: string
  readonly apiKey?: string | undefined
  readonly ttlMs?: number | undefined
  readonly fetchImpl?: typeof fetch | undefined
}): Graph => {
  const url = configuredUrl(opts.url)
  const ttlMs = opts.ttlMs ?? 30_000
  if (url === null || !validApiKey(opts.apiKey) || !validTtl(ttlMs)) return graphOff

  const fetchImpl = opts.fetchImpl ?? fetch
  const cache = new Map<string, CacheEntry>()
  const inFlight = new Map<string, Pending>()

  const cachePut = (key: string, value: GraphValue | null): void => {
    if (cache.has(key)) cache.delete(key)
    else if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(key, { atMs: Date.now(), value })
  }

  const post = async (
    document: string,
    variables: Readonly<Record<string, unknown>>,
    controller: AbortController
  ): Promise<unknown> => {
    const encoded = JSON.stringify({ query: document, variables })
    if (Buffer.byteLength(encoded) > MAX_REQUEST_BYTES) throw REFUSED
    const headers = new Headers({
      accept: "application/json",
      "accept-encoding": "identity",
      "content-type": "application/json"
    })
    if (opts.apiKey !== undefined && opts.apiKey !== "") headers.set("authorization", `Bearer ${opts.apiKey}`)

    let response: Response | undefined
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    let onAbort: (() => void) | undefined
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    const stopped = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(REFUSED)
      controller.signal.addEventListener("abort", onAbort, { once: true })
      if (controller.signal.aborted) onAbort()
    })
    const download = async (): Promise<unknown> => {
      response = await fetchImpl(url, {
        method: "POST",
        headers,
        body: encoded,
        redirect: "error",
        credentials: "omit",
        signal: controller.signal
      })
      if (controller.signal.aborted) {
        // A supplied fetch may ignore AbortSignal and resolve after the caller timed out or
        // was interrupted. The outer finally already ran while `response` was unavailable,
        // so this late-resolution branch must release the newly arrived body itself.
        if (response.body !== null) void response.body.cancel().catch(() => {})
        throw REFUSED
      }
      const contentLength = response.headers.get("content-length")
      const contentType = response.headers.get("content-type")
      const contentEncoding = response.headers.get("content-encoding")
      // `Headers` does not expose the status line, but count every accessible field with
      // its wire separators and the terminating CRLF rather than just its payload bytes.
      let headerBytes = 2
      response.headers.forEach((value, name) => {
        headerBytes += Buffer.byteLength(name) + Buffer.byteLength(value) + 4
      })
      if (
        response.status !== 200 ||
        !response.ok ||
        response.redirected ||
        response.body === null ||
        headerBytes > MAX_RESPONSE_HEADER_BYTES ||
        (contentLength !== null &&
          (!/^(0|[1-9][0-9]*)$/.test(contentLength) || Number(contentLength) > MAX_RESPONSE_BYTES)) ||
        !/^application\/json(?:\s*;|$)/i.test(contentType ?? "") ||
        (contentEncoding !== null && contentEncoding.toLowerCase() !== "identity")
      ) {
        throw REFUSED
      }

      const expectedBytes = contentLength === null ? null : Number(contentLength)
      reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let bytes = 0
      for (;;) {
        const next = await reader.read()
        if (next.done) break
        bytes += next.value.byteLength
        if (bytes > MAX_RESPONSE_BYTES || (expectedBytes !== null && bytes > expectedBytes)) throw REFUSED
        chunks.push(next.value)
      }
      if (expectedBytes !== null && bytes !== expectedBytes) throw REFUSED
      const joined = new Uint8Array(bytes)
      let offset = 0
      for (const chunk of chunks) {
        joined.set(chunk, offset)
        offset += chunk.byteLength
      }
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined)) as unknown
    }

    try {
      return await Promise.race([download(), stopped])
    } finally {
      clearTimeout(timer)
      if (onAbort !== undefined) controller.signal.removeEventListener("abort", onAbort)
      if (reader !== undefined) void reader.cancel().catch(() => {})
      else if (response?.body !== null) void response?.body?.cancel().catch(() => {})
    }
  }

  const waitFor = (pending: Pending, signal: AbortSignal): Promise<GraphValue | null> =>
    new Promise((resolve, reject) => {
      let finished = false
      pending.waiters++
      const release = (): void => {
        if (finished) return
        finished = true
        signal.removeEventListener("abort", interrupted)
        pending.waiters--
        if (pending.waiters === 0 && !pending.settled) pending.controller.abort()
      }
      const interrupted = (): void => {
        release()
        reject(REFUSED)
      }
      signal.addEventListener("abort", interrupted, { once: true })
      if (signal.aborted) {
        interrupted()
        return
      }
      pending.promise.then(
        (value) => {
          if (finished) return
          release()
          resolve(value)
        },
        () => {
          if (finished) return
          release()
          reject(REFUSED)
        }
      )
    })

  const query = <A extends GraphValue>(
    key: string,
    document: string,
    variables: Readonly<Record<string, unknown>>,
    decode: (value: unknown) => A | null
  ): Effect.Effect<A | null> =>
    Effect.tryPromise({
      try: async (signal) => {
        const now = Date.now()
        const hit = cache.get(key)
        if (hit !== undefined && now >= hit.atMs && now - hit.atMs < ttlMs) return hit.value as A | null

        let pending = inFlight.get(key)
        if (pending === undefined) {
          if (inFlight.size >= MAX_INFLIGHT) return null
          const controller = new AbortController()
          pending = { controller, promise: Promise.resolve(null), waiters: 0, settled: false }
          const owned = pending
          owned.promise = post(document, variables, controller)
            .then(decode)
            .catch(() => null)
            .then((value) => {
              if (!controller.signal.aborted) cachePut(key, value)
              return value
            })
            .finally(() => {
              owned.settled = true
              controller.abort()
              if (inFlight.get(key) === owned) inFlight.delete(key)
            })
          inFlight.set(key, owned)
        }
        return await waitFor(pending, signal) as A | null
      },
      catch: () => REFUSED
    }).pipe(Effect.catchAll(() => Effect.succeed(null)))

  return {
    stats: () => query("stats", STATS_QUERY, {}, decodeStats),
    evidenceFor: (id) =>
      listingId(id)
        ? query(`evidence:${id}`, EVIDENCE_QUERY, { id }, (value) => decodeEvidence(value, id))
        : Effect.succeed(null),
    treeFor: (treeHash) => {
      const id = typeof treeHash === "string" ? treeHash.toLowerCase() : ""
      return hash(id)
        ? query(`tree:${id}`, TREE_QUERY, { id }, (value) => decodeTree(value, id))
        : Effect.succeed(null)
    }
  }
}

export const GraphOff: Layer.Layer<GraphTag> = Layer.succeed(GraphTag, graphOff)

export const GraphFromEnv = (): Layer.Layer<GraphTag> => {
  const url = process.env["ARCADE_GRAPH_URL"]
  if (url === undefined || url === "") return GraphOff
  const rawTtl = process.env["ARCADE_GRAPH_TTL_MS"]
  let ttlMs: number | undefined
  if (rawTtl !== undefined) {
    if (!/^[1-9][0-9]{0,5}$/.test(rawTtl)) return GraphOff
    ttlMs = Number(rawTtl)
    if (!validTtl(ttlMs)) return GraphOff
  }
  return Layer.succeed(
    GraphTag,
    makeGraph({
      url,
      ...(process.env["ARCADE_GRAPH_KEY"] === undefined
        ? {}
        : { apiKey: process.env["ARCADE_GRAPH_KEY"] }),
      ...(ttlMs === undefined ? {} : { ttlMs })
    })
  )
}
