import { Data, Effect } from "effect"
import { createPublicClient, http, parseAbi, type CcipRequestParameters } from "viem"
import { normalize } from "viem/ens"
import { sepolia } from "viem/chains"
import {
  arcadeSellerName, dnsNameOf, ENS_TEXT_KEYS, ensDeploymentReader,
  loadEnsDeployments, resolveEnsDeployment
} from "@arcade/core"

/** Read-only authority checks. This module never obtains an account or signs anything. */
export interface EnsReader {
  readonly getEnsText: (a: {
    readonly name: string
    readonly key: string
    readonly universalResolverAddress?: `0x${string}`
  }) => Promise<string | null>
}
export class EnsNameExpired extends Data.TaggedError("EnsNameExpired")<{
  readonly name: string; readonly key: string; readonly detail?: string
}> {
  readonly code = "ens_name_expired"
  override get message(): string {
    return `${this.name} has no ${this.key} record. It may be expired, unregistered, or misconfigured; an empty record alone does not prove expiry. Nothing was signed.`
  }
}
export class EnsResolutionUnavailable extends Data.TaggedError("EnsResolutionUnavailable")<{
  readonly name: string; readonly key: string
  readonly reason: "invalid_name" | "invalid_record" | "rpc_unavailable" | "configuration" | "disabled" | "offchain_blocked"
}> {
  readonly code = "ens_resolution_unavailable"
  override get message(): string {
    return `ENS resolution is unavailable (${this.reason}). No expiry was inferred. Nothing was signed.`
  }
}
export class EnsPayToMismatch extends Data.TaggedError("EnsPayToMismatch")<{
  readonly name: string; readonly field: "payTo" | "chain"
  readonly ensValue: string; readonly challengeValue: string
}> {
  readonly code = "ens_payto_mismatch"
  override get message(): string {
    return `Refusing to sign: ${this.name} declares ${this.field} ${this.ensValue}, but the 402 requests ${this.challengeValue}. Nothing was signed.`
  }
}
export interface EnsListing {
  readonly name: string; readonly endpoint: string; readonly payTo: string; readonly chainCaip2: string
  /** Advisory only; a valid 402 and the caller's spending cap remain authoritative. */
  readonly priceAtomic?: bigint
}

type Env = Readonly<Record<string, string | undefined>>
const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const isAddress = (s: string) => s.length === 42 && ADDRESS.test(s) && !/^0x0{40}$/i.test(s)
const isChain = (s: string) => s.length <= 23 && /^eip155:[1-9][0-9]*$/.test(s) && Number.isSafeInteger(Number(s.slice(7)))
const UINT256_MAX = (1n << 256n) - 1n
const MAX_BODY = 131_072
const TEXT_LIMIT = 4096
const READ_DEADLINE_MS = 10_000
const error = (name: string, key: string, reason: EnsResolutionUnavailable["reason"]) => new EnsResolutionUnavailable({ name, key, reason })
const normalizedName = (raw: string): string => {
  // Reuse core's bounded DNS/UTF-8 validation, including its hierarchy and label rules.
  if (raw.length > 253) throw error("<invalid ENS name>", "name", "invalid_name")
  dnsNameOf(raw)
  return normalize(raw)
}
const diagnosticName = (name: string): string => { try { return normalizedName(name) } catch { return "<invalid ENS name>" } }
export const looksLikeEnsName = (s: string): boolean => { try { normalizedName(s); return true } catch { return false } }
export const ensRootFromEnv = (env: Env = process.env): string | undefined => {
  const raw = env["ARCADE_ENS_ROOT"]
  if (raw === undefined || raw.trim() === "") return undefined
  // Core's root parser is intentionally a DNS-safe .eth 2LD, not an arbitrary hierarchy.
  return arcadeSellerName({ root: raw, sellerLabel: "reader" }).slice("reader.".length)
}

