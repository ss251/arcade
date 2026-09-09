# Plan A — Settlement core (M2) + chain config (M9 part 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make hires safe and auditable: validate input before payment, carry hub-issued lineage across hops, refuse cycles/depth/over-budget hires with a transactional tree ledger, return a receipt tree, commit the tree hash on chain via FeeSplitter v2, and move chain constants into a selectable `ChainConfig` with a pending mainnet manifest.

**Architecture:** All changes sit behind existing seams: the paid endpoint in `apps/hub/src/server.ts`, `runJob` in `apps/hub/src/pipeline.ts`, the `Job`/`Receipt`/`JobAssignment` schemas in `packages/core`, the hire broker in `packages/runner`, `fetchWithPayment` in `packages/buyer`, and `EIP3009Live.settle` in `packages/payments`. The hub is the only source of truth for lineage; clients present an opaque capability and the hub derives everything else from persisted jobs. This plan is the critical path: Plans B–I consume the interfaces in the "Produces" blocks below.

**Tech Stack:** Bun 1.3, TypeScript, Effect 3.22 (Effect Schema, `Data.TaggedError`), `bun:sqlite`, viem 2.x, vitest 3 + `bun test` for `.bun.test.ts`, Foundry (`forge`) for `contracts/`.

## Global Constraints

- Never commit `internal/`; secrets only via Keychain/env, never in source or `.env`.
- **Depends on / rebase base (spec §13).** This plan depends on **no other plan** and is the critical path: it runs **Fri Sept 5 – Sat Sept 6**, branched from `main` at `57183db`, and merges to `main` before any other stream starts. Plans B, C, D, E and G branch from `main` *after* Plan A Task 12 lands (Sun Sept 7); F, G's subgraph half and H follow on Mon Sept 8; I is threaded through the week. The canonical merge order for every file two plans share is **A → B → C → D → E → F → G → H → I**, with two recorded exceptions, both in the affected plans' Merge notes: Plan H's `GET /stats` + `store.statsSource` land before Plan G Task 8 rewires them, and Plan E's `apps/web` edits (its Task 13) land before Plan H rewrites those files. Do not start a Plan A task on a branch that already carries another plan's work.
- **Receipt field ownership.** Four plans add optional fields to `Receipt` and every name is unique, so the merges are additive and non-conflicting: **A** adds `rootJobId`, `parentJobId`, `hop`, `ancestors`, `children`, `treeHash`, `authorizationNonce`, `treeCeilingAtomic`, `treeCommittedAtomic`, `receiptSignature`; **C** adds `canary`; **F** adds `sessionId` and `settleRefKind`; **D**, **E**, **G** and **H** add none. Every one of them is `Schema.optional(...)` so rows written before the field existed still decode. A plan that needs a fifth name adds it to this list first.
- Settle only on success: schema-valid + non-empty + no refusal (`shouldSettle`, `packages/core/src/job.ts`). Nothing in this plan may broadcast on a non-settling outcome.
- Never call `waitForTransactionReceipt`; keep the one-receipt-per-tick retry in `packages/payments/src/eip3009.ts`.
- Money is 6-decimal atomic `bigint` everywhere (`packages/core/src/money.ts`); gas is 18-decimal and stays out of receipts.
- Effect idioms: `Effect.gen`, `Schema.Class`, `Data.TaggedError`; no zod.
- Third-party x402 clients (Circle CLI) must keep working: no required new headers on root calls; no custom EIP-3009 nonce.
- Gates before each commit: `bun run test` (vitest + bun), `bunx tsc --noEmit` (or `bun run typecheck`), and `forge test` for contract tasks.
- Commit after every task with a conventional message; small commits (hackathon rule).
- **Owner-performed steps.** Any step marked **OWNER** stops the executor: print the command, hand it to the human, resume on confirmation. The full week's list, with the day each is needed, is `docs/superpowers/plans/2026-09-04-01-owner-actions.md`.

---

## File structure

| file | responsibility |
|---|---|
| `packages/core/src/lineage.ts` (new) | `Lineage` schema, error tags, `hireCapability` mint/verify helpers (pure, HMAC) |
| `packages/core/src/job.ts` | `Job` gains lineage fields |
| `packages/core/src/receipt.ts` | `Receipt` gains tree fields; `ReceiptChild` schema; `treeHashOf` |
| `packages/core/src/protocol.ts` | `JobAssignment` gains `parentJobId?`, `hireCapability?` |
| `packages/core/src/errors.ts` | new tagged errors (`InputInvalid`, `LineageInvalid`, `LineageCycle`, `LineageDepth`, `TreeBudgetExceeded`) |
| `packages/core/src/chain-config.ts` (new) | `ChainConfig` schema, `loadChainConfig(network)`, both manifests |
| `config/chains/arc-testnet.json`, `config/chains/arc-mainnet.json` (new) | checked-in chain manifests |
| `apps/hub/src/validate.ts` | `validateJson` (generalised), `validateOutput` kept as alias |
| `apps/hub/src/lineage.ts` (new) | hub-side: derive lineage from parent job, reservation ledger API |
| `apps/hub/src/store.ts`, `apps/hub/src/store-sqlite.ts` | `reserveTree`, `commitTree`, `releaseTree`, `treeState` + `tree_reservations` table |
| `apps/hub/src/server.ts` | input gate, lineage checks, capability issue, `/jobs/:id/result` tree |
| `apps/hub/src/pipeline.ts` | ledger commit/release, receipt tree, `treeHash` handed to settle |
| `apps/hub/src/broker.ts` | dispatch carries `parentJobId`, `hireCapability` |
| `packages/runner/src/daemon.ts`, `packages/runner/src/hire-broker.ts` | forward capability on child purchases |
| `packages/buyer/src/fetch-with-payment.ts`, `packages/buyer/src/index.ts` | optional `lineage` header forwarding |
| `packages/payments/src/eip3009.ts`, `packages/payments/src/rail.ts` | `settle(verified, {treeHash, childCount, childTotalAtomic}?)` → `settleWithTree` on v2 splitters |
| `contracts/FeeSplitterV2.sol`, `contracts/test/FeeSplitterV2.t.sol`, `scripts/deploy-splitter.ts` | v2 contract |
| `apps/hub/src/chain-check.ts` (new), `scripts/chain-check.ts` (new) | boot probes |
| `docs/mainnet-runbook.md` (new) | Sept 16–30 checklist |

---

### Task 1: Input gate — validate the body before any payment work

**Files:**
- Modify: `apps/hub/src/validate.ts`
- Modify: `apps/hub/src/server.ts:771-808`
- Modify: `packages/core/src/errors.ts`
- Test: `apps/hub/test/input-gate.test.ts`, `apps/hub/test/validate.test.ts`

**Interfaces:**
- Produces: `validateJson(value: unknown, schema: unknown): boolean` (exported from `apps/hub/src/validate.ts`; `validateOutput` stays as an alias); HTTP `400 {error: "input_invalid", detail: string}`; `InputInvalid` tagged error in `@arcade/core`.

- [ ] **Step 1: Write the failing validator test**

```ts
// apps/hub/test/validate.test.ts
import { describe, expect, it } from "vitest"
import { validateJson, validateOutput } from "../src/validate.ts"

describe("validateJson", () => {
  const schema = { type: "object", required: ["address"], properties: { address: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" } } }
  it("accepts a conforming object", () => {
    expect(validateJson({ address: "0x" + "a".repeat(40) }, schema)).toBe(true)
  })
  it("rejects a missing required key", () => {
    expect(validateJson({}, schema)).toBe(false)
  })
  it("rejects a pattern miss", () => {
    expect(validateJson({ address: "nope" }, schema)).toBe(false)
  })
  it("keeps validateOutput as an alias", () => {
    expect(validateOutput).toBe(validateJson)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run apps/hub/test/validate.test.ts`
Expected: FAIL — `validateJson` is not exported.

- [ ] **Step 3: Rename the validator and keep the alias**

In `apps/hub/src/validate.ts` rename `export const validateOutput = (value: Json, schema: Json): boolean =>` to `export const validateJson = …`, replace the recursive calls inside it (`validateOutput(obj[key], sub)`, `validateOutput(el, items)`) with `validateJson(...)`, and append:

```ts
/** Kept for existing call sites; settlement validation and input validation are the same check. */
export const validateOutput = validateJson
```

- [ ] **Step 4: Run the validator test**

Run: `bunx vitest run apps/hub/test/validate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the `InputInvalid` error**

In `packages/core/src/errors.ts` add:

```ts
export class InputInvalid extends Data.TaggedError("InputInvalid")<{
  readonly skillId: string
  readonly detail: string
}> {}
```

(Import `Data` from `effect` if the file does not already.)

- [ ] **Step 6: Write the failing input-gate test**

The hub test harness in `apps/hub/test/openapi.test.ts` shows how the server is exercised; this test spawns the paid endpoint through the same `fetch` path. Create `apps/hub/test/input-gate.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { validateJson } from "../src/validate.ts"
import { inputGate } from "../src/server.ts"

