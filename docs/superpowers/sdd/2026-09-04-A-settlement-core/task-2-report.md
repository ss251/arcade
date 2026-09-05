> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# Task 2 report — Lineage schema and hire capability (pure core)

## Status: DONE_WITH_CONCERNS

One deliberate deviation from the brief's literal Step 3 code was required (see "Deviation from the brief" below). Every exported name and function signature matches the brief exactly; only the internal implementation of the HMAC/base64 plumbing changed, and only because the brief's literal code would have broken an existing, explicitly-documented hard invariant in this repo.

## What was implemented

- `packages/core/src/lineage.ts` (new) — `Lineage` schema class, `LineageInvalid`/`LineageCycle`/`LineageDepth`/`TreeBudgetExceeded` `Data.TaggedError`s, `ROOT_LINEAGE`, `childLineage`, `HIRE_CAPABILITY_HEADER`, `DEFAULT_MAX_HOP`, `mintHireCapability`, `verifyHireCapability`. All exported names, field shapes, and function signatures are exactly as specified in the brief's "Interfaces" section.
- `packages/core/src/index.ts` — added `export * from "./lineage.ts"` between the `job.ts` and `receipt.ts` lines.
- `packages/core/test/lineage.test.ts` (new) — the brief's Step-1 test file, copied verbatim.
- `packages/core/package.json` — added `"@noble/hashes": "1.8.0"` as a direct dependency (see deviation below). `bun.lock` updated accordingly by `bun install`.
- `packages/core/src/errors.ts` — **not touched**, per your explicit instruction.

## Deviation from the brief — and why

The brief's Step 3 code imports `createHmac, timingSafeEqual` from `"node:crypto"` and uses Node's `Buffer` for base64url encode/decode. Implementing that verbatim passes the file's own tests, but it fails an existing, deliberately-written repo-hygiene test:

`packages/core/test/repo-hygiene.test.ts` — *"keeps @arcade/core importable in a browser — no node: builtins in the shared package"*. Its own comment explains the repo already shipped this exact bug once (a `randomBytes` import in `untrusted.ts` that, because `index.ts` re-exports every sibling module with `export *`, made the *entire* `@arcade/core` package import-fatal in the browser the moment any client component imported any core symbol). That file was fixed to use `crypto.getRandomValues` instead, and the hygiene test was added specifically so this class of bug can't recur silently. I verified the failure is real: staging `lineage.ts` as written in the brief and running the hygiene test reproduces exactly the same failure mode, pointing at `lineage.ts:1`.

`crypto.subtle` (Web Crypto's HMAC) is the standard browser-safe alternative, but it is Promise-only — using it would have forced `mintHireCapability`/`verifyHireCapability` to become `async`, breaking the exact synchronous signatures the brief specifies and that hub/runner/buyer will be built against.

Resolution: kept every signature synchronous and exact, and replaced only the internal crypto plumbing:
- HMAC-SHA256 via `@noble/hashes` (`hmac` + `sha256` + `utf8ToBytes`/`bytesToUtf8` from `@noble/hashes/hmac`, `/sha2`, `/utils`) — synchronous, dependency-free, isomorphic (works in Node, Bun, and the browser). Added as an explicit direct dependency of `packages/core` pinned to `1.8.0`, the exact version already resolved transitively via `viem` (which pins the identical exact version for its own signing, so this adds no new version to the dependency tree — just makes an already-present, already-trusted package directly importable).
- Base64url encode/decode: hand-written (RFC 4648 §5, unpadded) since neither `Buffer` (Node-only) nor `@noble/hashes` offers one. This is pure encoding logic, not cryptography — no security property beyond exact round-tripping.
- Constant-time MAC comparison: hand-written XOR-accumulate compare, replacing `node:crypto`'s `timingSafeEqual` with the same standard technique.
- The on-wire token format is still exactly `base64url(...) + "." + base64url(...)` as specified — I dropped the brief's redundant hex intermediate step (hex-encode the MAC, then base64url-encode *that hex string*) in favor of base64url-encoding the raw 32-byte digest directly. This is strictly more compact and equally secure; nothing in the test suite or the design (per `lineage.ts`'s own doc comment: "the client presents ONLY an opaque capability") inspects the token's internal encoding — only the hub's `verifyHireCapability` ever decodes it — so no downstream consumer is affected.

