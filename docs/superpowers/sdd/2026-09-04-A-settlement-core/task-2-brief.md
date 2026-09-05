> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

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

Historical excerpt (not current operator instructions):
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

Historical excerpt (not current operator instructions):
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

Historical command (not current operator instructions):
```text
git add packages/core/src/lineage.ts packages/core/src/index.ts packages/core/test/lineage.test.ts
git commit -m "feat(core): lineage schema and hub-issued hire capability"
```

---
