import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"

const ERROR = "Invalid staged subgraph manifest"
const PILOT = "0xf95c8afefae677fdcfc7bd5b8aaaf3702db99206"
const MARKER = "{{SPLITTER_SOURCES}}"
const MAX_BLOCK = 2_147_483_647
const fail = (): never => { throw new Error(ERROR) }

type SplitterPin = Readonly<{ address: string; seller: string; startBlock: number }>
// Reviewed fixed-block code/immutable evidence. Zero is the retained pilot
// exception, not a creation-height fallback or current hub announcement.
const SPLITTER_PINS: readonly SplitterPin[] = Object.freeze([
  Object.freeze({ address: "0x9e304ec13dd862c81ee8caa8fd262dac426fbedf", seller: "0xcf821769ed3c0e55e152745377bb833d7155a78a", startBlock: 60_460_646 }),
  Object.freeze({ address: PILOT, seller: "0x3b2bbb840a9570223adbf2172a33bb77fe8d21af", startBlock: 0 })
])

/** Inert immutable policy lookup; no discovery, contract read or caller trust flag. */
export function approvedSplitterPin(address: string): SplitterPin | null {
  if (typeof address !== "string" || address.length !== 42 || !/^0x[0-9a-fA-F]{40}$/.test(address)) return null
  const canonicalAddress = address.toLowerCase()
  return SPLITTER_PINS.find((pin) => pin.address === canonicalAddress) ?? null
}

/** Capture only bounded own data, without invoking caller-provided accessors/toJSON. */
function data(value: unknown, depth = 0): unknown {
  if (depth > 8) return fail()
  if (value === null || typeof value === "boolean") return value
  if (typeof value === "string") {
    if (value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)) return fail()
    return value
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) return fail()
    return value
  }
  if (typeof value !== "object") return fail()
  const array = Array.isArray(value)
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== (array ? Array.prototype : Object.prototype) && prototype !== null) return fail()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const keys = Reflect.ownKeys(descriptors)
  if (keys.length > 65 || keys.some((key) => typeof key !== "string")) return fail()
  for (const descriptor of Object.values(descriptors)) {
    if (!("value" in descriptor)) return fail()
  }
  if (array) {
    const length: unknown = descriptors.length?.value
    if (typeof length !== "number" || !Number.isInteger(length) || length < 0 || length > 64 || keys.length !== length + 1) return fail()
    return Array.from({ length }, (_, index) => {
      const descriptor = descriptors[String(index)]
      if (!descriptor) return fail()
      return data(descriptor.value, depth + 1)
    })
  }
  const captured: Record<string, unknown> = Object.create(null)
  for (const key of (keys as string[]).sort()) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) return fail()
    captured[key] = data(descriptors[key]!.value, depth + 1)
  }
  return captured
}

