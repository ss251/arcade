import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, writeFile, rm, readdir, copyFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { Schema } from "effect"
import { SkillManifest, toPublicListing } from "../packages/core/src/index.ts"
import { buildWellKnownX402 } from "../apps/hub/src/openapi.ts"
import { decodeSplitterDiscovery, planSplitterUpdate, updateSplitterList, parseSplitterArgs, type SplitterFetch } from "./graph-splitters.ts"

const ORIGIN = "https://hub.example"
const PILOT = "0xf95c8afefae677fdcfc7bd5b8aaaf3702db99206"
const A9 = "0x9e304ec13dd862c81ee8caa8fd262dac426fbedf"
const SELLER = "0xcf821769ed3c0e55e152745377bb833d7155a78a"
const ASSET = "0x3600000000000000000000000000000000000000"
const existing = { splitters: [{ address: PILOT, startBlock: 0 }] }
const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
function fixture(prices = ["$0.25"], rail = "eip3009", seller = SELLER) {
  const records = prices.map((price, i) => ({ seller, feeSplitter: A9,
    listing: toPublicListing(Schema.decodeUnknownSync(SkillManifest)({
      id: `skill-${i}`, version: "1.0.0", serviceName: "Public skill", description: "Public description", tags: ["test"], price,
      bounds: { timeoutSec: 60, maxTurns: 2, maxToolCalls: 2, maxCostUsd: 0.1 },
      inputSchema: { type: "object" }, outputSchema: { type: "object" },
      engine: { adapter: "claude-api", entry: "agent.ts", credential: "api-key", capabilities: [] }
    }))
  }))
  return { listings: wire(records.map(({ listing, seller }) => ({ ...listing, seller }))),
    document: wire(buildWellKnownX402({ listings: records, origin: ORIGIN, rail, rails: [rail, ...(rail === "eip3009" ? ["gateway"] : [])], network: "eip155:5042002", asset: ASSET })) }
}
function first(f: ReturnType<typeof fixture>) {
  const resource = (f.document.resources as Array<Record<string, unknown>>)[0]!
  return { resource, accept: (resource.accepts as Array<Record<string, unknown>>)[0]! }
}
const discovery = (f = fixture()) => decodeSplitterDiscovery(ORIGIN, f.listings, f.document)