export const parseArcadeEndpoint = (endpoint: string): {
  readonly hubUrl: string; readonly seller: string; readonly skillId: string
} => {
  const invalid = () => new Error("arcade.endpoint must be an exact <origin>/x/<seller>/<skill> paid path: HTTPS (HTTP only on loopback), without credentials, query, fragment, or escaped path.")
  if (endpoint.length > 2048 || /[\s\\%?#]/.test(endpoint)) throw invalid()
  let url: URL
  try { url = new URL(endpoint) } catch { throw invalid() }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || url.username || url.password || url.search || url.hash) throw invalid()
  // Match the original bytes too: URL normalizes /a/../ before exposing pathname.
  const path = /^https?:\/\/[^/]+(\/x\/(0x[0-9a-fA-F]{40})\/([a-z0-9][a-z0-9-]{1,63}))$/.exec(endpoint)
  if (!path || path[1] !== url.pathname || !isAddress(path[2]!)) throw invalid()
  return { hubUrl: url.origin, seller: path[2]!, skillId: path[3]! }
}

const bounded = <A>(read: () => Promise<A>, milliseconds: number): Promise<A> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("ENS read deadline exceeded")), milliseconds)
  Promise.resolve().then(read).then(value => { clearTimeout(timer); resolve(value) }, () => { clearTimeout(timer); reject(new Error("ENS read unavailable")) })
})
const readRecord = (reader: EnsReader, name: string, key: string): Promise<string | null> => {
  // Preserve only our own fixed error type; never retain provider causes, URL tokens or bodies.
  let known: EnsResolutionUnavailable | undefined
  return bounded(() => Promise.resolve().then(() => reader.getEnsText({ name, key })).catch(cause => {
    if (cause instanceof EnsResolutionUnavailable) known = error(name, key, cause.reason)
    throw new Error("ENS read unavailable")
  }), READ_DEADLINE_MS).catch(() => { throw known ?? error(name, key, "rpc_unavailable") }).then(value => {
    if (value !== null && (typeof value !== "string" || value.length > TEXT_LIMIT || new TextEncoder().encode(value).byteLength > TEXT_LIMIT)) throw error(name, key, "invalid_record")
    return value
  })
}
export const resolveEnsListing = (reader: EnsReader, rawName: string): Effect.Effect<EnsListing, EnsNameExpired | EnsResolutionUnavailable> =>
  Effect.gen(function* () {
    const name = yield* Effect.try({ try: () => normalizedName(rawName), catch: () => error("<invalid ENS name>", "name", "invalid_name") })
    const [endpoint, payTo, chain, price] = yield* Effect.tryPromise({
      try: () => Promise.all([ENS_TEXT_KEYS.endpoint, ENS_TEXT_KEYS.payTo, ENS_TEXT_KEYS.chain, ENS_TEXT_KEYS.priceAtomic].map(key => readRecord(reader, name, key))),
      catch: cause => cause instanceof EnsResolutionUnavailable ? cause : error(name, "records", "rpc_unavailable")
    })
    for (const [key, value] of [[ENS_TEXT_KEYS.endpoint, endpoint], [ENS_TEXT_KEYS.payTo, payTo], [ENS_TEXT_KEYS.chain, chain]] as const) {
      if (value === null || value === "") return yield* new EnsNameExpired({ name, key })
    }
    // Array indexing is checked above at runtime; explicit narrowing keeps this boundary honest.
    if (typeof endpoint !== "string" || typeof payTo !== "string" || typeof chain !== "string") return yield* error(name, "records", "invalid_record")
    yield* Effect.try({ try: () => parseArcadeEndpoint(endpoint), catch: () => error(name, ENS_TEXT_KEYS.endpoint, "invalid_record") })
    if (!isAddress(payTo)) return yield* error(name, ENS_TEXT_KEYS.payTo, "invalid_record")
    if (!isChain(chain)) return yield* error(name, ENS_TEXT_KEYS.chain, "invalid_record")
    let priceAtomic: bigint | undefined
    if (price !== null && price !== "") {
      if (typeof price !== "string" || price.length > 78 || !/^(0|[1-9][0-9]*)$/.test(price)) return yield* error(name, ENS_TEXT_KEYS.priceAtomic, "invalid_record")
      priceAtomic = BigInt(price)
      if (priceAtomic > UINT256_MAX) return yield* error(name, ENS_TEXT_KEYS.priceAtomic, "invalid_record")
    }
    return { name, endpoint, payTo, chainCaip2: chain, ...(priceAtomic === undefined ? {} : { priceAtomic }) }
  })

export const ensRefusal = (listing: EnsListing, req: { readonly payTo: string; readonly network: string }): EnsPayToMismatch | null => {
  if (!isAddress(listing.payTo) || !isAddress(req.payTo) || listing.payTo.toLowerCase() !== req.payTo.toLowerCase()) {
    return new EnsPayToMismatch({ name: diagnosticName(listing.name), field: "payTo", ensValue: isAddress(listing.payTo) ? listing.payTo : "<invalid payee>", challengeValue: isAddress(req.payTo) ? req.payTo : "<invalid payee>" })
  }
  if (!isChain(listing.chainCaip2) || !isChain(req.network) || listing.chainCaip2 !== req.network) {
    return new EnsPayToMismatch({ name: diagnosticName(listing.name), field: "chain", ensValue: isChain(listing.chainCaip2) ? listing.chainCaip2 : "<invalid chain>", challengeValue: isChain(req.network) ? req.network : "<invalid chain>" })
  }
  return null
}

