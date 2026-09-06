import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { approvedSplitterPin, buildManifest, renderManifest, type ManifestPaths } from "../build-manifest.ts"

const text = (relative: string): string => readFileSync(new URL(relative, import.meta.url), "utf8")
const chain = (): unknown => JSON.parse(text("../../config/chains/arc-testnet.json"))
const template = (): string => text("../subgraph.template.yaml")
const pilot = "0xf95c8afefae677fdcfc7bd5b8aaaf3702db99206"
const a9 = "0x9e304ec13dd862c81ee8caa8fd262dac426fbedf"
const list = () => ({ splitters: [{ address: pilot, startBlock: 0 }] })
const reviewedList = () => ({ splitters: [{ address: a9, startBlock: 60_460_646 }, { address: pilot, startBlock: 0 }] })
const render = () => renderManifest(template(), chain(), list())
const renderReviewed = () => renderManifest(template(), chain(), reviewedList())
const invalid = "Invalid staged subgraph manifest"
const requiredAssets = [
  "schema.graphql", "src/fee-splitter.ts", "src/ids.ts", "abis/FeeSplitter.json", "abis/FeeSplitterV2.json",
  "src/identity.ts", "src/reputation.ts", "src/validation.ts", "src/registry.ts",
  "abis/IdentityRegistry.json", "abis/ReputationRegistry.json", "abis/ValidationRegistry.json"
]

const registryTemplates = [
  {
    "kind": "ethereum",
    "name": "IdentityRegistry",
    "network": "arc-testnet",
    "source": {
      "abi": "IdentityRegistry"
    },
    "mapping": {
      "kind": "ethereum/events",
      "apiVersion": "0.0.9",
      "language": "wasm/assemblyscript",
      "file": "./src/identity.ts",
      "entities": [
        "Agent",
        "ListingClaim",
        "RegistryEvent"
      ],
      "abis": [
        {
          "name": "IdentityRegistry",
          "file": "./abis/IdentityRegistry.json"
        }
      ],
      "eventHandlers": [
        {
          "event": "Registered(indexed uint256,string,indexed address)",
          "handler": "handleRegistered"
        },
        {
          "event": "URIUpdated(indexed uint256,string,indexed address)",
          "handler": "handleURIUpdated"
        },
        {
          "event": "MetadataSet(indexed uint256,indexed string,string,bytes)",
          "handler": "handleMetadataSet"
        },
        {
          "event": "Transfer(indexed address,indexed address,indexed uint256)",
          "handler": "handleTransfer"
        }
      ]
    }
  },
  {
    "kind": "ethereum",
    "name": "ReputationRegistry",
    "network": "arc-testnet",
    "source": {
      "abi": "ReputationRegistry"
    },
    "mapping": {
      "kind": "ethereum/events",
      "apiVersion": "0.0.9",
      "language": "wasm/assemblyscript",
      "file": "./src/reputation.ts",
      "entities": [
        "Agent",
        "Feedback",
        "RegistryEvent"
      ],
      "abis": [
        {
          "name": "ReputationRegistry",
          "file": "./abis/ReputationRegistry.json"
        }
      ],
      "eventHandlers": [
        {
          "event": "NewFeedback(indexed uint256,indexed address,uint64,int128,uint8,indexed string,string,string,string,string,bytes32)",
          "handler": "handleNewFeedback"
        },
        {
          "event": "FeedbackRevoked(indexed uint256,indexed address,indexed uint64)",
          "handler": "handleFeedbackRevoked"
        }
      ]
    }
  },
  {
    "kind": "ethereum",
    "name": "ValidationRegistry",
    "network": "arc-testnet",
    "source": {
      "abi": "ValidationRegistry"
    },
    "mapping": {
      "kind": "ethereum/events",
      "apiVersion": "0.0.9",
      "language": "wasm/assemblyscript",
      "file": "./src/validation.ts",
      "entities": [
        "Agent",
        "Validation",
        "RegistryEvent"
      ],
      "abis": [
        {
          "name": "ValidationRegistry",
          "file": "./abis/ValidationRegistry.json"
        }
      ],
      "eventHandlers": [
        {
          "event": "ValidationRequest(indexed address,indexed uint256,string,indexed bytes32)",
          "handler": "handleValidationRequest"
        },
        {
          "event": "ValidationResponse(indexed address,indexed uint256,indexed bytes32,uint8,string,bytes32,string)",
          "handler": "handleValidationResponse"
        }
      ]
    }
  }
]

