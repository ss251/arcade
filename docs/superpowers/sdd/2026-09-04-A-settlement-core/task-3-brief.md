> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

### Task 3: Job, Receipt and JobAssignment gain lineage/tree fields

**Merge notes.** `packages/core/src/receipt.ts` is also edited by **C** (`canary`, Task 5) and **F** (`sessionId`, `settleRefKind`, Task 6); `packages/core/src/protocol.ts` is also edited by **D** (`Hello.agents` / `AgentAnnouncement`, Task 7). A lands first and all four additions are `Schema.optional` with distinct names, so C, D and F rebase by appending their field below A's block — nobody reorders or re-types an existing field. `packages/core/src/index.ts` gains one `export * from` line per plan (A: `./lineage.ts`, `./chain-config.ts`; D: `./erc8004.ts`; E: `./ens.ts`; F: `./session.ts`) — the only conflict possible there is line adjacency, resolved by keeping every line.

**Files:**
- Modify: `packages/core/src/job.ts:58-68`, `packages/core/src/receipt.ts:16-58`, `packages/core/src/protocol.ts:113-120`
- Test: `packages/core/test/receipt-tree.test.ts`

**Interfaces:**
- Produces:
  - `Job` optional fields: `rootJobId?`, `parentJobId?`, `hop?` (default 0), `ancestors?` (default []).
  - `class ReceiptChild { jobId, skillId, priceAtomic: bigint, settled: boolean, settleTx?: string }`
  - `Receipt` optional fields: `rootJobId?`, `parentJobId?`, `hop?`, `ancestors?`, `children?: ReceiptChild[]`, `treeHash?: string`, `authorizationNonce?: string`, `treeCeilingAtomic?: bigint`, `treeCommittedAtomic?: bigint`, `receiptSignature?: string`
  - `treeHashOf(rootJobId: string, children: ReadonlyArray<ReceiptChild>): \`0x${string}\`` = keccak256 of canonical JSON `{rootJobId, children:[{jobId, skillId, priceAtomic: string, settleTx: string|null}]}` sorted by `jobId`.
  - `JobAssignment` optional fields: `parentJobId?`, `hireCapability?`.
  All optional so existing rows decode (SQLite stores JSON; `Schema.optional` keeps old rows valid).

- [ ] **Step 1: Write the failing test**

Historical excerpt (not current operator instructions):
```ts
// packages/core/test/receipt-tree.test.ts
import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import { Receipt, ReceiptChild, treeHashOf } from "../src/receipt.ts"
import { Job } from "../src/job.ts"
import { JobAssignment } from "../src/protocol.ts"

describe("receipt tree fields", () => {
  const child = ReceiptChild.make({ jobId: "job_child00000000000", skillId: "usdc-flow-check", priceAtomic: 10000n, settled: true, settleTx: "0xabc" })
  it("hashes deterministically regardless of child order", () => {
    const a = ReceiptChild.make({ ...child, jobId: "job_a0000000000000000" })
    const b = ReceiptChild.make({ ...child, jobId: "job_b0000000000000000" })
    expect(treeHashOf("job_root000000000000", [a, b])).toBe(treeHashOf("job_root000000000000", [b, a]))
    expect(treeHashOf("job_root000000000000", [a, b])).toMatch(/^0x[0-9a-f]{64}$/)
  })
  it("old receipts without tree fields still decode", () => {
    const r = Schema.decodeUnknownSync(Receipt)({
      jobId: "job_x000000000000000", skillId: "s", skillVersion: "1", buyer: "0xb", seller: "0xs",
      priceAtomic: 1n, sellerAtomic: 1n, feeAtomic: 0n, feeBps: 0, rail: "test", network: "eip155:1",
      latencyMs: 1, settled: false, reason: "r", createdAtMs: 1
    })
    expect(r.children).toBeUndefined()
  })
  it("Job and JobAssignment accept lineage fields", () => {
    const j = Job.make({ id: "job_x000000000000000", skillId: "s", seller: "0xs", buyer: "0xb", priceAtomic: 1n, input: {}, status: "queued", createdAtMs: 1, rootJobId: "job_x000000000000000", hop: 0, ancestors: [] })
    expect(j.hop).toBe(0)
    const a = JobAssignment.make({ jobId: "job_x000000000000000", skillId: "s", skillVersion: "1", input: {}, timeoutSec: 5, parentJobId: "job_p000000000000000", hireCapability: "a.b" })
    expect(a.hireCapability).toBe("a.b")
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run packages/core/test/receipt-tree.test.ts`
Expected: FAIL — `ReceiptChild` not exported / unknown fields.