describe("input gate", () => {
  const listing = { id: "usdc-flow-check", inputSchema: { type: "object", required: ["address"], properties: { address: { type: "string" } } } }
  it("returns null for a valid body", () => {
    expect(inputGate(listing as never, { address: "0xabc" })).toBeNull()
  })
  it("names the failure for an invalid body", () => {
    const r = inputGate(listing as never, {})
    expect(r).toEqual({ error: "input_invalid", detail: expect.stringContaining("inputSchema") })
  })
  it("treats a non-object body as invalid when the schema is an object", () => {
    expect(inputGate(listing as never, "x")).not.toBeNull()
    expect(validateJson("x", listing.inputSchema)).toBe(false)
  })
})
```

- [ ] **Step 7: Run it to verify it fails**

Run: `bunx vitest run apps/hub/test/input-gate.test.ts`
Expected: FAIL — `inputGate` is not exported.

- [ ] **Step 8: Implement `inputGate` and wire it before the payment header check**

In `apps/hub/src/server.ts`, above `const main = Effect.gen(...)`, add an exported pure helper:

```ts
/**
 * Input is validated BEFORE any payment work. Previously the hub verified the buyer's
 * authorization, then parsed the body and swallowed a malformed one as `{}` — a verified
 * authorization attached to garbage input, i.e. the "paid, got a 400" class one layer in.
 */
export const inputGate = (
  listing: { readonly id: string; readonly inputSchema: unknown },
  body: unknown
): { error: "input_invalid"; detail: string } | null =>
  validateJson(body, listing.inputSchema)
    ? null
    : { error: "input_invalid", detail: `body does not satisfy the listing's inputSchema for ${listing.id}` }
```

Import `validateJson` from `./validate.ts`. Then in the paid-endpoint branch (`if (callMatch !== null && req.method === "POST")`), move body parsing to the top of the branch, right after `const { listing, seller } = found.right`:

```ts
        const rawBody = await req.text()
        let input: unknown
        try {
          input = rawBody === "" ? {} : JSON.parse(rawBody)
        } catch {
          return json({ error: "input_invalid", detail: "body is not JSON" }, 400)
        }
        const gate = inputGate(listing, input)
        if (gate !== null) return json(gate, 400)
```

Delete the later line `const input = await req.json().catch(() => ({}))`. The 402 challenge is still returned for a valid body with no payment header, so probes keep working unchanged (a probe with an empty body against a listing requiring fields now gets 400; update the buyer probe in Task 8 to send the real body, which `callSkill` already does).

- [ ] **Step 9: Run the tests**

Run: `bunx vitest run apps/hub/test/input-gate.test.ts apps/hub/test/validate.test.ts apps/hub/test/openapi.test.ts apps/hub/test/pipeline.test.ts`
Expected: PASS.

- [ ] **Step 10: Typecheck and commit**

```bash
bunx tsc --noEmit
git add apps/hub/src/validate.ts apps/hub/src/server.ts packages/core/src/errors.ts apps/hub/test/input-gate.test.ts apps/hub/test/validate.test.ts
git commit -m "feat(hub): validate input against the listing schema before any payment work"
```

---

### Task 2: Lineage schema and hire capability (pure core)

**Files:**
- Create: `packages/core/src/lineage.ts`
- Modify: `packages/core/src/index.ts` (export), `packages/core/src/errors.ts`
- Test: `packages/core/test/lineage.test.ts`

**Interfaces:**
- Produces:
  - `HIRE_CAPABILITY_HEADER = "x-arcade-hire-capability"`
  - `mintHireCapability(secret: string, parentJobId: string, expiresAtMs: number): string` → `base64url(payloadJSON) + "." + base64url(hmacHex)`
  - `verifyHireCapability(secret: string, token: string, nowMs: number): { parentJobId: string } | LineageInvalid`
  - `class Lineage extends Schema.Class { rootJobId, parentJobId?, hop, ancestors: string[] }`
  - `ROOT_LINEAGE(jobId): Lineage` → `{rootJobId: jobId, hop: 0, ancestors: []}`
  - `childLineage(parent: Lineage & {skillId}, parentJobId): Lineage`
  - errors: `LineageInvalid {reason}`, `LineageCycle {skillId}`, `LineageDepth {hop, max}`, `TreeBudgetExceeded {rootJobId, ceilingAtomic, wouldBeAtomic}`
  - `DEFAULT_MAX_HOP = 3` (hops 0..3 allowed → four levels; `lineage_depth` when `hop > max`)

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/test/lineage.test.ts
import { describe, expect, it } from "vitest"
import {
  Lineage, ROOT_LINEAGE, childLineage, mintHireCapability, verifyHireCapability,
  HIRE_CAPABILITY_HEADER, DEFAULT_MAX_HOP
} from "../src/lineage.ts"

const SECRET = "test-secret"

describe("hire capability", () => {
  it("round-trips and names the parent", () => {
    const tok = mintHireCapability(SECRET, "job_parent0000000000", Date.now() + 60_000)
    const v = verifyHireCapability(SECRET, tok, Date.now())
    expect(v).toEqual({ parentJobId: "job_parent0000000000" })
  })
  it("refuses a tampered payload", () => {
    const tok = mintHireCapability(SECRET, "job_parent0000000000", Date.now() + 60_000)
    const [p, mac] = tok.split(".")
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p!, "base64url").toString()), parentJobId: "job_other00000000000" })).toString("base64url")
    const v = verifyHireCapability(SECRET, `${forged}.${mac}`, Date.now())
    expect((v as { _tag?: string })._tag).toBe("LineageInvalid")
  })
  it("refuses an expired capability", () => {
    const tok = mintHireCapability(SECRET, "job_parent0000000000", Date.now() - 1)
    const v = verifyHireCapability(SECRET, tok, Date.now())
    expect((v as { _tag?: string })._tag).toBe("LineageInvalid")
  })
  it("refuses a wrong secret", () => {
    const tok = mintHireCapability("other", "job_parent0000000000", Date.now() + 60_000)
    expect((verifyHireCapability(SECRET, tok, Date.now()) as { _tag?: string })._tag).toBe("LineageInvalid")
  })
  it("exports the header name", () => {
    expect(HIRE_CAPABILITY_HEADER).toBe("x-arcade-hire-capability")
  })
})

describe("lineage derivation", () => {
  it("root has hop 0 and no ancestors", () => {
    expect(ROOT_LINEAGE("job_a")).toEqual(Lineage.make({ rootJobId: "job_a", hop: 0, ancestors: [] }))
  })
  it("child appends the parent's skill and increments hop", () => {
    const parent = { ...ROOT_LINEAGE("job_a"), skillId: "counterparty-brief" }
    const child = childLineage(parent, "job_a")
    expect(child).toEqual(Lineage.make({ rootJobId: "job_a", parentJobId: "job_a", hop: 1, ancestors: ["counterparty-brief"] }))
  })
  it("default max hop is 3", () => {
    expect(DEFAULT_MAX_HOP).toBe(3)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run packages/core/test/lineage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/core/src/lineage.ts`**

```ts
import { createHmac, timingSafeEqual } from "node:crypto"
import { Data, Schema } from "effect"

/**
 * Lineage — how the hub knows a call is a sub-hire and of what.
 *
 * The client presents ONLY an opaque capability naming its parent job; the hub verifies the
 * MAC and derives root, hop and ancestors from the persisted parent. A forged header buys
 * nothing, and an omitted header is simply a root call from a new customer.
 */

export const HIRE_CAPABILITY_HEADER = "x-arcade-hire-capability"
export const DEFAULT_MAX_HOP = 3

export class Lineage extends Schema.Class<Lineage>("Lineage")({
  rootJobId: Schema.String,
  parentJobId: Schema.optional(Schema.String),
  hop: Schema.Int,
  ancestors: Schema.Array(Schema.String)
}) {}

export class LineageInvalid extends Data.TaggedError("LineageInvalid")<{ readonly reason: string }> {}
export class LineageCycle extends Data.TaggedError("LineageCycle")<{ readonly skillId: string }> {}
export class LineageDepth extends Data.TaggedError("LineageDepth")<{ readonly hop: number; readonly max: number }> {}
export class TreeBudgetExceeded extends Data.TaggedError("TreeBudgetExceeded")<{
  readonly rootJobId: string
  readonly ceilingAtomic: bigint
  readonly wouldBeAtomic: bigint
}> {}

export const ROOT_LINEAGE = (jobId: string): Lineage =>
  Lineage.make({ rootJobId: jobId, hop: 0, ancestors: [] })

export const childLineage = (
  parent: { readonly rootJobId: string; readonly hop: number; readonly ancestors: ReadonlyArray<string>; readonly skillId: string },
  parentJobId: string
): Lineage =>
  Lineage.make({
    rootJobId: parent.rootJobId,
    parentJobId,
    hop: parent.hop + 1,
    ancestors: [...parent.ancestors, parent.skillId]
  })

interface CapabilityPayload {
  readonly v: 1
  readonly aud: "arcade-hire"
  readonly parentJobId: string
  readonly expiresAtMs: number
}

const canonical = (p: CapabilityPayload): string =>
  JSON.stringify({ v: p.v, aud: p.aud, parentJobId: p.parentJobId, expiresAtMs: p.expiresAtMs })

const mac = (secret: string, payloadJson: string): string =>
  createHmac("sha256", secret).update(`arcade-hire-v1:${payloadJson}`).digest("hex")

export const mintHireCapability = (secret: string, parentJobId: string, expiresAtMs: number): string => {
  const payload = canonical({ v: 1, aud: "arcade-hire", parentJobId, expiresAtMs })
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${Buffer.from(mac(secret, payload), "utf8").toString("base64url")}`
}