async function fixture(run: (paths: ManifestPaths, root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "arcade-g3-manifest-"))
  try {
    for (const directory of ["subgraph/src", "subgraph/abis", "config/chains", "elsewhere"]) await mkdir(join(root, directory), { recursive: true })
    for (const path of ["subgraph/build-manifest.ts", "subgraph/subgraph.template.yaml", "subgraph/splitters.json", ...requiredAssets.map((asset) => `subgraph/${asset}`), "config/chains/arc-testnet.json"]) {
      await copyFile(new URL(`../../${path}`, import.meta.url), join(root, path))
    }
    await run({
      template: pathToFileURL(join(root, "subgraph/subgraph.template.yaml")),
      chainConfig: pathToFileURL(join(root, "config/chains/arc-testnet.json")),
      splitters: pathToFileURL(join(root, "subgraph/splitters.json")),
      output: pathToFileURL(join(root, "subgraph/subgraph.yaml"))
    }, root)
  } finally { await rm(root, { recursive: true, force: true }) }
}

async function child(root: string, args: string[]) {
  const childProcess = Bun.spawn([process.execPath, "--no-env-file", ...args], { cwd: join(root, "elsewhere"), env: {}, stdout: "pipe", stderr: "pipe" })
  const timer = setTimeout(() => childProcess.kill(), 5000)
  try {
    const [exit, stdout, stderr] = await Promise.all([childProcess.exited, new Response(childProcess.stdout).text(), new Response(childProcess.stderr).text()])
    return { exit, stdout, stderr }
  } finally { clearTimeout(timer); if (childProcess.exitCode === null) { childProcess.kill(); await childProcess.exited } }
}

