import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { renderManifest } from "../build-manifest.ts"
import {
  buildASTSchema, Kind, parse, print, validate,
  type ObjectTypeDefinitionNode
} from "../node_modules/graphql/index.js"

const text = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8")
const current = (): string => text("../schema.graphql")

const expected: Readonly<Record<string, { readonly immutable: boolean; readonly fields: Readonly<Record<string, string>> }>> = {
  RegistryEvent: { immutable: true, fields: {
    id: "Bytes!", registry: "Bytes!", kind: "String!", disposition: "String!",
    txHash: "Bytes!", blockNumber: "BigInt!", timestamp: "BigInt!", logIndex: "BigInt!"
  } },
  Marketplace: { immutable: false, fields: {
    id: "ID!", settlementCount: "BigInt!", treeCount: "BigInt!", settledVolumeAtomic: "BigInt!",
    feeAtomic: "BigInt!", childTotalAtomic: "BigInt!", agentCount: "BigInt!", feedbackCount: "BigInt!",
    validationRequestCount: "BigInt!", validationPassCount: "BigInt!", splitterCount: "BigInt!", updatedAt: "BigInt!"
  } },
  Splitter: { immutable: false, fields: {
    id: "Bytes!", source: "String!", listing: "Listing", firstSeenBlock: "BigInt!",
    settlementCount: "BigInt!", settledVolumeAtomic: "BigInt!", settlements: "[Settlement!]!"
  } },
  Settlement: { immutable: true, fields: {
    id: "Bytes!", rail: "String!", splitter: "Splitter", escrowJob: "EscrowJob", buyer: "Bytes!", totalAtomic: "BigInt!", sellerAtomic: "BigInt!",
    feeAtomic: "BigInt!", nonce: "Bytes", tree: "Tree", blockNumber: "BigInt!", timestamp: "BigInt!", txHash: "Bytes!"
  } },
  EscrowJob: { immutable: false, fields: {
    id: "ID!", chainId: "BigInt!", escrow: "Bytes!", jobId: "BigInt!", client: "Bytes!",
    provider: "Bytes!", evaluator: "Bytes!", hook: "Bytes!", expiredAt: "BigInt!", status: "String!",
    paymentToken: "Bytes", budgetAtomic: "BigInt", fundedAtomic: "BigInt", fundedAt: "BigInt", fundTx: "Bytes",
    closureEligible: "Boolean!", completedAt: "BigInt", completeTx: "Bytes", treeHash: "Bytes", receiptHash: "Bytes", deliverable: "Bytes",
    createdBlock: "BigInt!", createdAt: "BigInt!", createdTxHash: "Bytes!",
    updatedBlock: "BigInt!", updatedAt: "BigInt!", updatedLogIndex: "BigInt!", events: "[EscrowEvent!]!"
  } },
  EscrowEvent: { immutable: true, fields: {
    id: "Bytes!", escrow: "Bytes!", emitter: "Bytes!", jobId: "BigInt!", job: "EscrowJob",
    kind: "String!", actor: "Bytes", token: "Bytes", amountAtomic: "BigInt", cumulativeAtomic: "BigInt",
    agentId: "BigInt", hash: "Bytes", treeHash: "Bytes", receiptHash: "Bytes",
    childCount: "BigInt", childTotalAtomic: "BigInt", payloadHash: "Bytes!", blockNumber: "BigInt!",
    timestamp: "BigInt!", txHash: "Bytes!", logIndex: "BigInt!"
  } },
  Tree: { immutable: false, fields: {
    id: "Bytes!", root: "Settlement", childCount: "Int", childTotalAtomic: "BigInt!",
    blockNumber: "BigInt!", timestamp: "BigInt!", txHash: "Bytes!", occurrenceCount: "BigInt!", ambiguous: "Boolean!"
  } },
  TreeOccurrence: { immutable: true, fields: {
    id: "Bytes!", treeHash: "Bytes!", root: "Settlement!", splitter: "Splitter!", childCount: "BigInt!",
    childTotalAtomic: "BigInt!", blockNumber: "BigInt!", timestamp: "BigInt!", txHash: "Bytes!", logIndex: "BigInt!"
  } },
  Agent: { immutable: false, fields: {
    id: "ID!", chainId: "BigInt!", agentId: "BigInt!", registry: "Bytes!", owner: "Bytes!",
    agentWallet: "Bytes", agentURI: "String", listing: "Listing", createdAt: "BigInt!", updatedAt: "BigInt!",
    feedbackCount: "BigInt!", validationRequestCount: "BigInt!", validationPassCount: "BigInt!",
    feedback: "[Feedback!]!", validations: "[Validation!]!"
  } },
  Listing: { immutable: false, fields: {
    id: "ID!", agent: "Agent!", feeSplitter: "Splitter", priceAtomic: "BigInt", endpoint: "String", updatedAt: "BigInt!"
  } },
  ListingClaim: { immutable: true, fields: {
    id: "Bytes!", agent: "Agent!", registry: "Bytes!", metadataKey: "String!", claimedListingId: "String",
    claimedSplitter: "Bytes", claimedPriceAtomic: "BigInt", claimedEndpoint: "String",
    blockNumber: "BigInt!", timestamp: "BigInt!", txHash: "Bytes!", logIndex: "BigInt!"
  } },
  Feedback: { immutable: false, fields: {
    id: "ID!", agent: "Agent!", clientAddress: "Bytes!", feedbackIndex: "BigInt!", value: "BigInt!",
    valueDecimals: "Int!", tag1: "String", tag2: "String", endpoint: "String", feedbackURI: "String",
    feedbackHash: "Bytes", isRevoked: "Boolean!", createdAt: "BigInt!", revokedAt: "BigInt", txHash: "Bytes!"
  } },
  Validation: { immutable: false, fields: {
    id: "Bytes!", agent: "Agent!", validatorAddress: "Bytes!", requestURI: "String", response: "Int",
    responseURI: "String", responseHash: "Bytes", tag: "String", status: "String!",
    createdAt: "BigInt!", updatedAt: "BigInt!", requestTxHash: "Bytes!", responseTxHash: "Bytes"
  } }
}