export const verifyHireCapability = (
  secret: string,
  token: string,
  nowMs: number
): { readonly parentJobId: string } | LineageInvalid => {
  const [p, m] = token.split(".")
  if (p === undefined || m === undefined) return new LineageInvalid({ reason: "malformed capability" })
  let parsed: CapabilityPayload
  try {
    parsed = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as CapabilityPayload
  } catch {
    return new LineageInvalid({ reason: "capability payload is not JSON" })
  }
  if (parsed.v !== 1 || parsed.aud !== "arcade-hire" || typeof parsed.parentJobId !== "string") {
    return new LineageInvalid({ reason: "capability payload shape" })
  }
  const expected = Buffer.from(mac(secret, canonical(parsed)), "utf8")
  const presented = Buffer.from(m, "base64url")
  if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) {
    return new LineageInvalid({ reason: "bad mac" })
  }
  if (typeof parsed.expiresAtMs !== "number" || parsed.expiresAtMs <= nowMs) {
    return new LineageInvalid({ reason: "capability expired" })
  }
  return { parentJobId: parsed.parentJobId }
}
```

Export from `packages/core/src/index.ts`: `export * from "./lineage.ts"`.

- [ ] **Step 4: Run tests**

Run: `bunx vitest run packages/core/test/lineage.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/lineage.ts packages/core/src/index.ts packages/core/test/lineage.test.ts
git commit -m "feat(core): lineage schema and hub-issued hire capability"
```

---

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

```ts
  /** Lineage, derived by the hub. Absent on rows written before lineage existed → root. */
  rootJobId: Schema.optional(Schema.String),
  parentJobId: Schema.optional(Schema.String),
  hop: Schema.optional(Schema.Int),
  ancestors: Schema.optional(Schema.Array(Schema.String))
```

`packages/core/src/receipt.ts`, before `Receipt`:

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

```ts
  parentJobId: Schema.optional(Schema.String),
  /** Present only when the listing declares `hire-skills`; the runner forwards it on child purchases. */
  hireCapability: Schema.optional(Schema.String)
```

- [ ] **Step 4: Run tests, then the whole core suite**

Run: `bunx vitest run packages/core`
Expected: PASS (secrecy property test must still pass; the new fields are hub-computed, not seller-authored).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/job.ts packages/core/src/receipt.ts packages/core/src/protocol.ts packages/core/test/receipt-tree.test.ts
git commit -m "feat(core): lineage and receipt-tree fields on Job, Receipt, JobAssignment"
```

---

### Task 4: Tree reservation ledger in the store (memory + SQLite)

**Merge notes.** `apps/hub/src/store.ts` and `store-sqlite.ts` are edited by five plans, each adding a disjoint table plus its `Store` methods: **A** `tree_reservations` (this task), **C** `pay_tests` + `ListingRecord.payTested/.delisted`, **D** `erc8004_docs` + four `ListingRecord` fields, **F** `sessions`, **H** one field (`Store.statsSource`, later rewired by **G**). Land in that order. The mechanical conflicts are always the same three places — the `StoreState` interface, `empty()`/`emptyState()`, and the `SCHEMA` string — so each plan appends rather than rewrites, and `initial` gains one key per plan.

**Files:**
- Modify: `apps/hub/src/store.ts`, `apps/hub/src/store-sqlite.ts`
- Test: `apps/hub/test/tree-ledger.test.ts`, `apps/hub/test/tree-ledger-sqlite.bun.test.ts`

**Interfaces:**
- Produces on `Store`:
  - `reserveTree(rootJobId: string, childJobId: string, amountAtomic: bigint, ceilingAtomic: bigint): Effect<boolean>` — true if reserved; false if `reserved + committed + amount > ceiling`. Atomic per root.
  - `commitTree(childJobId): Effect<void>`, `releaseTree(childJobId): Effect<void>`
  - `treeState(rootJobId): Effect<{ reservedAtomic: bigint; committedAtomic: bigint; children: ReadonlyArray<{childJobId: string; amountAtomic: bigint; state: "reserved"|"committed"|"released"}> }>`
  - `StoreState.trees: Map<string, Array<TreeRow>>` with `TreeRow = {childJobId, amountAtomic, state}`.

- [ ] **Step 1: Write the failing in-memory test**

```ts
// apps/hub/test/tree-ledger.test.ts
import { describe, expect, it } from "vitest"
import { Effect, Layer } from "effect"
import { StoreLive, StoreTag } from "../src/store.ts"

const run = <A>(eff: Effect.Effect<A, never, StoreTag>) =>
  Effect.runPromise(Effect.provide(eff, StoreLive))

describe("tree reservation ledger", () => {
  it("reserves within the ceiling and refuses beyond it", async () => {
    const out = await run(Effect.gen(function* () {
      const s = yield* StoreTag
      const a = yield* s.reserveTree("job_root", "job_c1", 60_000n, 100_000n)
      const b = yield* s.reserveTree("job_root", "job_c2", 60_000n, 100_000n)
      const st = yield* s.treeState("job_root")
      return { a, b, st }
    }))
    expect(out.a).toBe(true)
    expect(out.b).toBe(false)
    expect(out.st.reservedAtomic).toBe(60_000n)
  })
  it("commit moves reserved to committed; release frees it", async () => {
    const out = await run(Effect.gen(function* () {
      const s = yield* StoreTag
      yield* s.reserveTree("job_root", "job_c1", 60_000n, 100_000n)
      yield* s.commitTree("job_c1")
      yield* s.reserveTree("job_root", "job_c2", 30_000n, 100_000n)
      yield* s.releaseTree("job_c2")
      const ok = yield* s.reserveTree("job_root", "job_c3", 40_000n, 100_000n)
      return { ok, st: yield* s.treeState("job_root") }
    }))
    expect(out.ok).toBe(true)
    expect(out.st.committedAtomic).toBe(60_000n)
    expect(out.st.reservedAtomic).toBe(40_000n)
  })
  it("a zero ceiling refuses every hire", async () => {
    const ok = await run(Effect.flatMap(StoreTag, (s) => s.reserveTree("job_r", "job_c", 1n, 0n)))
    expect(ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run apps/hub/test/tree-ledger.test.ts`
Expected: FAIL — `reserveTree` missing.

- [ ] **Step 3: Implement in `apps/hub/src/store.ts`**

Add to `StoreState`: `readonly trees: Map<string, Array<TreeRow>>` and

```ts
export interface TreeRow {
  readonly childJobId: string
  readonly amountAtomic: bigint
  state: "reserved" | "committed" | "released"
}
```

Initialize `trees: new Map()` in `empty()`. Extend `Store`:

```ts
  readonly reserveTree: (rootJobId: string, childJobId: string, amountAtomic: bigint, ceilingAtomic: bigint) => Effect.Effect<boolean>
  readonly commitTree: (childJobId: string) => Effect.Effect<void>
  readonly releaseTree: (childJobId: string) => Effect.Effect<void>
  readonly treeState: (rootJobId: string) => Effect.Effect<{
    readonly reservedAtomic: bigint
    readonly committedAtomic: bigint
    readonly children: ReadonlyArray<TreeRow>
  }>
```

Implement in `makeStore` (Ref.modify makes the check-and-insert atomic within the process):

```ts
  reserveTree: (rootJobId, childJobId, amountAtomic, ceilingAtomic) =>
    Ref.modify(ref, (s) => {
      const rows = s.trees.get(rootJobId) ?? []
      const held = rows.filter((r) => r.state !== "released").reduce((n, r) => n + r.amountAtomic, 0n)
      if (held + amountAtomic > ceilingAtomic) return [false, s]
      const trees = new Map(s.trees)
      trees.set(rootJobId, [...rows, { childJobId, amountAtomic, state: "reserved" }])
      return [true, { ...s, trees }]
    }),

  commitTree: (childJobId) => Ref.update(ref, (s) => setTreeState(s, childJobId, "committed")),
  releaseTree: (childJobId) => Ref.update(ref, (s) => setTreeState(s, childJobId, "released")),

  treeState: (rootJobId) =>
    Effect.map(Ref.get(ref), (s) => {
      const rows = s.trees.get(rootJobId) ?? []
      const sum = (st: TreeRow["state"]) => rows.filter((r) => r.state === st).reduce((n, r) => n + r.amountAtomic, 0n)
      return { reservedAtomic: sum("reserved"), committedAtomic: sum("committed"), children: rows }
    })
```

with the helper above `makeStore`:

```ts
const setTreeState = (s: StoreState, childJobId: string, state: TreeRow["state"]): StoreState => {
  const trees = new Map(s.trees)
  for (const [root, rows] of trees) {
    if (rows.some((r) => r.childJobId === childJobId)) {
      trees.set(root, rows.map((r) => (r.childJobId === childJobId ? { ...r, state } : r)))
    }
  }
  return { ...s, trees }
}
```

Update `emptyState()` in `store-sqlite.ts` and the `initial` object to include `trees`.

- [ ] **Step 4: Run the in-memory test**

Run: `bunx vitest run apps/hub/test/tree-ledger.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing SQLite durability test**

```ts
// apps/hub/test/tree-ledger-sqlite.bun.test.ts
import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import { openSqliteStore } from "../src/store-sqlite.ts"

