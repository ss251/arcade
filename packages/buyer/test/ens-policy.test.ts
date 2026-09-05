import { afterEach, describe, expect, it, vi } from "vitest"
import { Effect } from "effect"
import { decodeFunctionData, encodeErrorResult, encodeFunctionData, encodeFunctionResult, parseAbi } from "viem"
import { ENS_TEXT_KEYS, loadEnsDeployments, ROOT_REGISTRY_ABI } from "@arcade/core"
import {
  EnsNameExpired, EnsResolutionUnavailable, ensRefusal, ensRootFromEnv, looksLikeEnsName,
  parseArcadeEndpoint, resolveEnsListing, sepoliaEnsReader, type EnsReader
} from "../src/ens-policy.ts"

const NAME = "usdc-flow-check.ss251.arcade-hub.eth"
const SELLER = "0xAeB742d58cc7F5CF656fCD9Beb07Bf0C1ACa6f5b"
const PAYEE = "0x1111111111111111111111111111111111111111"
const ENDPOINT = `https://hub.example/x/${SELLER}/usdc-flow-check`
const CHAIN = "eip155:5042002"
const records: Record<string, string> = {
  [ENS_TEXT_KEYS.endpoint]: ENDPOINT, [ENS_TEXT_KEYS.payTo]: PAYEE,
  [ENS_TEXT_KEYS.chain]: CHAIN, [ENS_TEXT_KEYS.priceAtomic]: "50000"
}
const readerOf = (overrides: Record<string, string | null> = {}): EnsReader => ({
  getEnsText: async ({ key }) => ({ ...records, ...overrides })[key] ?? null
})
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.either(effect))
const listing = { name: NAME, endpoint: ENDPOINT, payTo: PAYEE, chainCaip2: CHAIN }
afterEach(() => vi.useRealTimers())

