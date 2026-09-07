import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import ABI from "../node_modules/@graphprotocol/graph-cli/dist/protocols/ethereum/abi.js"
import { renderManifest } from "../build-manifest.ts"

const text = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8")
const sources = {
  ERC8183: "../../lib/erc8183/contracts/ERC8183.sol",
  ArcadeJobHook: "../../contracts/ArcadeJobHook.sol"
} as const
const names = {
  ERC8183: ["JobCreated", "ProviderSet", "PayoutReceiverSet", "BudgetSet", "JobFunded",
    "JobSubmitted", "JobCompleted", "JobRejected", "JobExpired", "PaymentReleased",
    "PlatformFeePaid", "EvaluatorFeePaid", "Refunded", "Settled"],
  ArcadeJobHook: ["ArcadeSettled", "ArcadeRefused"]
} as const
type Name = keyof typeof sources
function declarations(name: Name) {
  const source = text(sources[name])
  return names[name].map(eventName => {
    const body = new RegExp(`event ${eventName}\\s*\\(([^)]*)\\)\\s*;`).exec(source)?.[1]
    if (!body) throw Error("Missing pinned Solidity event")
    return { anonymous: false, name: eventName, type: "event", inputs: body.split(",").map(field => {
      const parts = field.trim().split(/\s+/)
      if (parts.length < 2 || parts.length > 3 || (parts.length === 3 && parts[1] !== "indexed")) throw Error("Unexpected event layout")
      return { name: parts.at(-1), type: parts[0], indexed: parts.includes("indexed") }
    }) }
  })
}

describe("J11A inactive escrow schema and ABI contracts", () => {
  for (const name of Object.keys(sources) as Name[]) {
    test(`${name} parses in the actual pinned Graph parser and matches local Solidity exactly`, () => {
      const path = new URL(`../abis/${name}.json`, import.meta.url)
      const expected = declarations(name)
      expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(expected)
      const parsed = ABI.load(name, fileURLToPath(path))
      expect(parsed.data.toJS()).toEqual(expected)
      expect(parsed.eventSignatures().toArray()).toEqual(expected.map(event =>
        `${event.name}(${event.inputs.map(input => `${input.indexed ? "indexed " : ""}${input.type}`).join(",")})`))
    })
  }
  test("retains both active splitter sources and exactly four pre-existing inactive templates", () => {
    const manifest = Bun.YAML.parse(renderManifest(text("../subgraph.template.yaml"),
      JSON.parse(text("../../config/chains/arc-testnet.json")), JSON.parse(text("../splitters.json")))) as {
        dataSources: Array<{ name: string }>; templates: Array<{ name: string }>
      }
    expect(manifest.dataSources.map((s: { name: string }) => s.name)).toEqual(["FeeSplitterA9", "FeeSplitterSmoke"])
    expect(manifest.templates.map((s: { name: string }) => s.name)).toEqual([
      "FeeSplitterV2", "IdentityRegistry", "ReputationRegistry", "ValidationRegistry"])
    expect(JSON.stringify(manifest)).not.toMatch(/ERC8183|ArcadeJobHook/)
  })
  test("retains exact splitter provenance in active and historical mappings", () => {
    expect(text("../src/fee-splitter.ts")).toContain('settlement.rail = "eip3009"')
    expect(text("../src/smoke.ts")).toContain('s.rail = "eip3009"')
    for (const path of ["../src/fee-splitter.ts", "../src/smoke.ts"]) {
      expect(text(path)).not.toMatch(/new Escrow(?:Job|Event)|\.escrowJob\s*=/)
    }
  })
})