/** Optional seams replace only public HTTP/environment inputs; the real viem codecs still run. */
export interface SepoliaEnsReaderOptions {
  readonly env?: Env
  readonly fetch?: (request: Request) => Promise<Response>
  readonly timeoutMs?: number
}
const httpsUrl = (raw: string): URL => {
  if (raw.length > 2048 || /[\s\\]/.test(raw)) throw new Error("Invalid ENS URL")
  const url = new URL(raw)
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("Invalid ENS URL")
  return url
}
const trustedOrigins = (raw: string | undefined): ReadonlySet<string> => {
  if (raw === undefined || raw.trim() === "") return new Set()
  if (raw.length > 2048) throw new Error("Invalid ENS CCIP configuration")
  const origins = raw.split(",")
  if (origins.length > 4) throw new Error("Invalid ENS CCIP configuration")
  return new Set(origins.map(value => {
    const url = httpsUrl(value.trim())
    // Origins are explicitly operator-trusted; literal IPs and local/single-label names
    // are never allowed. DNS ownership of allowlisted hostnames remains an operator trust.
    if (url.pathname !== "/" || url.search || !url.hostname.includes(".") || /^(?:[0-9.]+|\[.*\])$/.test(url.hostname) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname)) throw new Error("Invalid ENS CCIP origin")
    return url.origin
  }))
}

/** Headers and the entire body share a deadline. Abort/cancel also bounds an uncooperative fetch. */
const fetchBody = async (request: Request, fetcher: (request: Request) => Promise<Response>, signal: AbortSignal): Promise<{ body: string; contentType: string }> => {
  let bodyReader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let onAbort: (() => void) | undefined
  const download = async () => {
    if (signal.aborted) throw new Error("ENS request cancelled")
    const response = await fetcher(new Request(request, { redirect: "error", credentials: "omit", signal }))
    if (signal.aborted) { void response.body?.cancel().catch(() => {}); throw new Error("ENS request cancelled") }
    if (!response.ok || response.redirected || Number(response.headers.get("content-length")) > MAX_BODY || !response.body) throw new Error("ENS response refused")
    bodyReader = response.body.getReader()
    const decoder = new TextDecoder("utf-8", { fatal: true })
    let bytes = 0, body = ""
    for (;;) {
      const next = await bodyReader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > MAX_BODY) throw new Error("ENS response too large")
      body += decoder.decode(next.value, { stream: true })
    }
    return { body: body + decoder.decode(), contentType: response.headers.get("content-type") ?? "" }
  }
  try {
    return await Promise.race([download(), new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new Error("ENS request cancelled"))
      signal.addEventListener("abort", onAbort, { once: true })
      if (signal.aborted) onAbort()
    })])
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort)
    void bodyReader?.cancel().catch(() => {})
  }
}

