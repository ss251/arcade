import { describe, expect, test } from "bun:test"
import { deepStrictEqual } from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import ABI from "../node_modules/@graphprotocol/graph-cli/dist/protocols/ethereum/abi.js"
import { IDENTITY_REGISTRY_ABI, REPUTATION_REGISTRY_ABI, VALIDATION_REGISTRY_ABI } from "../../packages/core/src/erc8004.ts"

type Input = { name: string; type: string; indexed: boolean }
type Event = { anonymous: false; name: string; type: "event"; inputs: Input[] }
const event = (name: string, fields: string): Event => ({
  anonymous: false, name, type: "event", inputs: fields.split(",").map(field => {
    const [type, second, third] = field.trim().split(/\s+/)
    if (!type || !second || (third !== undefined && second !== "indexed")) throw Error("Invalid ABI test contract")
    return { name: third ?? second, type, indexed: second === "indexed" }
  })
})

// Inactive local event contracts, not explorer-verified deployment ABIs. The
// three plan-only registry events are separately pinned below; do not infer
// their activation or deployment compatibility from the smoke manifest build.
const expected = {
  FeeSplitterV2: [
    event("Settled", "address indexed buyer,uint256 total,uint256 sellerAmount,uint256 feeAmount,bytes32 indexed nonce"),
    event("SettledTree", "address indexed buyer,uint256 total,uint256 sellerAmount,uint256 feeAmount,bytes32 indexed nonce,bytes32 indexed treeHash,uint32 childCount,uint256 childTotalAtomic")
  ],
  IdentityRegistry: [
    event("Registered", "uint256 indexed agentId,string agentURI,address indexed owner"),
    event("URIUpdated", "uint256 indexed agentId,string newURI,address indexed updatedBy"),
    event("MetadataSet", "uint256 indexed agentId,string indexed indexedMetadataKey,string metadataKey,bytes metadataValue"),
    event("Transfer", "address indexed from,address indexed to,uint256 indexed tokenId")
  ],
  ReputationRegistry: [
    event("NewFeedback", "uint256 indexed agentId,address indexed clientAddress,uint64 feedbackIndex,int128 value,uint8 valueDecimals,string indexed indexedTag1,string tag1,string tag2,string endpoint,string feedbackURI,bytes32 feedbackHash"),
    event("FeedbackRevoked", "uint256 indexed agentId,address indexed clientAddress,uint64 indexed feedbackIndex")
  ],
  ValidationRegistry: [
    event("ValidationRequest", "address indexed validatorAddress,uint256 indexed agentId,string requestURI,bytes32 indexed requestHash"),
    event("ValidationResponse", "address indexed validatorAddress,uint256 indexed agentId,bytes32 indexed requestHash,uint8 response,string responseURI,bytes32 responseHash,string tag")
  ]
} satisfies Record<string, Event[]>
type Name = keyof typeof expected
const names = Object.keys(expected) as Name[]
const text = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8")
const json = (path: string): unknown => JSON.parse(text(path))
/** Test-only exact contract: Graph parsing/topic signatures alone lose names. */
const assertLayout = (name: Name, actual: unknown): void => deepStrictEqual(actual, expected[name])
const signature = (entry: Event): string => `${entry.name}(${entry.inputs.map(input => `${input.indexed ? "indexed " : ""}${input.type}`).join(",")})`

describe("G3 inactive ABI event subsets", () => {
  test("uses the installed pinned Graph parser without changing the isolated toolchain", () => {
    expect(json("../node_modules/@graphprotocol/graph-cli/package.json")).toHaveProperty("version", "0.98.1")
    expect(json("../package.json")).toHaveProperty("dependencies.@graphprotocol/graph-cli", "0.98.1")
  })

  test.each(names)("parses %s through actual Graph ABI.load with the complete exact layout", name => {
    const file = fileURLToPath(new URL(`../abis/${name}.json`, import.meta.url))
    const raw = json(`../abis/${name}.json`)
    const parsed = ABI.load(name, file)
    assertLayout(name, raw)
    assertLayout(name, parsed.data.toJS())
    expect(parsed.eventSignatures().toArray()).toEqual(expected[name].map(signature))
  })

  test("corroborates the complete splitter layouts against the actual local Solidity declarations", () => {
    const source = text("../../contracts/FeeSplitterV2.sol")
    for (const entry of expected.FeeSplitterV2) {
      const declaration = new RegExp(`event ${entry.name}\\s*\\(([^)]+)\\)\\s*;`).exec(source)?.[1]
      expect(declaration).toBeDefined()
      expect(event(entry.name, declaration!)).toEqual(entry)
    }
  })

  test.each([
    ["IdentityRegistry", IDENTITY_REGISTRY_ABI],
    ["ReputationRegistry", REPUTATION_REGISTRY_ABI],
    ["ValidationRegistry", VALIDATION_REGISTRY_ABI]
  ] as const)("corroborates existing %s core events (including Transfer for Identity)", (name, core) => {
    const events = core.filter(entry => entry.type === "event")
    expect(events.length).toBeGreaterThan(0)
    for (const entry of events) {
      expect(expected[name].find(candidate => candidate.name === entry.name)).toEqual({
        anonymous: false, ...entry, inputs: entry.inputs.map(input => ({ ...input }))
      })
    }
  })

  test.each(names)("keeps %s plan candidates explicit, without pretending local text verifies deployed code", name => {
    const plan = text("../../docs/superpowers/plans/2026-09-04-G-graph.md")
    const marker = `\n\u0060subgraph/abis/${name}.json\u0060`
    const offset = plan.indexOf(marker)
    expect(offset).toBeGreaterThanOrEqual(0)
    const section = plan.slice(offset)
    const block = /```json\n([\s\S]*?)\n```/.exec(section)?.[1]
    expect(block).toBeDefined()
    const candidate: unknown = JSON.parse(block!)
    expect(candidate).toEqual(name === "IdentityRegistry" ? expected[name].filter(entry => entry.name !== "Transfer") : expected[name])
  })

  test.each([
    ["indexed flag", "IdentityRegistry", (events: Event[]) => { events[2]!.inputs[1]!.indexed = false }],
    ["signedness", "ReputationRegistry", (events: Event[]) => { events[0]!.inputs[3]!.type = "uint128" }],
    ["feedback width", "ReputationRegistry", (events: Event[]) => { events[0]!.inputs[2]!.type = "uint256" }],
    ["child count width", "FeeSplitterV2", (events: Event[]) => { events[1]!.inputs[6]!.type = "uint256" }],
    ["same-type argument order", "FeeSplitterV2", (events: Event[]) => { [events[0]!.inputs[2], events[0]!.inputs[3]] = [events[0]!.inputs[3]!, events[0]!.inputs[2]!] }],
    ["Transfer omission", "IdentityRegistry", (events: Event[]) => { events.pop() }],
    ["anonymous event", "ValidationRegistry", (events: Event[]) => { Object.assign(events[0]!, { anonymous: true }) }],
    ["extra ABI member", "ValidationRegistry", (events: Event[]) => { Object.assign(events[0]!, { extra: true }) }]
  ] as const)("rejects an in-memory %s mutation of the exact %s contract", (_label, name, mutate) => {
    const altered = structuredClone(expected[name])
    mutate(altered)
    expect(() => assertLayout(name, altered)).toThrow()
  })
})