describe("resolveEnsListing", () => {
  it("normalizes a name and reads four records, keeping the route seller distinct from the splitter payee", async () => {
    const calls: Array<{ name: string; key: string }> = []
    const result = await run(resolveEnsListing({ getEnsText: async a => {
      calls.push(a); return readerOf().getEnsText(a)
    } }, NAME.toUpperCase()))
    expect(result).toMatchObject({ _tag: "Right", right: { ...listing, priceAtomic: 50000n } })
    expect(calls).toEqual([ENS_TEXT_KEYS.endpoint, ENS_TEXT_KEYS.payTo, ENS_TEXT_KEYS.chain, ENS_TEXT_KEYS.priceAtomic].map(key => ({ name: NAME, key })))
    expect(new Set(calls.map(c => c.key))).toEqual(new Set(Object.keys(records)))
  })
  it.each([ENS_TEXT_KEYS.endpoint, ENS_TEXT_KEYS.payTo, ENS_TEXT_KEYS.chain])("refuses a successfully empty required %s record without asserting proven expiry", async key => {
    const result = await run(resolveEnsListing(readerOf({ [key]: null }), NAME))
    expect(result).toMatchObject({ _tag: "Left", left: { _tag: "EnsNameExpired", code: "ens_name_expired", key } })
    if (result._tag === "Left") {
      expect(result.left.message).toContain("Nothing was signed")
      expect(result.left.message).not.toContain("means nobody")
    }
  })
  it("keeps missing advisory price optional and preserves exact integers above Number.MAX_SAFE_INTEGER", async () => {
    const withoutPrice = await run(resolveEnsListing(readerOf({ [ENS_TEXT_KEYS.priceAtomic]: null }), NAME))
    expect(withoutPrice._tag).toBe("Right")
    if (withoutPrice._tag === "Right") expect(withoutPrice.right).toEqual(listing)
    const amount = "9007199254740993"
    expect(await run(resolveEnsListing(readerOf({ [ENS_TEXT_KEYS.priceAtomic]: amount }), NAME))).toMatchObject({ _tag: "Right", right: { priceAtomic: 9007199254740993n } })
  })
  it.each(["-1", "+1", "01", "1.0", "1e6", " 1", "0x10", "1".repeat(79), (1n << 256n).toString()])("refuses malformed advisory atomic %s as invalid, not expired", async value => {
    expect(await run(resolveEnsListing(readerOf({ [ENS_TEXT_KEYS.priceAtomic]: value }), NAME))).toMatchObject({ _tag: "Left", left: { _tag: "EnsResolutionUnavailable", reason: "invalid_record", key: ENS_TEXT_KEYS.priceAtomic } })
  })
  it.each(["", "eip155:0", "eip155:01", "eip155:9007199254740992", "solana:mainnet", "eip155:1\n"]) ("never turns an absent or malformed chain %j into a fail-open empty value", async value => {
    expect(await run(resolveEnsListing(readerOf({ [ENS_TEXT_KEYS.chain]: value }), NAME))).toMatchObject({ _tag: "Left" })
  })
  it.each(["0x1", "0x" + "0".repeat(40), `${PAYEE}\n`])("rejects invalid payee %j", async value => {
    expect(await run(resolveEnsListing(readerOf({ [ENS_TEXT_KEYS.payTo]: value }), NAME))).toMatchObject({ _tag: "Left", left: { _tag: "EnsResolutionUnavailable", reason: "invalid_record" } })
  })
  it("sanitizes both synchronous throws and promise rejection, without converting an outage to expiry", async () => {
    for (const reader of [
      { getEnsText: () => { throw new Error("SECRET https://rpc.example/token") } },
      { getEnsText: async () => { throw new Error("SECRET https://rpc.example/token") } }
    ]) {
      const result = await run(resolveEnsListing(reader, NAME))
      expect(result).toMatchObject({ _tag: "Left", left: { _tag: "EnsResolutionUnavailable", code: "ens_resolution_unavailable", reason: "rpc_unavailable" } })
      expect(JSON.stringify(result)).not.toContain("SECRET")
    }
  })
  it("bounds a stuck injected reader without requiring it to cooperate", async () => {
    vi.useFakeTimers()
    const result = run(resolveEnsListing({ getEnsText: () => new Promise(() => {}) }, NAME))
    await vi.advanceTimersByTimeAsync(15_001)
    expect(await result).toMatchObject({ _tag: "Left", left: { _tag: "EnsResolutionUnavailable" } })
  })
  it("rejects an oversized text before exposing or parsing it", async () => {
    const result = await run(resolveEnsListing(readerOf({ [ENS_TEXT_KEYS.endpoint]: "SECRET".repeat(20_000) }), NAME))
    expect(result).toMatchObject({ _tag: "Left", left: { _tag: "EnsResolutionUnavailable", reason: "invalid_record" } })
    expect(JSON.stringify(result)).not.toContain("SECRET")
  })
  it.each(["skill", "bad..eth", ".eth", "arcade.eth.", " arcade.eth", `${"a".repeat(64)}.eth`, `${Array(5).fill("é".repeat(30)).join(".")}.eth`])("rejects invalid name before any read: %j", async name => {
    const read = vi.fn(async () => null)
    expect(await run(resolveEnsListing({ getEnsText: read }, name))).toMatchObject({ _tag: "Left", left: { _tag: "EnsResolutionUnavailable", reason: "invalid_name" } })
    expect(read).not.toHaveBeenCalled()
    expect(looksLikeEnsName(name)).toBe(false)
  })
})

describe("strict ENS payment agreement", () => {
  it("permits only agreeing, nonzero payee and canonical chain, casefolding the address", () => {
    expect(ensRefusal(listing, { payTo: PAYEE.toUpperCase().replace("0X", "0x"), network: CHAIN })).toBeNull()
    expect(ensRefusal(listing, { payTo: SELLER, network: CHAIN })).toMatchObject({ code: "ens_payto_mismatch", field: "payTo" })
    expect(ensRefusal(listing, { payTo: PAYEE, network: "eip155:1" })).toMatchObject({ field: "chain" })
  })
  it("refuses identical missing or malformed values instead of equating them", () => {
    for (const chainCaip2 of ["", "eip155:01", "solana:mainnet"]) expect(ensRefusal({ ...listing, chainCaip2 }, { payTo: PAYEE, network: chainCaip2 })).toMatchObject({ field: "chain" })
    for (const payTo of ["", "0x1", "0x" + "0".repeat(40)]) expect(ensRefusal({ ...listing, payTo }, { payTo, network: CHAIN })).toMatchObject({ field: "payTo" })
  })
  it("does not reflect malformed provider/challenge payloads in refusal diagnostics", () => {
    const refusal = ensRefusal(listing, { payTo: "SECRET".repeat(1000), network: CHAIN })
    expect(JSON.stringify(refusal)).not.toContain("SECRET")
    expect(refusal?.message).toContain("Nothing was signed")
  })
})

