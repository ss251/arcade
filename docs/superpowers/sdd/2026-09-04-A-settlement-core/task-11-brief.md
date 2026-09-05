> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

### Task 11: Boot checks and `scripts/chain-check.ts`

**Files:**
- Create: `apps/hub/src/chain-check.ts`, `scripts/chain-check.ts`
- Modify: `apps/hub/src/server.ts` preflight
- Test: `apps/hub/test/chain-check.test.ts`

**Interfaces:**
- Produces: `chainCheck(cfg: ChainConfig, rpc: {chainId(): Promise<number>; read(fn: "name"|"version"|"decimals"): Promise<unknown>; balanceOf(addr): Promise<bigint>}, facilitator: string): Promise<{ok: boolean; findings: string[]}>`; hub refuses to start when `cfg.status === "pending"` or when `ARCADE_RAIL=gateway` and `cfg.gateway === null`.

- [ ] **Step 1: Write the failing test**

Historical excerpt (not current operator instructions):
```ts
// apps/hub/test/chain-check.test.ts
import { describe, expect, it } from "vitest"
import { loadChainConfig } from "@arcade/core"
import { chainCheck } from "../src/chain-check.ts"
const good = { chainId: async () => 5042002, read: async (fn: string) => ({ name: "USDC", version: "2", decimals: 6 })[fn], balanceOf: async () => 1n }
describe("chainCheck", () => {
  it("passes on a matching testnet", async () => {
    expect((await chainCheck(loadChainConfig("arc-testnet"), good, "0xfacilitator")).ok).toBe(true)
  })
  it("fails on a chain id mismatch", async () => {
    const r = await chainCheck(loadChainConfig("arc-testnet"), { ...good, chainId: async () => 1 }, "0xf")
    expect(r.ok).toBe(false); expect(r.findings.join()).toContain("chainId")
  })
  it("fails on an unfunded facilitator", async () => {
    const r = await chainCheck(loadChainConfig("arc-testnet"), { ...good, balanceOf: async () => 0n }, "0xf")
    expect(r.findings.join()).toContain("facilitator")
  })
  it("refuses a pending network before any RPC", async () => {
    const r = await chainCheck(loadChainConfig("arc-mainnet"), good, "0xf")
    expect(r.ok).toBe(false); expect(r.findings.join()).toContain("pending")
  })
})
```

- [ ] **Step 2: Run to verify failure** — `bunx vitest run apps/hub/test/chain-check.test.ts` → FAIL.

- [ ] **Step 3: Implement `apps/hub/src/chain-check.ts`**

Historical excerpt (not current operator instructions):
```ts
import type { ChainConfig } from "@arcade/core"
export interface ChainRpc {
  readonly chainId: () => Promise<number>
  readonly read: (fn: "name" | "version" | "decimals") => Promise<unknown>
  readonly balanceOf: (addr: string) => Promise<bigint>
}
export const chainCheck = async (cfg: ChainConfig, rpc: ChainRpc, facilitator: string): Promise<{ ok: boolean; findings: string[] }> => {
  const findings: string[] = []
  if (cfg.status === "pending") return { ok: false, findings: [`${cfg.id} is pending: fill config/chains/${cfg.id}.json from docs.arc.io (see docs/mainnet-runbook.md)`] }
  const id = await rpc.chainId().catch(() => -1)
  if (id !== cfg.chainId) findings.push(`chainId: rpc reports ${id}, config says ${cfg.chainId}`)
  const name = await rpc.read("name").catch(() => undefined)
  if (name !== cfg.usdc.eip712Name) findings.push(`usdc name: ${String(name)} ≠ ${cfg.usdc.eip712Name}`)
  const version = await rpc.read("version").catch(() => undefined)
  if (version !== cfg.usdc.eip712Version) findings.push(`usdc version: ${String(version)} ≠ ${cfg.usdc.eip712Version}`)
  const decimals = await rpc.read("decimals").catch(() => undefined)
  if (Number(decimals) !== cfg.usdc.decimals) findings.push(`usdc decimals: ${String(decimals)} ≠ ${cfg.usdc.decimals}`)
  const bal = await rpc.balanceOf(facilitator).catch(() => 0n)
  if (bal === 0n) findings.push(`facilitator ${facilitator} has no USDC for gas`)
  return { ok: findings.length === 0, findings }
}
```

`scripts/chain-check.ts`: builds a real `ChainRpc` with viem (`createPublicClient` over `cfg.rpcHttp[0]`, `readContract` on the USDC ERC-20 ABI), takes `--network`, prints findings, exits 1 on failure. In `server.ts` preflight: load `cfg = loadChainConfig()`; if `cfg.status === "pending"` exit with the finding; if `RAIL === "gateway" && cfg.gateway === null` exit with "Gateway is not available on this network"; run `chainCheck` at boot when `ARCADE_CHAIN_CHECK !== "0"` and log findings (warn on a laptop, refuse on a platform).

- [ ] **Step 4: Run** — `bunx vitest run apps/hub && bun run scripts/chain-check.ts --network arc-testnet` → PASS and the script prints `ok`.

- [ ] **Step 5: Commit**

Historical command (not current operator instructions):
```text
git add apps/hub/src/chain-check.ts scripts/chain-check.ts apps/hub/src/server.ts apps/hub/test/chain-check.test.ts
git commit -m "feat(hub): chain boot checks; refuse pending mainnet and gateway-less networks"
```

---
