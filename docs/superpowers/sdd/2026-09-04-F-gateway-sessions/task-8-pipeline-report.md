> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F8 session executor implementation checkpoint

September 6, 2026, 02:08:39 IST (September 5, 20:38:39 UTC).
Executor source/tests FROZEN for independent review. No full-repository gate,
commit, external network, credentials or live spending was performed here.

## Ownership and inputs

Parent reassigned only `apps/hub/src/pipeline-sessions.ts` and
`apps/hub/test/session-pipeline.test.ts` from G14 after its first draft/run90309
closed. G14 retains the pure preparation helpers, router and actual HTTP/root-child
fixtures. Read current complete parent decisions/source handoff, pure helper,
legacy pipeline, actual broker/rail/F5/F6/lineage/receipt/D contracts. Used the
ts-testing skill for behavioral Red/Green and finite failure-path cleanup.

The original four receipt-getter files and report were preserved throughout this
checkpoint. Parent subsequently took their exclusive ownership for the separate
selected terminal-bundle TOCTOU correction. That correction is not included in
this executor checkpoint or its retained getter checks.

## Genuine failures and corrections

- Inherited author checkpoint, 01:50:35 IST: actual TestRail mixed-case payer
  settled but could not atomically finish. Retained the test; fixture now calls
  G14's canonicalSessionPayment/canonicalSessionRequirements BEFORE actual
  verification and passes the exact canonical challenge to prepareSessionCall.
  The original VerifiedPayment object remains identical through settlement.
- 01:55:59: four passing / one failing. A duplicate evaluation during a paused
  owner's settlement invoked markUncertain once, expected zero. Moved duplicate
  rejection outside the owner's cleanup; 5/5 passed at01:56:24.
- 01:58:24: five passing / one failing. A hash-shaped Gateway child receipt was
  accepted as EIP V2 tree evidence and the root settled. Assembly now requires
  actual correlated EIP/network/reference/flat-parent-chain evidence.
- 02:00:08: seventeen passing / two failing (the tree case above plus new cost
  case). A valid failed runner cost0.0123 was discarded. Consume G14's bounded
  sessionReleaseCost and optional cost-only release helper; no failed output or
  provider prose is retained. Both corrections passed in19/19 at02:00:54.
- 02:06:18, repeated02:07:16: a stuck uncertainty marker remained unfinished
  after50ms. Effect.onError cleanup is uninterruptible; make its marker child
  explicitly interruptible so the local timeout can finish without releasing
  the durable hold.
- 02:07:16: mutating options after issuing the Effect changed the dispatched
  hire capability. Capture hire capability, attester service and copied flat
  attestation coordinates at issuance. Both final boundary corrections passed
  in48/48 at02:07:45; exact two-root strict check also passed.

Additional cases which passed on their first run are supplemental coverage, not
invented Reds. Two fixture-development failures are explicitly excluded from
the product-Red list: a released receipt with an explicitly present undefined
settleTx was not the actual omitted-field legacy shape; a negative child fixture
ignored reserveTree returning false, so it had no admitted tree. The corrected
negative test explicitly proves the real kernel refuses admission, then uses a
corrupt read seam only. Its defensive uint256 check is supplemental coverage.
One test-only typed D callback initially exposed SessionError instead of the
required never channel; Effect.orDie preserves the callback contract and the
test checks its observed persistence/projection outside swallowed best effort.

## Behavior and boundaries

One issued Effect owns at most one runner dispatch and one attempted settlement.
The process-local latch is not a durable restart resumer; F5's claimed begin
barrier remains the independent authority. False/failed/defective begin never
sends. The selected rail receives the exact verified object. Original queued
time is preserved; authorization time is checked again before begin. No retry,
expiry release after dispatch, compensation or synthetic no-charge outcome.

Dispatch is bounded by listing timeout plus5s; outcome preparation is bounded
and own-data. Malformed/oversized/accessor/cyclic/future/invalid-cost output
releases before begin through a fixed safe terminal. Valid known inference cost
may be retained; absence remains unknown. A pre-barrier interruption/defect can
leave the reservation held rather than fabricate a terminal.

Settlement has a30s deadline. Post-begin typed errors, synchronous throws,
defects, interruption, malformed settlement or atomic-finish failure expose no
output/terminal receipt and retain settling/uncertain liability. A defective or
stuck50ms marker cannot erase the hold. A late noncooperative settlement response
cannot resume the canceled pipeline or authorize another attempt.