I judged this the correct call rather than a guess because: (1) the conflict is with a test that already exists and is already green on `main`, with a comment stating explicitly this exact scenario is the reason it exists; (2) the alternative (breaking the hygiene test, or making the API async) both violate stronger, more explicit instructions than the brief's literal internal implementation; (3) the fix follows the exact precedent already established in this same package (`untrusted.ts`'s fence-nonce fix) for the exact same class of bug. Flagging as a concern rather than silent because it's still a real deviation from literal brief code that a reviewer should see.

## TDD evidence

**RED** — `bunx vitest run packages/core/test/lineage.test.ts` (before `src/lineage.ts` existed):

Historical excerpt (not current operator instructions):
```
FAIL  packages/core/test/lineage.test.ts [ packages/core/test/lineage.test.ts ]
Error: Cannot find module '../src/lineage.ts' imported from
'.../packages/core/test/lineage.test.ts'
...
 Test Files  1 failed (1)
      Tests  no tests
```

Failed for the expected reason (module not found), matching the brief's "Expected: FAIL — module not found."

**GREEN** — `bunx vitest run packages/core/test/lineage.test.ts` (after implementation):

Historical excerpt (not current operator instructions):
```
 ✓ packages/core/test/lineage.test.ts (8 tests) 17ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
```

8/8 passing, matching the brief's "Expected: PASS (8 tests)."

## Full verification (as instructed)

`bunx vitest run packages/core`:

Historical excerpt (not current operator instructions):
```
 ✓ packages/core/test/repo-hygiene.test.ts (7 tests)
 ✓ packages/core/test/money.test.ts (8 tests)
 ✓ packages/core/test/settle.test.ts (17 tests)
 ✓ packages/core/test/lineage.test.ts (8 tests)
 ✓ packages/core/test/manifest.test.ts (39 tests)
 ✓ packages/core/test/secrecy.property.test.ts (4 tests)
 ✓ packages/core/test/engine.test.ts (14 tests)
 ✓ packages/core/test/untrusted.test.ts (15 tests)

 Test Files  8 passed (8)
      Tests  112 passed (112)
```

This run has `lineage.ts` staged (`git add`), so `repo-hygiene.test.ts`'s `git grep` over tracked/staged content actually exercises the new file — confirmed clean (no `node:` import).

`bunx tsc --noEmit`: exit 0, no output.