describe("exact paid endpoint and opt-in root", () => {
  it("parses an exact HTTPS paid path and permits HTTP only on loopback", () => {
    expect(parseArcadeEndpoint(ENDPOINT)).toEqual({ hubUrl: "https://hub.example", seller: SELLER, skillId: "usdc-flow-check" })
    expect(parseArcadeEndpoint(`http://127.0.0.1:4011/x/${SELLER}/usdc-flow-check`)).toMatchObject({ hubUrl: "http://127.0.0.1:4011" })
  })
  it.each([
    "http://hub.example", "ftp://hub.example", "https://user:secret@hub.example",
    "https://hub.example/a/..", "https://hub.example/%2e%2e", "https://hub.example\\secret"
  ])("refuses unsafe origins or path normalization %s", origin => {
    expect(() => parseArcadeEndpoint(`${origin}/x/${SELLER}/usdc-flow-check`)).toThrow(/\/x\/<seller>\/<skill>/)
  })
  it.each(["?secret=1", "?", "#secret", "#", "/", "/..", "%2fsecret", "\n"]) ("refuses hidden query, fragment, path escape or non-exact suffix %j", suffix => {
    expect(() => parseArcadeEndpoint(ENDPOINT + suffix)).toThrow()
  })
  it("rejects invalid route identity and missing route, without echoing endpoint credentials", () => {
    for (const endpoint of [ENDPOINT.replace(SELLER, "0x1"), ENDPOINT.replace(SELLER, "0x" + "0".repeat(40)), "https://secret@hub.example/health"]) {
      try { parseArcadeEndpoint(endpoint); expect.fail("accepted unsafe endpoint") } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect(String(error)).not.toContain("secret@")
      }
    }
  })
  it("has no implicit production root and uses the same 2LD normalization as core", () => {
    expect(ensRootFromEnv({})).toBeUndefined()
    expect(ensRootFromEnv({ ARCADE_ENS_ROOT: " " })).toBeUndefined()
    expect(ensRootFromEnv({ ARCADE_ENS_ROOT: "Arcade-Hub.eth" })).toBe("arcade-hub.eth")
    expect(() => ensRootFromEnv({ ARCADE_ENS_ROOT: "other.arcade-hub.eth" })).toThrow()
    expect(looksLikeEnsName(NAME.toUpperCase())).toBe(true)
  })
})