- [ ] **Step 3: Add the fields**

`packages/core/src/job.ts`, inside `Job`:

Historical excerpt (not current operator instructions):
```ts
  /** Lineage, derived by the hub. Absent on rows written before lineage existed → root. */
  rootJobId: Schema.optional(Schema.String),
  parentJobId: Schema.optional(Schema.String),
  hop: Schema.optional(Schema.Int),
  ancestors: Schema.optional(Schema.Array(Schema.String))
```

`packages/core/src/receipt.ts`, before `Receipt`:

Historical excerpt (not current operator instructions):
```ts
import { keccak256, toHex } from "viem"

export class ReceiptChild extends Schema.Class<ReceiptChild>("ReceiptChild")({
  jobId: Schema.String,
  skillId: Schema.String,
  priceAtomic: Schema.BigIntFromSelf,
  settled: Schema.Boolean,
  settleTx: Schema.optional(Schema.String)
}) {}

/** Canonical, order-independent commitment to a receipt tree. Committed on chain by FeeSplitter v2. */
export const treeHashOf = (rootJobId: string, children: ReadonlyArray<ReceiptChild>): `0x${string}` => {
  const sorted = [...children].sort((a, b) => (a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0))
  const canonical = JSON.stringify({
    rootJobId,
    children: sorted.map((c) => ({ jobId: c.jobId, skillId: c.skillId, priceAtomic: c.priceAtomic.toString(), settleTx: c.settleTx ?? null }))
  })
  return keccak256(toHex(canonical))
}
```

and inside `Receipt` (after `createdAtMs`):

Historical excerpt (not current operator instructions):
```ts
  rootJobId: Schema.optional(Schema.String),
  parentJobId: Schema.optional(Schema.String),
  hop: Schema.optional(Schema.Int),
  ancestors: Schema.optional(Schema.Array(Schema.String)),
  /** Direct children settled or refused under this job. Present on parents only. */
  children: Schema.optional(Schema.Array(ReceiptChild)),
  /** keccak256 of the canonical tree; the value FeeSplitterV2 committed at settlement. */
  treeHash: Schema.optional(Schema.String),
  /** The EIP-3009 nonce of this settlement, for matching the splitter's Settled event. */
  authorizationNonce: Schema.optional(Schema.String),
  treeCeilingAtomic: Schema.optional(Schema.BigIntFromSelf),
  treeCommittedAtomic: Schema.optional(Schema.BigIntFromSelf),
  /** EIP-191 signature by the hub attester over the canonical receipt JSON. */
  receiptSignature: Schema.optional(Schema.String)
```

`packages/core/src/protocol.ts`, inside `JobAssignment`:

Historical excerpt (not current operator instructions):
```ts
  parentJobId: Schema.optional(Schema.String),
  /** Present only when the listing declares `hire-skills`; the runner forwards it on child purchases. */
  hireCapability: Schema.optional(Schema.String)
```

- [ ] **Step 4: Run tests, then the whole core suite**

Run: `bunx vitest run packages/core`
Expected: PASS (secrecy property test must still pass; the new fields are hub-computed, not seller-authored).

- [ ] **Step 5: Commit**

Historical command (not current operator instructions):
```text
git add packages/core/src/job.ts packages/core/src/receipt.ts packages/core/src/protocol.ts packages/core/test/receipt-tree.test.ts
git commit -m "feat(core): lineage and receipt-tree fields on Job, Receipt, JobAssignment"
```

---
