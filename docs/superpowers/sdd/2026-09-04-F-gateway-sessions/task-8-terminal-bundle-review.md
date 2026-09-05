> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F8 selected terminal-bundle independent review

September 6, 2026, 02:14:28 IST (September 5, 20:44:28 UTC).
Verdict: CLEAN within the four-file correction scope. No actionable finding.

Read the complete parent correction report and latest parent decisions, the
selected Store helper/interface, both complete test files, and actual SQLite
selected-read transaction/decoding. Used ts-testing for focused behavioral
verification. No source/test edit, full suite, Git action, network, credential
access or live spending. Only this private review note is written.

## Authority and compatibility

- Exact scalar session/job ID bounds precede the read callback. One selected
  state is read and validated through unchanged F5 ledger/digest invariants;
  selected session/call membership precedes returning terminal evidence.
- Reserved/settling/uncertain returns undefined. Missing/corrupt terminal Job or
  Receipt fails unavailable, not pending. The returned Job and Receipt are actual
  persisted evidence, each defensively copied from that same validated state.
  No separate global getJob, allReceipts, cache or generated terminal participates.
- The helper body is synchronous and uninterruptible. JavaScript scheduling
  cannot interleave an ordinary asynchronous update between validation and its
  two copies. This is not a hostile in-process Proxy/accessor sandbox guarantee.
- getSessionReceipt remains a projection of the same helper. Original refusal,
  corruption, copy, restart, selected-query and memory-whole-state cases remain
  unchanged and pass. Copying the selected Job additionally is necessary for the
  new pair; it does not change receipt bytes or accounting state.
- SQLite still loads one selected session using its existing four-SELECT read
  transaction, at most101 selected rows per bounded query, then validates the
  parsed detached state. This is not a physical one-row getter. No SQL, schema,
  transition, F6 or write operation was added. Memory honestly retains whole-state
  validation and can refuse selected access for unrelated in-memory corruption.
- Actual memory mutation after the bundle returns cannot change that prior pair;
  the next read detects the digest mismatch. The API does not promise to observe
  writes after a completed read. Router consumption of this pair is G14's separate
  responsibility and is not accepted by this four-file review.

The parent report preserves its actual7 Vitest/2 Bun missing-method Reds and the
earlier demonstrated router race. I did not revert source or rerun old Reds.
No test-only type cleanup is misclassified as a product failure.

## Independent checks

From the F worktree:

```text
bun --no-env-file x vitest run apps/hub/test/session-receipt.test.ts apps/hub/test/session-ledger.test.ts apps/hub/test/sessions.test.ts apps/hub/test/store.test.ts
94/94 tests, 4 files PASS; start02:14:19 IST

bun --no-env-file test apps/hub/test/session-receipt.bun.test.ts
14/14 native SQLite tests, 68 assertions PASS
```

Independent exact TypeScript createProgram used the absolute root tsconfig path,
its absolute parse directory and configFilePath, all original compiler options
plus noEmit:true/incremental:false, and exactly the four owned source/test roots
below. Output: EXACT_F8_BUNDLE_ROOTS=4 DIAGNOSTICS=0 at02:14:28 IST.
Owned temporary databases/handles were cleaned by the existing fixtures; no
listener, external service or wallet was involved.

Read-only fingerprint audit matched every seven-file pin in the parent report.
Removing only the new getSessionTerminal interface line reconstructs the prior
getter ledger hash76665c4f…a265. Removing only approved getter/observed-listing
additions reconstructs the original F5 Store hash233311c6…75e4. Removing only the
new terminal-bundle test blocks reconstructs BOTH complete original getter test
hashes b2a99525…5e80 and d5d7038f…426d. Thus their original assertions/helpers are
byte-identical, not weakened. SQLite and F6 match their unchanged full-file pins.

```text
9eddd13eb1d8a5462aac3a905cb2fef05d14509407fc22b9e7859a7109a66b32  apps/hub/src/session-ledger.ts
ce1649dac5d9c809b45efaa02d4741db3172c10036afa3ef78ffa6077d1a2e55  apps/hub/src/store.ts
59170ddc1f2a3a614dea2c21b514cc7107c168e7758d74a1c7acd49784091d76  apps/hub/test/session-receipt.test.ts
f8a756678c10c1005d5044e168599d49540b0b743257f058f44452d6e2966bdb  apps/hub/test/session-receipt.bun.test.ts
97d866953795b0e9e6e9c72052a799ebc1b10fe5356d853cd722c8264567b69a  apps/hub/src/store-sqlite.ts
f1f00db9511e7ae17a2119a891e4149cb24e73127c500c7f4940d7cee5e7dc30  apps/hub/src/sessions.ts
f67f5546bc2db8653305f21dcc0a63418ce0d300f38e3dee9e9bd731a96134b5  apps/hub/test/sessions.test.ts
```

Pipeline source/tests/report remain frozen at their prior checkpoint. F9 source
remains held; no implementation preparation is presented as source acceptance.