const UNIVERSAL_ABI = parseAbi(["function resolveWithGateways(bytes name, bytes data, string[] gateways) view returns (bytes, address)"])
const TEXT_ABI = parseAbi(["function text(bytes32 node, string key) view returns (string)"])
const ROUTING_ABI = parseAbi(["function ROOT_REGISTRY() view returns (address)"])
const ROUTING_DATA = encodeFunctionData({abi:ROUTING_ABI,functionName:"ROOT_REGISTRY"})
const OWNER_ABI = parseAbi(["function findOwner(bytes name) view returns (address)"])
const OWNER_SELECTOR = encodeFunctionData({abi:OWNER_ABI,functionName:"findOwner",args:["0x"]}).slice(0,10)
const OFFCHAIN_ABI = parseAbi(["error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData)"])
const deployment = loadEnsDeployments()[0]!
type RpcCall = { id: number; method: string; params?: Array<{ to?: string; data?: `0x${string}` } | string> }
const rpcFixture = (options: { chainId?: string; code?: string; root?: string; routedRoot?: string; exactOwner?: `0x${string}`; ownerError?: boolean; textError?: boolean; offchain?: { urls: string[]; sender?: `0x${string}`; loop?: boolean } } = {}) => {
  const calls: RpcCall[] = [], requests: Request[] = []
  const fetcher = async (request: Request): Promise<Response> => {
    requests.push(request)
    const call = JSON.parse(await request.text()) as RpcCall
    calls.push(call)
    let result: unknown
    if (call.method === "eth_chainId") result = options.chainId ?? "0xaa36a7"
    else if (call.method === "eth_getCode") result = options.code ?? "0x6000"
    else if (call.method === "eth_call") {
      const target = call.params?.[0]
      if (typeof target !== "object" || !target.data) throw new Error("bad request")
      if (target.to?.toLowerCase() === deployment.rootRegistry) result = encodeFunctionResult({ abi: ROOT_REGISTRY_ABI, functionName: "getSubregistry", result: (options.root ?? deployment.ethRegistry) as `0x${string}` })
      else if (target.to?.toLowerCase() === deployment.universalResolver) {
        if(target.data===ROUTING_DATA)return Response.json({jsonrpc:"2.0",id:call.id,result:encodeFunctionResult({abi:ROUTING_ABI,functionName:"ROOT_REGISTRY",result:(options.routedRoot??deployment.rootRegistry) as `0x${string}`})})
        if(target.data.startsWith(OWNER_SELECTOR))return options.ownerError
          ? Response.json({jsonrpc:"2.0",id:call.id,error:{code:3,message:"SECRET owner lookup failed"}})
          : Response.json({jsonrpc:"2.0",id:call.id,result:encodeFunctionResult({abi:OWNER_ABI,functionName:"findOwner",result:options.exactOwner??SELLER})})
        if (options.textError) return Response.json({ jsonrpc: "2.0", id: call.id, error: { code: 3, message: "SECRET reverted" } })
        if (options.offchain && (!target.data.startsWith("0x01020304") || options.offchain.loop)) return Response.json({ jsonrpc: "2.0", id: call.id, error: { code: 3, message: "execution reverted", data: encodeErrorResult({ abi: OFFCHAIN_ABI, errorName: "OffchainLookup", args: [options.offchain.sender ?? deployment.universalResolver, options.offchain.urls, "0x1234", "0x01020304", "0xabcd"] }) } })
        if (target.data.startsWith("0x01020304")) return Response.json({ jsonrpc: "2.0", id: call.id, result: encodeFunctionResult({ abi: UNIVERSAL_ABI, functionName: "resolveWithGateways", result: [encodeFunctionResult({ abi: TEXT_ABI, functionName: "text", result: ENDPOINT }), deployment.permissionedResolverImpl] }) })
        const decoded = decodeFunctionData({ abi: UNIVERSAL_ABI, data: target.data })
        const text = decodeFunctionData({ abi: TEXT_ABI, data: decoded.args[1] })
        const value = records[text.args[1]] ?? ""
        result = encodeFunctionResult({ abi: UNIVERSAL_ABI, functionName: "resolveWithGateways", result: [encodeFunctionResult({ abi: TEXT_ABI, functionName: "text", result: value }), deployment.permissionedResolverImpl] })
      } else result = encodeFunctionResult({ abi: ROOT_REGISTRY_ABI, functionName: "getSubregistry", result: "0x0000000000000000000000000000000000000000" })
    } else throw new Error(`unexpected non-read method ${call.method}`)
    return Response.json({ jsonrpc: "2.0", id: call.id, result })
  }
  return { fetcher, calls, requests }
}
const ENV = { ARCADE_ENS_ROOT: "arcade-hub.eth", ARCADE_ENS_RPC: "https://sepolia.example/rpc" }