export const sepoliaEnsReader = (options: SepoliaEnsReaderOptions = {}): EnsReader => {
  const env = options.env ?? process.env
  let disabled = false, invalid = false, rpcUrl = "", resolver: `0x${string}` | undefined
  let origins: ReadonlySet<string> = new Set()
  const timeoutMs = options.timeoutMs ?? READ_DEADLINE_MS
  try {
    disabled = ensRootFromEnv(env) === undefined
    if (!disabled) {
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > READ_DEADLINE_MS) throw new Error("Invalid ENS deadline")
      const rpc = httpsUrl(env["ARCADE_ENS_RPC"] ?? sepolia.rpcUrls.default.http[0])
      if (rpc.search || rpc.href.includes("?")) throw new Error("Invalid ENS RPC")
      rpcUrl = rpc.href
      const configured = env["ARCADE_ENS_UNIVERSAL_RESOLVER"] ?? loadEnsDeployments()[0]!.universalResolver
      resolver = loadEnsDeployments().find(d => d.universalResolver.toLowerCase() === configured.toLowerCase())?.universalResolver
      if (!resolver) throw new Error("Unpinned ENS resolver")
      origins = trustedOrigins(env["ARCADE_ENS_CCIP_ORIGINS"])
    }
  } catch { invalid = true }
  const fetcher = options.fetch ?? (request => fetch(request))
  const startSession = () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let rpcCalls = 0, ccipCalls = 0, offchainBlocked = false, routingVerified = false
    const ccipRequest = async ({ data, sender, urls }: CcipRequestParameters): Promise<`0x${string}`> => {
      if(!routingVerified)throw new Error("ENS routing preflight must be entirely onchain")
      if (controller.signal.aborted || ++ccipCalls > 4 || urls.length === 0 || urls.length > 3 || data.length > 32_770) throw new Error("ENS CCIP bounds exceeded")
      // Select one explicitly trusted origin; never fall back across arbitrary origins.
      const candidate = urls.find(raw => {
        try { return origins.has(httpsUrl(raw.replaceAll("{sender}", sender).replaceAll("{data}", data)).origin) } catch { return false }
      })
      if (!candidate) { offchainBlocked = true; throw new Error("ENS offchain origin is not trusted") }
      const url = httpsUrl(candidate.replaceAll("{sender}", sender.toLowerCase()).replaceAll("{data}", data))
      if (/[{}]/.test(url.href)) throw new Error("Invalid ENS gateway template")
      const get = candidate.includes("{data}")
      const request = new Request(url, get ? { method: "GET" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sender: sender.toLowerCase(), data }) })
      const response = await fetchBody(request, fetcher, controller.signal)
      const value: unknown = response.contentType.startsWith("application/json") ? (JSON.parse(response.body) as { data?: unknown } | null)?.data : response.body
      if (typeof value !== "string" || value.length < 4 || value.length > MAX_BODY || !/^0x(?:[0-9a-fA-F]{2})+$/.test(value)) throw new Error("Invalid ENS CCIP response")
      return value as `0x${string}`
    }
    const transport = http(rpcUrl, {
      batch: false, retryCount: 0, timeout: timeoutMs, maxResponseBodySize: MAX_BODY,
      methods: { include: ["eth_chainId", "eth_call", "eth_getCode"] },
      fetchOptions: { redirect: "error", credentials: "omit" },
      fetchFn: async (input, init) => {
        if (controller.signal.aborted || ++rpcCalls > 24) throw new Error("ENS RPC bounds exceeded")
        const request = new Request(input, init)
        const sent: unknown = await request.clone().json()
        const response = await fetchBody(request, fetcher, controller.signal)
        const received: unknown = JSON.parse(response.body)
        if (typeof sent !== "object" || sent === null || !("id" in sent) ||
          typeof received !== "object" || received === null || Array.isArray(received) ||
          !("id" in received) || received.id !== sent.id || !("jsonrpc" in received) || received.jsonrpc !== "2.0" ||
          ("result" in received) === ("error" in received)) throw new Error("Invalid ENS JSON-RPC response")
        return new Response(response.body, { headers: { "content-type": "application/json" } })
      }
    })
    const client = createPublicClient({ chain: sepolia, ccipRead: { request: ccipRequest }, transport })
    const onchain = createPublicClient({ chain: sepolia, ccipRead: false, transport })
    const ready = resolveEnsDeployment(ensDeploymentReader(onchain)).then(async deployment => {
      if (deployment.universalResolver !== resolver) throw new Error("ENS resolver provenance mismatch")
      const code = await onchain.getCode({ address: deployment.universalResolver })
      if (code === undefined || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code)) throw new Error("ENS resolver has no code")
      // Both beta manifests share an upgradable UR proxy. A live root->eth link and
      // code at the proxy do not prove that it serves the selected namespace.
      const servedRoot=await onchain.readContract({address:deployment.universalResolver,abi:parseAbi(["function ROOT_REGISTRY() view returns (address)"]),functionName:"ROOT_REGISTRY"})
      if(servedRoot.toLowerCase()!==deployment.rootRegistry)throw new Error("ENS resolver routes to a different root")
      routingVerified=true
    })
    const registrations=new Map<string,Promise<boolean>>()
    const registered=(name:string):Promise<boolean>=>{
      let check=registrations.get(name)
      if(!check){
        // ENSv2 retains ancestor wildcard resolvers after a leaf expires. Text
        // availability is therefore NOT evidence that this exact name is live.
        // findOwner walks exact, live parent mounts and checks current ownership;
        // this authority check must never follow offchain/wildcard resolution.
        check=ready.then(async()=>isAddress(await onchain.readContract({
          address:resolver!,abi:parseAbi(["function findOwner(bytes name) view returns (address)"]),
          functionName:"findOwner",args:[dnsNameOf(name)]
        })))
        registrations.set(name,check)
      }
      return check
    }
    return {
      client, ready, registered, users: 0, blocked: () => offchainBlocked,
      close: () => { clearTimeout(timer); controller.abort() }
    }
  }
  let session: ReturnType<typeof startSession> | undefined
  return { getEnsText: async a => {
    const name = diagnosticName(a.name), key = Object.values(ENS_TEXT_KEYS).find(key => key === a.key) ?? "record"
    if (disabled) throw error(name, key, "disabled")
    if (invalid || name === "<invalid ENS name>" || key === "record" || (a.universalResolverAddress !== undefined && a.universalResolverAddress.toLowerCase() !== resolver)) throw error(name, key, "configuration")
    // Concurrent record reads share one bounded preflight. Later lookups recheck the chain.
    const current = session ??= startSession()
    current.users++
    try {
      await current.ready
      if(!await current.registered(name))return null
      return await current.client.getEnsText({ name, key, universalResolverAddress: resolver!, strict: true })
    } catch { throw error(name, key, current.blocked() ? "offchain_blocked" : "rpc_unavailable") }
    finally {
      if (--current.users === 0) { current.close(); if (session === current) session = undefined }
    }
  } }
}
