import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { credentialOf, SkillManifest, toPublicListing } from "@arcade/core"
import { buildEnv } from "../../../packages/runner/src/exec.ts"
import { validateJson } from "../../../apps/hub/src/validate.ts"

const ADDRESS = "0x1111111111111111111111111111111111111111"
const HASH = `0x${"a".repeat(64)}`
const SUBGRAPH = "43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb"
const ENDPOINT = `https://gateway.thegraph.com/api/x402/subgraphs/id/${SUBGRAPH}`
const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), "utf8")
const rawManifest = (): Record<string, unknown> => JSON.parse(read("../arcade.json")) as Record<string, unknown>
// Use core's declared Effect dependency, not an undeclared hoisted root dependency.
const coreRequire = createRequire(new URL("../../../packages/core/package.json", import.meta.url))
const coreSchema = coreRequire("effect/Schema") as {
  decodeUnknownSync: (schema: typeof SkillManifest) => (value: unknown) => SkillManifest
}
const manifest = () => coreSchema.decodeUnknownSync(SkillManifest)(rawManifest())
const assessment = () => ({
  address: ADDRESS, verdict: "manual-review", identities: [{
    agentId: "8453:7", chainId: 8453, owner: ADDRESS, agentWallet: null,
    name: null, active: null, x402Support: null, ens: null, supportedTrusts: [],
    validationsPassed: 0, validationsFailed: 0
  }], attesterSettledCount: 0, contradictions: [], evidenceFlags: ["payment-proof-unverified"],
  sources: [{ name: "agent0-base", endpoint: ENDPOINT, subgraphId: SUBGRAPH,
    block: null, blockHash: null, chain: "eip155:8453", costAtomic: null, paymentTx: null }]
})

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe("counterparty-graph listing contract", () => {
  it("decodes the exact bounded script listing without hiring authority", () => {
    const listing = manifest()
    expect(listing.id).toBe("counterparty-graph")
    expect(listing.price).toBe("$0.05")
    expect(listing.engine).toEqual({ adapter: "script", entry: "run.ts", capabilities: [] })
    expect(credentialOf(listing)).toBe("none")
    expect(listing.bounds).toEqual({ timeoutSec: 90 })
    expect(listing.bounds.maxSubSpendUsd ?? 0).toBe(0)
    expect(listing.secrets).toEqual(["GRAPH_X402_PAYER_KEY", "GRAPH_X402_KEYCHAIN_SERVICE"])
    expect(listing.egress).toEqual(["gateway.thegraph.com", "mainnet.base.org"])
    expect(listing.description).toMatch(/evidence|policy/i)
    expect(listing.description).not.toMatch(/safe to transact/i)
  })

  it("publishes a realistic public input but no private transport or credential names", () => {
    const listing = manifest()
    const projected = toPublicListing(listing)
    expect(projected.canaryInput).toEqual({ address: "0x3600000000000000000000000000000000000000" })
    expect(validateJson(projected.canaryInput, projected.inputSchema)).toBe(true)
    for (const key of ["engine", "secrets", "egress", "entry", "systemPrompt"]) expect(projected).not.toHaveProperty(key)
    expect(JSON.stringify(projected)).not.toMatch(/GRAPH_X402_|run\.ts/)
  })

  it("forwards only declared payer configuration and never a hire, model or seller grant", () => {
    vi.stubEnv("GRAPH_X402_PAYER_KEY", "dummy-payer-only")
    vi.stubEnv("GRAPH_X402_KEYCHAIN_SERVICE", "dummy-service-only")
    for (const name of ["ANTHROPIC_API_KEY", "ARCADE_SELLER_KEY", "ARCADE_SUBBUY_KEY", "ARCADE_HIRE_SOCKET", "X402_PRIVATE_KEY"]) vi.stubEnv(name, "must-stay-private")
    const env = buildEnv(manifest(), "/tmp/graph-skill-fixture")
    expect(env).toMatchObject({ GRAPH_X402_PAYER_KEY: "dummy-payer-only", GRAPH_X402_KEYCHAIN_SERVICE: "dummy-service-only", HOME: "/tmp/graph-skill-fixture" })
    expect(Object.keys(env).sort()).toEqual(["ARCADE_SANDBOX", "GRAPH_X402_KEYCHAIN_SERVICE", "GRAPH_X402_PAYER_KEY", "HOME", "LANG", "PATH"].sort())
  })

  it.each([{}, { address: "not-an-address" }, { address: `0x${"1".repeat(39)}` }, { address: 7 }])("rejects malformed input %j", (input) => {
    expect(validateJson(input, manifest().inputSchema)).toBe(false)
  })

  it("declares closed shapes and bounded evidence flags for the strict runtime gate", () => {
    // The hub's deliberately limited validator ignores additionalProperties/uniqueItems.
    // G11/G12 must additionally enforce these declarations; this test does not pretend otherwise.
    const raw = rawManifest() as { inputSchema: Record<string, unknown>; outputSchema: Record<string, unknown> }
    expect(raw.inputSchema.additionalProperties).toBe(false)
    expect(raw.outputSchema.additionalProperties).toBe(false)
    expect(raw.outputSchema.required).toEqual(["address", "verdict", "identities", "attesterSettledCount", "contradictions", "sources", "evidenceFlags"])
    const props = raw.outputSchema.properties as Record<string, Record<string, unknown>>
    expect(props.evidenceFlags).toMatchObject({ type: "array", maxItems: 12, uniqueItems: true })
    expect(props.identities).toMatchObject({ type: "array", maxItems: 50 })
    expect(props.sources).toMatchObject({ type: "array", maxItems: 2 })
  })

  it("accepts unknown source block/cost as null without fabricating payment", () => {
    expect(validateJson(assessment(), manifest().outputSchema)).toBe(true)
  })

  it.each([
    ["negative count", (a: ReturnType<typeof assessment>) => ({ ...a, attesterSettledCount: -1 })],
    ["fractional count", (a: ReturnType<typeof assessment>) => ({ ...a, attesterSettledCount: 0.5 })],
    ["unbounded count", (a: ReturnType<typeof assessment>) => ({ ...a, attesterSettledCount: 101 })],
    ["unknown flag", (a: ReturnType<typeof assessment>) => ({ ...a, evidenceFlags: ["raw-provider-diagnostic"] })],
    ["foreign chain", (a: ReturnType<typeof assessment>) => ({ ...a, identities: [{ ...a.identities[0], chainId: 1 }] })],
    ["noncanonical agent", (a: ReturnType<typeof assessment>) => ({ ...a, identities: [{ ...a.identities[0], agentId: "8453:007" }] })],
    ["invalid owner", (a: ReturnType<typeof assessment>) => ({ ...a, identities: [{ ...a.identities[0], owner: "bad" }] })],
    ["negative validations", (a: ReturnType<typeof assessment>) => ({ ...a, identities: [{ ...a.identities[0], validationsPassed: -1 }] })],
    ["unbounded sources", (a: ReturnType<typeof assessment>) => ({ ...a, sources: Array(3).fill(a.sources[0]) })],
    ["unsafe block", (a: ReturnType<typeof assessment>) => ({ ...a, sources: [{ ...a.sources[0], block: Number.MAX_SAFE_INTEGER + 1 }] })],
    ["forged block hash", (a: ReturnType<typeof assessment>) => ({ ...a, sources: [{ ...a.sources[0], blockHash: "0x1" }] })],
    ["noncanonical cost", (a: ReturnType<typeof assessment>) => ({ ...a, sources: [{ ...a.sources[0], costAtomic: "01" }] })],
    ["forged payment hash", (a: ReturnType<typeof assessment>) => ({ ...a, sources: [{ ...a.sources[0], paymentTx: "0x1" }] })],
    ["foreign endpoint", (a: ReturnType<typeof assessment>) => ({ ...a, sources: [{ ...a.sources[0], endpoint: "https://untrusted.invalid/" }] })]
  ] as const)("rejects %s from output", (_name, mutate) => {
    expect(validateJson(mutate(assessment()), manifest().outputSchema)).toBe(false)
  })

  it("allows canonical independently supplied public source coordinates", () => {
    const a = assessment()
    expect(validateJson({ ...a, sources: [{ ...a.sources[0], block: 123, blockHash: HASH, costAtomic: "10000", paymentTx: HASH }] }, manifest().outputSchema)).toBe(true)
  })
})