describe("tree ledger survives restart", () => {
  it("re-reads reserved and committed rows", async () => {
    const path = `${process.env["TMPDIR"] ?? "/tmp"}/arcade-tree-${process.pid}-${Date.now()}.db`
    const a = openSqliteStore(path, "boot_a")
    await Effect.runPromise(a.store.reserveTree("job_root", "job_c1", 60_000n, 100_000n))
    await Effect.runPromise(a.store.commitTree("job_c1"))
    await Effect.runPromise(a.store.reserveTree("job_root", "job_c2", 30_000n, 100_000n))
    a.close()
    const b = openSqliteStore(path, "boot_b")
    const st = await Effect.runPromise(b.store.treeState("job_root"))
    expect(st.committedAtomic).toBe(60_000n)
    expect(st.reservedAtomic).toBe(30_000n)
    b.close()
  })
})
```

- [ ] **Step 6: Run to verify failure**

Run: `bun test apps/hub/test/tree-ledger-sqlite.bun.test.ts`
Expected: FAIL — rows not persisted.

- [ ] **Step 7: Persist in `store-sqlite.ts`**

Append to `SCHEMA`:

```sql
CREATE TABLE IF NOT EXISTS tree_reservations (
  child_job_id TEXT PRIMARY KEY,
  root_job_id TEXT NOT NULL,
  amount_atomic TEXT NOT NULL,
  state TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tree_root ON tree_reservations(root_job_id);
```

Load at open (after `ratings`):

```ts
  const trees = new Map<string, Array<TreeRow>>()
  for (const row of db.query<{ child_job_id: string; root_job_id: string; amount_atomic: string; state: TreeRow["state"] }, []>(`SELECT * FROM tree_reservations`).all()) {
    const rows = trees.get(row.root_job_id) ?? []
    rows.push({ childJobId: row.child_job_id, amountAtomic: BigInt(row.amount_atomic), state: row.state })
    trees.set(row.root_job_id, rows)
  }
```

(import `TreeRow` from `./store.ts`; add `trees` to `initial`). Statements and wrappers:

```ts
  const upsertTree = db.query(
    `INSERT INTO tree_reservations (child_job_id, root_job_id, amount_atomic, state) VALUES (?, ?, ?, ?)
     ON CONFLICT(child_job_id) DO UPDATE SET state = excluded.state`
  )
  const setTreeStateStmt = db.query(`UPDATE tree_reservations SET state = ? WHERE child_job_id = ?`)
```

and in `store`:

```ts
    reserveTree: (root, child, amount, ceiling) =>
      Effect.tap(inner.reserveTree(root, child, amount, ceiling), (ok) =>
        Effect.sync(() => { if (ok) upsertTree.run(child, root, amount.toString(), "reserved") })
      ),
    commitTree: (child) => Effect.tap(inner.commitTree(child), () => Effect.sync(() => setTreeStateStmt.run("committed", child))),
    releaseTree: (child) => Effect.tap(inner.releaseTree(child), () => Effect.sync(() => setTreeStateStmt.run("released", child))),
```

Wrap the `reserveTree` body in `db.transaction(...)` only if `Ref.modify` is not sufficient for your runtime; the in-memory `Ref.modify` is the serialization point for one process, and the row write follows it.

- [ ] **Step 8: Run both tests and the store suite**

Run: `bun test apps/hub/test/tree-ledger-sqlite.bun.test.ts && bunx vitest run apps/hub/test/tree-ledger.test.ts apps/hub/test/store.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/hub/src/store.ts apps/hub/src/store-sqlite.ts apps/hub/test/tree-ledger.test.ts apps/hub/test/tree-ledger-sqlite.bun.test.ts
git commit -m "feat(hub): transactional tree reservation ledger, durable in sqlite"
```

---

### Task 5: Hub lineage derivation and refusals at the paid endpoint

**Merge notes — the canonical order of checks in the paid branch.** Four plans insert a check
into the same `if (callMatch !== null && req.method === "POST")` block of
`apps/hub/src/server.ts`. This is the one sequence all four are written against; a plan that
disagrees with it is wrong, not the sequence. Landing order for the file is
**A → C → D → E → F → H → G** (D, E, G and H edit other routes in the same file, not this
branch; E's name resolution is buyer-side only and adds nothing here).

1. **Input gate (A, Task 1)** — parse the body, `400 input_invalid` if it does not satisfy
   `listing.inputSchema`. Nothing below runs on a body the seller could not have served.
2. **Delisted check (C, Task 6)** — `403 listing_delisted` when the listing failed three
   consecutive pay-tests, exempting the canary's own address. The payer for that exemption is
   read from the *claimed* `from` in the payment header (`decodeHeaderJson`, `:791-796`),
   before verification: a forged `from` buys nothing but a 402 one line later, and no money
   moves either way. Plan C's Task 6 carries this position and the amended `delistRefusal`
   call site.
3. **Session header (F, Task 8)** — `x-arcade-session`; resolve the session and pick
   `callRail`. Refusals `409 session_rail_unavailable`, `404 session_not_found`,
   `409 session_closed`. Absent header ⇒ nothing changes and the default rail is used.
4. **Lineage (A, this task)** — `resolveLineage` on `x-arcade-hire-capability`; refusals
   `402 lineage_invalid | lineage_cycle | lineage_depth`.
5. **402 challenge / verify** — `callRail.challenge` when no payment header, then
   `callRail.verify`. Every rail call in this branch goes through `callRail`, not `rail`,
   once F has landed.
6. **Reservation** — the tree reservation against the root's `maxSubSpendUsd`
   (`402 tree_budget_exceeded`, A) and, when a session is present, the session budget
   reservation (`403 session_buyer_mismatch`, `402 session_budget_exceeded`, F). Both happen
   after verification and before a job exists, so a refusal never broadcasts.
7. **Job** — `store.putJob(...)`, mint `hireCapability`, `runJob({...})`.

**Files:**
- Create: `apps/hub/src/lineage.ts`
- Modify: `apps/hub/src/server.ts` (paid branch), `apps/hub/src/broker.ts:38-45,119-148`, `apps/hub/src/pipeline.ts` (`RunJobArgs`)
- Test: `apps/hub/test/lineage.test.ts`

**Interfaces:**
- Produces:
  - `resolveLineage(store, secret, header: string | null, listing: {id}, nowMs, maxHop): Effect<Lineage, LineageInvalid | LineageCycle | LineageDepth>` — null header → `ROOT_LINEAGE` placeholder (rootJobId filled after the job id is minted).
  - HTTP refusals: `402 {error: "lineage_invalid"|"lineage_cycle"|"lineage_depth"|"tree_budget_exceeded", detail}` (402 because the caller may retry as a root buy; the paid path is the surface the client is on).
  - `Broker.dispatch` args gain `parentJobId?`, `hireCapability?`; `JobAssignment` carries them.
  - `RunJobArgs` gains `lineage: Lineage`, `hireCapability?: string`.
  - The hub mints `hireCapability` for a job when `listing.bounds.maxSubSpendUsd > 0` (proxy for "may hire"; the runner still gates on the private `hire-skills` capability), expiry = `timeoutSec + 60s`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/hub/test/lineage.test.ts
import { describe, expect, it } from "vitest"
import { Effect, Layer } from "effect"
import { Job, mintHireCapability } from "@arcade/core"
import { StoreLive, StoreTag } from "../src/store.ts"
import { resolveLineage } from "../src/lineage.ts"

const SECRET = "s"
const parent = Job.make({
  id: "job_parent0000000000", skillId: "counterparty-brief", seller: "0xs", buyer: "0xb", priceAtomic: 250_000n,
  input: {}, status: "running", createdAtMs: 1, rootJobId: "job_parent0000000000", hop: 0, ancestors: []
})
const withParent = (eff: Effect.Effect<unknown, unknown, StoreTag>) =>
  Effect.runPromise(Effect.provide(Effect.gen(function* () {
    const s = yield* StoreTag
    yield* s.putJob(parent)
    return yield* Effect.either(eff)
  }), StoreLive))

describe("resolveLineage", () => {
  it("no header → root", async () => {
    const r = await withParent(Effect.flatMap(StoreTag, (s) => resolveLineage(s, SECRET, null, { id: "x" }, Date.now(), 3)))
    expect(r).toMatchObject({ _tag: "Right", right: { hop: 0, ancestors: [] } })
  })
  it("valid capability → child of the parent", async () => {
    const cap = mintHireCapability(SECRET, parent.id, Date.now() + 60_000)
    const r = await withParent(Effect.flatMap(StoreTag, (s) => resolveLineage(s, SECRET, cap, { id: "usdc-flow-check" }, Date.now(), 3)))
    expect(r).toMatchObject({ _tag: "Right", right: { rootJobId: parent.id, parentJobId: parent.id, hop: 1, ancestors: ["counterparty-brief"] } })
  })
  it("cycle refused", async () => {
    const cap = mintHireCapability(SECRET, parent.id, Date.now() + 60_000)
    const r = await withParent(Effect.flatMap(StoreTag, (s) => resolveLineage(s, SECRET, cap, { id: "counterparty-brief" }, Date.now(), 3)))
    expect(r).toMatchObject({ _tag: "Left", left: { _tag: "LineageCycle" } })
  })
  it("depth refused", async () => {
    const cap = mintHireCapability(SECRET, parent.id, Date.now() + 60_000)
    const r = await withParent(Effect.flatMap(StoreTag, (s) => resolveLineage(s, SECRET, cap, { id: "usdc-flow-check" }, Date.now(), 0)))
    expect(r).toMatchObject({ _tag: "Left", left: { _tag: "LineageDepth" } })
  })
  it("forged capability refused", async () => {
    const cap = mintHireCapability("other", parent.id, Date.now() + 60_000)
    const r = await withParent(Effect.flatMap(StoreTag, (s) => resolveLineage(s, SECRET, cap, { id: "usdc-flow-check" }, Date.now(), 3)))
    expect(r).toMatchObject({ _tag: "Left", left: { _tag: "LineageInvalid" } })
  })
  it("finished parent refused", async () => {
    const cap = mintHireCapability(SECRET, parent.id, Date.now() + 60_000)
    const r = await Effect.runPromise(Effect.provide(Effect.gen(function* () {
      const s = yield* StoreTag
      yield* s.putJob(Job.make({ ...parent, status: "succeeded" }))
      return yield* Effect.either(resolveLineage(s, SECRET, cap, { id: "usdc-flow-check" }, Date.now(), 3))
    }), StoreLive))
    expect(r).toMatchObject({ _tag: "Left", left: { _tag: "LineageInvalid" } })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run apps/hub/test/lineage.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `apps/hub/src/lineage.ts`**

```ts
import { Effect } from "effect"
import {
  Lineage, LineageCycle, LineageDepth, LineageInvalid, ROOT_LINEAGE, childLineage, verifyHireCapability
} from "@arcade/core"
import type { Store } from "./store.ts"

/**
 * The hub derives lineage; the client only names its parent through a capability the hub
 * minted. Everything a forged header could claim is recomputed from persisted jobs.
 */
export const resolveLineage = (
  store: Store,
  secret: string,
  header: string | null,
  listing: { readonly id: string },
  nowMs: number,
  maxHop: number
): Effect.Effect<Lineage, LineageInvalid | LineageCycle | LineageDepth> =>
  Effect.gen(function* () {
    if (header === null) return ROOT_LINEAGE("") // rootJobId is filled once the job id exists
    const v = verifyHireCapability(secret, header, nowMs)
    if (v instanceof LineageInvalid) return yield* v
    const parent = yield* store.getJob(v.parentJobId)
    if (parent === undefined) return yield* new LineageInvalid({ reason: "unknown parent job" })
    if (parent.status !== "running" && parent.status !== "queued") {
      return yield* new LineageInvalid({ reason: `parent job is ${parent.status}` })
    }
    const lineage = childLineage(
      { rootJobId: parent.rootJobId ?? parent.id, hop: parent.hop ?? 0, ancestors: parent.ancestors ?? [], skillId: parent.skillId },
      parent.id
    )
    if (lineage.ancestors.includes(listing.id)) return yield* new LineageCycle({ skillId: listing.id })
    if (lineage.hop > maxHop) return yield* new LineageDepth({ hop: lineage.hop, max: maxHop })
    return lineage
  })
```

- [ ] **Step 4: Run the test**

Run: `bunx vitest run apps/hub/test/lineage.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Wire the paid endpoint**

In `apps/hub/src/server.ts` paid branch, after the input gate (Task 1) and before the `header === null` 402 challenge, add:

```ts
        const maxHop = Number(process.env["ARCADE_MAX_HOP"] ?? DEFAULT_MAX_HOP)
        const lineageE = await run(
          resolveLineage(store, hubSecret, req.headers.get(HIRE_CAPABILITY_HEADER), listing, Date.now(), maxHop).pipe(Effect.either)
        )
        if (lineageE._tag === "Left") {
          const e = lineageE.left
          const code = e._tag === "LineageCycle" ? "lineage_cycle" : e._tag === "LineageDepth" ? "lineage_depth" : "lineage_invalid"
          return json({ error: code, detail: e._tag === "LineageInvalid" ? e.reason : e._tag === "LineageCycle" ? `${e.skillId} is already in this call tree` : `hop ${e.hop} exceeds max ${e.max}` }, 402)
        }
        const lineage0 = lineageE.right
```

After `rail.verify` succeeds and `jobId` is minted, replace the `store.putJob(Job.make({...}))` call with one that includes lineage, and reserve the tree budget for children:

```ts
        const lineage = lineage0.hop === 0 ? ROOT_LINEAGE(jobId) : lineage0
        if (lineage.hop > 0) {
          const root = await run(store.getJob(lineage.rootJobId))
          const rootListing = root === undefined ? undefined : await run(store.getListing(root.skillId).pipe(Effect.either))
          const ceiling = rootListing !== undefined && rootListing._tag === "Right" && rootListing.right.listing.bounds.maxSubSpendUsd !== undefined
            ? parsePrice(String(rootListing.right.listing.bounds.maxSubSpendUsd))
            : 0n
          const ok = await run(store.reserveTree(lineage.rootJobId, jobId, priceAtomic, ceiling))
          if (!ok) {
            return json({ error: "tree_budget_exceeded", detail: `this call tree's ceiling is ${formatPrice(ceiling)}` }, 402)
          }
        }
        await run(store.putJob(Job.make({ id: jobId, skillId: listing.id, seller, buyer: verified.payer, priceAtomic, input, status: "queued", createdAtMs: Date.now(), rootJobId: lineage.rootJobId, ...(lineage.parentJobId === undefined ? {} : { parentJobId: lineage.parentJobId }), hop: lineage.hop, ancestors: lineage.ancestors })))
        const mayHire = (listing.bounds.maxSubSpendUsd ?? 0) > 0
        const hireCapability = mayHire ? mintHireCapability(hubSecret, jobId, Date.now() + (listing.bounds.timeoutSec + 60) * 1000) : undefined