describe("G6 reviewed static emitters with inactive G5 registries", () => {
  test("commits exactly the reviewed address-sorted two-source inventory", () => {
    expect(JSON.parse(text("../splitters.json"))).toEqual(reviewedList())
  })

  test("renders the reviewed V2 static source while retaining the exact pilot and four inactive templates", () => {
    const rendered = renderManifest(template(), chain(), reviewedList())
    const actual = Bun.YAML.parse(rendered) as { dataSources: unknown[]; templates: unknown[] }
    const historical = Bun.YAML.parse(render()) as { dataSources: unknown[]; templates: unknown[] }
    expect(actual.dataSources).toEqual([{
      kind: "ethereum", name: "FeeSplitterA9", network: "arc-testnet",
      source: { address: a9, abi: "FeeSplitterV2", startBlock: 60_460_646 },
      mapping: { kind: "ethereum/events", apiVersion: "0.0.9", language: "wasm/assemblyscript", file: "./src/fee-splitter.ts",
        entities: ["Settlement", "Splitter", "Tree", "TreeOccurrence"],
        abis: [{ name: "FeeSplitterV2", file: "./abis/FeeSplitterV2.json" }],
        eventHandlers: [
          { event: "Settled(indexed address,uint256,uint256,uint256,indexed bytes32)", handler: "handleSettled" },
          { event: "SettledTree(indexed address,uint256,uint256,uint256,indexed bytes32,indexed bytes32,uint32,uint256)", handler: "handleSettledTree" }
        ] }
    }, ...historical.dataSources])
    expect(actual.templates).toEqual(historical.templates)
    expect(JSON.stringify(actual.dataSources)).not.toMatch(/Registry|Marketplace|listing|seller|context/)
    expect(rendered).toBe(renderManifest(template(), chain(), JSON.parse(text("../splitters.json"))))
  })

  test("canonicalizes order and case without mutating the reviewed two-source input", () => {
    const input = { splitters: [...reviewedList().splitters].reverse().map((entry) => ({ ...entry, address: `0x${entry.address.slice(2).toUpperCase()}` })) }
    const before = JSON.stringify(input)
    expect(renderManifest(template(), chain(), input)).toBe(renderManifest(template(), chain(), reviewedList()))
    expect(JSON.stringify(input)).toBe(before)
  })
  test("retains indexed event history explicitly", () => {
    expect(Bun.YAML.parse(render())).toHaveProperty("indexerHints.prune", "never")
  })

  test("returns only immutable reviewed address/seller/height pins", () => {
    const expected = [
      { address: a9, seller: "0xcf821769ed3c0e55e152745377bb833d7155a78a", startBlock: 60_460_646 },
      { address: pilot, seller: "0x3b2bbb840a9570223adbf2172a33bb77fe8d21af", startBlock: 0 }
    ]
    for (const entry of expected) {
      const pin = approvedSplitterPin(`0x${entry.address.slice(2).toUpperCase()}`)
      expect(pin).toEqual(entry)
      expect(Object.keys(pin!)).toEqual(["address", "seller", "startBlock"])
      expect(Object.isFrozen(pin)).toBe(true)
      expect(Reflect.set(pin!, "seller", a9)).toBe(false)
      expect(Reflect.set(pin!, "startBlock", 1)).toBe(false)
      expect(Reflect.set(pin!, "verified", true)).toBe(false)
      expect(approvedSplitterPin(entry.address)).toEqual(entry)
    }
  })

  test("refuses unknown/malformed pin inputs without coercion or property access", () => {
    let calls = 0
    const trap = new Proxy({}, { get() { calls++; throw Error("SENTINEL") }, ownKeys() { calls++; throw Error("SENTINEL") } })
    const coercible = { toString() { calls++; return pilot } }
    for (const value of [null, undefined, false, 1, 1n, Symbol("pin"), {}, [], trap, coercible,
      new String(pilot), "", pilot + "\n", pilot + " ", pilot.slice(2), pilot.toUpperCase(),
      "0x" + "0".repeat(40), "0x" + "a".repeat(40), a9.replace("9", "g"), "x".repeat(4097)]) {
      expect(approvedSplitterPin(value as string)).toBeNull()
    }
    expect(calls).toBe(0)
  })

  for (const height of [0, -0, -1, 0.5, 60_460_645, 60_460_647, 2_147_483_647, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, "60460646", 60_460_646n, null]) {
    test(`refuses changed A9 height ${String(height)} (${typeof height})`, () => {
      expect(() => renderManifest(template(), chain(), { splitters: [
        { address: a9, startBlock: height }, ...list().splitters
      ] })).toThrow(new Error(invalid))
    })
  }

  for (const [label, value] of [
    ["A9 without required pilot", { splitters: [reviewedList().splitters[0]] }],
    ["case-folded duplicate V2", { splitters: [...reviewedList().splitters, { address: `0x${a9.slice(2).toUpperCase()}`, startBlock: 60_460_646 }] }],
    ["unknown emitter with plausible height", { splitters: [...list().splitters, { address: "0x" + "a".repeat(40), startBlock: 60_460_646 }] }],
    ["caller seller assignment", { splitters: [{ ...reviewedList().splitters[0], seller: a9 }, ...list().splitters] }],
    ["caller approval flag", { splitters: [{ ...reviewedList().splitters[0], verified: true }, ...list().splitters] }],
    ["caller ABI override", { splitters: [{ ...reviewedList().splitters[0], abi: "FeeSplitter" }, ...list().splitters] }]
  ] as const) {
    test(`refuses ${label} before rendering any selected source`, () => {
      expect(() => renderManifest(template(), chain(), value)).toThrow(new Error(invalid))
    })
  }

  test("renders committed inputs before pinned code generation and compilation", () => {
    expect(JSON.parse(text("../package.json"))).toHaveProperty("scripts.codegen", "bun --no-env-file run manifest && graph codegen subgraph.yaml")
    expect(JSON.parse(text("../package.json"))).toHaveProperty("scripts.build", "bun --no-env-file run codegen && graph build subgraph.yaml")
    expect(JSON.parse(text("../package.json"))).toHaveProperty("scripts.manifest", "bun --no-env-file build-manifest.ts")
    expect(JSON.parse(text("../package.json"))).toHaveProperty("scripts.deploy", "bun --no-env-file run build && graph deploy arcade-ledger-arc-testnet subgraph.yaml")
    expect(JSON.parse(text("../package.json"))).toHaveProperty("scripts.test", "graph test --version 0.6.0")
  })

  test("retains the valid pilot-only compatibility selection with no context", () => {
    const source = render()
    expect(source).toBe(renderManifest(template(), chain(), list()))
    expect(source).toBe(render())
    expect(source.endsWith("\n")).toBe(true)
    expect(source).not.toContain("{{")
    const parsed = Bun.YAML.parse(source)
    expect(parsed).toHaveProperty("dataSources", [{
      kind: "ethereum", name: "FeeSplitterSmoke", network: "arc-testnet",
      source: { address: pilot, abi: "FeeSplitter", startBlock: 0 },
      mapping: { kind: "ethereum/events", apiVersion: "0.0.9", language: "wasm/assemblyscript", file: "./src/fee-splitter.ts",
        entities: ["Settlement", "Splitter"], abis: [{ name: "FeeSplitter", file: "./abis/FeeSplitter.json" }],
        eventHandlers: [{ event: "Settled(indexed address,uint256,uint256,uint256,indexed bytes32)", handler: "handleSettled" }] }
    }])
    expect(parsed).toHaveProperty("templates", [{
      kind: "ethereum", name: "FeeSplitterV2", network: "arc-testnet", source: { abi: "FeeSplitterV2" },
      mapping: { kind: "ethereum/events", apiVersion: "0.0.9", language: "wasm/assemblyscript", file: "./src/fee-splitter.ts",
        entities: ["Settlement", "Splitter", "Tree", "TreeOccurrence"],
        abis: [{ name: "FeeSplitterV2", file: "./abis/FeeSplitterV2.json" }],
        eventHandlers: [
          { event: "Settled(indexed address,uint256,uint256,uint256,indexed bytes32)", handler: "handleSettled" },
          { event: "SettledTree(indexed address,uint256,uint256,uint256,indexed bytes32,indexed bytes32,uint32,uint256)", handler: "handleSettledTree" }
        ] }
    }, ...registryTemplates])
    expect(JSON.stringify((parsed as { dataSources: unknown }).dataSources)).not.toMatch(/Registry|Marketplace|listing|context/)
    expect(source).not.toMatch(/Marketplace|\blisting\b|context/)
  })

  test("normalizes the pilot address without mutating input", () => {
    const input = { splitters: [{ address: `0x${pilot.slice(2).toUpperCase()}`, startBlock: 0 }] }
    const before = JSON.stringify(input)
    expect(renderManifest(template(), chain(), input)).toBe(render())
    expect(JSON.stringify(input)).toBe(before)
  })

  test("registry handler signatures preserve the staged ABI order, widths and indexed parameters", () => {
    const parsed = Bun.YAML.parse(render()) as { templates: typeof registryTemplates }
    for (const entry of parsed.templates.slice(1)) {
      const abi = JSON.parse(text(`../abis/${entry.name}.json`)) as Array<{
        type: string; name: string; inputs: Array<{ type: string; indexed: boolean }>
      }>
      expect(entry.source).toEqual({ abi: entry.name })
      expect(entry.mapping.eventHandlers.map(({ event }) => event)).toEqual(abi
        .filter((item) => item.type === "event")
        .map((item) => `${item.name}(${item.inputs.map((input) => `${input.indexed ? "indexed " : ""}${input.type}`).join(",")})`))
    }
  })

  for (const [label, value] of [
    ["null", null], ["array root", []], ["empty list", { splitters: [] }], ["missing list", {}],
    ["extra root key", { ...list(), note: "not authority" }],
    ["listing claim", { splitters: [{ ...list().splitters[0], listingId: "someone-else" }] }],
    ["activation profile", { splitters: [{ ...list().splitters[0], profile: "v2" }] }],
    ["zero address", { splitters: [{ address: `0x${"0".repeat(40)}`, startBlock: 0 }] }],
    ["other emitter", { splitters: [{ address: `0x${"a".repeat(40)}`, startBlock: 0 }] }],
    ["address newline", { splitters: [{ address: `${pilot}\n`, startBlock: 0 }] }],
    ["YAML injection", { splitters: [{ address: `${pilot}\ntemplates: []`, startBlock: 0 }] }],
    ["duplicate", { splitters: [list().splitters[0], list().splitters[0]] }],
    ["case-folded conflicting duplicate", { splitters: [list().splitters[0], { address: `0x${pilot.slice(2).toUpperCase()}`, startBlock: 42 }] }]
  ] as const) {
    test(`refuses ${label} without reflecting input`, () => {
      expect(() => renderManifest(template(), chain(), value)).toThrow(new Error(invalid))
    })
  }

  for (const value of [-1, -0, 0.5, 1, 2_147_483_647, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, "0", 0n]) {
    test(`refuses unsupported pilot block ${String(value)} (${typeof value})`, () => {
      expect(() => renderManifest(template(), chain(), { splitters: [{ address: pilot, startBlock: value }] })).toThrow(new Error(invalid))
    })
  }

  for (const [label, mutate] of [
    ["network", (input: Record<string, unknown>) => { input.id = "arc-mainnet" }],
    ["chain ID", (input: Record<string, unknown>) => { input.chainId = 1 }],
    ["CAIP-2", (input: Record<string, unknown>) => { input.caip2 = "eip155:1" }],
    ["status", (input: Record<string, unknown>) => { input.status = "pending" }],
    ["registry pin", (input: Record<string, unknown>) => { input.erc8004 = { ...(input.erc8004 as object), identity: `0x${"a".repeat(40)}` } }],
    ["extra field", (input: Record<string, unknown>) => { input.authority = true }]
  ] as const) {
    test(`refuses changed chain ${label}`, () => {
      const input = chain() as Record<string, unknown>
      mutate(input)
      expect(() => renderManifest(template(), input, list())).toThrow(new Error(invalid))
    })
  }

  for (const [label, change] of [
    ["missing marker", (source: string) => source.replace("{{SPLITTER_SOURCES}}", "")],
    ["duplicate marker", (source: string) => `${source}{{SPLITTER_SOURCES}}\n`],
    ["unknown marker", (source: string) => `${source}{{REGISTRY_SOURCES}}\n`],
    ["extra root", (source: string) => `${source}templates: []\n`],
    ["wrong schema path", (source: string) => source.replace("./schema.graphql", "../other.graphql")],
    ["pruning", (source: string) => source.replace("prune: never", "prune: auto")],
    ["missing registry template", (source: string) => source.slice(0, source.indexOf("  - kind: ethereum\n    name: ValidationRegistry"))],
    ["registry static address", (source: string) => source.replace("      abi: IdentityRegistry", `      abi: IdentityRegistry\n      address: ${pilot}`)],
    ["registry start block", (source: string) => source.replace("      abi: IdentityRegistry", "      abi: IdentityRegistry\n      startBlock: 1")],
    ["registry context", (source: string) => source.replace("    name: IdentityRegistry", "    name: IdentityRegistry\n    context:\n      listingId:\n        type: String\n        data: not-authority")],
    ["wrong registry ABI", (source: string) => source.replace("./abis/IdentityRegistry.json", "./abis/ReputationRegistry.json")],
    ["wrong registry mapping", (source: string) => source.replace("./src/identity.ts", "./src/smoke.ts")],
    ["wrong registry handler", (source: string) => source.replace("handler: handleRegistered", "handler: handleTransfer")],
    ["extra registry entity", (source: string) => source.replace("        - ListingClaim", "        - ListingClaim\n        - Marketplace")],
    ["missing replay entity", (source: string) => source.replace("        - RegistryEvent\n", "")],
    ["unindexed metadata key", (source: string) => source.replace("MetadataSet(indexed uint256,indexed string", "MetadataSet(indexed uint256,string")],
    ["unsigned feedback", (source: string) => source.replace("uint64,int128,uint8", "uint64,uint128,uint8")],
    ["malformed YAML", (source: string) => `${source}[\n`],
    ["control byte", (source: string) => `${source}\u0000`]
  ] as const) {
    test(`refuses template ${label}`, () => {
      expect(() => renderManifest(change(template()), chain(), list())).toThrow(new Error(invalid))
    })
  }

  test("rejects accessors and toJSON without invoking them", () => {
    let calls = 0
    const values = [Object.defineProperty({}, "splitters", { get() { calls++; throw new Error("SENTINEL") } }),
      { ...list(), toJSON() { calls++; return list() } },
      { splitters: [Object.defineProperty({ address: pilot }, "startBlock", { get() { calls++; return 0 } })] }]
    for (const value of values) expect(() => renderManifest(template(), chain(), value)).toThrow(new Error(invalid))
    expect(calls).toBe(0)
  })

  test("normalizes proxy traps, inherited keys, holes and array extras", () => {
    const values = [new Proxy({}, { ownKeys() { throw new Error("SENTINEL") } }),
      Object.create(list()), { splitters: new Array(1) }, { splitters: Object.assign([list().splitters[0]], { note: "SENTINEL" }) }]
    for (const value of values) expect(() => renderManifest(template(), chain(), value)).toThrow(new Error(invalid))
  })

  test("writes a complete owned-temp output with all inactive registry inputs present", async () => {
    await fixture(async (paths) => {
      await buildManifest(paths)
      expect(await readFile(paths.output, "utf8")).toBe(renderReviewed())
      expect((await readdir(new URL("./abis/", paths.output))).sort()).toEqual([
        "FeeSplitter.json", "FeeSplitterV2.json", "IdentityRegistry.json", "ReputationRegistry.json", "ValidationRegistry.json"
      ])
    })
  })

  test("invalid reviewed-source edits preserve the prior manifest without temporary output", async () => {
    for (const changed of [
      { splitters: [{ address: a9, startBlock: 0 }, ...list().splitters] },
      { splitters: [reviewedList().splitters[0]] },
      { splitters: [...list().splitters, { address: "0x" + "a".repeat(40), startBlock: 60_460_646 }] },
      { splitters: [{ ...reviewedList().splitters[0], verified: true }, ...list().splitters] }
    ]) {
      await fixture(async (paths) => {
        await writeFile(paths.output, "preserve reviewed prior output\n")
        await writeFile(paths.splitters, JSON.stringify(changed))
        await expect(buildManifest(paths)).rejects.toThrow(new Error(invalid))
        expect(await readFile(paths.output, "utf8")).toBe("preserve reviewed prior output\n")
        expect((await readdir(new URL("./", paths.output))).some((name) => name.endsWith(".tmp"))).toBe(false)
      })
    }
  })

  for (const asset of requiredAssets) {
    test(`missing required ${asset} preserves prior output`, async () => {
      await fixture(async (paths) => {
        await writeFile(paths.output, "prior output\n")
        await rm(new URL(asset, paths.output))
        await expect(buildManifest(paths)).rejects.toThrow(new Error(invalid))
        expect(await readFile(paths.output, "utf8")).toBe("prior output\n")
        expect((await readdir(new URL("./", paths.output))).some((name) => name.endsWith(".tmp"))).toBe(false)
      })
    })
  }

  test("invalid JSON preserves prior output and emits only fixed CLI diagnostics", async () => {
    await fixture(async (paths, root) => {
      await writeFile(paths.output, "prior output\n")
      await writeFile(paths.splitters, "SENTINEL malformed JSON")
      const result = await child(root, [join(root, "subgraph/build-manifest.ts")])
      expect(result).toEqual({ exit: 1, stdout: "", stderr: `${invalid}\n` })
      expect(await readFile(paths.output, "utf8")).toBe("prior output\n")
    })
  })

  test("malformed chain JSON remains inside the fixed CLI diagnostic boundary", async () => {
    await fixture(async (paths, root) => {
      await writeFile(paths.output, "prior output\n")
      await writeFile(paths.chainConfig, "SENTINEL malformed chain JSON")
      expect(await child(root, [join(root, "subgraph/build-manifest.ts")])).toEqual({ exit: 1, stdout: "", stderr: `${invalid}\n` })
      expect(await readFile(paths.output, "utf8")).toBe("prior output\n")
    })
  })

  test("guarded CLI resolves from its module, not cwd; importing does not write", async () => {
    await fixture(async (paths, root) => {
      const module = pathToFileURL(join(root, "subgraph/build-manifest.ts")).href
      expect(await child(root, ["--eval", `await import(${JSON.stringify(module)})`])).toEqual({ exit: 0, stdout: "", stderr: "" })
      expect((await readdir(new URL("./", paths.output))).includes("subgraph.yaml")).toBe(false)
      expect(await child(root, [join(root, "subgraph/build-manifest.ts")])).toEqual({ exit: 0, stdout: "", stderr: "" })
      expect(await readFile(paths.output, "utf8")).toBe(renderReviewed())
      await writeFile(paths.output, "preserve on import\n")
      expect(await child(root, ["--eval", `await import(${JSON.stringify(module)})`])).toEqual({ exit: 0, stdout: "", stderr: "" })
      expect(await readFile(paths.output, "utf8")).toBe("preserve on import\n")
    })
  })

  test("CLI rejects argument-based configuration and leaves prior output untouched", async () => {
    await fixture(async (paths, root) => {
      await writeFile(paths.output, "prior output\n")
      expect(await child(root, [join(root, "subgraph/build-manifest.ts"), "--network", "SENTINEL"])).toEqual({ exit: 1, stdout: "", stderr: `${invalid}\n` })
      expect(await readFile(paths.output, "utf8")).toBe("prior output\n")
    })
  })
})
