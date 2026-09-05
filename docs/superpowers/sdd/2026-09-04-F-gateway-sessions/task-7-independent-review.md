> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F7 independent review — September 6, 2026

Verdict: **CLEAN / DONE** for the frozen seven-file F7 transport scope. No
actionable findings. This is an independent source/focused-runtime review, not a
full-suite, F8 paid-session integration or live Gateway verdict.

Read the complete author report at SHA-256
`821d928be56504fe4a675a581fc9e243883228db6401da517b2c43aee45bbbc0`,
all seven frozen source/test files in full, actual Plan F Task 7, current complete
task7-parent-decisions.md and task7-readiness.md, and the frozen F6 API. Compared
the implementation with the approved readiness adaptations, not the obsolete
illustrative putSession/query-token/global-receipt implementation.

The ts-testing skill guided behavior checks. Read the complete review skill and
its checklist; applied the bounded static categories. Its Git/network/bootstrap,
telemetry, automatic fixes and broader orchestration were not performed because
they exceed this delegated read-only source-review scope. Root independently
owns the sole full gate, final diff and publication/commit.

## Source and behavioral conclusions

- Authentication precedes protected body/Store IO and capacity at
  server-sessions.ts:114–121. The actual router tests show fixed404 for missing,
  Unicode, duplicate and query-only credentials; capacity saturation does not
  distinguish failed capabilities. The shared comparator fixes the existing
  actual /jobs URL-decoded Unicode case while a valid job token still succeeds.
  Session HMAC domain remains separate; no session query fallback was introduced.
- One private response constructor and top-level namespace mounting contain
  malformed application paths/methods and failures. Error mapping at
  server-sessions.ts:87–94 does not spread caught errors or private values.
  The handler is mounted before unrelated dispatch at server.ts:782–783.
- readBody's total-byte limit, observed/declared-length checks, fatal UTF-8,
  monotonic deadline before/after each read, skipped empty chunks and unawaited
  cancellation are present at server-sessions.ts:32–72. Collected tests actually
  exercise stalled input, uncooperative cancel, late reader completion, abort,
  elapsed-time enforcement before timer dispatch and admission recovery.
  Late valid bytes do not reach a Store write. No retry/compensation path exists.
- Open performs exact string-to-bigint conversion and closed-key validation,
  selects the actual built/default rail, then delegates to F6. Real admission
  captures both actual durability and the matching configured bounded secret;
  test remains usable in a mixed registry. Actual memory and SQLite :memory:
  refuse real opens; owned durable SQLite allows the offline Gateway open.
- GET at server-sessions.ts:154–158 uses one authoritative snapshot, held-adjusted
  remaining, exact string money and calls ARRAY. The same-object projection test
  checks reference identity, exactly one read and no close. Complete-open omits
  closed_receipt; persisted complete-close recovers the exact F6 artifact.
- Close invokes one atomic F6 close after authentication/body validation.
  Reserved/settling/uncertain holds refuse unchanged; concurrent losers and repeats
  cannot overwrite close time. Pending service operations receive AbortSignal,
  surface fixed errors and are not retried. A completed synchronous transaction
  is not claimed to be undone by HTTP cancellation.
- Actual disk restart exercises a randomly opened, non-reseeded session, a
  second real SQLite handle's held accounting, retained original token and
  identical persisted closed_receipt. Changed secret gives404 before reads.
- publicReceipt narrowly removes sessionId while retaining existing public fields
  and redactions. Actual tokenless /receipts bytes, page and fragment responses
  exclude the seeded session ID/private input/buyer. F8 paid branches, runner,
  settlement pipeline, lineage and H1 projection rewrite were not implemented.

## Independent commands and results

All shell calls used login:false. Every Bun invocation used --no-env-file.

```text
bun --no-env-file x --no-install vitest run apps/hub/test/session-endpoints.test.ts apps/hub/test/receipts-feed.test.ts apps/hub/test/sessions.test.ts apps/hub/test/rails.test.ts
```

Exit0: **101 tests / 4 files**, 1.04s. Components: 56 F7 endpoints, five
public-receipt cases, 30 unchanged F6 cases, ten unchanged Rails cases.

```text
bun --no-env-file test ./apps/hub/test/session-endpoints.bun.test.ts
```

Initial sandbox attempt could not bind its owned loopback servers: 0 pass,
11 fail, 33 cleanup assertions. This is an environmental bind failure, NOT a
behavioral Red. After scoped loopback permission, the exact unchanged command
exited0: **11 tests / 1 file / 184 assertions**, 9.65s. No endpoint source was
changed between attempts. Observed zero external-fetch attempts; children used
allowlisted dummy environments and ephemeral 127.0.0.1 ports. The tests await
owned child/socket cleanup and assert listener connection refusal afterward.
The owned temporary SQLite directory is removed after handle/child closure.

