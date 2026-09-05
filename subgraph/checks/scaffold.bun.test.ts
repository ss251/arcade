import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const text = (relative: string): string => readFileSync(new URL(relative, import.meta.url), "utf8")
const json = (relative: string): unknown => JSON.parse(text(relative))

describe("G1 offline smoke scaffold", () => {
  test("pins a separate Graph toolchain without joining the application workspace", () => {
    expect(json("../package.json")).toMatchObject({
      name: "arcade-subgraph", private: true,
      dependencies: { "@graphprotocol/graph-cli": "0.98.1", "@graphprotocol/graph-ts": "0.38.2" },
      devDependencies: { "matchstick-as": "0.6.0" },
      scripts: { codegen: "graph codegen subgraph.yaml", build: "graph build subgraph.yaml" }
    })
    expect(json("../../package.json")).toHaveProperty("workspaces", ["packages/*", "apps/*"])
  })

  test("uses precisely the locally declared v1 Settled event, not the V2 tree event", () => {
    const source = text("../../contracts/FeeSplitter.sol")
    const declaration = /event Settled\s*\(([^)]+)\)/.exec(source)?.[1]
    expect(declaration).toBeDefined()
    const inputs = declaration!.split(",").map((field) => {
      const parts = field.trim().split(/\s+/)
      return { indexed: parts.includes("indexed"), internalType: parts[0], name: parts.at(-1), type: parts[0] }
    })
    expect(json("../abis/FeeSplitter.json")).toEqual([{ anonymous: false, inputs, name: "Settled", type: "event" }])
  })

  test("binds the sole smoke source to the runbook pilot and exact event handler", () => {
    const address = "0xf95c8afefae677fdcfc7bd5b8aaaf3702db99206"
    expect(text("../../docs/runbook.md")).toContain(address)
    expect(Bun.YAML.parse(text("../subgraph.yaml"))).toEqual({
      specVersion: "1.0.0", schema: { file: "./schema.graphql" },
      dataSources: [{ kind: "ethereum", name: "FeeSplitterSmoke", network: "arc-testnet",
        source: { address, abi: "FeeSplitter", startBlock: 0 },
        mapping: { kind: "ethereum/events", apiVersion: "0.0.9", language: "wasm/assemblyscript",
          file: "./src/smoke.ts", entities: ["Settlement"],
          abis: [{ name: "FeeSplitter", file: "./abis/FeeSplitter.json" }],
          eventHandlers: [{ event: "Settled(indexed address,uint256,uint256,uint256,indexed bytes32)", handler: "handleSettled" }]
        }
      }]
    })
  })

  test("preserves immutable atomic-money fields and transaction/log event identity", () => {
    expect(text("../schema.graphql").replace(/\s+/g, " ").trim()).toBe(
      "type Settlement @entity(immutable: true) { id: Bytes! buyer: Bytes! totalAtomic: BigInt! sellerAtomic: BigInt! feeAtomic: BigInt! nonce: Bytes! blockNumber: BigInt! timestamp: BigInt! txHash: Bytes! }"
    )
    const mapping = text("../src/smoke.ts")
    expect(mapping).toContain("event.transaction.hash.concatI32(event.logIndex.toI32())")
    for (const [field, value] of Object.entries({
      buyer: "event.params.buyer", totalAtomic: "event.params.total", sellerAtomic: "event.params.sellerAmount",
      feeAtomic: "event.params.feeAmount", nonce: "event.params.nonce", blockNumber: "event.block.number",
      timestamp: "event.block.timestamp", txHash: "event.transaction.hash"
    })) expect(mapping).toContain(`s.${field} = ${value}`)
    expect(mapping).toContain("s.save()")
  })

  test("keeps generated sources out of git and the whole toolchain out of Docker", () => {
    const patterns = (path: string) => text(path).split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith("#"))
    const git = patterns("../../.gitignore")
    const docker = patterns("../../.dockerignore")
    for (const pattern of ["subgraph/generated/", "build/", "node_modules/"]) {
      expect(git).toContain(pattern)
      expect(docker).toContain(pattern)
    }
    expect(docker).toContain("subgraph/")
    expect(git).not.toContain("subgraph/")
  })

  test("does not label an offline build as Studio deployment or indexed-chain evidence", () => {
    const readme = text("../README.md")
    expect(readme).toContain("Studio deployment: PENDING")
    expect(readme).toContain("Query URL: PENDING")
    expect(readme).toContain("Authorization requirement: UNVERIFIED")
    expect(readme).toContain("Registry support: UNVERIFIED")
    expect(readme).toContain("Tasks 2–6 remain gated")
    expect(readme).toContain("Missing owner prerequisites are not an unsupported-network result")
  })
})
