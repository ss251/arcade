> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F11 journal independent checkpoint review — September 6, 2026

Verdict: **FINDINGS — three reproduced journal contract gaps** against the
quiescent405-line journal checkpoint. Not whole-runtime acceptance and not a
final review of the concurrently evolving runtime/CLI. G14 owns all corrections;
this reviewer changed no production/collected source or shared test.

Read complete latest task11-parent-decisions, full gateway-funding-journal.ts and
the account-wide describe plus imports/helpers of gateway-funding-runtime.bun.test.ts.
Read ts-testing fully and used its deterministic behavioral-test workflow.
Parent/G14 explicitly held the journal source and selected describe during probing.
Only the private regression fixture and this ignored report were written.

## Reproductions

1. **Withdrawal request fee cap is not bound at the first burn-intent record.**
   Given request amount100/maxFee10/maxBurnBlockDelta20/gasCapWei1000, append planned
   amount100, then burn_authorization_prepared with maxFee11 and otherwise unsigned
   scalar facts. Append resolves. validateTransition's frozenKeys only compares a
   later occurrence to the first observed fact; it never compares this first
   maxFee (or first maxBurnBlockDelta) to the captured request. It does compare
   gasCapWei to the request. Require request-policy binding for the relevant
   fields before accepting the durable burn authorization record. This is a
   demonstrated journal-level contract defect; no actual signature/send occurred.

2. **Burn preparation accepts no finite intent/spec evidence.**
   After a valid withdrawal planned event, burn_authorization_prepared containing
   only the operationDigest resolves. The withdrawal-event branch only checks
   request.kind. Unlike transaction-stage intents, it requires no amount/specHash,
   maxFee or finite maxBlockHeight. A hash-chained record can therefore claim
   authorization preparation without its required reconstruction facts. Require
   the closed captured intent coordinates and their policy bindings before that
   state is durable; runtime still owns actual fresh-height/delay and signature
   checks. No journal RPC or redundant signer implementation is proposed.

3. **Signed-complete finalization lacks local transcript prerequisites.**
   For an exact-deposit request, a journal containing only planned amount100 is
   cleanly closed. Supplying the explicit trusted verifier seam's result
   finalized/terminalKind:credited causes finalizeFundingJournal to append its
   finalization record and retire active.claim, although the transcript contains
   no prepared transaction/hash. The signed-terminal branch accepts either
   credited or withdrawal_complete without checking matching request kind or
   minimum reconstructable prepared-stage/hash evidence.
   Require the journal's own matching stage/hash prerequisites independently of
   the trusted runtime's external terminal-effect verification; retain valid
   read-only recovery after unknown send when the known prepared hash and exact
   effects suffice. Do not require an acknowledgement that may have been lost.

The third reproduction intentionally supplies a result to the documented trusted
verifier seam. It is **not** proof that arbitrary CLI/provider input can supply
that callback, nor that the unfinished production verifier falsely proves credit.
Its scope is the missing local transcript gate required by parent policy. Root
and G14 received all three exact reproductions before any source thaw.

## Executed evidence

Before testing, journal SHA was
ca4f982bd8abc39b326ea44f8a1119be8e697b270bab096cb6a9bedb6f88387b.
After all probes at04:41:31IST, it remained exactly the same.

```text
bun --no-env-file test packages/buyer/test/gateway-funding-runtime.bun.test.ts --test-name-pattern 'F11 account-wide'
```

Result:19 pass,0 fail,1 filtered,67 assertions, exit0. Only the account-wide
describe ran; lower runtime tests were not reviewed/executed as acceptance.
Exact journal-only strict:1 root,0 diagnostics, exit0.

```text
bun --no-env-file test [private standalone journal regression fixture]
```

Result:3 pass,3 fail,21 assertions across6 tests, exit1. All three failed assertions
expected rejection but received a resolved promise. This is a genuine behavioral
Red, not an import/path/setup failure. Exact journal+private-fixture strict:
2 roots,0 diagnostics, exit0. Strict used installed TypeScript parsed repository
options, noEmit:true/incremental:false/composite:false and only those exact roots.

The passing independent cases establish:
- Actual claim-sync and header-sync injected failures retain active.claim and an
  account poison marker, refuse a different journal path and omit raw errors.
- Actual hardlink creation causes bounded read/append rejection before accepting
  the multiply linked journal; durable bytes stay unchanged.
- An injected claim-retirement failure occurs after durable finalization but
  leaves claim+poison and refuses a fresh operation; it is not clean completion.

Seven fresh owned temporary roots were created under OS tmpdir and realpath
validated. Every returned journal facade was closed; open/finalizer internal
failure paths close their own handles. afterEach awaited cleanup of only those
owned roots, including synthetic uncertain records after evidence assertions.
No child process, production namespace, operational environment/key, signature,
network/RPC/API, wallet/account query, mutation, Git or full suite was used.
The supplement imports only journal/pure modules, not the moving runtime.

## Source observations and remaining scope

The exact source uses OS userInfo().homedir, not HOME, and a fixed chain/account
claim independent of journalPath/opId. New descendants require owned0700 real
directories; fresh claim/journal use exclusive no-follow opens and0600/nlink1
regular-file validation. Reads are bounded/fatal-UTF8; native O_EXCL supplies the
cross-process exclusion primitive, although these tests did not launch competing
processes. Source plus author selection covers Promise-concurrent ownership and
stale-head appends, same-stage transaction-hash binding, symlink/parent-mode
refusals and append/close/witness failures.