Exact nested TypeScript check used typescript's compiler API from
`bun --no-env-file -e`, reading/parsing the real root tsconfig through ts.sys,
then createProgram with the seven frozen paths below as explicit rootNames,
the parsed root options plus noEmit:true/incremental:false, and the complete
config/parse/getPreEmitDiagnostics set. Result:
**EXACT_F7_INDEPENDENT_ROOTS=7 DIAGNOSTICS=0**, exit0. No nested test was
silently excluded and no compiler option relaxed.

After notifying root of the exact non-test filename, added only the standalone
private fixture `[private standalone boundary script]`. It was added
after root's completed full gate and does not match collected test filenames.

```text
bun --no-env-file [private standalone boundary script]
```

Exit0: **7 separate supplemental cases / 19 assertions / cleanup complete**.
Uses actual durable SQLite and the actual F6/F7 API, an offline rail double and
no HTTP/provider call. Covers accepted 4096-byte ASCII and multibyte secrets,
rejected 4098-byte multibyte secret, mismatching configured secret, rejected BOM
JSON and pre-aborted open with zero writes, and wrong HMAC domain before reads.
Reapplied exact root TypeScript options with that fixture as an explicit eighth
root: **EXACT_F7_WITH_PRIVATE_ROOTS=8 DIAGNOSTICS=0**, exit0.

A further no-file offline probe checked five JSON budget strings ending in LF,
CR, CRLF, U+2028 or U+2029. Observed400 for all and OPENED=0; these observations
are not added to either test runner's count or the 19-assertion supplement.
Owned seven files plus private fixture have no trailing-whitespace matches
(rg exit1 means no matches). No full suite was run by this reviewer.

## Limits and honest handoff

The actual raw-socket tests establish a complete Content-Length-framed fixed
application400/private,no-store response, followed by cleanup of test-owned
sockets. They DO NOT establish peer-initiated TCP EOF. The author's earlier
7.5-second observation explicitly did not see EOF; this review does not turn
response completion into that claim. Malformed HTTP rejected by Bun's parser
before app dispatch is outside the application-private response guarantee.

Local RailTest and offline Gateway-open cases are not payment, mining, funding,
withdrawal, remote reconciliation, batch aggregation or F8 execution evidence.
F9 recovery retains the capability and reads status; it must not auto-replay
close. F1 approval remains consumed and no live spend is authorized. No keys or
ambient secret values were accessed; no external-network, Git or dependency
operation occurred. No production source, collected test or public artifact was
changed. Only the private supplemental fixture and this ignored report were written.

## Verified frozen SHA-256 inventory

All seven match the complete author report; both frozen F6 fingerprints also
match. The private supplement is separately attributed.

```text
6ea6b0f61bc42f1482db75867745bc02de4182864a3e1d4decd50c654c65dd1d  apps/hub/src/server-sessions.ts
8079438b515405e4b0cf507afdc9fc05b54d0f9ac3f6805bf75370e4c088b923  apps/hub/src/server.ts
33c1eec2ba00d91f5817c905f88baa6c06b198e4bc060f7c741c4065a8500ff4  apps/hub/src/receipts-feed.ts
879e6721f02c80abb6029a4d94a35cb2c391308a9f01236676c1cf2e71f7532f  apps/hub/test/session-endpoints.test.ts
e62028ad0042de1ea8c8e09f5103395e84dc3fd46fd85bc0d54cd7de30afbe73  apps/hub/test/session-endpoints.bun.test.ts
e53cd86bd462d06f2ec26266100ec5d18ccd1d668d948bfa8e00312113045c52  apps/hub/test/fixtures/session-endpoints-preload.ts
4178d898b86727a6c1861ac5c781395784e4e1a1f50d6c1902c7dde6524839e1  apps/hub/test/receipts-feed.test.ts
f1f00db9511e7ae17a2119a891e4149cb24e73127c500c7f4940d7cee5e7dc30  apps/hub/src/sessions.ts
f67f5546bc2db8653305f21dcc0a63418ce0d300f38e3dee9e9bd731a96134b5  apps/hub/test/sessions.test.ts
5fc579a798db583fd3fba0e297b21ccf54b95ed075cfc47e4af48d7209223ddd  [private standalone boundary script]
9b7c2f19952df572a0ecca9011b6771e73a17533b1ea473a30a0d3a470a40f5b  task-7-parent-decisions.md
430102c263f3fce30df24a5c47f00e9da038d27942027a0e8bfc006ff9198951  task-7-implementation-readiness.md
```
