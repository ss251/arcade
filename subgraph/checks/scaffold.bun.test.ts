import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"

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
          file: "./src/smoke.ts", entities: ["Settlement", "Splitter"],
          abis: [{ name: "FeeSplitter", file: "./abis/FeeSplitter.json" }],
          eventHandlers: [{ event: "Settled(indexed address,uint256,uint256,uint256,indexed bytes32)", handler: "handleSettled" }]
        }
      }]
    })
  })

  test("preserves immutable atomic-money fields and transaction/log event identity", () => {
    const historical = text("./fixtures/g1-schema.graphql")
    expect(createHash("sha256").update(historical).digest("hex")).toBe(
      "114cfff3389dccb395606f4aa6db60d02fb49c7a5886788cf5dc6f64777aee1c"
    )
    expect(historical.replace(/\s+/g, " ").trim()).toBe(
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

  test("separates the historical local build from the partial live indexing checkpoint", () => {
    const readme = text("../README.md")
    expect(readme).toContain("Historical local-only checkpoint")
    const current = readme.split("## September 5, 2026 — partial live checkpoint")[1]?.split("\n## ")[0]
    expect(current).toBeDefined()
    expect(current).toContain("2026-09-05T13:24:16.472Z")
    expect(current).toContain("QmePuPnHraVaV9TmxaAwCCMKwTD8iFW96eoEUfSA1BoCW8")
    expect(current).toContain("https://api.studio.thegraph.com/query/1721684/arcade-ledger-arc-testnet/v0.0.1-smoke")
    expect(current).toContain("2026-09-05T13:36:11.268Z")
    expect(current).toContain("2026-09-05T13:45:02.316Z")
    expect(current).toContain("latest settlements and the exact known-transaction filter were empty")
    expect(current).toContain("not a fully-synced or complete G1 live PASS")
    expect(current).toContain("Tasks 2–6 remain gated")
    expect(readme).toContain("Missing owner prerequisites are not an unsupported-network result")
  })

  test("records the indexed runbook match without claiming an atomic fully-synced head", () => {
    const readme = text("../README.md")
    const current = readme.split("## September 5, 2026 — indexed runbook match")[1]?.split("\n## ")[0]
    expect(current).toBeDefined()
    expect(current).toContain("G1 deployment and indexed-runbook query requirement: MET")
    expect(current).toContain("2026-09-05T14:41:46.576Z")
    expect(current).toContain("QmePuPnHraVaV9TmxaAwCCMKwTD8iFW96eoEUfSA1BoCW8")
    expect(current).toContain("0x9a706d5760f11ba0c5aa1fe30afc6f4fa87e908bafa4a78cdafe3af1415eefd2")
    expect(current).toContain("10,000 atomic units ($0.01)")
    expect(current).toContain("six-block observed gap")
    expect(current).toContain("not a fully-synced or dashboard-status proof")
    expect(current).toContain("parent review, full gate, commit and explicit release")
  })
})