const canonical = (value: unknown): string => JSON.stringify(data(value))
// Exact public selection from config/chains/arc-testnet.json, not deployed-code/ABI
// evidence. Keep the pin inert: importing JSON would escape the CLI error boundary.
const CHAIN = canonical({
  id: "arc-testnet", status: "ready", chainId: 5042002, caip2: "eip155:5042002",
  rpcHttp: ["https://rpc.testnet.arc.io", "https://rpc.testnet.arc.network"],
  explorerBaseUrl: "https://testnet.arcscan.app",
  usdc: { address: "0x3600000000000000000000000000000000000000", decimals: 6, nativeDecimals: 18, eip712Name: "USDC", eip712Version: "2" },
  erc8004: {
    identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
    validation: "0x8004Cb1BF31DAf7788923b405b754f57acEB4272"
  },
  gateway: { wallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9", domain: 26, facilitatorUrl: "https://gateway-api-testnet.circle.com", minValiditySeconds: 604900 }
})

const ESCROW_TEMPLATES = [
  {
    "kind": "ethereum",
    "name": "ERC8183",
    "network": "arc-testnet",
    "source": {
      "abi": "ERC8183"
    },
    "mapping": {
      "kind": "ethereum/events",
      "apiVersion": "0.0.9",
      "language": "wasm/assemblyscript",
      "file": "./src/escrow.ts",
      "entities": [
        "EscrowJob",
        "EscrowEvent"
      ],
      "abis": [
        {
          "name": "ERC8183",
          "file": "./abis/ERC8183.json"
        }
      ],
      "eventHandlers": [
        {
          "event": "JobCreated(indexed uint256,indexed address,indexed address,address,uint48,address)",
          "handler": "handleJobCreated"
        },
        {
          "event": "ProviderSet(indexed uint256,indexed address,uint256)",
          "handler": "handleProviderSet"
        },
        {
          "event": "PayoutReceiverSet(indexed uint256,indexed address)",
          "handler": "handlePayoutReceiverSet"
        },
        {
          "event": "BudgetSet(indexed uint256,indexed address,uint256)",
          "handler": "handleBudgetSet"
        },
        {
          "event": "JobFunded(indexed uint256,indexed address,uint256)",
          "handler": "handleJobFunded"
        },
        {
          "event": "JobSubmitted(indexed uint256,indexed address,bytes32)",
          "handler": "handleJobSubmitted"
        },
        {
          "event": "JobCompleted(indexed uint256,indexed address,bytes32)",
          "handler": "handleJobCompleted"
        },
        {
          "event": "JobRejected(indexed uint256,indexed address,bytes32)",
          "handler": "handleJobRejected"
        },
        {
          "event": "JobExpired(indexed uint256)",
          "handler": "handleJobExpired"
        },
        {
          "event": "PaymentReleased(indexed uint256,indexed address,uint256)",
          "handler": "handlePaymentReleased"
        },
        {
          "event": "PlatformFeePaid(indexed uint256,indexed address,uint256)",
          "handler": "handlePlatformFeePaid"
        },
        {
          "event": "EvaluatorFeePaid(indexed uint256,indexed address,uint256)",
          "handler": "handleEvaluatorFeePaid"
        },
        {
          "event": "Refunded(indexed uint256,indexed address,uint256)",
          "handler": "handleRefunded"
        },
        {
          "event": "Settled(indexed uint256,uint256,uint256)",
          "handler": "handleSettled"
        }
      ]
    }
  },
  {
    "kind": "ethereum",
    "name": "ArcadeJobHook",
    "network": "arc-testnet",
    "source": {
      "abi": "ArcadeJobHook"
    },
    "mapping": {
      "kind": "ethereum/events",
      "apiVersion": "0.0.9",
      "language": "wasm/assemblyscript",
      "file": "./src/escrow-hook.ts",
      "entities": [
        "EscrowJob",
        "EscrowEvent"
      ],
      "abis": [
        {
          "name": "ArcadeJobHook",
          "file": "./abis/ArcadeJobHook.json"
        }
      ],
      "eventHandlers": [
        {
          "event": "ArcadeSettled(indexed uint256,bytes32,uint32,uint256,bytes32)",
          "handler": "handleArcadeSettled"
        },
        {
          "event": "ArcadeRefused(indexed uint256,bytes32)",
          "handler": "handleArcadeRefused"
        }
      ]
    }
  }
]

function activeManifest(pins: readonly SplitterPin[]) {
  const manifest = {
    specVersion: "1.0.0", indexerHints: { prune: "never" }, schema: { file: "./schema.graphql" },
    dataSources: [{ kind: "ethereum", name: "FeeSplitterSmoke", network: "arc-testnet",
      source: { address: PILOT, abi: "FeeSplitter", startBlock: 0 },
      mapping: { kind: "ethereum/events", apiVersion: "0.0.9", language: "wasm/assemblyscript",
        file: "./src/fee-splitter.ts", entities: ["Settlement", "Splitter"],
        abis: [{ name: "FeeSplitter", file: "./abis/FeeSplitter.json" }],
        eventHandlers: [{ event: "Settled(indexed address,uint256,uint256,uint256,indexed bytes32)", handler: "handleSettled" }]
      }
    }],
    templates: [{ kind: "ethereum", name: "FeeSplitterV2", network: "arc-testnet",
      source: { abi: "FeeSplitterV2" },
      mapping: { kind: "ethereum/events", apiVersion: "0.0.9", language: "wasm/assemblyscript",
        file: "./src/fee-splitter.ts", entities: ["Settlement", "Splitter", "Tree", "TreeOccurrence"],
        abis: [{ name: "FeeSplitterV2", file: "./abis/FeeSplitterV2.json" }],
        eventHandlers: [
          { event: "Settled(indexed address,uint256,uint256,uint256,indexed bytes32)", handler: "handleSettled" },
          { event: "SettledTree(indexed address,uint256,uint256,uint256,indexed bytes32,indexed bytes32,uint32,uint256)", handler: "handleSettledTree" }
        ]
      }
    }, { kind: "ethereum", name: "IdentityRegistry", network: "arc-testnet",
      source: { abi: "IdentityRegistry" },
      mapping: { kind: "ethereum/events", apiVersion: "0.0.9", language: "wasm/assemblyscript",
        file: "./src/identity.ts", entities: ["Agent","ListingClaim","RegistryEvent"],
        abis: [{ name: "IdentityRegistry", file: "./abis/IdentityRegistry.json" }],
        eventHandlers: [
          { event: "Registered(indexed uint256,string,indexed address)", handler: "handleRegistered" },
          { event: "URIUpdated(indexed uint256,string,indexed address)", handler: "handleURIUpdated" },
          { event: "MetadataSet(indexed uint256,indexed string,string,bytes)", handler: "handleMetadataSet" },
          { event: "Transfer(indexed address,indexed address,indexed uint256)", handler: "handleTransfer" }
        ]
      }
    }, { kind: "ethereum", name: "ReputationRegistry", network: "arc-testnet",
      source: { abi: "ReputationRegistry" },
      mapping: { kind: "ethereum/events", apiVersion: "0.0.9", language: "wasm/assemblyscript",
        file: "./src/reputation.ts", entities: ["Agent","Feedback","RegistryEvent"],
        abis: [{ name: "ReputationRegistry", file: "./abis/ReputationRegistry.json" }],
        eventHandlers: [
          { event: "NewFeedback(indexed uint256,indexed address,uint64,int128,uint8,indexed string,string,string,string,string,bytes32)", handler: "handleNewFeedback" },
          { event: "FeedbackRevoked(indexed uint256,indexed address,indexed uint64)", handler: "handleFeedbackRevoked" }
        ]
      }
    }, { kind: "ethereum", name: "ValidationRegistry", network: "arc-testnet",
      source: { abi: "ValidationRegistry" },
      mapping: { kind: "ethereum/events", apiVersion: "0.0.9", language: "wasm/assemblyscript",
        file: "./src/validation.ts", entities: ["Agent","Validation","RegistryEvent"],
        abis: [{ name: "ValidationRegistry", file: "./abis/ValidationRegistry.json" }],
        eventHandlers: [
          { event: "ValidationRequest(indexed address,indexed uint256,string,indexed bytes32)", handler: "handleValidationRequest" },
          { event: "ValidationResponse(indexed address,indexed uint256,indexed bytes32,uint8,string,bytes32,string)", handler: "handleValidationResponse" }
        ]
      }
    }]
  }
  const pilot = manifest.dataSources[0]!
  manifest.templates.push(...ESCROW_TEMPLATES)
  manifest.dataSources = pins.map((pin) => pin.address === PILOT ? pilot : {
    kind: "ethereum", name: "FeeSplitterA9", network: "arc-testnet",
    source: { address: pin.address, abi: "FeeSplitterV2", startBlock: pin.startBlock },
    mapping: manifest.templates[0]!.mapping
  })
  return manifest
}

/** Required pilot, optional exact A9 pin; six inactive templates, no listing authority. */
export function renderManifest(template: string, chainConfig: unknown, splitters: unknown): string {
  try {
    if (canonical(chainConfig) !== CHAIN) return fail()
    const captured = data(splitters)
    if (captured === null || typeof captured !== "object" || Array.isArray(captured)) return fail()
    const list = captured as Record<string, unknown>
    if (Object.keys(list).join() !== "splitters" || !Array.isArray(list.splitters) || list.splitters.length < 1 || list.splitters.length > SPLITTER_PINS.length) return fail()
    const seen = new Set<string>()
    const pins: SplitterPin[] = []
    for (const entry of list.splitters) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return fail()
      const item = entry as Record<string, unknown>
      if (Object.keys(item).join() !== "address,startBlock" || typeof item.address !== "string" ||
          item.address.length !== 42 || !/^0x[0-9a-fA-F]{40}$/.test(item.address)) return fail()
      const address = item.address.toLowerCase()
      if (seen.has(address)) return fail()
      seen.add(address)
      if (typeof item.startBlock !== "number" || !Number.isInteger(item.startBlock) ||
          item.startBlock < 0 || item.startBlock > MAX_BLOCK) return fail()
      const pin = approvedSplitterPin(address)
      if (!pin || item.startBlock !== pin.startBlock) return fail()
      pins.push(pin)
    }
    if (!seen.has(PILOT) || typeof template !== "string" || template.length > 16_384 ||
        /[\u0000-\u0008\u000b-\u001f\u007f]/.test(template) || template.split(MARKER).length !== 2) return fail()
    const expected = activeManifest(pins.sort((a, b) => a.address < b.address ? -1 : a.address > b.address ? 1 : 0))
    const source = Bun.YAML.stringify(expected.dataSources, null, 2).trimEnd().split("\n").map((line) => `  ${line}`).join("\n")
    const rendered = template.replace(MARKER, source)
    if (/[{}]/.test(rendered) || canonical(Bun.YAML.parse(rendered)) !== canonical(expected)) return fail()
    return rendered.endsWith("\n") ? rendered : `${rendered}\n`
  } catch { return fail() }
}