describe("pinned query and dependency contract", () => {
  it("loads the installed factory offline without invoking it or touching fetch", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network forbidden in G10"))
    const client = await import("@graphprotocol/client-x402")
    expect(typeof client.createGraphQuery).toBe("function")
    expect(client.CHAIN_IDS).toEqual({ base: "eip155:8453", "base-sepolia": "eip155:84532" })
    expect(network).not.toHaveBeenCalled()
  })

  it("parses both fixed documents with the installed client peer GraphQL parser", () => {
    const clientRequire = createRequire(coreRequire.resolve("@graphprotocol/client-x402/package.json"))
    const graphql = clientRequire("graphql") as {
      parse: (document: string) => { definitions: Array<{ kind: string; operation?: string; name?: { value: string } }> }
    }
    for (const name of ["identities", "attestations"]) {
      const parsed = graphql.parse(read(`../queries/${name}.graphql`))
      const operations = parsed.definitions.filter((entry) => entry.kind === "OperationDefinition")
      expect(operations).toHaveLength(1)
      expect(operations[0]?.operation).toBe("query")
      expect(operations[0]?.name?.value).toMatch(/^Counterparty(Identities|Attestations)$/)
    }
  })

  it("pins only the root application x402 client dependency", () => {
    const pkg = JSON.parse(read("../../../package.json")) as { dependencies: Record<string, string>; workspaces: string[] }
    expect(pkg.dependencies["@graphprotocol/client-x402"]).toBe("1.0.0")
    expect(pkg.workspaces).toEqual(["packages/*", "apps/*"])
  })

  it("pins the identity query with bounded owner/wallet joins and coherent block metadata", () => {
    const query = read("../queries/identities.graphql")
    expect(query).toContain("query CounterpartyIdentities($address: Bytes!)")
    expect(query).toContain("_meta { block { number hash } hasIndexingErrors }")
    expect(query).toContain("asWallet: agents(where: { agentWallet: $address }, first: 25)")
    expect(query).toContain("asOwner: agents(where: { owner: $address }, first: 25)")
    expect(query).toContain("validations(first: 25)")
    expect(query).toContain("agent { id }")
    expect(query.match(/\bquery\s+Counterparty/g)).toHaveLength(1)
    expect(query).not.toMatch(/\bmutation\b|\bsubscription\b|__schema/)
  })

  it("pins feedback bindings and payer provenance without relaying feedback prose", () => {
    const query = read("../queries/attestations.graphql")
    expect(query).toContain("query CounterpartyAttestations($agentIds: [String!]!)")
    expect(query).toContain("_meta { block { number hash } hasIndexingErrors }")
    expect(query).toContain("where: { agent_in: $agentIds }")
    expect(query).toContain("first: 100")
    for (const field of ["feedbackIndex", "feedbackHash", "feedbackId", "agentId", "agentRegistry", "clientAddress", "proofOfPaymentFromAddress", "proofOfPaymentToAddress", "proofOfPaymentChainId", "proofOfPaymentTxHash"]) expect(query).toMatch(new RegExp(`\\b${field}\\b`))
    expect(query).not.toMatch(/\btext\b|\bmutation\b|\bsubscription\b|__schema/)
    expect(query.match(/\bquery\s+Counterparty/g)).toHaveLength(1)
  })
})
