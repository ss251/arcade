> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

### Task 10: `ChainConfig` and manifests

**Files:**
- Create: `packages/core/src/chain-config.ts`, `config/chains/arc-testnet.json`, `config/chains/arc-mainnet.json`
- Modify: `packages/core/src/chain.ts` (re-export from config for compatibility), `packages/payments/src/eip3009.ts:12` (drop viem `arcTestnet` import; build `defineChain` from config), `apps/hub/src/server.ts` (use config), `packages/buyer/src/mcp.ts`, `apps/web/src/lib/wallet.ts`
- Test: `packages/core/test/chain-config.test.ts`

**Interfaces:**
- Produces: `class ChainConfig extends Schema.Class { id: "arc-testnet"|"arc-mainnet"; status: "ready"|"pending"; chainId: number; caip2: string; rpcHttp: string[]; explorerBaseUrl: string; usdc: {address, decimals: 6, nativeDecimals: 18, eip712Name, eip712Version}; erc8004?: {identity, reputation, validation}; gateway: null | {wallet, domain, facilitatorUrl, minValiditySeconds} }`; `loadChainConfig(network = process.env.ARCADE_NETWORK ?? "arc-testnet"): ChainConfig` (reads the JSON manifest bundled at build time via `import ... with {type: "json"}`); `toViemChain(cfg)`.

- [ ] **Step 1: Write the failing test**

Historical excerpt (not current operator instructions):
```ts
// packages/core/test/chain-config.test.ts
import { describe, expect, it } from "vitest"
import { loadChainConfig } from "../src/chain-config.ts"
describe("chain config", () => {
  it("testnet is ready with the known constants", () => {
    const c = loadChainConfig("arc-testnet")
    expect(c.status).toBe("ready")
    expect(c.chainId).toBe(5042002)
    expect(c.usdc.address).toBe("0x3600000000000000000000000000000000000000")
    expect(c.rpcHttp).toEqual(expect.arrayContaining(["https://rpc.testnet.arc.io", "https://rpc.testnet.arc.network"]))
    expect(c.erc8004?.identity).toBe("0x8004A818BFB912233c491871b3d84c89A494BD9e")
  })
  it("mainnet is pending", () => {
    expect(loadChainConfig("arc-mainnet").status).toBe("pending")
  })
  it("unknown network throws", () => {
    expect(() => loadChainConfig("base" as never)).toThrow()
  })
})
```

- [ ] **Step 2: Run to verify failure** — `bunx vitest run packages/core/test/chain-config.test.ts` → FAIL.

- [ ] **Step 3: Write the manifests and loader**

`config/chains/arc-testnet.json`:

Historical excerpt (not current operator instructions):
```json
{ "id": "arc-testnet", "status": "ready", "chainId": 5042002, "caip2": "eip155:5042002",
  "rpcHttp": ["https://rpc.testnet.arc.io", "https://rpc.testnet.arc.network"],
  "explorerBaseUrl": "https://testnet.arcscan.app",
  "usdc": { "address": "0x3600000000000000000000000000000000000000", "decimals": 6, "nativeDecimals": 18, "eip712Name": "USDC", "eip712Version": "2" },
  "erc8004": { "identity": "0x8004A818BFB912233c491871b3d84c89A494BD9e", "reputation": "0x8004B663056A597Dffe9eCcC1965A193B7388713", "validation": "0x8004Cb1BF31DAf7788923b405b754f57acEB4272" },
  "gateway": { "wallet": "0x0077777d7EBA4688BDeF3E311b846F25870A19B9", "domain": 26, "facilitatorUrl": "https://gateway-api-testnet.circle.com", "minValiditySeconds": 604900 } }
```

`config/chains/arc-mainnet.json`: `{ "id": "arc-mainnet", "status": "pending", "chainId": 0, "caip2": "eip155:0", "rpcHttp": [], "explorerBaseUrl": "", "usdc": { "address": "0x0000000000000000000000000000000000000000", "decimals": 6, "nativeDecimals": 18, "eip712Name": "USDC", "eip712Version": "2" }, "gateway": null }` with a top-level `"note": "Fill from https://docs.arc.io after the Sept 16, 2026 public mainnet launch; see docs/mainnet-runbook.md"`.

`packages/core/src/chain-config.ts`:

Historical excerpt (not current operator instructions):
```ts
import { Schema } from "effect"
import testnet from "../../../config/chains/arc-testnet.json" with { type: "json" }
import mainnet from "../../../config/chains/arc-mainnet.json" with { type: "json" }

const Hex = Schema.String.pipe(Schema.pattern(/^0x[0-9a-fA-F]{40}$/))
export class ChainConfig extends Schema.Class<ChainConfig>("ChainConfig")({
  id: Schema.Literal("arc-testnet", "arc-mainnet"),
  status: Schema.Literal("ready", "pending"),
  chainId: Schema.Int,
  caip2: Schema.String,
  rpcHttp: Schema.Array(Schema.String),
  explorerBaseUrl: Schema.String,
  usdc: Schema.Struct({ address: Hex, decimals: Schema.Literal(6), nativeDecimals: Schema.Literal(18), eip712Name: Schema.String, eip712Version: Schema.String }),
  erc8004: Schema.optional(Schema.Struct({ identity: Hex, reputation: Hex, validation: Hex })),
  gateway: Schema.NullOr(Schema.Struct({ wallet: Hex, domain: Schema.Int, facilitatorUrl: Schema.String, minValiditySeconds: Schema.Int })),
  note: Schema.optional(Schema.String)
}) {}

const MANIFESTS: Record<string, unknown> = { "arc-testnet": testnet, "arc-mainnet": mainnet }
export type NetworkId = "arc-testnet" | "arc-mainnet"

export const loadChainConfig = (network: NetworkId = (process.env["ARCADE_NETWORK"] as NetworkId) ?? "arc-testnet"): ChainConfig => {
  const raw = MANIFESTS[network]
  if (raw === undefined) throw new Error(`unknown ARCADE_NETWORK "${network}" (known: ${Object.keys(MANIFESTS).join(", ")})`)
  return Schema.decodeUnknownSync(ChainConfig)(raw)
}

export const toViemChain = (c: ChainConfig) => ({
  id: c.chainId, name: c.id, nativeCurrency: { name: "USDC", symbol: "USDC", decimals: c.usdc.nativeDecimals },
  rpcUrls: { default: { http: c.rpcHttp } }, blockExplorers: { default: { name: "Arcscan", url: c.explorerBaseUrl } }
})
```

Keep `packages/core/src/chain.ts` exporting the same names but derived: `const cfg = loadChainConfig(); export const ARC_CHAIN_ID = cfg.chainId; …` so existing imports keep compiling; replace the viem `arcTestnet` import in `eip3009.ts` with `defineChain(toViemChain(config.chain))` where `Eip3009Config` gains `chain: ChainConfig`. Ensure `tsconfig` has `resolveJsonModule: true` (add if missing).

- [ ] **Step 4: Run** — `bunx vitest run packages/core packages/payments && bunx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit**

Historical command (not current operator instructions):
```text
git add packages/core/src/chain-config.ts packages/core/src/chain.ts config/chains packages/payments/src/eip3009.ts packages/core/test/chain-config.test.ts tsconfig.base.json
git commit -m "feat(core): ChainConfig manifests with a pending Arc mainnet entry"
```

---
