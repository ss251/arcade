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

describe("J11 inactive escrow schema and ABI contracts", () => {
  test("mapping sources cannot instantiate templates or manufacture terminal settlements", () => {
    for (const path of ["../src/escrow-events.ts", "../src/escrow.ts", "../src/escrow-hook.ts"]) {
      expect(text(path)).not.toMatch(/\.create(?:WithContext)?\(|new (?:Settlement|Tree|Listing)\b/)
    }
  })
  for (const [label, from, to] of [
    ["address activation", "      abi: ERC8183\n", "      abi: ERC8183\n      address: '0x1111111111111111111111111111111111111111'\n"],
    ["invented start block", "      abi: ArcadeJobHook\n", "      abi: ArcadeJobHook\n      startBlock: 1\n"],
    ["wrong escrow handler", "handler: handleJobFunded", "handler: handleSettled"],
    ["foreign hook mapping", "file: ./src/escrow-hook.ts", "file: ./src/fee-splitter.ts"]
  ] as const) test(`refuses ${label} in staged templates`, () => {
    const template = text("../subgraph.template.yaml"), changed = template.replace(from, to)
    expect(changed).not.toBe(template)
    expect(() => renderManifest(changed, JSON.parse(text("../../config/chains/arc-testnet.json")),
      JSON.parse(text("../splitters.json")))).toThrow("Invalid staged subgraph manifest")
  })
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
  test("retains both active splitter sources and adds only two inactive escrow templates", () => {
    const manifest = Bun.YAML.parse(renderManifest(text("../subgraph.template.yaml"),
      JSON.parse(text("../../config/chains/arc-testnet.json")), JSON.parse(text("../splitters.json")))) as {
        dataSources: Array<{ name: string }>; templates: Array<{ name: string } & Record<string, unknown>>
      }
    expect(manifest.dataSources.map((s: { name: string }) => s.name)).toEqual(["FeeSplitterA9", "FeeSplitterSmoke"])
    expect(manifest.templates.map((s: { name: string }) => s.name)).toEqual([
      "FeeSplitterV2", "IdentityRegistry", "ReputationRegistry", "ValidationRegistry", "ERC8183", "ArcadeJobHook"])
    expect(JSON.stringify(manifest.dataSources)).not.toMatch(/ERC8183|ArcadeJobHook/)
    for (const [index, name] of (["ERC8183", "ArcadeJobHook"] as const).entries()) {
      expect(manifest.templates[index + 4]).toEqual({
        kind: "ethereum", name, network: "arc-testnet", source: { abi: name },
        mapping: { kind: "ethereum/events", apiVersion: "0.0.9", language: "wasm/assemblyscript",
          file: name === "ERC8183" ? "./src/escrow.ts" : "./src/escrow-hook.ts",
          entities: ["EscrowJob", "EscrowEvent"], abis: [{ name, file: `./abis/${name}.json` }],
          eventHandlers: declarations(name).map(event => ({
            event: `${event.name}(${event.inputs.map(input => `${input.indexed ? "indexed " : ""}${input.type}`).join(",")})`,
            handler: `handle${event.name}` })) }
      })
    }
  })
  test("retains exact splitter provenance in active and historical mappings", () => {
    expect(text("../src/fee-splitter.ts")).toContain('settlement.rail = "eip3009"')
    expect(text("../src/smoke.ts")).toContain('s.rail = "eip3009"')
    for (const path of ["../src/fee-splitter.ts", "../src/smoke.ts"]) {
      expect(text(path)).not.toMatch(/new Escrow(?:Job|Event)|\.escrowJob\s*=/)
    }
  })
})
