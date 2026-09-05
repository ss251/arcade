> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F9 buyer session author checkpoint

September 6, 2026. Implementation in progress; not final acceptance, a full gate,
live evidence or funding authority. Parent released F9 after F8 commit `1953256`.
Funding remains F11; session ENS/hire, MCP/CLI changes and operational keys are out
of scope. Parent owns combined review, full gates, public copy and atomic commit.

## Ownership and exact API

Parent approved the eight-path source handoff and then a 5/3 author split. This
author owns session.ts, session-wire.ts, additive index export, session.test.ts and
additive promise-api.test.ts. B9 owns session-http.ts, session.bun.test.ts and the
single fixtures/session-runtime.ts. Ordinary fetch-with-payment/core/payments/hub/
MCP/CLI/dependencies are unchanged by this author. B9 reports native fixtures
separately; do not attribute their counts to this author's unit suite.

Public root exports now include:

- `openSession(OpenSessionArgs): Effect<BuyerSession, BuyerSessionFailure>`.
  Args: hubUrl, account, budgetUsd, optional rail/fetch. Authority/body snapshots
  are captured before evaluation/await; token remains closure-private.
- BuyerSession immutable id/buyer/rail/network/budgetAtomic;
  `call({seller,skillId,input,maxAmountAtomic?,maxWaitMs?,pollIntervalMs?})` returns
  SkillResult with locally issued authorizedAmountAtomic and fencedResult;
  `status()` returns validated SessionHubStatus plus localIssuedAtomic,
  localConfirmedAtomic and localExposureAtomic; `close()` returns exact
  SessionReceiptJson. Seller argument means URL service name, not wallet address.
- Parent-approved F10 refinement: read-only
  `quote({seller,skillId,input,maxWaitMs?})` returns immutable
  `{priceAtomic,rail,network,serviceName,skillId,skillVersion,seller}`. Returned seller
  is the listing wallet. Actual-input private probe uses both session headers;
  no signature/reservation/debit occurs. Call performs its own fresh probe.
- `openSessionPromise(args, {signal?}?)` returns a frozen Promise facade with
  call/quote/status/close and the same public identity. Each method accepts optional
  `{signal?}` and runs its single issued Effect once. No cleanup mutation/retry or
  assumption that scripts import the SDK's Effect runtime.
- `BuyerSessionFailure` has fixed code, phase (`unsigned`, `issued`,
  `mutation-uncertain`) and locally known authorizedAmountAtomic. No raw provider,
  token, input, signal.reason or reflected error method is retained. Effect runtime
  interruption remains interruption; the Promise boundary preserves original
  tagged failures via Effect.either rather than FiberFailure stringification.

Closed/terminal projection consumes the exact F7/F8 wire, not the stale plan query
token or ordinary callSkill poller. Both session headers scope actual-input probes
and the one paid retry; result GET adds x-job-token at exact token-free same-origin
job path. No session fallback, remote redirects, `/jobs/:id` metadata recovery or
receipt-tree output channel. Gateway UUID/Test references stay unlinked; EIP hash
category/link is not independent mined proof. Splitter routing/fee remain trusted
hub handshake assertions, not SDK pre-sign contract verification.

The SDK retains a monotonic issued total before entering the captured signer;
confirmed/unresolved are classifications of that total. Released/absent/closed hub
evidence never refunds issued authority. New signatures check cap, captured budget,
reserved/issued amounts, unmatched hub obligations and independently validated hub
remaining; known overlap is not counted twice. This is per-instance local policy,
not persistent or wallet-wide accounting. F10 retains its separate process ceiling.

## Test chronology so far (IST)

- 02:35:25: missing session-wire module collection failure, zero tests. Not a
  behavioral Red. Initial eight implemented cases exposed only a test-side naked
  JSON.stringify(BigInt); fixed the test replacer, not production behavior.
- 02:39:44: genuine 8 pass/1 fail: valid closed calls with reordered JSON object
  keys were rejected. Explicit normalized call-field projection fixed it.
- 02:41:49: missing session module collection failure, zero tests. Kept separate
  from the wire checkpoint. Initial lifecycle implementation: 15/15 at 02:47:00.