Only atomic persistence permits returned output or EIP D enqueue. Gateway/Test
skip D. EIP uses the actual verified/bound payee and bounded best-effort50ms
enqueue; callback failure does not alter persisted settlement. Direct payments
allocate full seller/zero fee, observed splitter fee is used for eligible EIP,
and no session receipt carries a fee-accrual marker.

Only EIP V2 roots inspect the separate A tree. Existing global allReceipts is
used solely there, never for session polling. Exactly one actual receipt must
match every row, with matching root, amount, network, rail, terminal state and
flat parent/ancestor chain. Committed references must be actual canonical-shaped
nonzero EIP hashes (legacy absent kind or explicit onchain); no Gateway UUID or
Test reference is inferred as chain evidence. Committed amounts must fit uint256,
sum exactly to the ledger total and remain within the declared ceiling, with no
reserved child. This is correlation of local evidence, NOT independent chain
reconciliation. Missing/contradictory evidence has no synthetic fallback.

The session artifact omits children and every optional tree field. A separate
seller-funded child ledger/receipts are neither charged to the buyer's session
nor undone when the parent releases. The broker receives only the existing
ordinary hire capability, not session ID/token or a forged parent. Complete is
not graph-wide financial finality or a dual-ledger atomicity claim.

## Final focused checks

All commands run from the F worktree with `bun --no-env-file`:

```text
bun --no-env-file x vitest run apps/hub/test/session-pipeline.test.ts apps/hub/test/pipeline.test.ts apps/hub/test/rail-pipeline.test.ts apps/hub/test/pipeline-tree.test.ts apps/hub/test/pipeline-attest.test.ts apps/hub/test/sessions.test.ts apps/hub/test/session-receipt.test.ts
127 tests / 7 files PASS at02:08:32 IST

bun --no-env-file test apps/hub/test/session-receipt.bun.test.ts
12 tests / 54 assertions PASS (actual owned temporary SQLite)
```

Exact TypeScript createProgram: read absolute root tsconfig.json, parse using its
absolute directory and configFilePath; use all parsed root options plus
noEmit:true/incremental:false. Explicit rootNames: the two executor paths plus
session-ledger.ts, store.ts and both receipt-getter test files. All dependencies
are compiled normally. Six exact roots, zero diagnostics at02:08:39 IST.

The executor file has48 cases: four inherited draft cases plus44 added cases.
Actual TestRail/Broker/F5/F6 memory success, interruption, atomicity and deadlines
are exercised. Non-test rail unit scenarios use controlled adapter seams and
explicitly pre-admitted F5 memory state, bypassing only F6's durable-admission
guard in the fixture; they are NOT cryptographic, network or durable-admission
proof. The separate getter Bun tests cover real disk/reopen/two-handle indexed
reads, not the whole executor. G14 owns the actual router/root-child/disk executor
integration. No claim of that unfinished separate integration is made here.

## Frozen bytes

```text
84a152c3faa35cdc5e271716430d9509bf4b3c5cc4ac0a44e9ef132de206e692  apps/hub/src/pipeline-sessions.ts
1b70eb59279cc972f766b6875ee855cb5464b2c52d970dd7a6a2759361999fc0  apps/hub/test/session-pipeline.test.ts
76665c4f2be176705bb219aabf3f462b5880116847a80f3163b241a82bf2a265  apps/hub/src/session-ledger.ts (retained getter checkpoint)
4bc13814caff3002c0b9c64f82d415da8a698dbbedd578a80a8902ce1d6f4385  apps/hub/src/store.ts (retained getter checkpoint)
b2a99525fd5e6a81c9cf7b802fe9e53d623cabdcd591b4e970f908d475558e80  apps/hub/test/session-receipt.test.ts (retained getter checkpoint)
d5d7038f53d7216bf27e792672b5af525394a7959a395d84995d3322284f426d  apps/hub/test/session-receipt.bun.test.ts (retained getter checkpoint)
37897842bfac306bfd2ab6f19ec35d04f96f05192acfca59c161350ba4783762  apps/hub/src/pipeline.ts (untouched legacy source)
```

No edits outside the two executor paths and this private report. G14's active
pure-helper changes are dependencies, not author-owned source or a whole-F8
freeze. Parent owns independent review, combined gates, public copies and commit.