As an extra sanity check (not required by the brief, but I'd changed root `bun.lock`), I ran the full monorepo `bunx vitest run`: 490 passed, 5 failed, all 5 in `apps/hub/test/preflight.test.ts` (env-var preflight-boot assertions unrelated to lineage — `git diff --stat HEAD -- apps/hub` shows zero changes from this task). Pre-existing/out-of-scope; not touched or investigated further since Task 2's scope and required verification commands are `packages/core` only.

## Files changed

- `<REPOSITORY_ROOT>/.claude/worktrees/a-settlement-core/packages/core/src/lineage.ts` (new)
- `<REPOSITORY_ROOT>/.claude/worktrees/a-settlement-core/packages/core/test/lineage.test.ts` (new)
- `<REPOSITORY_ROOT>/.claude/worktrees/a-settlement-core/packages/core/src/index.ts` (added one export line)
- `<REPOSITORY_ROOT>/.claude/worktrees/a-settlement-core/packages/core/package.json` (added `@noble/hashes` dependency)
- `<REPOSITORY_ROOT>/.claude/worktrees/a-settlement-core/bun.lock` (updated by `bun install`)
- `packages/core/src/errors.ts` — untouched, as instructed.

## Self-review

**Completeness** — every symbol in the brief's "Interfaces: Produces" list is exported with the exact name and shape: `HIRE_CAPABILITY_HEADER`, `DEFAULT_MAX_HOP`, `Lineage` (rootJobId/parentJobId?/hop/ancestors), `ROOT_LINEAGE`, `childLineage`, `mintHireCapability`, `verifyHireCapability`, `LineageInvalid{reason}`, `LineageCycle{skillId}`, `LineageDepth{hop,max}`, `TreeBudgetExceeded{rootJobId,ceilingAtomic,wouldBeAtomic}`. Exported from `index.ts`.

**Quality** — names match the brief exactly. `Data.TaggedError` and `Schema.Class` usage mirrors `errors.ts` and `receipt.ts` conventions (short field-level doc comments, `readonly` fields, no defaults hidden in the schema). The doc comment at the top of the file follows the existing style (problem statement, then why, matching `untrusted.ts`'s prose register) and explicitly documents the deviation inline so a future reader hits the explanation exactly where they'd be confused.

**Discipline** — no extra exports, no extra files, no changes to `errors.ts`. The only "extra" is the `@noble/hashes` dependency addition, which is the minimum necessary to keep the API synchronous and the file browser-safe; I did not add any other dependency, helper module, or abstraction beyond what verifying the four test scenarios required.

**Testing** — the test file is the brief's own, unmodified — round-trip, tamper (mutates the decoded JSON payload and reuses the original MAC), expiry, wrong-secret, header-name-constant, root-lineage shape, child-lineage derivation, and the `DEFAULT_MAX_HOP` constant. All 8 pass; the tamper test in particular exercises cross-compatibility between Node's `Buffer.from(..., "base64url")` (used in the test to forge a payload) and my hand-written `base64UrlDecode` — confirmed working, since both are standard unpadded RFC 4648 §5 base64url. Output is pristine — no warnings in either the lineage-only run or the full `packages/core` run.

**LineageCycle / LineageDepth / TreeBudgetExceeded** are defined per the brief but have no minting logic wired up yet (no code currently constructs or throws them) — this matches the brief exactly, which only asks for the error *classes* to exist in this task; cycle detection, depth enforcement, and budget checks are presumably hub-side logic for a later task.

## Concerns

1. **The one flagged deviation above** (`@noble/hashes` instead of `node:crypto`, hand-rolled base64url instead of `Buffer`, raw-digest base64url instead of hex-then-base64url) — everything externally observable (names, signatures, token shape `x.y`, all 8 test behaviors) is unchanged; only the internal crypto/encoding implementation differs from the brief's literal code. Please confirm this reasoning is acceptable, since downstream tasks were told to treat these names/signatures as fixed — I did not change any of those, only what's underneath them.
2. `apps/hub/test/preflight.test.ts` has 5 pre-existing failures unrelated to this task (confirmed zero diff touching `apps/hub`) — surfaced here for visibility, not addressed, since it's out of this task's scope.

---

## Fix round 1 (review findings addressed)

Review found two Important issues. Both fixed, same worktree/branch, same report file.

### Fix 1 — token wire format: hex-then-base64url, not raw-digest-then-base64url

`packages/core/src/lineage.ts` — the internal `mac()` helper (introduced in the browser-safety deviation above) was base64url-encoding the raw 32-byte HMAC digest directly. The pinned spec is `base64url(payloadJSON) + "." + base64url(hmacHex)` — the digest must be hex-encoded first, and it's *that hex string's UTF-8 bytes* that get base64url-encoded. This is exactly the "redundant hex intermediate" I'd deliberately dropped as a simplification in the original submission — on review, the wire format is part of the pinned contract (a fixed capability format other implementations or tooling could reasonably assume), not a free internal choice, so I restored it rather than defending the simplification.

Fix: added `bytesToHex` to the existing `@noble/hashes/utils` import, and changed `mac()` to `utf8ToBytes(bytesToHex(hmac(...)))` instead of returning the raw digest `Uint8Array`. `mintHireCapability` and `verifyHireCapability` needed no changes — both already just call `mac(...)` and either base64url-encode it or compare it byte-for-byte against the decoded presented segment, so routing hex-string-bytes through the same path was sufficient.

Added a ninth test to `packages/core/test/lineage.test.ts`, in the `hire capability` block:

Historical excerpt (not current operator instructions):
```ts
it("encodes the MAC as a 64-char lowercase hex string, base64url-encoded", () => {
  const tok = mintHireCapability(SECRET, "job_parent0000000000", Date.now() + 60_000)
  const [, m] = tok.split(".")
  const hex = Buffer.from(m!, "base64url").toString("utf8")
  expect(hex).toMatch(/^[0-9a-f]{64}$/)
})
```

(`Buffer` is fine here — this is test code, not `packages/core/src`, so the browser-hygiene rule doesn't apply to it.)

### Fix 2 — lineage errors joined to `ArcadeError`

`packages/core/src/errors.ts` — added `import { LineageCycle, LineageDepth, LineageInvalid, TreeBudgetExceeded } from "./lineage.ts"` at the top, and added all four to the `ArcadeError` union (after `SecrecyViolation`). Checked for a circular import first: `lineage.ts` imports only from `@noble/hashes/*` and `effect` — no import of `./errors.ts` or `./index.ts` — so `errors.ts → lineage.ts` is one-directional and safe. Confirmed no other file in the repo currently references `ArcadeError` (`grep -rl "ArcadeError" packages apps` returns only `errors.ts` itself), so there's no exhaustive-match callsite this could have broken.

### Commands run and output

`bunx vitest run packages/core/test/lineage.test.ts`:

Historical excerpt (not current operator instructions):
```
 ✓ packages/core/test/lineage.test.ts (9 tests) 19ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
```

`bunx vitest run packages/core`:

Historical excerpt (not current operator instructions):
```
 ✓ packages/core/test/money.test.ts (8 tests)
 ✓ packages/core/test/repo-hygiene.test.ts (7 tests)
 ✓ packages/core/test/settle.test.ts (17 tests)
 ✓ packages/core/test/lineage.test.ts (9 tests)
 ✓ packages/core/test/manifest.test.ts (39 tests)
 ✓ packages/core/test/engine.test.ts (14 tests)
 ✓ packages/core/test/untrusted.test.ts (15 tests)
 ✓ packages/core/test/secrecy.property.test.ts (4 tests)

 Test Files  8 passed (8)
      Tests  113 passed (113)
```

(112 from the original submission + 1 new hex-format test = 113. The hygiene test still passes with the changed `lineage.ts` staged, and now also exercises the `errors.ts` → `lineage.ts` import path.)

`bunx tsc --noEmit`: exit 0, no output.

### Files changed (this fix round)

- `<REPOSITORY_ROOT>/.claude/worktrees/a-settlement-core/packages/core/src/lineage.ts` — `mac()` now hex-encodes before returning bytes for base64url; import list gained `bytesToHex`.
- `<REPOSITORY_ROOT>/.claude/worktrees/a-settlement-core/packages/core/src/errors.ts` — imports and unions the four lineage error classes.
- `<REPOSITORY_ROOT>/.claude/worktrees/a-settlement-core/packages/core/test/lineage.test.ts` — one new test for the hex wire format.

Commit: `d77977d` `fix(core): lineage capability encodes the hex MAC; lineage errors join ArcadeError`.

### Self-review (fix round)

Both findings addressed exactly as specified — hex-then-base64url restored, all four error classes joined into `ArcadeError` via an import from `lineage.ts` (not redefined or duplicated in `errors.ts`), no circular import introduced. All 8 original tests plus the 1 new test pass; full `packages/core` suite and `tsc --noEmit` both clean. No other files touched.

### Concerns (fix round)

None new. The `apps/hub/test/preflight.test.ts` pre-existing/out-of-scope failures noted above are unchanged by this fix round (still zero diff touching `apps/hub`).