describe("G6 current discovery join", () => {
  test("joins actual public producer output, aggregates skills without assigning historical listing ownership", () => {
    const f = fixture(["$0.25", "$001.020000", "0.000001", "$9007199254740993.123456"])
    const result = discovery(f)
    expect(result).toEqual({ kind: "observed", candidates: [{ address: A9, seller: SELLER, listingIds: ["skill-0", "skill-1", "skill-2", "skill-3"] }] })
    const plan = planSplitterUpdate(existing, result)
    expect(JSON.parse(plan.json)).toEqual({ splitters: [{ address: A9, startBlock: 60460646 }, { address: PILOT, startBlock: 0 }] })
    expect(plan).toMatchObject({ added: 1, total: 2 })
    expect(plan.json).not.toMatch(/seller|listing|60460645/)
  })
  test("empty valid documents preserve every known pin; discovery-only ENS-expired entries are excluded", () => {
    const f = fixture()
    expect(decodeSplitterDiscovery(ORIGIN, [], f.document)).toEqual({ kind: "empty", candidates: [] })
    const full = JSON.parse(planSplitterUpdate(existing, discovery(f)).json)
    expect(planSplitterUpdate(full, decodeSplitterDiscovery(ORIGIN, [], fixture([]).document))).toMatchObject({ added: 0, total: 2 })
  })
  test("accepts actual producer address spelling while retaining canonical reviewed identity", () => {
    const f = fixture(["$1"], "eip3009", "0x" + SELLER.slice(2).toUpperCase())
    expect(discovery(f).candidates[0]).toEqual({ address: A9, seller: SELLER, listingIds: ["skill-0"] })
  })
  test("accepts the exact uint256 atomic boundary from the actual six-decimal producer", () => {
    const max = (1n << 256n) - 1n
    const value = `${max / 1_000_000n}.${(max % 1_000_000n).toString().padStart(6, "0")}`
    expect(discovery(fixture([value])).candidates).toHaveLength(1)
  })
  test("does not treat the retained empty response with an absent rail as verified EIP-3009 discovery", () => {
    expect(() => decodeSplitterDiscovery(ORIGIN, [], { x402Version: 2, resources: [] })).toThrow("discovery_invalid")
  })
  test("refuses observed schema or description drift across the two non-atomic reads", () => {
    const f = fixture(); first(f).resource.outputSchema = { type: "string" }
    expect(() => discovery(f)).toThrow("discovery_invalid")
    const other = fixture(); first(other).resource.description = "Changed description"; first(other).accept.description = "Changed description"
    expect(() => discovery(other)).toThrow("discovery_invalid")
  })
  test.each(["gateway", "test", "unknown"])("does not promote the %s default rail", (rail) => {
    expect(() => discovery(fixture(["$1"], rail))).toThrow("discovery_invalid")
  })
  test.each(["0", "$0.000000", "$0.0000001", " $1", "+1", "9".repeat(90)])("refuses invalid or unbounded price %s", (price) => {
    const f = fixture(); f.listings[0]!.price = price
    expect(() => discovery(f)).toThrow("discovery_invalid")
  })
  test.each([
    ["amount", "0250000"], ["amount", "250001"], ["amount", "0"], ["amount", (1n << 256n).toString()],
    ["network", "eip155:1"], ["asset", "0x" + "1".repeat(40)], ["scheme", "upto"],
    ["resource", ORIGIN + "/x/other/skill-0"], ["payTo", SELLER]
  ])("rejects mismatched payment coordinate %s", (key, value) => {
    const f = fixture(); first(f).accept[key!] = value
    expect(() => discovery(f)).toThrow()
  })
  test("rejects duplicate or missing matches and cross-origin/encoded paths", () => {
    for (const mutate of [
      (f: ReturnType<typeof fixture>) => { f.listings.push(f.listings[0]!) },
      (f: ReturnType<typeof fixture>) => { (f.document.resources as unknown[]).push(first(f).resource) },
      (f: ReturnType<typeof fixture>) => { f.document.resources = [] },
      (f: ReturnType<typeof fixture>) => { first(f).resource.resource = "https://other.example/x/" + SELLER + "/skill-0" },
      (f: ReturnType<typeof fixture>) => { first(f).resource.resource = ORIGIN + "/x/" + SELLER + "/%73kill-0" },
      (f: ReturnType<typeof fixture>) => { first(f).resource.accepts = [first(f).accept, first(f).accept] }
    ]) { const f = fixture(); mutate(f); expect(() => discovery(f)).toThrow("discovery_invalid") }
  })
  test("requires immutable approved seller binding, no arbitrary announced splitter authority", () => {
    const f = fixture(); first(f).accept.payTo = PILOT
    expect(() => discovery(f)).toThrow("unapproved_splitter")
  })
  test("fixed diagnostics capture own JSON data without invoking accessors or raw proxy errors", () => {
    let invoked = 0
    for (const value of [Object.defineProperty({}, "resources", { get() { invoked++; throw new Error("PRIVATE") } }),
      new Proxy({}, { ownKeys() { throw new Error("PRIVATE") } }),
      { x402Version: 2, rail: "eip3009", resources: [], extra: undefined }]) {
      expect(() => decodeSplitterDiscovery(ORIGIN, [], value)).toThrow("discovery_invalid")
    }
    expect(invoked).toBe(0)
  })
  test("does not inspect a hostile thrown value while normalizing diagnostics", () => {
    const thrown = new Proxy({}, { getPrototypeOf() { throw new Error("PRIVATE_THROWN_VALUE") } })
    const input = new Proxy({}, { ownKeys() { throw thrown } })
    expect(() => decodeSplitterDiscovery(ORIGIN, [], input)).toThrow("discovery_invalid")
  })
  test("enforces depth, rows and Unicode before projection", () => {
    const f = fixture(); f.document.resources = Array(1001).fill(first(f).resource)
    expect(() => discovery(f)).toThrow("discovery_invalid")
    const deep = fixture(); let nested: unknown = {}; for (let i = 0; i < 18; i++) nested = { nested }
    first(deep).resource.outputSchema = nested
    expect(() => discovery(deep)).toThrow("discovery_invalid")
    const unicode = fixture(); first(unicode).resource.description = "\ud800"
    expect(() => discovery(unicode)).toThrow("discovery_invalid")
  })
  test.each([
    { splitters: [] }, { splitters: [{ address: PILOT, startBlock: 1 }] },
    { splitters: [{ address: A9, startBlock: 60460646 }] },
    { splitters: [...existing.splitters, { address: A9, startBlock: 0 }] },
    { splitters: [...existing.splitters, ...existing.splitters] },
    { splitters: [{ address: PILOT, startBlock: 0, listingId: "skill-0" }] },
    { ...existing, erc8004StartBlock: 0 }
  ])("rejects corrupt existing inventory without repairing or dropping pins", (value) => {
    expect(() => planSplitterUpdate(value, discovery())).toThrow("inventory_invalid")
  })
  test("revalidates caller-supplied discovery rather than accepting a trust flag", () => {
    for (const candidate of [
      { address: A9, seller: PILOT, listingIds: ["skill-0"] },
      { address: A9, seller: SELLER, listingIds: [] },
      { address: A9, seller: SELLER, listingIds: ["skill-0"], verified: true },
      { address: A9, seller: SELLER, listingIds: ["skill-0", "skill-0"] }
    ]) expect(() => planSplitterUpdate(existing, { kind: "observed", candidates: [candidate] })).toThrow()
  })
})