const objectTypes = (source: string): ReadonlyArray<ObjectTypeDefinitionNode> =>
  parse(source).definitions.filter((node): node is ObjectTypeDefinitionNode => node.kind === Kind.OBJECT_TYPE_DEFINITION)

const fields = (node: ObjectTypeDefinitionNode): Record<string, string> =>
  Object.fromEntries((node.fields ?? []).map((field) => [field.name.value, print(field.type)]))

/** A test contract, not a graph-node persistence or authorization validator. */
const violations = (source: string): string[] => {
  const nodes = objectTypes(source)
  const problems: string[] = []
  if (nodes.length !== Object.keys(expected).length) problems.push("entity set")
  for (const [name, spec] of Object.entries(expected)) {
    const node = nodes.find((candidate) => candidate.name.value === name)
    if (!node) { problems.push(`${name}: missing`); continue }
    const actual = fields(node)
    if (Object.keys(actual).length !== Object.keys(spec.fields).length) problems.push(`${name}: field set`)
    for (const [field, type] of Object.entries(spec.fields)) {
      if (actual[field] !== type) problems.push(`${name}.${field}: ${type}`)
    }
    const immutable = node.directives?.find((d) => d.name.value === "entity")?.arguments?.find((a) => a.name.value === "immutable")?.value
    if (immutable?.kind !== Kind.BOOLEAN || immutable.value !== spec.immutable) problems.push(`${name}: immutable`)
  }
  for (const [entity, field, target] of [
    ["Splitter", "settlements", "splitter"], ["Agent", "feedback", "agent"], ["Agent", "validations", "agent"],
    ["EscrowJob", "events", "job"]
  ] as const) {
    const value = nodes.find((n) => n.name.value === entity)?.fields?.find((f) => f.name.value === field)
      ?.directives?.find((d) => d.name.value === "derivedFrom")?.arguments?.find((a) => a.name.value === "field")?.value
    if (value?.kind !== Kind.STRING || value.value !== target) problems.push(`${entity}.${field}: derivedFrom`)
  }
  return problems
}