- 02:49:00: genuine 19 pass/2 fail: syntactically correlated success accepted empty
  output; later status could erase a locally confirmed job. Nonempty success gate
  and selected membership/terminal correlation corrected those behaviors.
- 02:50:09: 21/21 Green. Then pure Schema decoding reflected a malformed sentinel
  (22 pass/1 fail at 02:50:38). Fixed Schema projection now discards parse details.
- The first close/status race test observed only base fixture requests, missing
  intercepted status reads. Correcting its counter produced the genuine
  02:51:04 Red: recovered-closed client performed a new read after a late pending
  close reply (2 vs 1). The late reply can no longer reopen terminal local state.
- 02:51:42: 23/23 Green. Initial exact strict found one fixture function missing
  Bun fetch.preconnect; corrected its structural dummy fetch, no cast suppression.
- Added actual Gateway/EIP signature recovery, captured input/account/fetch,
  cancellation before/after signer entry, lost6+6 budget10 concurrency, malformed
  ENS/hire before IO and selected-chain drift checks: 28/28 at 02:54:24.
- Added root Promise boundary tests: 35/35 across two files at 02:55:40.
- Parent's quote refinement: collected missing-method Red at 02:56:37 (1 fail,
  28 skipped); 36/36 with Promise tests after implementation at 02:58:07.
- Parent identified an owned pending-poll timer leak. Genuine 02:58:42 Red observed
  one real 60-second timer retained after interrupted exit, expected zero. Test
  cleanup cleared only its observed handle. Replaced the inner unowned Promise
  timer with cancellation-owned pause; 37/37 at 02:59:22. Rechecking captured chain
  at actual signer entry was added as parent hardening, not claimed as a reproduced
  scheduling Red.
- G3 independently found throwing Proxy traps escaping pure normalization. Author
  reproduced all three traps at 02:59:54 (3 fail, 30 skipped), against frozen wire
  `8ef937395a5e7b7a36d2d9feac519a7b66e8574e194329ad44624461197a1e75`.
  Parent approved a narrow outer fixed-error wrapper. This was a pure helper
  diagnostic leak, not a demonstrated outer SDK leak or hostile-Proxy sandbox.
- Latest completed checkpoint 03:00:22: **40 Vitest /2 files**, including 33 session
  and 7 Promise tests. Exact five owned source/test roots with actual root compiler
  options and dependency traversal: **0 diagnostics**. No full suite was run.

Commands: `bun --no-env-file x --no-install vitest run
packages/buyer/test/session.test.ts packages/buyer/test/promise-api.test.ts` and a
fileless TypeScript createProgram over the five owned roots, noEmit true,
incremental false, actual tsconfig options. Focused private/native team checks are
reported by their owners. No author test process remains running at this checkpoint.

## Partial freeze and remaining work

Pure wire refrozen for G3 review after the approved Proxy correction:
`ea2b7e792482cc94ea71939ab0e99afbd29caa474e40d4e1db968220a15c0bef`.
Shared unit file at that checkpoint:
`5097f02ac92160156b6082d977acff61fa3a3c872b7840a0edf88adacc107f06`.
Lifecycle source at that checkpoint:
`23a32ec8b2eee7a8acd814484916aa863f666bc642dafc754a8bb650bb4f5862`.
The latter two are not final freezes: independent wire tests use a coordinated
quiescent slice while remaining lifecycle regression/review work continues.

Still required: final lifecycle evidence/correlation checks, combined focused
legacy buyer regression group and exact strict, B9 native fixture report/hash
verification, independent review and final eight-path freeze. Parent full gate
and commit remain pending. No live transfer, deposit, withdraw, ENS write or
operational credential was used. Native fixtures are owned loopbacks only; socket
cleanup is not proof of cancellation of any remote paid work or Bun peer EOF.

## Final author freeze — supersedes the in-progress checkpoint above

All eight source/test paths are now frozen. At 03:03:13 a final genuine lifecycle
Red reproduced a second distinct issued job presenting the first operation's
terminal reference: output was incorrectly released (1 fail/1 pass/33 skipped).
The per-instance terminal correlation now rejects duplicated references and any
reference/status contradictory to an already confirmed operation before output
or confirmation mutation. The accompanying real elapsed-deadline case passed on
its initial run: one signer, bounded pending timeout, no additional authorization.

