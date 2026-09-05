> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# Task 3 Report — Job, Receipt and JobAssignment gain lineage/tree fields

## Status
DONE

## What I implemented

Exactly the interfaces specified in the brief, no extras:

1. **`packages/core/src/job.ts`** — `Job` gains four optional fields (added after `outcome`): `rootJobId?: string`, `parentJobId?: string`, `hop?: Int`, `ancestors?: string[]`.

2. **`packages/core/src/receipt.ts`**:
   - New import: `keccak256, toHex` from `viem` (already a `packages/core` dependency).
   - New `ReceiptChild` schema class: `{ jobId, skillId, priceAtomic: bigint, settled: boolean, settleTx?: string }`.
   - New `treeHashOf(rootJobId, children)` — sorts children by `jobId`, builds canonical JSON `{rootJobId, children:[{jobId, skillId, priceAtomic: string, settleTx: string|null}]}`, returns `keccak256(toHex(canonical))` typed as `` `0x${string}` ``. Order-independent by construction (sort before serialize).
   - `Receipt` gains, after `createdAtMs`: `rootJobId?`, `parentJobId?`, `hop?`, `ancestors?`, `children?: ReceiptChild[]`, `treeHash?`, `authorizationNonce?`, `treeCeilingAtomic?: bigint`, `treeCommittedAtomic?: bigint`, `receiptSignature?`. All `Schema.optional`.

3. **`packages/core/src/protocol.ts`** — `JobAssignment` gains `parentJobId?: string` and `hireCapability?: string`, both optional, appended after `timeoutSec`.

All new fields are `Schema.optional`, so pre-lineage rows stored as JSON in the hub's SQLite store still `Schema.decodeUnknownSync` cleanly (verified directly by a test).

## What I tested and results

New test file `packages/core/test/receipt-tree.test.ts`, verbatim from the brief:
- `treeHashOf` is order-independent and returns a well-formed `0x`+64-hex-char string.
- A pre-lineage `Receipt` payload (no tree fields present) still decodes, and `r.children` is `undefined`.
- `Job.make` and `JobAssignment.make` accept the new lineage fields.

## TDD evidence

**RED** — `bunx vitest run packages/core/test/receipt-tree.test.ts` (test file written, source unmodified):

Historical excerpt (not current operator instructions):
```
FAIL  packages/core/test/receipt-tree.test.ts [ packages/core/test/receipt-tree.test.ts ]
TypeError: Cannot read properties of undefined (reading 'make')
 ❯ packages/core/test/receipt-tree.test.ts:8:30
   const child = ReceiptChild.make({ jobId: "job_child00000000000", ski…
Test Files  1 failed (1)
     Tests  no tests
```

**GREEN** — same command after implementing the fields:

Historical excerpt (not current operator instructions):
```
✓ packages/core/test/receipt-tree.test.ts (3 tests) 14ms
Test Files  1 passed (1)
     Tests  3 passed (3)
```

**Full suite** — `bunx vitest run packages/core apps/hub`:

Historical excerpt (not current operator instructions):
```
Test Files  1 failed | 17 passed (18)
     Tests  4 failed | 225 passed (229)
```
(re-run: 2 failed | 227 passed — count varies between runs)

All 4/2 failures are in `apps/hub/test/preflight.test.ts` (env-refusal assertions: `refused` expected `true`, got `false`; a "durability could not be verified" warning missing) — this is the pre-existing spawn-timeout flakiness the task context called out for this host. Confirmed pre-existing and not caused by this change:
- Ran `apps/hub/test/preflight.test.ts` alone on the pre-task commit (`git stash` back to `d77977d`): **7/7 pass**, 8.8s.
- Ran the same file alone with my changes applied (no stash): **7/7 pass**, 9.0s.
- Failures appear only when `preflight.test.ts` runs concurrently inside the full `packages/core apps/hub` vitest invocation (it spawns child processes; under parallel load on this host those spawns evidently time out or get resource-starved), and the failing subset/count varies run to run (4 then 2) — consistent with host flakiness, not a deterministic regression.
- No file this task touched (`job.ts`, `receipt.ts`, `protocol.ts`) is imported by `preflight.test.ts` or its subject.

Every `packages/core` test, including `secrecy.property.test.ts` (4/4, the manifest secrecy-boundary property test) and `lineage.test.ts` (9/9), passed in every run.

**Typecheck** — `bunx tsc --noEmit`: clean, no output, no errors.

## Files changed

- `packages/core/src/job.ts` — 4 new optional fields on `Job`.
- `packages/core/src/receipt.ts` — `viem` import, `ReceiptChild` class, `treeHashOf`, 9 new optional fields on `Receipt`.
- `packages/core/src/protocol.ts` — 2 new optional fields on `JobAssignment`.
- `packages/core/test/receipt-tree.test.ts` — new, verbatim from the brief.

Commit: `56c187d` — `feat(core): lineage and receipt-tree fields on Job, Receipt, JobAssignment`

## Self-review

- **Completeness**: every field named in the brief's Interfaces block is present with the exact name and type (`Job`: `rootJobId?`, `parentJobId?`, `hop?`, `ancestors?`; `ReceiptChild`: `jobId`, `skillId`, `priceAtomic: bigint`, `settled`, `settleTx?`; `Receipt`: all 9 new fields; `treeHashOf` signature matches; `JobAssignment`: `parentJobId?`, `hireCapability?`).
- **Quality**: matches existing `Schema.Class`/`Schema.TaggedClass` conventions in these files; comments carried over verbatim from the brief where given; `treeHashOf` is a pure function, no side effects, deterministic via explicit sort.
- **Discipline**: no extra fields, no restructuring beyond the brief's insertion points, `packages/core/src/manifest.ts` (seller-authored types, the secrecy boundary) untouched — the new fields are hub-computed only, confirmed by the still-passing `secrecy.property.test.ts`. No Node builtin imports introduced (`viem` is a declared dependency and browser-safe; confirmed by `repo-hygiene.test.ts`'s `node:` import grep, which still passes).
- **Testing**: the new test exercises real decode/construct behavior (not mocks) against the actual schemas, including the backward-compatibility case for pre-lineage rows.

## Concerns

None blocking. One observation for whoever reviews the merge points the brief calls out: `receipt.ts` and `protocol.ts` are also touched by later plans (C/F for `receipt.ts`, D for `protocol.ts`) — my additions are appended after the existing fields in both files (receipt fields after `createdAtMs`, protocol fields after `timeoutSec`), leaving clean append points for those rebases as the brief anticipated.

The `apps/hub/test/preflight.test.ts` flakiness under full-suite parallel load (spawn-timeout pattern) is pre-existing and host-specific, matching what the task context predicted; not something this task's diff can or should fix.
