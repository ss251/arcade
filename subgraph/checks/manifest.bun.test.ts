import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { buildManifest, renderManifest, type ManifestPaths } from "../build-manifest.ts"

const text = (relative: string): string => readFileSync(new URL(relative, import.meta.url), "utf8")
const chain = (): unknown => JSON.parse(text("../../config/chains/arc-testnet.json"))
const template = (): string => text("../subgraph.template.yaml")
const pilot = "0xf95c8afefae677fdcfc7bd5b8aaaf3702db99206"
const list = () => ({ splitters: [{ address: pilot, startBlock: 0 }] })
const render = () => renderManifest(template(), chain(), list())
const invalid = "Invalid staged subgraph manifest"

async function fixture(run: (paths: ManifestPaths, root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "arcade-g3-manifest-"))
  try {
    for (const directory of ["subgraph/src", "subgraph/abis", "config/chains", "elsewhere"]) await mkdir(join(root, directory), { recursive: true })
    for (const path of ["subgraph/build-manifest.ts", "subgraph/subgraph.template.yaml", "subgraph/splitters.json", "subgraph/schema.graphql", "subgraph/src/fee-splitter.ts", "subgraph/src/ids.ts", "subgraph/abis/FeeSplitter.json", "subgraph/abis/FeeSplitterV2.json", "config/chains/arc-testnet.json"]) {
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

describe("G3 manifest boundary with the approved G4 mapping transition", () => {
  test("retains indexed event history explicitly", () => {
    expect(Bun.YAML.parse(render())).toHaveProperty("indexerHints.prune", "never")
  })

  test("renders committed inputs before pinned code generation and compilation", () => {
    expect(JSON.parse(text("../package.json"))).toHaveProperty("scripts.codegen", "bun --no-env-file run manifest && graph codegen subgraph.yaml")
    expect(JSON.parse(text("../package.json"))).toHaveProperty("scripts.build", "bun --no-env-file run codegen && graph build subgraph.yaml")
    expect(JSON.parse(text("../package.json"))).toHaveProperty("scripts.manifest", "bun --no-env-file build-manifest.ts")
    expect(JSON.parse(text("../package.json"))).toHaveProperty("scripts.deploy", "bun --no-env-file run build && graph deploy arcade-ledger-arc-testnet subgraph.yaml")
    expect(JSON.parse(text("../package.json"))).toHaveProperty("scripts.test", "graph test --version 0.6.0")
  })

  test("renders committed inputs deterministically with exactly the active pilot and no context", () => {
    const source = render()
    expect(source).toBe(renderManifest(template(), chain(), JSON.parse(text("../splitters.json"))))
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
    }])
    expect(source).not.toMatch(/Registry|Marketplace|listing|context/)
  })

  test("normalizes the pilot address without mutating input", () => {
    const input = { splitters: [{ address: `0x${pilot.slice(2).toUpperCase()}`, startBlock: 0 }] }
    const before = JSON.stringify(input)
    expect(renderManifest(template(), chain(), input)).toBe(render())
    expect(JSON.stringify(input)).toBe(before)
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

  test("writes a complete owned-temp output without requiring inactive registry ABIs", async () => {
    await fixture(async (paths) => {
      await buildManifest(paths)
      expect(await readFile(paths.output, "utf8")).toBe(render())
      expect((await readdir(new URL("./abis/", paths.output))).sort()).toEqual(["FeeSplitter.json", "FeeSplitterV2.json"])
    })
  })

  for (const asset of ["schema.graphql", "src/fee-splitter.ts", "src/ids.ts", "abis/FeeSplitter.json", "abis/FeeSplitterV2.json"]) {
    test(`missing active ${asset} preserves prior output`, async () => {
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
      expect(await readFile(paths.output, "utf8")).toBe(render())
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