Final focused author verification on frozen source:

- **361 Vitest /10 files**, 03:04:57, exit 0: every existing collected buyer suite
  plus gateway-sign.test.ts. This includes 35 session and 7 Promise tests; no
  uncollected native cases are hidden in that count. The earlier run passed 359
  and hit two unchanged hire-test Unix-socket EPERM errors. A scoped local-socket
  permission rerun passed all 361 without source/test changes.
- **37 Bun /3 files /161 parent assertions**, exit 0, 11.66s: new native session
  file plus unchanged F2 gateway-fetch and gateway-replay. The actual unfinished
  HTTP body hit 5004.69ms; the unchanged Blob-stall case hit 5001.66ms. Exact owned
  listeners/children were closed/reaped by their fixtures. Child-internal
  assertions are not added to Bun's parent assertion count.
- Exact five owned roots and dependency traversal: **0 diagnostics**. Final exact
  eight-root check including B9 native/fixture files is recorded below when done;
  this is not the full root/web type gate.

Focused commands were the buyer directory plus the single existing signer suite,
and exactly the three named native files, using --no-env-file. Only owned local
sockets/loopbacks were permitted; no external services, keys or paid work occurred.
B9's complete frozen native author report was read by this author:
`task-9-http-native-report.md`, SHA-256
`31ee0cd8760a8dda6411952a86f2f0d2ecb635d25acc479dd7dd9363ee44cc74`.
It separately establishes actual package/script imports, Test success/release,
Gateway's real F2 signer/F3 verifier across owned facilitator fixtures, and SQLite
close/reopen evidence. Its initial 24/86 count and quoted source dependency are
historical; this author's final combined native rerun used the final SDK hash below.

| Frozen path | SHA-256 |
| --- | --- |
| packages/buyer/src/session.ts | e2813a3e7ea83898d16dce7aaebce114537c44fe2cc2b402dee1cdc7b72323bb |
| packages/buyer/src/session-wire.ts | ea2b7e792482cc94ea71939ab0e99afbd29caa474e40d4e1db968220a15c0bef |
| packages/buyer/src/index.ts | 25bb0e50918093a3a7b62065f7bbe4e2392b52946fbc111f26983a377cd2e1ca |
| packages/buyer/test/session.test.ts | 1c74d6e82b2e64130517187f6168e63148efd13a987bb2a766118163157535f0 |
| packages/buyer/test/promise-api.test.ts | 13d96edbe7b9f0fe1a54b9acf553a43cddf784629187ed07cec3194b093e4ed0 |
| packages/buyer/src/session-http.ts | fbb95a382a0922bf01234d8c006704690a341f63532e151dff1bec74dcc27fb9 |
| packages/buyer/test/session.bun.test.ts | 848b0c81b0802b59da14f851238774f668e635d616517061a1803508ee41d635 |
| packages/buyer/test/fixtures/session-runtime.ts | 3e92a4a49a304006e47c8bd8b8e30c19f2645cd0753ab9b483095c2989ab95c2 |

Removing only the new session re-export reconstructs index.ts baseline
`858ad5c6989c9f4aff2d326a0656e4a129f1c2178c01506cac6609a44dc88a7c`.
Removing the one new Promise import and appended session describe block reconstructs
the original Promise test baseline
`1ba9bbeb3f886e01df0a3b9a8485a0efba6a3e47e28004cf46abd8631071ebd3`.
Actual unchanged F2 transport/signers, MCP, and both F7/F8 route hashes match the
readiness/frozen inputs. No Git command or unrelated source mutation was used.

The ts-testing skill influenced genuine regression-first boundaries, preservation
of setup/environment failures as distinct from product Reds, actual signing/runtime
coverage and exact nested strict checks. Independent lifecycle/wire review and
parent full repository gates/commit remain pending at this freeze. Source will
only thaw for a coordinated concrete review correction.