```

and pass `lineage` and `hireCapability` into `runJob({...})`. Import `DEFAULT_MAX_HOP, HIRE_CAPABILITY_HEADER, ROOT_LINEAGE, mintHireCapability` from `@arcade/core` and `resolveLineage` from `./lineage.ts`. Note the reservation happens at the paid retry (the branch with a payment header), never on the probe, because the code above the challenge returns early for `header === null`; move the reservation below the `header === null` return so probes never reserve.

- [ ] **Step 6: Carry the capability through broker and pipeline**

`apps/hub/src/broker.ts`: extend the `dispatch` args type with `readonly parentJobId?: string; readonly hireCapability?: string` and include both in the `conn.send({... _tag: "JobAssignment" ...})` object (omit when undefined).

`apps/hub/src/pipeline.ts`: extend `RunJobArgs` with `readonly lineage: Lineage; readonly hireCapability?: string`; pass `parentJobId: args.lineage.parentJobId, hireCapability: args.hireCapability` into `broker.dispatch`; include the lineage fields in both `Job.make` calls in `finish` and in `Receipt.make` (`rootJobId`, `parentJobId`, `hop`, `ancestors`). Update `apps/hub/test/pipeline.test.ts` `setup()` to pass `lineage: ROOT_LINEAGE("job_testtesttesttest01")`.

- [ ] **Step 7: Run the hub suites and typecheck**

Run: `bunx vitest run apps/hub && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/hub/src/lineage.ts apps/hub/src/server.ts apps/hub/src/broker.ts apps/hub/src/pipeline.ts apps/hub/test/lineage.test.ts apps/hub/test/pipeline.test.ts
git commit -m "feat(hub): derive lineage from hub-issued capability; refuse cycles, depth and over-budget hires"
```

---

### Task 6: Ledger commit/release and the receipt tree in the pipeline

**Merge notes.** `apps/hub/src/pipeline.ts` is edited by **A** (this task: lineage on `RunJobArgs`, commit/release, the receipt tree), **C** (`RunJobArgs.canary` → `Receipt.canary`), **D** (`RunJobArgs.attest`, the queue hand-off *after* `store.putReceipt`) and **F** (`RunJobArgs.rail`/`sessionId`, session commit/release). Land A → C → D → F. All three later plans add one optional field to `RunJobArgs` and one guarded block inside `finish`; the ordering rule inside `finish` is: build the tree → `shouldSettle` → `rail.settle(verified, tree)` → `store.putReceipt(receipt)` → **then** the best-effort side effects (D's attest hand-off, F's session commit). Nothing after `putReceipt` may change a settlement outcome. `apps/hub/src/ui.ts` is edited by A (child rows), C (pay-test line, `canary` mark), D (identity evidence) and F (session refs) — four separate render helpers, same land order.

**Files:**
- Modify: `apps/hub/src/pipeline.ts`, `apps/hub/src/server.ts` (`/jobs/:id/result`), `apps/hub/src/ui.ts` (child rows)
- Test: `apps/hub/test/pipeline-tree.test.ts`

**Interfaces:**
- Produces: on a child's terminal receipt the hub calls `commitTree(childJobId)` when settled, else `releaseTree`; on a root's terminal receipt it builds `children[]` from `treeState(rootJobId)` + child receipts, sets `treeHash = treeHashOf(rootJobId, children)`, `treeCeilingAtomic`, `treeCommittedAtomic`; `GET /jobs/:id/result` returns `receipt.children` and `receipt.treeHash`; `ReceiptTree` JSON for the UI.

- [ ] **Step 1: Write the failing test**

```ts
// apps/hub/test/pipeline-tree.test.ts
import { describe, expect, it } from "vitest"
import { Effect, Layer, Ref } from "effect"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import { Bounds, JobOutcome, PublicListing, ROOT_LINEAGE, childLineage, parsePrice, treeHashOf } from "@arcade/core"
import { PaymentPayload, RailTag, makeTestRail, makeTestState, signAuthorization } from "@arcade/payments"
import { BrokerTag, type Broker } from "../src/broker.ts"
import { StoreLive, StoreTag } from "../src/store.ts"
import { runJob } from "../src/pipeline.ts"

const buyer = privateKeyToAccount(generatePrivateKey())
const SELLER = "0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF"
const root = PublicListing.make({ id: "parent", version: "1.0.0", serviceName: "P", description: "d", tags: [], price: "$0.25", bounds: Bounds.make({ timeoutSec: 5, maxSubSpendUsd: 0.05 }), inputSchema: { type: "object" }, outputSchema: { type: "object", required: ["ok"] } })
const child = PublicListing.make({ ...root, id: "child", price: "$0.01", bounds: Bounds.make({ timeoutSec: 5 }) })
const ok = JobOutcome.make({ status: "succeeded", stopReason: "end_turn", output: { ok: true }, startedAtMs: 0, finishedAtMs: 1 })
const stub = (o: JobOutcome): Broker => ({ register: () => Effect.void, unregister: () => Effect.void, dispatch: () => Effect.succeed(o), complete: () => Effect.void, runnerFor: () => Effect.succeed("r"), runnerForJob: () => Effect.succeed("r") })

