> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

### Task 1: Input gate — validate the body before any payment work

**Files:**
- Modify: `apps/hub/src/validate.ts`
- Modify: `apps/hub/src/server.ts:771-808`
- Modify: `packages/core/src/errors.ts`
- Test: `apps/hub/test/input-gate.test.ts`, `apps/hub/test/validate.test.ts`

**Interfaces:**
- Produces: `validateJson(value: unknown, schema: unknown): boolean` (exported from `apps/hub/src/validate.ts`; `validateOutput` stays as an alias); HTTP `400 {error: "input_invalid", detail: string}`; `InputInvalid` tagged error in `@arcade/core`.

- [ ] **Step 1: Write the failing validator test**

Historical excerpt (not current operator instructions):
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

Historical excerpt (not current operator instructions):
```ts
/** Kept for existing call sites; settlement validation and input validation are the same check. */
export const validateOutput = validateJson
```

- [ ] **Step 4: Run the validator test**

Run: `bunx vitest run apps/hub/test/validate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the `InputInvalid` error**

In `packages/core/src/errors.ts` add:

Historical excerpt (not current operator instructions):
```ts
export class InputInvalid extends Data.TaggedError("InputInvalid")<{
  readonly skillId: string
  readonly detail: string
}> {}
```

(Import `Data` from `effect` if the file does not already.)

- [ ] **Step 6: Write the failing input-gate test**

The hub test harness in `apps/hub/test/openapi.test.ts` shows how the server is exercised; this test spawns the paid endpoint through the same `fetch` path. Create `apps/hub/test/input-gate.test.ts`:

Historical excerpt (not current operator instructions):
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

Historical excerpt (not current operator instructions):
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

Historical excerpt (not current operator instructions):
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

Historical command (not current operator instructions):
```text
bunx tsc --noEmit
git add apps/hub/src/validate.ts apps/hub/src/server.ts packages/core/src/errors.ts apps/hub/test/input-gate.test.ts apps/hub/test/validate.test.ts
git commit -m "feat(hub): validate input against the listing schema before any payment work"
```

---