const assets = ["schema.graphql", "src/fee-splitter.ts", "src/ids.ts", "src/identity.ts", "src/reputation.ts", "src/validation.ts", "src/registry.ts",
  "abis/FeeSplitter.json", "abis/FeeSplitterV2.json", "abis/IdentityRegistry.json", "abis/ReputationRegistry.json", "abis/ValidationRegistry.json"]
async function owned<T>(run: (paths: { output: URL; template: URL; chainConfig: URL }, root: string) => Promise<T>) {
  const root = await mkdtemp(join(tmpdir(), "g6-splitters-"))
  try {
    for (const directory of ["src", "abis"]) await mkdir(join(root, directory))
    for (const asset of assets) await copyFile(new URL(`../subgraph/${asset}`, import.meta.url), join(root, asset))
    const paths = { output: pathToFileURL(join(root, "splitters.json")), template: pathToFileURL(join(root, "subgraph.template.yaml")), chainConfig: pathToFileURL(join(root, "chain.json")) }
    await copyFile(new URL("../subgraph/subgraph.template.yaml", import.meta.url), paths.template)
    await copyFile(new URL("../config/chains/arc-testnet.json", import.meta.url), paths.chainConfig)
    await writeFile(paths.output, JSON.stringify(existing))
    return await run(paths, root)
  } finally { await rm(root, { recursive: true, force: true }) }
}
function transport(f = fixture()) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  const fetchImpl: SplitterFetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return Response.json(String(url).endsWith("/listings") ? f.listings : f.document)
  }
  return { fetchImpl, calls }
}
describe("G6 bounded local generator", () => {
  test("default dry-run performs exactly two public GETs and no file mutation", () => owned(async (paths, root) => {
    const t = transport(); const before = await readFile(paths.output, "utf8")
    expect(await updateSplitterList({ ...paths, hubOrigin: ORIGIN, fetchImpl: t.fetchImpl, write: false })).toEqual({ changed: true, added: 1, total: 2 })
    expect(await readFile(paths.output, "utf8")).toBe(before)
    expect(t.calls.map(c => c.url)).toEqual([ORIGIN + "/listings", ORIGIN + "/.well-known/x402"])
    for (const { init } of t.calls) {
      expect(init).toMatchObject({ method: "GET", credentials: "omit", redirect: "error" })
      const headers: string[] = []; new Headers(init?.headers).forEach((_value, key) => headers.push(key))
      expect(headers).toEqual(["accept"])
      expect(init?.body).toBeUndefined()
    }
    expect((await readdir(root)).some(name => name.endsWith(".tmp"))).toBe(false)
  }))
  test("captures dry-run permission before awaiting caller-controlled transport", () => owned(async paths => {
    const f = fixture()
    const options = { ...paths, hubOrigin: ORIGIN, write: false, fetchImpl: async (url: string | URL | Request) => {
      options.write = true
      return Response.json(String(url).endsWith("/listings") ? f.listings : f.document)
    } }
    await updateSplitterList(options)
    expect(await readFile(paths.output, "utf8")).toBe(JSON.stringify(existing))
  }))
  test("explicit write atomically replaces only validated list, remains append-only on empty discovery", () => owned(async paths => {
    await updateSplitterList({ ...paths, hubOrigin: ORIGIN, fetchImpl: transport().fetchImpl, write: true })
    const written = await readFile(paths.output, "utf8")
    expect(JSON.parse(written).splitters).toHaveLength(2)
    expect(await updateSplitterList({ ...paths, hubOrigin: ORIGIN, fetchImpl: transport(fixture([])).fetchImpl, write: true })).toEqual({ changed: false, added: 0, total: 2 })
    expect(await readFile(paths.output, "utf8")).toBe(written)
  }))
  test("invalid discovery or missing real mapping preserves original bytes and leaves no temporary file", () => owned(async (paths, root) => {
    const before = await readFile(paths.output, "utf8")
    const f = fixture(); first(f).accept.amount = "1"
    await expect(updateSplitterList({ ...paths, hubOrigin: ORIGIN, fetchImpl: transport(f).fetchImpl, write: true })).rejects.toThrow("discovery_invalid")
    await rm(join(root, "src/identity.ts"))
    await expect(updateSplitterList({ ...paths, hubOrigin: ORIGIN, fetchImpl: transport().fetchImpl, write: true })).rejects.toThrow("manifest_invalid")
    expect(await readFile(paths.output, "utf8")).toBe(before)
    expect((await readdir(root)).some(name => name.endsWith(".tmp"))).toBe(false)
  }))
  test("HTTP, malformed JSON, oversized body and fatal UTF8 are fixed refusals without retries", () => owned(async paths => {
    for (const response of [new Response("REMOTE_PRIVATE", { status: 503 }), new Response("{PRIVATE"), new Response("x".repeat(1_048_577)), new Response(new Uint8Array([0xc3]))]) {
      let calls = 0
      const fetchImpl = async () => { calls++; return response }
      await expect(updateSplitterList({ ...paths, hubOrigin: ORIGIN, fetchImpl, write: true })).rejects.toThrow(/^(discovery_invalid|discovery_unavailable)$/)
      expect(calls).toBe(1)
      expect(await readFile(paths.output, "utf8")).toBe(JSON.stringify(existing))
    }
  }))
  test("abort cuts off an uncooperative body and causes no late mutation", () => owned(async paths => {
    const controller = new AbortController(); let cancel = 0
    const fetchImpl = async () => new Response(new ReadableStream<Uint8Array>({ pull() { controller.abort(); return new Promise<void>(() => undefined) }, cancel() { cancel++ } }))
    await expect(updateSplitterList({ ...paths, hubOrigin: ORIGIN, fetchImpl, signal: controller.signal, write: true })).rejects.toThrow("cancelled")
    expect(cancel).toBe(1)
    expect(await readFile(paths.output, "utf8")).toBe(JSON.stringify(existing))
  }))
  test("invalid inventory and already cancelled operations perform no GET", () => owned(async paths => {
    const t = transport(), signal = AbortSignal.abort()
    await expect(updateSplitterList({ ...paths, hubOrigin: ORIGIN, fetchImpl: t.fetchImpl, signal, write: true })).rejects.toThrow("cancelled")
    await writeFile(paths.output, JSON.stringify({ splitters: [] }))
    await expect(updateSplitterList({ ...paths, hubOrigin: ORIGIN, fetchImpl: t.fetchImpl, write: true })).rejects.toThrow("inventory_invalid")
    expect(t.calls).toHaveLength(0)
  }))
  test("late uncooperative fetch acquisition is cancelled and never decoded or written", () => owned(async paths => {
    const controller = new AbortController()
    const entered = Promise.withResolvers<void>(), response = Promise.withResolvers<Response>(), cancelled = Promise.withResolvers<void>()
    let calls = 0
    const operation = updateSplitterList({ ...paths, hubOrigin: ORIGIN, signal: controller.signal, write: true,
      fetchImpl: async () => { calls++; entered.resolve(); return response.promise } })
    await entered.promise; controller.abort()
    await expect(operation).rejects.toThrow("cancelled")
    response.resolve(new Response(new ReadableStream({ cancel() { cancelled.resolve() } })))
    await cancelled.promise
    expect(calls).toBe(1)
    expect(await readFile(paths.output, "utf8")).toBe(JSON.stringify(existing))
  }))
  test("second GET failure is fixed and never retries or changes the output", () => owned(async paths => {
    const f = fixture(); let calls = 0
    await expect(updateSplitterList({ ...paths, hubOrigin: ORIGIN, write: true, fetchImpl: async () => {
      if (++calls === 1) return Response.json(f.listings)
      throw new Error("PRIVATE_REMOTE_SENTINEL")
    } })).rejects.toThrow("discovery_unavailable")
    expect(calls).toBe(2)
    expect(await readFile(paths.output, "utf8")).toBe(JSON.stringify(existing))
  }))
  test("cooperative concurrent changes are not overwritten and staged temporary files are cleaned", () => owned(async (paths, root) => {
    const f = fixture(), changed = JSON.stringify({ splitters: existing.splitters }, null, 4)
    let calls = 0
    await expect(updateSplitterList({ ...paths, hubOrigin: ORIGIN, write: true, fetchImpl: async () => {
      if (++calls === 1) return Response.json(f.listings)
      await writeFile(paths.output, changed); return Response.json(f.document)
    } })).rejects.toThrow("write_failed")
    expect(await readFile(paths.output, "utf8")).toBe(changed)
    expect((await readdir(root)).some(name => name.endsWith(".tmp"))).toBe(false)
  }))
})