// These are Graph's generated query/scalar facilities, not additional persisted entities.
// Persisted field selections below come from the real G7 source, never copied fixture queries.
const graphQueryFacilities = `
  scalar BigInt
  scalar Bytes
  directive @entity(immutable: Boolean!) on OBJECT
  directive @derivedFrom(field: String!) on FIELD_DEFINITION
  type _Block_ { number: Int! }
  type _Meta_ { block: _Block_! hasIndexingErrors: Boolean! }
  type Query {
    _meta: _Meta_
    marketplace(id: ID!): Marketplace
    listing(id: ID!): Listing
    tree(id: Bytes!): Tree
  }
`

const realQuery = (name: string): string => {
  const match = new RegExp(`const ${name} = ` + "`([^`]+)`").exec(text("../../apps/hub/src/graph.ts"))
  if (!match?.[1]) throw new Error(`G7 query declaration missing: ${name}`)
  return match[1]
}

describe("G2 ledger schema contract (offline)", () => {
  test("defines the existing ledger plus offline escrow jobs and immutable observations", () => {
    expect(violations(current())).toEqual([])
  })

  for (const [name, spec] of Object.entries(expected)) {
    test(`${name} preserves exact scalar ranges, relationships and immutability`, () => {
      const node = objectTypes(current()).find((n) => n.name.value === name)
      expect(node).toBeDefined()
      expect(node && fields(node)).toEqual(spec.fields)
    })
  }

  for (const [from, to, problem] of [
    ["totalAtomic: BigInt!", "totalAtomic: Float!", "Settlement.totalAtomic"],
    ["splitter: Splitter\n", "splitter: Splitter!\n", "Settlement.splitter"],
    ["nonce: Bytes\n", "nonce: Bytes!\n", "Settlement.nonce"],
    ["rail: String!", "rail: String", "Settlement.rail"],
    ["escrowJob: EscrowJob\n", "escrowJob: EscrowJob!\n", "Settlement.escrowJob"],
    ["jobId: BigInt!", "jobId: Int!", "EscrowJob.jobId"],
    ["budgetAtomic: BigInt\n", "budgetAtomic: BigInt!\n", "EscrowJob.budgetAtomic"],
    ["fundedAtomic: BigInt\n", "fundedAtomic: Float\n", "EscrowJob.fundedAtomic"],
    ["type EscrowEvent @entity(immutable: true)", "type EscrowEvent @entity(immutable: false)", "EscrowEvent: immutable"],
    ["childCount: BigInt\n", "childCount: Int\n", "EscrowEvent.childCount"],
    ["job: EscrowJob\n", "job: EscrowJob!\n", "EscrowEvent.job"],
    ["root: Settlement\n", "root: Settlement!\n", "Tree.root"],
    ["childCount: Int\n", "childCount: Int!\n", "Tree.childCount"],
    ["childCount: BigInt!", "childCount: Int!", "TreeOccurrence.childCount"],
    ["type TreeOccurrence @entity(immutable: true)", "type TreeOccurrence @entity(immutable: false)", "TreeOccurrence: immutable"],
    ["type ListingClaim @entity(immutable: true)", "type ListingClaim @entity(immutable: false)", "ListingClaim: immutable"],
    ["type RegistryEvent @entity(immutable: true)", "type RegistryEvent @entity(immutable: false)", "RegistryEvent: immutable"],
    ["kind: String!", "kind: Bytes!", "RegistryEvent.kind"],
    ["disposition: String!", "disposition: String", "RegistryEvent.disposition"],
    ["owner: Bytes!", "owner: Bytes", "Agent.owner"],
    ["agentId: BigInt!\n  registry: Bytes!", "agentId: BigInt!\n  registry: String!", "Agent.registry"],
    ["listing: Listing\n", "listing: Listing!\n", "Splitter.listing"],
    ["agent: Agent!", "agent: String!", "Listing.agent"],
    ["@derivedFrom(field: \"splitter\")", "@derivedFrom(field: \"buyer\")", "Splitter.settlements: derivedFrom"]
  ] as const) {
    test(`rejects a mutated ${problem} contract`, () => {
      const original = current()
      const mutated = original.replace(from, to)
      expect(mutated).not.toBe(original)
      expect(violations(mutated).some((v) => v.startsWith(problem))).toBe(true)
    })
  }

  for (const query of ["STATS_QUERY", "EVIDENCE_QUERY", "TREE_QUERY"]) {
    test(`validates actual G7 ${query} field selections against the schema`, () => {
      const schema = buildASTSchema(parse(current() + graphQueryFacilities))
      expect(validate(schema, parse(realQuery(query)))).toEqual([])
    })
  }

  test("detects a missing field consumed by the actual tree query", () => {
    const altered = current().replace("childCount: Int\n", "childCountElsewhere: Int\n")
    expect(altered).not.toBe(current())
    const schema = buildASTSchema(parse(altered + graphQueryFacilities))
    expect(validate(schema, parse(realQuery("TREE_QUERY"))).map((e) => e.message).join(" ")).toContain("childCount")
  })

  test("requires duplicate-event guard before updating emitter counters and saving a settlement", () => {
    const mapping = text("../src/smoke.ts")
    expect(mapping).toContain("const id = event.transaction.hash.concatI32(event.logIndex.toI32())")
    const guard = mapping.indexOf("if (Settlement.load(id) != null) return")
    const load = mapping.indexOf("Splitter.load(event.address)")
    const increment = mapping.indexOf("splitter.settlementCount = splitter.settlementCount.plus")
    expect(guard).toBeGreaterThan(0)
    expect(load).toBeGreaterThan(guard)
    expect(increment).toBeGreaterThan(load)
    expect(mapping).toContain("s.splitter = splitter.id")
    expect(mapping).toContain("splitter.firstSeenBlock = event.block.number")
    expect(mapping).toContain("splitter.source = \"static\"")
    expect(mapping).not.toMatch(/(?:Marketplace|Agent|Listing)\.(?:load|save)|new (?:Marketplace|Agent|Listing)|splitter\.listing\s*=/)
  })

  test("declares pilot entities and the real inactive tree mapping without registry coverage", () => {
    const manifest = Bun.YAML.parse(renderManifest(text("../subgraph.template.yaml"), JSON.parse(text("../../config/chains/arc-testnet.json")), JSON.parse(text("../splitters.json"))))
    expect(manifest).toMatchObject({ dataSources: [
      { name: "FeeSplitterA9", mapping: { entities: ["Settlement", "Splitter", "Tree", "TreeOccurrence"] } },
      { name: "FeeSplitterSmoke", mapping: { entities: ["Settlement", "Splitter"] } }
    ] })
    expect(manifest).toHaveProperty("templates.0", expect.objectContaining({
      name: "FeeSplitterV2",
      mapping: expect.objectContaining({ entities: ["Settlement", "Splitter", "Tree", "TreeOccurrence"] })
    }))
    expect(manifest).toHaveProperty("templates.length", 6)
  })

  test("labels local schema evolution separately from deployed G1 and unavailable aggregates", () => {
    const section = text("../README.md").split("## G2 local schema transition")[1]?.split("\n## ")[0]
    expect(section).toBeDefined()
    expect(section).toContain("does not change the acknowledged G1 CID")
    expect(section).toContain("no Marketplace row")
    expect(section).toContain("not graph-node runtime save/load evidence")
  })
})