const verifiedFor = async (rail: ReturnType<typeof makeTestRail>, price: bigint) => {
  const signed = await Effect.runPromise(signAuthorization({ account: buyer, to: SELLER, valueAtomic: price }))
  const req = await Effect.runPromise(rail.challenge({ priceAtomic: price, resource: "/x", payTo: SELLER }))
  const { signature, ...authorization } = signed
  return Effect.runPromise(rail.verify(PaymentPayload.make({ x402Version: 2, payload: { authorization, signature }, accepted: req }), req))
}

describe("receipt tree", () => {
  it("root receipt lists the settled child and commits the tree hash", async () => {
    const stateRef = Effect.runSync(Ref.make(makeTestState({ [buyer.address]: 10_000_000n })))
    const rail = makeTestRail(stateRef)
    const layer = Layer.mergeAll(StoreLive, Layer.succeed(RailTag, rail), Layer.succeed(BrokerTag, stub(ok)))
    const out = await Effect.runPromise(Effect.provide(Effect.gen(function* () {
      const store = yield* StoreTag
      const rootId = "job_root000000000000", childId = "job_child00000000000"
      const rootLineage = ROOT_LINEAGE(rootId)
      yield* store.reserveTree(rootId, childId, parsePrice("$0.01"), parsePrice("$0.05"))
      const c = yield* runJob({ jobId: childId, listing: child, seller: SELLER, input: {}, verified: yield* Effect.promise(() => verifiedFor(rail, parsePrice("$0.01"))), lineage: childLineage({ ...rootLineage, skillId: "parent" }, rootId) })
      const r = yield* runJob({ jobId: rootId, listing: root, seller: SELLER, input: {}, verified: yield* Effect.promise(() => verifiedFor(rail, parsePrice("$0.25"))), lineage: rootLineage })
      const st = yield* store.treeState(rootId)
      return { c, r, st }
    }), layer))
    expect(out.c.receipt.settled).toBe(true)
    expect(out.st.committedAtomic).toBe(10_000n)
    expect(out.r.receipt.children?.[0]).toMatchObject({ jobId: "job_child00000000000", settled: true })
    expect(out.r.receipt.treeHash).toBe(treeHashOf("job_root000000000000", out.r.receipt.children!))
    expect(out.r.receipt.treeCommittedAtomic).toBe(10_000n)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run apps/hub/test/pipeline-tree.test.ts`
Expected: FAIL — `children` undefined.

- [ ] **Step 3: Implement in `pipeline.ts`**

Inside `finish`, before building the receipt:

```ts
        // Ledger: a child's outcome commits or releases its reservation; a root's outcome
        // closes the tree and computes the commitment the splitter will carry on chain.
        if (args.lineage.hop > 0) {
          yield* settled ? store.commitTree(args.jobId) : store.releaseTree(args.jobId)
        }
        let tree: { children: ReadonlyArray<ReceiptChild>; treeHash: `0x${string}`; ceiling: bigint; committed: bigint } | undefined
        if (args.lineage.hop === 0) {
          const st = yield* store.treeState(args.jobId)
          const receipts = yield* store.allReceipts
          const children = st.children.filter((c) => c.state !== "released").map((c) => {
            const cr = receipts.find((r) => r.jobId === c.childJobId)
            return ReceiptChild.make({ jobId: c.childJobId, skillId: cr?.skillId ?? "", priceAtomic: c.amountAtomic, settled: cr?.settled ?? false, ...(cr?.settleTx === undefined ? {} : { settleTx: cr.settleTx }) })
          })
          const ceiling = args.listing.bounds.maxSubSpendUsd === undefined ? 0n : parsePrice(String(args.listing.bounds.maxSubSpendUsd))
          tree = { children, treeHash: treeHashOf(args.jobId, children), ceiling, committed: st.committedAtomic }
        }
```

and spread into `Receipt.make`: `...(tree === undefined ? {} : { children: tree.children, treeHash: tree.treeHash, treeCeilingAtomic: tree.ceiling, treeCommittedAtomic: tree.committed })`, plus `authorizationNonce: args.verified.payload.payload.authorization.nonce`. Import `ReceiptChild, treeHashOf` from `@arcade/core`.

The tree must be computed **before** settlement so the hash can be passed to the rail (Task 7): compute `tree` once before the `shouldSettle` decision (children are terminal by then because the parent's sandbox awaited each hire), store it in a local, and reuse it in `finish`.

- [ ] **Step 4: Expose it on `/jobs/:id/result` and the UI**

`/jobs/:id/result` already spreads `...receipt`; ensure bigint fields are stringified: add `treeCeilingAtomic: receipt.treeCeilingAtomic?.toString(), treeCommittedAtomic: receipt.treeCommittedAtomic?.toString(), children: receipt.children?.map((c) => ({ ...c, priceAtomic: c.priceAtomic.toString(), explorer: c.settleTx === undefined ? null : explorerTxUrl(c.settleTx) }))`. In `apps/hub/src/ui.ts` `renderReceiptRows`, render each child as an indented row `↳ <skillId> · <price> · <settled ? tx link : reason>` under its parent.

- [ ] **Step 5: Run tests and typecheck**

Run: `bunx vitest run apps/hub && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/hub/src/pipeline.ts apps/hub/src/server.ts apps/hub/src/ui.ts apps/hub/test/pipeline-tree.test.ts
git commit -m "feat(hub): commit/release tree reservations and publish the receipt tree"
```

---

### Task 7: FeeSplitter v2 with `settleWithTree`

**Merge notes.** `packages/payments/src/rail.ts`, `eip3009.ts` and `gateway.ts` are also edited by **F** (Task 3 hardens `GatewayLive`, Task 3 adds `SettledPayment.settlementKind`). A lands first: F rebases onto the widened `Rail.settle(verified, tree?)` signature and keeps `gateway.ts` *accepting and ignoring* the `tree` argument, exactly as Step 5 below specifies. The `SettledTree` event signature written here — `SettledTree(address indexed buyer, uint256 total, uint256 sellerAmount, uint256 feeAmount, bytes32 indexed nonce, bytes32 indexed treeHash, uint32 childCount, uint256 childTotalAtomic)` — is copied verbatim into Plan G's `subgraph/abis/FeeSplitterV2.json`; changing the field order here means changing it there in the same week, so do not reorder it after Sept 7.

**Files:**
- Create: `contracts/FeeSplitterV2.sol`, `contracts/test/FeeSplitterV2.t.sol`
- Modify: `packages/payments/src/rail.ts` (settle signature), `packages/payments/src/eip3009.ts` (ABI + branch), `packages/payments/src/test-rail.ts`, `packages/payments/src/gateway.ts` (accept and ignore the tree arg), `scripts/deploy-splitter.ts`, `apps/hub/src/splitter.ts` (detect v2 via `settleWithTree` selector), `apps/hub/src/pipeline.ts` (pass tree)
- Test: Foundry test; `packages/payments/test/rail.conformance.test.ts` (tree arg accepted by all rails)

**Interfaces:**
- Produces: `Rail.settle(verified: VerifiedPayment, tree?: {treeHash: \`0x${string}\`; childCount: number; childTotalAtomic: bigint}): Effect<SettledPayment, SettleError>`; `FEE_SPLITTER_V2_ABI` with `settleWithTree(address from, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s, bytes32 treeHash, uint32 childCount, uint256 childTotalAtomic)` and event `SettledTree(address indexed buyer, uint256 total, uint256 sellerAmount, uint256 feeAmount, bytes32 indexed nonce, bytes32 indexed treeHash, uint32 childCount, uint256 childTotalAtomic)`; `ListingRecord.splitterVersion?: 1 | 2`.

- [ ] **Step 1: Write the failing Foundry test**

```solidity
// contracts/test/FeeSplitterV2.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "forge-std/Test.sol";
import {FeeSplitterV2} from "../FeeSplitterV2.sol";
import {MockUSDC} from "./FeeSplitter.t.sol"; // reuse the existing mock token from the v1 test

contract FeeSplitterV2Test is Test {
    MockUSDC usdc; FeeSplitterV2 s; address seller = address(0xBEEF); address treasury = address(0xCAFE);
    uint256 buyerKey = 0xA11CE; address buyer;
    function setUp() public { usdc = new MockUSDC(); s = new FeeSplitterV2(address(usdc), seller, treasury, 500); buyer = vm.addr(buyerKey); usdc.mint(buyer, 1_000_000); }
    function _auth(uint256 value, bytes32 nonce) internal view returns (uint8 v, bytes32 r, bytes32 sg) {
        bytes32 digest = usdc.transferDigest(buyer, address(s), value, 0, type(uint256).max, nonce);
        (v, r, sg) = vm.sign(buyerKey, digest);
    }
    function testSettleWithTreeEmitsCommitment() public {
        bytes32 nonce = keccak256("n1"); bytes32 tree = keccak256("tree");
        (uint8 v, bytes32 r, bytes32 sg) = _auth(250_000, nonce);
        vm.expectEmit(true, true, true, true);
        emit FeeSplitterV2.SettledTree(buyer, 250_000, 237_500, 12_500, nonce, tree, 1, 10_000);
        s.settleWithTree(buyer, 250_000, 0, type(uint256).max, nonce, v, r, sg, tree, 1, 10_000);
        assertEq(usdc.balanceOf(seller), 237_500);
        assertEq(s.accruedFees(), 12_500);
    }
    function testPlainSettleStillWorks() public {
        bytes32 nonce = keccak256("n2");
        (uint8 v, bytes32 r, bytes32 sg) = _auth(10_000, nonce);
        s.settle(buyer, 10_000, 0, type(uint256).max, nonce, v, r, sg);
        assertEq(usdc.balanceOf(seller), 9_500);
    }
    function testNonceReuseReverts() public {
        bytes32 nonce = keccak256("n3"); bytes32 tree = keccak256("t");
        (uint8 v, bytes32 r, bytes32 sg) = _auth(10_000, nonce);
        s.settleWithTree(buyer, 10_000, 0, type(uint256).max, nonce, v, r, sg, tree, 0, 0);
        vm.expectRevert();
        s.settleWithTree(buyer, 10_000, 0, type(uint256).max, nonce, v, r, sg, tree, 0, 0);
    }
}
```

Check `contracts/test/FeeSplitter.t.sol` for the actual name of its mock token and its digest helper and adjust the two identifiers above to match (the v1 test already signs authorizations against a mock; reuse it rather than writing a second mock).

- [ ] **Step 2: Run to verify failure**

Run: `forge test --match-contract FeeSplitterV2Test`
Expected: FAIL to compile — `FeeSplitterV2` missing.

- [ ] **Step 3: Write `contracts/FeeSplitterV2.sol`**

Copy `contracts/FeeSplitter.sol` to `contracts/FeeSplitterV2.sol`, rename the contract to `FeeSplitterV2`, keep every existing function and event, and add:

```solidity
    /// @notice Same as `settle`, plus a commitment to the receipt tree the hub settled under
    ///         this authorization. Child hops were paid from the hiring seller's own wallet;
    ///         this records their existence and total so a later receipt cannot omit one.
    event SettledTree(
        address indexed buyer, uint256 total, uint256 sellerAmount, uint256 feeAmount,
        bytes32 indexed nonce, bytes32 indexed treeHash, uint32 childCount, uint256 childTotalAtomic
    );

    function settleWithTree(
        address from, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce,
        uint8 v, bytes32 r, bytes32 s_, bytes32 treeHash, uint32 childCount, uint256 childTotalAtomic
    ) external nonReentrant {
        (uint256 sellerAmount, uint256 feeAmount) = _settle(from, value, validAfter, validBefore, nonce, v, r, s_);
        emit SettledTree(from, value, sellerAmount, feeAmount, nonce, treeHash, childCount, childTotalAtomic);
    }
```

Refactor the body of `settle` into `function _settle(...) internal returns (uint256 sellerAmount, uint256 feeAmount)` that does the pull, the balance guard, the fee math, `accruedFees += feeAmount`, the seller transfer, and returns the amounts; `settle` calls `_settle` and emits the existing `Settled` event. Add `/// @custom:version 2` to the contract NatSpec so the hub can distinguish it, and a `function version() external pure returns (uint8) { return 2; }`.

- [ ] **Step 4: Run Foundry tests**

Run: `forge test`
Expected: PASS (v1 and v2 suites).

- [ ] **Step 5: Extend the Rail interface and the EIP-3009 rail**

`packages/payments/src/rail.ts`:

```ts
export interface SettleTree {
  readonly treeHash: `0x${string}`
  readonly childCount: number
  readonly childTotalAtomic: bigint
}
// in Rail:
  readonly settle: (verified: VerifiedPayment, tree?: SettleTree) => Effect.Effect<SettledPayment, SettleError>
```

`packages/payments/src/eip3009.ts`: add `FEE_SPLITTER_V2_ABI` (the `settleWithTree` function and `version()` view), and in `settle`, when `useSplitter && tree !== undefined && verified.requirements.extra?.["feeSplitterVersion"] === 2`, encode `settleWithTree` with the extra three args; otherwise the existing paths. `challenge` copies `feeSplitterVersion` into `extra` when the `ChallengeInput` carries it (add `feeSplitterVersion?: 1 | 2` to `ChallengeInput`). `test-rail.ts` and `gateway.ts` accept and ignore `tree`. `apps/hub/src/splitter.ts`: when verifying the announced splitter, also `readContract version()` and record `splitterVersion` on `ListingRecord` (1 if the call reverts). `server.ts` passes `feeSplitterVersion` into `rail.challenge`. `pipeline.ts` passes `tree` (from Task 6) into `rail.settle` for roots.

- [ ] **Step 6: Update the conformance suite and deploy script**

In `packages/payments/test/rail.conformance.test.ts` add one case per rail: `settle(verified, {treeHash: "0x" + "11".repeat(32), childCount: 0, childTotalAtomic: 0n})` succeeds. In `scripts/deploy-splitter.ts` add a `--v2` flag that deploys `FeeSplitterV2` (compile with `forge build`, read the artifact from `out/FeeSplitterV2.sol/FeeSplitterV2.json`).

- [ ] **Step 7: Run everything**

Run: `forge test && bunx vitest run packages/payments apps/hub && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Deploy v2 to Arc testnet and record it**

Run: `bun run scripts/deploy-splitter.ts --v2` (facilitator key from env as the existing script expects). Record the address in `docs/runbook.md` next to the v1 address and set `ARCADE_FEE_SPLITTER` for the demo runner to the v2 address.

- [ ] **Step 9: Commit**

```bash
git add contracts/FeeSplitterV2.sol contracts/test/FeeSplitterV2.t.sol packages/payments/src scripts/deploy-splitter.ts apps/hub/src/splitter.ts apps/hub/src/pipeline.ts apps/hub/src/server.ts packages/payments/test/rail.conformance.test.ts docs/runbook.md
git commit -m "feat(contracts,payments): FeeSplitterV2 settleWithTree commits the receipt tree on chain"
```

---

### Task 8: Runner and buyer forward the capability

**Merge notes.** `packages/buyer/src/fetch-with-payment.ts` is edited by **A** (`PayFetchOptions.lineage`, this task), **E** (`PayFetchOptions.beforeSign`, its Task 9) and **F** (session header, its Task 9); `packages/buyer/src/index.ts` by A, E and F; `packages/runner/src/hire-broker.ts` by A (`PurchaseArgs.lineage`) and E (`PurchaseArgs.name`); `packages/runner/src/daemon.ts` by A, D (`Hello.agents`) and E (the ENS liveness ticker). Land A → D → E → F. Each adds an optional field to the same options object and one line at a different point in the request path, so the rebases are additive — but note the ordering *inside* `fetchWithPayment`: A's `lineage` header is set on both the probe and the retry, E's `beforeSign` refusal runs immediately above `signAuthorization`, and F's session header is set beside A's. E's refusal is last because it is the final gate before a signature exists.

**Files:**
- Modify: `packages/runner/src/daemon.ts:217-226`, `packages/runner/src/hire-broker.ts` (`HireBroker.openJob`, `PurchaseArgs`, `defaultPurchase`), `packages/buyer/src/fetch-with-payment.ts`, `packages/buyer/src/index.ts`
- Test: `packages/runner/test/hire-broker.test.ts` (new cases), `packages/buyer/test/fetch-with-payment.test.ts` (new case)

**Interfaces:**
- Produces: `HireBroker.openJob(jobId, budgetUsd, hireCapability?: string)`; `PurchaseArgs.lineage?: string`; `PayFetchOptions.lineage?: string` → header `x-arcade-hire-capability` on probe and paid retry; `CallSkillArgs.lineage?: string`.

- [ ] **Step 1: Write the failing broker test**

Add to `packages/runner/test/hire-broker.test.ts`:

```ts
  it("forwards the hub capability to the purchase", async () => {
    let seen: string | undefined
    const purchase: PurchaseFn = async (args) => { seen = args.lineage; return { jobId: "job_sub", settled: true, result: {}, fenced: "", paidAtomic: 0n } }
    const b = start(purchase)
    const token = b.openJob("job_p", 1, "cap.abc")
    const res = await call("/hire", { "x-job-id": "job_p", "x-job-token": token }, { skillId: "child", input: {} })
    expect(res.status).toBe(200)
    expect(seen).toBe("cap.abc")
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run packages/runner/test/hire-broker.test.ts`
Expected: FAIL — `openJob` takes two args / `lineage` undefined.

- [ ] **Step 3: Implement**

`hire-broker.ts`: `Ledger` gains `hireCapability?: string`; `openJob: (jobId, budgetUsd, hireCapability?) => string` stores it; `PurchaseArgs` gains `readonly lineage?: string`; the `/hire` handler passes `...(ledger.hireCapability === undefined ? {} : { lineage: ledger.hireCapability })` into `purchase(...)`; `defaultPurchase` forwards `lineage` into `callSkill`.

`daemon.ts`: `token: broker!.openJob(msg.jobId, skill.manifest.bounds.maxSubSpendUsd, msg.hireCapability)`.

`packages/buyer/src/fetch-with-payment.ts`: `PayFetchOptions` gains `readonly lineage?: string`; when set, `headers.set(HIRE_CAPABILITY_HEADER, options.lineage)` on the probe headers (before the probe) and on `retryHeaders`. `packages/buyer/src/index.ts`: `CallSkillArgs.lineage?: string` passed through.

- [ ] **Step 4: Write and run the buyer test**

Add to `packages/buyer/test/fetch-with-payment.test.ts` a case using the existing stubbed `fetch` that asserts both requests carry `x-arcade-hire-capability: cap.abc` when `lineage: "cap.abc"` is passed, and neither carries it when it is not.

Run: `bunx vitest run packages/runner packages/buyer && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/runner/src packages/buyer/src packages/runner/test/hire-broker.test.ts packages/buyer/test/fetch-with-payment.test.ts
git commit -m "feat(runner,buyer): forward the hub hire capability on child purchases"
```

---

### Task 9: Live evidence — two settles, one refusal

**Files:**
- Create: `scripts/e2e-lineage.sh`
- Modify: `skills/wallet-risk-note/arcade.json` (ensure `maxSubSpendUsd`), add a second hiring listing `skills/loop-probe/` (script engine, hires `wallet-risk-note`, used only to demonstrate `lineage_cycle`)

**Cross-plan price resolution (settled here, once).** Plan G Task 14 re-prices
`wallet-risk-note` to `$0.15` and gives it a second hire (`counterparty-graph`, `$0.05`)
alongside `usdc-flow-check` (`$0.02`). The reservation ledger charges **every descendant
against the root's ceiling**, not the immediate parent's, so a `loop-probe` root sees a tree
of `0.15 + 0.05 + 0.02 = $0.22`. The numbers below are sized for that and are the only place
in the repo they are decided: **`loop-probe` price `$0.30`, `maxSubSpendUsd` `0.25`,
`e2e-lineage.sh --max-amount 0.35`.** Plan G asserts these and never edits them. (The review
brief proposed `0.20`; `0.20` is two cents short of the real tree, which would refuse the
third hire with `tree_budget_exceeded` and break the demo, so the ceiling is `0.25`.)

- [ ] **Step 1: OWNER — fund the demo keys from the faucet**

**OWNER.** The three-hop demo spends real testnet USDC from three addresses: the buyer, the
`wallet-risk-note` seller (which pays for its own two hires out of working capital) and the
facilitator (gas). Ask the owner to run the faucet drip for each address that reports a zero
balance, and to confirm before the live run in Step 3:

```bash
curl -s -X POST https://api.circle.com/v1/faucet/drips \
  -H "Authorization: Bearer $(security find-generic-password -s circle-api-key -w)" \
  -H 'content-type: application/json' \
  -d '{"address":"0x…","blockchain":"ARC-TESTNET","usdc":true}'
```

`"native": true` is rejected — USDC *is* native on Arc. Needed **Sat Sept 6**, before Step 3.
See `docs/superpowers/plans/2026-09-04-01-owner-actions.md`.

- [ ] **Step 2: Add the demo listing**

`skills/loop-probe/arcade.json`: price `$0.30`, `bounds: {timeoutSec: 60, maxSubSpendUsd: 0.25}`, `engine: {adapter: "script", entry: "run.ts", capabilities: ["hire-skills"]}`, input `{address}`, output `{ok: boolean, hired: string[]}`. `run.ts` hires `wallet-risk-note` (which hires `usdc-flow-check`, and `counterparty-graph` once Plan G Task 14 has landed) and then attempts to hire `loop-probe` itself, expecting `HireRefused` containing `lineage_cycle`, and reports both in the output.

- [ ] **Step 3: Write the script**

`scripts/e2e-lineage.sh`: starts nothing (assumes hub + runner running per `docs/runbook.md`), runs `bun run arcade-buy loop-probe --input '{"address":"0xAeB742d58cc7F5CF656fCD9Beb07Bf0C1ACa6f5b"}' --max-amount 0.35`, then fetches the poll URL and prints the receipt tree with explorer links, asserting: root settled, two children (one settled `wallet-risk-note`, one child-of-child visible in `wallet-risk-note`'s own receipt), and `hired` includes the cycle refusal text. Exit non-zero on any assertion failure.

- [ ] **Step 4: Run it against the live testnet hub and paste the tx hashes into `docs/runbook.md` under "Evidence: lineage"**

- [ ] **Step 5: Commit**

```bash
git add skills/loop-probe scripts/e2e-lineage.sh docs/runbook.md
git commit -m "test(e2e): live receipt tree with a refused cycle on Arc testnet"
```

---

### Task 10: `ChainConfig` and manifests

**Files:**
- Create: `packages/core/src/chain-config.ts`, `config/chains/arc-testnet.json`, `config/chains/arc-mainnet.json`
- Modify: `packages/core/src/chain.ts` (re-export from config for compatibility), `packages/payments/src/eip3009.ts:12` (drop viem `arcTestnet` import; build `defineChain` from config), `apps/hub/src/server.ts` (use config), `packages/buyer/src/mcp.ts`, `apps/web/src/lib/wallet.ts`
- Test: `packages/core/test/chain-config.test.ts`

**Interfaces:**
- Produces: `class ChainConfig extends Schema.Class { id: "arc-testnet"|"arc-mainnet"; status: "ready"|"pending"; chainId: number; caip2: string; rpcHttp: string[]; explorerBaseUrl: string; usdc: {address, decimals: 6, nativeDecimals: 18, eip712Name, eip712Version}; erc8004?: {identity, reputation, validation}; gateway: null | {wallet, domain, facilitatorUrl, minValiditySeconds} }`; `loadChainConfig(network = process.env.ARCADE_NETWORK ?? "arc-testnet"): ChainConfig` (reads the JSON manifest bundled at build time via `import ... with {type: "json"}`); `toViemChain(cfg)`.

- [ ] **Step 1: Write the failing test**

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

```bash
git add packages/core/src/chain-config.ts packages/core/src/chain.ts config/chains packages/payments/src/eip3009.ts packages/core/test/chain-config.test.ts tsconfig.base.json
git commit -m "feat(core): ChainConfig manifests with a pending Arc mainnet entry"
```

---

### Task 11: Boot checks and `scripts/chain-check.ts`

**Files:**
- Create: `apps/hub/src/chain-check.ts`, `scripts/chain-check.ts`
- Modify: `apps/hub/src/server.ts` preflight
- Test: `apps/hub/test/chain-check.test.ts`

**Interfaces:**
- Produces: `chainCheck(cfg: ChainConfig, rpc: {chainId(): Promise<number>; read(fn: "name"|"version"|"decimals"): Promise<unknown>; balanceOf(addr): Promise<bigint>}, facilitator: string): Promise<{ok: boolean; findings: string[]}>`; hub refuses to start when `cfg.status === "pending"` or when `ARCADE_RAIL=gateway` and `cfg.gateway === null`.

- [ ] **Step 1: Write the failing test**

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

```bash
git add apps/hub/src/chain-check.ts scripts/chain-check.ts apps/hub/src/server.ts apps/hub/test/chain-check.test.ts
git commit -m "feat(hub): chain boot checks; refuse pending mainnet and gateway-less networks"
```

---

### Task 12: Mainnet runbook and doc corrections

**Merge notes.** `docs/runbook.md` is appended to by every plan (A, B, C, D, E, F, G, H) and `README.md` by A, E, F, G and I. Both are append-only by convention: add a new `##` section with your plan's name, never re-flow another plan's section. **Plan I owns the README's ETHOnline restructure** (its Task 5) and **executes** `docs/mainnet-runbook.md` (its Task 15) — this task *writes* the runbook and Plan I never rewrites it. The stale `"366 tests"` line is corrected here; Plan I Task 5 replaces the figure again with the count its own run prints, and that later number wins.

**Files:**
- Create: `docs/mainnet-runbook.md`
- Modify: `CLAUDE.md` (RPC line), `docs/runbook.md` (link), `README.md` (test count line and `ARCADE_NETWORK` mention)

- [ ] **Step 1: Write `docs/mainnet-runbook.md`** with these sections, each with the exact commands: (1) Parameters: where to read chain id, RPC, USDC address, explorer (`https://docs.arc.io/arc/references/contract-addresses`, `/arc/references/rpc-endpoints`); (2) Fill `config/chains/arc-mainnet.json`, set `status: "ready"`; (3) `bun run scripts/chain-check.ts --network arc-mainnet`; (4) Deploy `FeeSplitterV2` per seller with `bun run scripts/deploy-splitter.ts --v2 --network arc-mainnet` (seller is immutable); (5) Fund the facilitator with mainnet USDC (gas is USDC); (6) `ARCADE_NETWORK=arc-mainnet ARCADE_RAIL=eip3009 bun run hub` (Gateway refused on mainnet until Circle lists Arc); (7) Canary: one deliberately failing call (no tx), one succeeding call (tx); (8) Rollback: `ARCADE_NETWORK=arc-testnet`; (9) Evidence: append tx hashes to `README.md` "Proven on Arc mainnet"; (10) Dates: Sept 16 public mainnet, Sept 30 prize deadline. Include the dual-decimal warning verbatim from `packages/core/src/chain.ts`.

- [ ] **Step 2: Correct docs.** In `CLAUDE.md` change the RPC line to list both hosts with `rpc.testnet.arc.io` first. In `README.md` replace "366 tests" with the current count from `bun run test`. Link the runbook from `docs/runbook.md`.

- [ ] **Step 3: Run the full gates**

Run: `bun run test && bunx tsc --noEmit && forge test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/mainnet-runbook.md CLAUDE.md README.md docs/runbook.md
git commit -m "docs: mainnet runbook for the Sept 16–30 flip; correct RPC host and test count"
```

---

## Self-review

- **Spec coverage (M2, M9 part 1):** input gate (T1), lineage capability + derivation + refusals (T2, T5), tree ledger (T4, T6), receipt tree fields and endpoint (T3, T6), FeeSplitter v2 with on-chain commitment (T7), runner/buyer forwarding (T8), live evidence (T9), ChainConfig + manifests (T10), boot checks (T11), runbook (T12). Circle CLI interop and the Sept 16 flip itself live in Plan I.
- **Placeholders:** none; every step has code or an exact command. The one deliberate reader instruction is in T7 step 1 (reuse the v1 test's mock token names).
- **Type consistency:** `mintHireCapability/verifyHireCapability/HIRE_CAPABILITY_HEADER/ROOT_LINEAGE/childLineage/DEFAULT_MAX_HOP` (T2) are used in T5, T8; `reserveTree/commitTree/releaseTree/treeState` (T4) in T5, T6; `ReceiptChild/treeHashOf` (T3) in T6; `SettleTree` and `Rail.settle(verified, tree?)` (T7) in T6's pipeline hand-off; `loadChainConfig/ChainConfig` (T10) in T11.