Main-close witness causality is correctly after successful main handle close.
Unsigned/noop finalization requires the matching witness; poison refuses reuse.
The source deliberately treats poison persistence as best effort under arbitrary
storage failure and excludes hostile same-user rewrites/cross-machine ownership.
This review does not broaden that guarantee. The three findings concern the
transcript/finalization policy, not a claim of observed external fund movement.

## Exact checkpoint inventory

```text
ca4f982bd8abc39b326ea44f8a1119be8e697b270bab096cb6a9bedb6f88387b  packages/buyer/src/gateway-funding-journal.ts
3c9fcb887358e13df601c187f9c2405bc969659c409c685bf49aef8598edcc84  packages/buyer/test/gateway-funding-runtime.bun.test.ts
36b490d17888a439f7b77c764374062ca74be2888409c4ec122aa6b6eee406d1  [private standalone journal regression fixture]
6aacac7bae7a2d1514044cce113927ac509c4bbc858bcbfd2476a5dfcad69e35  task-11-parent-decisions.md
```

All four hashes matched before/after the executed probe checkpoint (private
fixture hash measured after its creation). Hold the original Red fixture and
this report chronology for a separately released correction review. No final
CLEAN verdict is issued for this checkpoint.

## Correction review — September 6, 2026, 04:57:44 IST

Verdict: **CLEAN for the corrected journal checkpoint and the three findings**,
not whole-runtime/CLI acceptance. Original findings/Red chronology above remain
unchanged. Read the full corrected journal and three added account-wide tests,
plus complete latest parent decisions (44bfacd6adc99397ca439063fa311d48bd33e2a0a303d5ee1e1e96e24a9ca2b1).
The new deposit-credit-attribution limitation is explicit: pending-list absence
or an uncorrelated available increase cannot establish credited finalization.
The journal's generic verified-terminal seam is not evidence that production
credited finalization is currently available.

Corrections inspected:

- First withdrawal maxFee/maxBurnBlockDelta now equal the captured request;
  target-deposit minimumAvailable/maxDeposit are also request-bound.
- Burn preparation now requires planned source block, exact amount/fee,
  sourceBlock+approvedDelta finite height below maxUint256 and the exact spec hash
  reconstructed from pinned authority/self-recipient/zero caller/empty hook and
  deterministic operation-bound salt. No digest-only preparation passes.
- Before invoking the independent effect verifier, signed finalization requires
  planned plus the matching deposit/mint intent and prepared stage, including
  exact transaction/calldata hashes, amount, nonce and gas/fee fields. The verifier
  result must match request kind, prepared transaction hash and amount. Withdrawal
  completion additionally requires source transaction/block hashes and bounded
  actual fee. Unsigned/noop retain causal witness and no-signer requirements.
  A submitted acknowledgement is deliberately NOT required: known prepared hash
  plus independent complete terminal effects can resolve a lost acknowledgement
  without signing, replaying, repairing or automatically advancing a mutation.

Executed unchanged private fixture:

```text
bun --no-env-file test [private standalone journal regression fixture]
6 pass, 0 fail, 21 assertions, exit0
```

Executed selected collected journal describe (twice, not double-counted):

```text
bun --no-env-file test packages/buyer/test/gateway-funding-runtime.bun.test.ts --test-name-pattern 'F11 account-wide'
22 pass, 0 fail, 9 filtered, 77 assertions, exit0
```

Thus28 distinct tests/98 assertions total across these two bounded selections.
Exact journal+unchanged-private-fixture strict:2 roots,0 diagnostics, exit0.
The positive missing-witness/lost-ack collected case removes a synthetic witness
after a clean close; it is expressly NOT a process-crash experiment or real
credit proof. No new test cases/fixture edits, production writes, network, keys,
signatures, operational namespace, Git or full suite were introduced here.
All owned local test directories/handles were cleaned by the unchanged fixtures.

Retirement/ancestor inspection: the source revalidates owned0600 regular/nlink1
files on bounded reads, canonical realpath/private directory boundaries, exact
claim contents and journal head before finalization, and exact claim contents
again after durable finalization. A persistent exclusive finalizer claim
serializes cooperative retirement. This is pathname unlink following validation,
NOT an inode-pinned unlink/retained-dirfd proof against hostile same-user pathname
replacement. No additional material issue was reproduced within the approved
cooperative same-OS-account model; no speculative adversarial replacement claim
is promoted into a blocker or stronger safety guarantee.

Journal source before/after both remained:
a39d8681027a62e81ae49b719603b88745c8a9df9b5d1a3d5985cbe24b7924f1.
Private fixture unchanged:
36b490d17888a439f7b77c764374062ca74be2888409c4ec122aa6b6eee406d1.
The shared test file was intentionally not frozen as a whole: initial observed
81abb4e0b696adcbc6578608e8a74056a141398ae5be935b4c87a9f2cde6ca38,
later681b5e31be3ad75d00d573b488a43cb841c3ac14807cf7e1235a0dc0a5318d39
while G14 authored only its runtime section. The exact selected account-wide
describe substring (from its describe declaration through the next describe)
was independently SHA-checked before/after the final selected run:
745cdd33cf2ce952e1ac096a4665317a3e0b16fcd0c7d14ea89843e7252d5301,
unchanged. No whole shared-file/runtime freeze or strict acceptance is asserted.

Original report prefix preserved with SHA-256
241d752ae987881e191144393812f4b49eab2ddfef8c4301fa86a981ce457534.