describe("stock viem Sepolia reader", () => {
  it("refuses an expired/unregistered exact name even when an ancestor resolver still has all its text records",async()=>{
    const {fetcher,calls}=rpcFixture({exactOwner:"0x0000000000000000000000000000000000000000"})
    expect(await run(resolveEnsListing(sepoliaEnsReader({env:ENV,fetch:fetcher}),NAME))).toMatchObject({_tag:"Left",left:{_tag:"EnsNameExpired"}})
    const universal=calls.filter(c=>c.method==="eth_call"&&typeof c.params?.[0]==="object"&&c.params[0].to===deployment.universalResolver)
    expect(universal).toHaveLength(2)
    expect(universal.every(c=>typeof c.params?.[0]==="object"&&(c.params[0].data===ROUTING_DATA||c.params[0].data?.startsWith(OWNER_SELECTOR)))).toBe(true)
  })
  it("does not infer expiry when exact-registration lookup fails",async()=>{
    const {fetcher}=rpcFixture({ownerError:true})
    expect(await run(resolveEnsListing(sepoliaEnsReader({env:ENV,fetch:fetcher}),NAME))).toMatchObject({_tag:"Left",left:{_tag:"EnsResolutionUnavailable"}})
  })
  it("refuses a shared resolver proxy serving a different deployment root",async()=>{
    for(const routedRoot of [PAYEE,loadEnsDeployments()[1]!.rootRegistry]) {
      const {fetcher,calls}=rpcFixture({routedRoot})
      expect(await run(resolveEnsListing(sepoliaEnsReader({env:ENV,fetch:fetcher}),NAME))).toMatchObject({_tag:"Left",left:{_tag:"EnsResolutionUnavailable"}})
      expect(calls.filter(c=>c.method==="eth_call"&&typeof c.params?.[0]==="object"&&c.params[0].to===deployment.universalResolver).every(c=>typeof c.params?.[0]==="object"&&c.params[0].data===ROUTING_DATA)).toBe(true)
    }
  })
  it("is inert when the production root is unset, even if other ENS settings are invalid", async () => {
    const fetcher = vi.fn(async () => Response.json({}))
    const reader = sepoliaEnsReader({ env: { ARCADE_ENS_RPC: "SECRET" }, fetch: fetcher })
    expect(fetcher).not.toHaveBeenCalled()
    expect(await run(resolveEnsListing(reader, NAME))).toMatchObject({ _tag: "Left", left: { _tag: "EnsResolutionUnavailable", reason: "disabled" } })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it("uses real viem codecs after actual Sepolia chain/root/resolver preflight and allows only bounded read-only RPC", async () => {
    const { fetcher, calls, requests } = rpcFixture()
    const result = await run(resolveEnsListing(sepoliaEnsReader({ env: ENV, fetch: fetcher }), NAME))
    expect(result).toMatchObject({ _tag: "Right", right: { ...listing, priceAtomic: 50000n } })
    expect(calls[0]?.method).toBe("eth_chainId")
    expect(calls.some(c => c.method === "eth_getCode" && c.params?.[0] === deployment.universalResolver)).toBe(true)
    expect(calls.filter(c => c.method === "eth_chainId")).toHaveLength(1)
    expect(new Set(calls.map(c => c.method))).toEqual(new Set(["eth_chainId", "eth_call", "eth_getCode"]))
    expect(requests.every(r => r.redirect === "error" && r.credentials === "omit")).toBe(true)
  })
  it.each([
    { chainId: "0x1" }, { chainId: "garbage" }, { root: PAYEE }, { code: "0x" }
  ])("refuses wrong chain, unproven root or missing universal resolver code: %j", async settings => {
    const { fetcher, calls } = rpcFixture(settings)
    expect(await run(resolveEnsListing(sepoliaEnsReader({ env: ENV, fetch: fetcher }), NAME))).toMatchObject({ _tag: "Left", left: { _tag: "EnsResolutionUnavailable" } })
    expect(calls.some(c => c.method === "eth_call" && typeof c.params?.[0] === "object" && c.params[0].to?.toLowerCase() === deployment.universalResolver)).toBe(false)
  })
  it.each([
    { ARCADE_ENS_UNIVERSAL_RESOLVER: PAYEE }, { ARCADE_ENS_UNIVERSAL_RESOLVER: "0x1" },
    { ARCADE_ENS_RPC: "http://sepolia.example" }, { ARCADE_ENS_RPC: "https://user:SECRET@sepolia.example" },
    { ARCADE_ENS_RPC: "https://sepolia.example/?SECRET" }
  ])("refuses unsafe configuration without network or raw diagnostics: %j", async settings => {
    const fetcher = vi.fn(async () => Response.json({}))
    const result = await run(resolveEnsListing(sepoliaEnsReader({ env: { ...ENV, ...settings }, fetch: fetcher }), NAME))
    expect(result).toMatchObject({ _tag: "Left", left: { _tag: "EnsResolutionUnavailable", reason: "configuration" } })
    expect(JSON.stringify(result)).not.toContain("SECRET")
    expect(fetcher).not.toHaveBeenCalled()
  })
  it("never disguises a resolver revert as expiry", async () => {
    const { fetcher } = rpcFixture({ textError: true })
    const result = await run(resolveEnsListing(sepoliaEnsReader({ env: ENV, fetch: fetcher }), NAME))
    expect(result).toMatchObject({ _tag: "Left", left: { _tag: "EnsResolutionUnavailable" } })
    expect(JSON.stringify(result)).not.toContain("SECRET")
  })
  it.each([{ id: -1 }, { jsonrpc: "1.0" }, { error: null }])("refuses an uncorrelated or ambiguous JSON-RPC response %j", async mutation => {
    const f = rpcFixture()
    const reader = sepoliaEnsReader({ env: ENV, fetch: async request => {
      const response = await f.fetcher(request)
      return Response.json({ ...await response.json(), ...mutation })
    } })
    expect(await run(resolveEnsListing(reader, NAME))).toMatchObject({ _tag: "Left", left: { _tag: "EnsResolutionUnavailable" } })
    expect(f.calls).toHaveLength(1)
  })
  it("does not permit a caller to override the pinned resolver", async () => {
    const { fetcher, calls } = rpcFixture()
    const reader = sepoliaEnsReader({ env: ENV, fetch: fetcher })
    await expect(reader.getEnsText({ name: NAME, key: ENS_TEXT_KEYS.endpoint, universalResolverAddress: PAYEE })).rejects.toBeInstanceOf(EnsResolutionUnavailable)
    expect(calls).toHaveLength(0)
  })
  it("bounds streamed bodies including a never-ending body after headers, aborting the request", async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined, cancelled = false
    const reader = sepoliaEnsReader({ env: ENV, timeoutMs: 100, fetch: async request => {
      signal = request.signal
      return new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true } }), { headers: { "content-type": "application/json" } })
    } })
    const result = run(resolveEnsListing(reader, NAME))
    await vi.advanceTimersByTimeAsync(15_001)
    expect(await result).toMatchObject({ _tag: "Left", left: { _tag: "EnsResolutionUnavailable" } })
    expect(signal?.aborted).toBe(true)
    expect(cancelled).toBe(true)
  })
  it.each([302, 500, 200])("refuses redirects, HTTP failures or oversized bodies (HTTP %s)", async status => {
    const reader = sepoliaEnsReader({ env: ENV, fetch: async () => new Response(status === 200 ? "x".repeat(131_073) : "SECRET", { status }) })
    const result = await run(resolveEnsListing(reader, NAME))
    expect(result).toMatchObject({ _tag: "Left", left: { _tag: "EnsResolutionUnavailable" } })
    expect(JSON.stringify(result)).not.toContain("SECRET")
  })
  it("exports distinguishable tagged errors for future buyer and MCP consumers", () => {
    expect(new EnsNameExpired({ name: NAME, key: ENS_TEXT_KEYS.endpoint }).code).toBe("ens_name_expired")
    expect(new EnsResolutionUnavailable({ name: NAME, key: ENS_TEXT_KEYS.endpoint, reason: "rpc_unavailable" }).code).toBe("ens_resolution_unavailable")
  })
})