export interface ManifestPaths {
  readonly template: URL
  readonly chainConfig: URL
  readonly splitters: URL
  readonly output: URL
}

/** Local explicit-path orchestration; validation finishes before replacing any output. */
export async function buildManifest(paths: ManifestPaths): Promise<void> {
  let temporary: URL | undefined
  try {
    const { template, chainConfig, splitters, output } = paths
    for (const path of [template, chainConfig, splitters, output]) {
      if (!(path instanceof URL) || path.protocol !== "file:" || path.search || path.hash) return fail()
    }
    if ([template, chainConfig, splitters].some((path) => path.href === output.href)) return fail()
    const read = async (path: URL) => {
      const info = await stat(path)
      if (!info.isFile() || info.size > 65_536) return fail()
      return readFile(path, "utf8")
    }
    const [source, chain, list] = await Promise.all([read(template), read(chainConfig), read(splitters)])
    const rendered = renderManifest(source, JSON.parse(chain), JSON.parse(list))
    // All declared real mappings, shared helpers and inactive-template ABIs are required.
    for (const relative of [
      "./schema.graphql", "./src/fee-splitter.ts", "./src/ids.ts", "./abis/FeeSplitter.json", "./abis/FeeSplitterV2.json",
      "./src/identity.ts", "./src/reputation.ts", "./src/validation.ts", "./src/registry.ts",
      "./abis/IdentityRegistry.json", "./abis/ReputationRegistry.json", "./abis/ValidationRegistry.json",
      "./abis/ERC8183.json", "./abis/ArcadeJobHook.json", "./src/escrow.ts", "./src/escrow-hook.ts", "./src/escrow-events.ts"
    ]) {
      if (!(await stat(new URL(relative, output))).isFile()) return fail()
    }
    temporary = new URL(`.subgraph-${randomUUID()}.tmp`, output)
    await writeFile(temporary, rendered, { flag: "wx" })
    await rename(temporary, output)
    temporary = undefined
  } catch { return fail() }
  finally { if (temporary) await unlink(temporary).catch(() => undefined) }
}

if (import.meta.main) {
  try {
    if (Bun.argv.length !== 2) fail()
    await buildManifest({
      template: new URL("./subgraph.template.yaml", import.meta.url),
      chainConfig: new URL("../config/chains/arc-testnet.json", import.meta.url),
      splitters: new URL("./splitters.json", import.meta.url),
      output: new URL("./subgraph.yaml", import.meta.url)
    })
  } catch {
    process.stderr.write(`${ERROR}\n`)
    process.exitCode = 1
  }
}
