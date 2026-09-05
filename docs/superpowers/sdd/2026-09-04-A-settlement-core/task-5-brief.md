> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

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

Historical excerpt (not current operator instructions):
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

Historical excerpt (not current operator instructions):
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

Historical excerpt (not current operator instructions):
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

Historical excerpt (not current operator instructions):
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

Historical command (not current operator instructions):
```text
git add apps/hub/src/lineage.ts apps/hub/src/server.ts apps/hub/src/broker.ts apps/hub/src/pipeline.ts apps/hub/test/lineage.test.ts apps/hub/test/pipeline.test.ts
git commit -m "feat(hub): derive lineage from hub-issued capability; refuse cycles, depth and over-budget hires"
```

---