async function child(args: string[]) {
  const subprocess = Bun.spawn([process.execPath, "--no-env-file", ...args], { env: {}, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const timer = setTimeout(() => subprocess.kill(), 3000)
  const read = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader(); let text = "", bytes = 0
    try {
      for (;;) {
        const next = await reader.read(); if (next.done) return text
        bytes += next.value.byteLength
        if (bytes > 8192) { subprocess.kill(); throw new Error("owned child output limit") }
        text += new TextDecoder().decode(next.value)
      }
    } finally { reader.releaseLock() }
  }
  try {
    const [stdout, stderr, code] = await Promise.all([read(subprocess.stdout), read(subprocess.stderr), subprocess.exited])
    return { stdout, stderr, code }
  } finally { clearTimeout(timer); subprocess.kill(); await subprocess.exited }
}

describe("G6 argument boundary", () => {
  test("explicit origin and write opt-in only; help is inert", () => {
    expect(parseSplitterArgs(["--help"])).toEqual({ help: true })
    expect(parseSplitterArgs(["--hub", ORIGIN])).toEqual({ help: false, hubOrigin: ORIGIN, write: false })
    expect(parseSplitterArgs(["--write", "--hub", ORIGIN])).toEqual({ help: false, hubOrigin: ORIGIN, write: true })
  })
  test.each([[], ["--write"], ["--help", "--write"], ["--hub", ORIGIN, "--hub", ORIGIN], ["--hub", ORIGIN, "--out", "/tmp/file"],
    ["--hub", "http://example.com"], ["--hub", "https://user:password@hub.example"], ["--hub", ORIGIN + "/base"], ["--hub", ORIGIN + "?secret=value"]].map(args => [args] as const))("refuses noncanonical or ambient configuration", args => {
    expect(() => parseSplitterArgs(args)).toThrow("configuration_invalid")
  })
  test("real import and help are inert with empty child environment; invalid arguments emit only fixed diagnostics", async () => {
    const path = new URL("./graph-splitters.ts", import.meta.url).pathname
    const imported = await child(["--eval", `globalThis.fetch = () => { throw Error("NETWORK_FORBIDDEN") }; await import(${JSON.stringify(path)});`])
    expect(imported).toEqual({ code: 0, stdout: "", stderr: "" })
    const help = await child([path, "--help"])
    expect(help.code).toBe(0); expect(help.stderr).toBe(""); expect(help.stdout).toContain("Default: dry-run")
    const invalid = await child([path, "--hub", "https://PRIVATE:VALUE@hub.example"])
    expect(invalid).toEqual({ code: 1, stdout: "", stderr: "configuration_invalid\n" })
  })
})