describe("bounded opt-in CCIP with the actual viem sender and callback checks", () => {
  const gateway = "https://gateway.example"
  const trusted = { ...ENV, ARCADE_ENS_CCIP_ORIGINS: gateway }
  const fixture = (settings: { urls?: string[]; sender?: `0x${string}`; loop?: boolean } = {}, response: () => Response = () => Response.json({ data: "0x1234" })) => {
    const rpc = rpcFixture({ offchain: { urls: settings.urls ?? [`${gateway}/{sender}/{data}`], ...settings } })
    const gateways: Request[] = []
    const fetcher = (request: Request): Promise<Response> => {
      if (new URL(request.url).origin === new URL(ENV.ARCADE_ENS_RPC).origin) return rpc.fetcher(request)
      gateways.push(request)
      return Promise.resolve(response())
    }
    return { ...rpc, gateways, fetcher }
  }
  const query = (reader: EnsReader) => reader.getEnsText({ name: NAME, key: ENS_TEXT_KEYS.endpoint })
  it("refuses offchain gateways by default without fetching any of them", async () => {
    const f = fixture()
    await expect(query(sepoliaEnsReader({ env: ENV, fetch: f.fetcher }))).rejects.toMatchObject({ reason: "offchain_blocked" })
    expect(f.gateways).toHaveLength(0)
  })
  it("fetches an explicitly trusted gateway once then asks the onchain callback to verify its data", async () => {
    const f = fixture()
    expect(await query(sepoliaEnsReader({ env: trusted, fetch: f.fetcher }))).toBe(ENDPOINT)
    expect(f.gateways).toHaveLength(1)
    expect(f.gateways[0]?.url).toBe(`${gateway}/${deployment.universalResolver}/0x1234`)
    expect(f.gateways[0]?.redirect).toBe("error")
    expect(f.gateways[0]?.credentials).toBe("omit")
    expect(f.calls.some(call => typeof call.params?.[0] === "object" && call.params[0].data?.startsWith("0x01020304"))).toBe(true)
  })
  it("uses POST for a trusted URL without a data template", async () => {
    const f = fixture({ urls: [`${gateway}/lookup`] })
    expect(await query(sepoliaEnsReader({ env: trusted, fetch: f.fetcher }))).toBe(ENDPOINT)
    expect(f.gateways[0]?.method).toBe("POST")
    expect(await f.gateways[0]?.json()).toEqual({ sender: deployment.universalResolver, data: "0x1234" })
  })
  it("lets stock viem reject a forged OffchainLookup sender without contacting a gateway", async () => {
    const f = fixture({ sender: PAYEE })
    await expect(query(sepoliaEnsReader({ env: trusted, fetch: f.fetcher }))).rejects.toBeInstanceOf(EnsResolutionUnavailable)
    expect(f.gateways).toHaveLength(0)
  })
  it.each(["https://127.0.0.1", "https://localhost", "https://[::1]", "http://gateway.example", "https://user:SECRET@gateway.example", "https://gateway.example/path"]) ("rejects unsafe trusted origin configuration %s before any RPC", async origin => {
    const f = fixture()
    await expect(query(sepoliaEnsReader({ env: { ...ENV, ARCADE_ENS_CCIP_ORIGINS: origin }, fetch: f.fetcher }))).rejects.toMatchObject({ reason: "configuration" })
    expect(f.calls).toHaveLength(0)
    expect(f.gateways).toHaveLength(0)
  })
  it.each(["https://elsewhere.example/lookup", "https://user:SECRET@gateway.example/lookup", "http://gateway.example/lookup", "https://gateway.example.evil.example/lookup"]) ("does not contact an untrusted or credentialled resolver-supplied URL %s", async url => {
    const f = fixture({ urls: [url] })
    await expect(query(sepoliaEnsReader({ env: trusted, fetch: f.fetcher }))).rejects.toMatchObject({ reason: "offchain_blocked" })
    expect(f.gateways).toHaveLength(0)
  })
  it.each([
    () => new Response("SECRET", { status: 302 }),
    () => Response.json({ data: "0x123" }),
    () => Response.json({ data: "SECRET" }),
    () => new Response("x".repeat(131_073)),
    () => Response.json(null)
  ])("refuses gateway redirects, malformed hex or oversized bodies without fallback or callback", async response => {
    const f = fixture({}, response)
    await expect(query(sepoliaEnsReader({ env: trusted, fetch: f.fetcher }))).rejects.toBeInstanceOf(EnsResolutionUnavailable)
    expect(f.gateways).toHaveLength(1)
    expect(f.calls.some(call => typeof call.params?.[0] === "object" && call.params[0].data?.startsWith("0x01020304"))).toBe(false)
  })
  it("bounds offchain URL fanout and repeated offchain callbacks", async () => {
    const tooMany = fixture({ urls: Array(4).fill(`${gateway}/lookup`) })
    await expect(query(sepoliaEnsReader({ env: trusted, fetch: tooMany.fetcher }))).rejects.toBeInstanceOf(EnsResolutionUnavailable)
    expect(tooMany.gateways).toHaveLength(0)
    const loop = fixture({ loop: true })
    await expect(query(sepoliaEnsReader({ env: trusted, fetch: loop.fetcher }))).rejects.toBeInstanceOf(EnsResolutionUnavailable)
    expect(loop.gateways.length).toBeLessThanOrEqual(4)
    expect(loop.calls.length).toBeLessThanOrEqual(24)
  })
})
