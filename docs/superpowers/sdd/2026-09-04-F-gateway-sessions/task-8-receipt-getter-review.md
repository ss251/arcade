> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F8 selected receipt getter — independent review

Frozen September 6, 2026 (Asia/Kolkata), approximately 20:23 UTC September 5.

**CLEAN within the four-file getter slice.** No correction or new source test is
required by this review. This is not acceptance of the concurrently authored F8
paid router/pipeline, its public projections, or the eventual combined gate.

## Scope and independent verification

Read the complete author report at SHA-256
`a5758cf78dad2291e5fd5d5f64577ee8f2d771fec0313e48565740fd253049b5`,
current task8-parent-decisions, and all four owned files. Inspected the existing
SQLite selected read transaction, its query/index/counter checks and the shared
validation/serialization boundaries. Re-read the frozen F5 reference inventory.
The existing ts-testing guidance informed behavioral checks and use of the real
root strict options; no broad review automation or test expansion was invoked.

All commands used `login:false`; all Bun commands used `--no-env-file`.

```sh
bun --no-env-file x --no-install vitest run apps/hub/test/session-receipt.test.ts apps/hub/test/session-ledger.test.ts apps/hub/test/sessions.test.ts apps/hub/test/store.test.ts
bun --no-env-file test ./apps/hub/test/session-receipt.bun.test.ts
```

- Vitest: **87 passed, four files**, exit 0, 5.68 seconds. Getter 18, existing
  kernel 27, F6 facade 30, existing Store 12. Full final counts were observed.
- Actual native SQLite Bun: **12 passed, zero failed, 54 assertions, one file**,
  exit 0, 341 ms. Owned fixture handles and exact temporary directories were
  cleaned by the existing afterEach, including explicit reopen handles.
- Installed TypeScript via `bun --no-env-file -e`: absolute root tsconfig read
  and parsed with its actual directory/config path; createProgram with precisely
  the four owned absolute rootNames, original options plus noEmit:true and
  incremental:false. Config/parse/pre-emit diagnostics all collected:
  **EXACT_F8_GETTER_ROOTS=4 DIAGNOSTICS=0**, exit 0. Nested tests were included;
  strict, exactOptionalPropertyTypes and noUncheckedIndexedAccess were retained.
- Read-only Bun/node:fs/node:crypto inventory: **14 F5 foundation matches**,
  comprising 12 direct hashes and two original hashes reconstructed entirely in
  memory. The reconstruction removed only the getter interface line, the getter
  implementation block, the three new error imports and the two approved
  ListingRecord metadata fields/comment. No Git command or file rewrite was
  used. The exact original hashes recovered were
  `657606a150d6de31e530289cd152cdabec2dce3925ef6e30d4f4e818a917c7ee`
  (ledger) and
  `233311c6b7880e3a3426e25810a35d1b0ce05843311a4a9fad8611de6c0175e4`
  (Store).

## Review conclusions and evidence limits

Canonical scalar session/job IDs are checked before any selected read. Explicit
length and suffix alphabet checks reject whitespace, non-ASCII values and
coercible objects without invoking coercion. Exact accepted job suffix limits
are 16–128 ASCII alphanumerics. Invalid input is SessionInvalid; one selected
read plus full existing ledger validation precedes membership or receipt lookup.
Unknown selected session/missing or foreign call yields SessionNotFound. A
receipt belonging to another session is not returned by a global lookup.

Reserved, settling and uncertain states produce undefined only after their
existing no-terminal-evidence invariants validate. Both terminal states return
the actual persisted Receipt, not a reconstruction from the call or Job.
Job/receipt digests, coordinates, totals, terminal category and lineage are
validated first. Missing, changed, duplicate or contradictory evidence fails
closed as fixed SessionStorageUnavailable. Read failures do not escape as raw
provider errors or misleading input failures. Reusing the Effect observes the
current state; close does not erase the receipt. No getter mutation/retry/cache
or settlement action exists.

Returned receipts and nested arrays are independent copies. The stored accessor
test specifically establishes that a `reason` accessor is rejected without
invocation. It does **not** establish a general hostile in-process accessor or
Proxy sandbox: the unchanged F5 validator reads `receipt.jobId` while indexing
the in-memory receipt array. JSON-backed SQLite evidence cannot contain a JS
accessor. This is an evidence-scope qualification, not a newly introduced getter
regression or a request to broaden frozen foundation source.

SQLite uses the unchanged selected-session deferred read transaction. The actual
query-spy/EXPLAIN case reproduced four SELECTs: one selected header and selected
calls/correlated Jobs/correlated Receipts. The latter three use `session_id = ?
LIMIT 101` and the `session_calls_session` index; current maximum is 100 calls.
The getter does not call allReceipts/allSessions, load unrelated terminal JSON,
or introduce a table/migration. This is bounded selected-session loading, not a
new one-row physical getter. A second already-open handle and later reopen see
actual persisted evidence; an independent immediate write lock does not prevent
the read. Corruption/restoration is visible on the next read. These local tests
are not an independent crash/durability or remote-storage proof.

Memory intentionally retains whole-state validation and its existing receipt
array. Corruption in another memory session may therefore make a selected read
unavailable, unlike SQLite's selected evidence load. No new isolation guarantee
is claimed. The synchronous uninterruptible adapter is unchanged; this review
does not extend it to asynchronous callbacks or claim interruption rollback.

The optional splitterFeeBps/splitterNetwork declarations are data types only.
They do not observe a contract or stamp trusted provenance. The separate F8
handshake/paid author still owns actual observation, missing-legacy-coordinate
refusal, strict public projections, capability authentication, and settlement
integration. This getter is internal and is not itself an authenticated route.

## Final frozen SHA-256 inventory

```text
76665c4f2be176705bb219aabf3f462b5880116847a80f3163b241a82bf2a265  apps/hub/src/session-ledger.ts
4bc13814caff3002c0b9c64f82d415da8a698dbbedd578a80a8902ce1d6f4385  apps/hub/src/store.ts
b2a99525fd5e6a81c9cf7b802fe9e53d623cabdcd591b4e970f908d475558e80  apps/hub/test/session-receipt.test.ts
d5d7038f53d7216bf27e792672b5af525394a7959a395d84995d3322284f426d  apps/hub/test/session-receipt.bun.test.ts
97d866953795b0e9e6e9c72052a799ebc1b10fe5356d853cd722c8264567b69a  apps/hub/src/store-sqlite.ts
f1f00db9511e7ae17a2119a891e4149cb24e73127c500c7f4940d7cee5e7dc30  apps/hub/src/sessions.ts
f67f5546bc2db8653305f21dcc0a63418ce0d300f38e3dee9e9bd731a96134b5  apps/hub/test/sessions.test.ts
```

No supplemental fixture was needed or added. Wrote only this ignored review.
No production/test/dependency/public-document edit, Git operation, full suite,
network, HTTP listener, wallet/key/ambient-env access, API call, live payment,
F1 authority reuse or G/H work occurred. Parent owns combined verification,
publication and commit; the separate paid integration still requires its own
frozen independent review.