Final exact eight-root TypeScript program completed with **0 diagnostics** using
the absolute root tsconfig/configFilePath and all eight absolute owned paths,
noEmit true and incremental false. All eight final hashes matched afterward.
No author commands, children, listeners or test sessions remain running.

## Additive independent-review correction — temporal closed evidence

This section supersedes only the lifecycle freeze above. The original 188-line
report body is retained byte-for-byte, SHA-256
`8bb0005689186dbf02caf1ed51f0ca8ba31997761c30d965b19829acea464e16`.
The six other F9 source/test files and all previously recorded historical results
remain unchanged. Parent explicitly released only session.ts and session.test.ts
for this correction, with this append-only report update; no public documents,
full repository gate, Git, operational keys, external network or spending.

B9 independently reproduced two temporal reporting defects on the e2813a3 source:
an in-flight pre-close status could return closed:false after close had already
been proved; a later individually valid closed artifact could change closedAtMs.
In both cases the original SDK still refused a new call before IO or signer entry.
These are closed-observation consistency defects, **not signing reopen** or a
demonstrated financial bypass. Its third semantically identical/reordered-key case
already passed. The independent fixture remains unchanged at
`[private lifecycle regression fixture]`, SHA-256
`a9ba25e3412dd40470b1d1906917e3778366b1788a53bd4f50b2248b879f90de`.

Author reproduced that exact private fixture before any source correction:
**1 pass / 2 fail / 12 assertions**. Four collected lifecycle regressions were then
added. At **03:13:20 IST**, the targeted subset produced **3 genuine behavioral
Reds / 1 pass / 35 skips** against the unchanged production source. The third Red
reached its first changed openedAtMs case; the additional call-field, reference,
and amount cases in that test are follow-up coverage, not separately claimed
pre-fix Reds. The nested-object-key reorder case passed before and after.

The correction checks the CURRENT closed observation inside reconciliation after
IO, rather than relying on the dispatch-time wasClosed boolean. It fingerprints
the first fully decoded and locally reconciled closed receipt using an explicit
projection of every complete scalar field, every call's fields, and settlement
references. The decoder already bounds the artifact to 128 KiB and 100 calls;
the fingerprint introduces no unbounded collection or new accounting ledger.
Object-key order is irrelevant. Persisted call/reference array sequence remains
significant. A differing closed artifact is rejected before local reconciliation
updates, and only a fully accepted proof can install the retained fingerprint.
An intervening rejected response cannot replace it; a later matching proof stays
readable. No protocol, public API, Promise facade, wire, signer or transport change.

At **03:13:54 IST**, exact collected session/Promise tests passed **46 / 2 files**
(39 session, 7 Promise), followed by the unchanged private fixture **3 / 12
assertions**. Native session tests then passed **24 / 86 parent assertions**;
the actual unfinished response body reached its bound at 5003.77 ms. These native
tests retained the actual root/Promise imports, Test success/release, Gateway
signer/verifier, owned loopback and temporary SQLite close/reopen coverage. Their
owned children/listeners were cleaned up; no external payment or provider access.

An exact TypeScript program using the absolute repository config and all eight
F9 source/test roots plus the unchanged private regression had **0 diagnostics**
(noEmit true, incremental false). Commands were narrowly:

```text
bun --no-env-file x --no-install vitest run packages/buyer/test/session.test.ts packages/buyer/test/promise-api.test.ts
bun --no-env-file test [private lifecycle regression fixture]
bun --no-env-file test ./packages/buyer/test/session.bun.test.ts
```

New frozen hashes:

| Path | SHA-256 |
| --- | --- |
| packages/buyer/src/session.ts | 1c91030172feb22a57b371977f33d378dfefdb5434f077c5eff83a150892c56d |
| packages/buyer/test/session.test.ts | b5ed74583a02ddc155af162e82886fbd86fc2f56b7c252726db50fefd020fa12 |

The six unchanged F9 hashes match the historical inventory above. The ts-testing
skill influenced the genuine regression-first reproduction and explicit temporal
ordering assertions. Source/test are frozen for B9 and parent re-review; the parent
owns subsequent complete repository gate/publication/commit. No author commands,
children, listeners or test sessions remain running at this correction freeze.
