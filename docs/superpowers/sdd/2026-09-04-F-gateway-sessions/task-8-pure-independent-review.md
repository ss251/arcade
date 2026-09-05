> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F8 pure session-call boundary — independent review

September 6, 2026 (Asia/Kolkata); frozen approximately 20:39 UTC September 5.

**CLEAN within the frozen pure pair.** No production correction requested. This
does not accept the separate paid router, pipeline, public projections, HTTP
transport, or later combined gate.

## Freeze and commands

Read latest task8-parent-decisions in full, including the observed fee/network
policy and early canonical-address/object-key/attempt-owner corrections. Read
the entire source and test file again after G14 supplied the two frozen hashes.
Read actual core JobOutcome/shouldSettle, payment wire/Verified/settlement types,
TestRail and existing output-validator behavior. The ts-testing skill guided the
focused behavioral checks and retention of the actual root compiler options.

```text
93df9c427511c29be2ba13737bab7c48da172a9e7e5add32c0c6ec68adc9529e  apps/hub/src/session-call.ts
5cc1f701cb98c08a82ab424177b5096974adafb57687eb41c11660492b95c0be  apps/hub/test/session-call.test.ts
```

Both hashes matched before runtime checks and again after the independent helper
supplement. No test was run against the earlier moving draft. G14 confirmed its
router/helper dependencies quiescent; B9 retained pipeline ownership.

```sh
bun --no-env-file x --no-install vitest run apps/hub/test/session-call.test.ts -t 'session call admission'
```

Exit 0 at 02:06:45 IST: **22 passed, 21 deliberately skipped, one file**, 754 ms.
The file contains 43 cases; this review does not claim to have executed all 43.
The selected cases use actual local TestRail verification, actual EIP typed-data
signing/recovery with newly generated unfunded ephemeral fixture accounts, and
the actual F3 Gateway implementation with global fetch intercepted by the test.
The Gateway clone is rejected while the original VerifiedPayment reaches the
mocked settle response. This proves local identity/recovery behavior, not remote
verification, actual Gateway acceptance, recipient credit or chain settlement.
No request reached a network or bound a loopback listener.

Installed TypeScript through `bun --no-env-file -e`: read/parse the absolute root
tsconfig with its actual directory and config path, then createProgram with
exactly the two owned absolute rootNames, actual options plus noEmit:true and
incremental:false. All config, parse and pre-emit diagnostics were collected:
**EXACT_F8_PURE_ROOTS=2 DIAGNOSTICS=0 WATCHED_STABLE=true**, exit 0. Strict,
exactOptionalPropertyTypes and noUncheckedIndexedAccess were unchanged. The test
file imports router/pipeline code transitively even though its router cases were
skipped. The two pure hashes plus these transitive hashes were unchanged across
that compiler execution; this is a bounded typing checkpoint, not pipeline
acceptance or its eventual freeze:

```text
3c23c38e56eeb815f89b842e9ae961447fa982d8db5c42dc52786b654e624266  apps/hub/src/server-session-calls.ts
3c41952f250f219e4120c328e4f6ac6fe8459cd2aac1f4ecebf675c832f62649  apps/hub/src/pipeline-sessions.ts
```

## Independent fileless helper supplement

Ran a separate `bun --no-env-file -e` assertion script importing only the pure
helper and actual core/payment foundations; no router/test-file import. Created
an in-memory TestRail, actual local verified authorization, canonical Session
and listing fixture; no reserve, dispatch or settle was called. All assertions
were green on the first run, so none is claimed as a new Red:

- **12 outcome cases:** accepted output is deeply frozen; reject failed status,
  categorized refusal, null/empty/wrong-schema output, invalid start/finish or
  future finish, negative/infinite cost, and oversized combined evidence.
- **7 terminal cases:** fixed release preserves only known finite nonnegative
  inference cost and drops failed output/provider error; accepted Test terminal
  retains the original SettledPayment object, full seller/zero fee and actual
  test reference category; reject wrong payer, amount, hash-shaped Test reference,
  cross-rail category and an unexpected settlement field. Checked all seven
  absent release reference/tree/fee-accrual fields individually.
- **10 own-data cases:** reject accessor, sparse array, symbol key, hidden field,
  Date prototype, negative zero, NaN and function; accessor count remains zero.
  Reject a multibyte object key exceeding a small explicit byte bound while an
  in-bound UTF-8 key round-trips correctly.

Observed final output: **PURE_SUPPLEMENT_ASSERTIONS=39 PASS**, exit 0, 215 ms;
12 outcome + 7 terminal + 10 data cases. The exact executable invocation is
retained in this task's command history, not a new fixture or collected test.
No file was written by it. Its Test reference is simulated local evidence, not
an on-chain hash; it calls terminal builders without sending a payment.

## Boundary conclusions and limits

The own-data walker obtains data descriptors before reading values, rejects
unsupported prototype/accessor/symbol/reserved-tag/cycle shapes and applies
65,536-node/key and depth-64 bounds. It counts raw UTF-8 key/value bytes before
assignment or JSON key encoding; exact canonical F5 serialization independently
counts syntax and escaped bytes. The early oversized escaped-key test checks
allocation order, not an earlier acceptance of an oversized value. This is not
a JavaScript Proxy sandbox or a general event-loop latency guarantee.

Preparation validates exact original challenge equality and accepted challenge
equality, payer/payee, pinned rail/network/domain/token/contract, exact amount,
canonical decimal authorization values, nonzero lowercase nonce and validity
window. All EVM address coordinates are normalized together before verification;
signature bytes are untouched. A noncanonical returned verifier payer/payee or
authorization from/to is refused before admission. The exact original verified
object is frozen and retained; a separate bounded own-data binding/Job snapshot
is created, preserving original createdAtMs and root lineage. These checks do
not replace the actual selected verifier or authenticate an arbitrary forged
VerifiedPayment supplied by trusted internal code.

Gateway/Test/direct EIP allocate full seller price and zero local fee. Splitter
EIP requires verified true, observed safe integer fee 0..10000, exact observed
network and known version; missing legacy observations cannot fall back to boot
fee configuration. The requirements must route to that same observed splitter.
This pure helper consumes prior handshake facts; it does not perform a fresh
contract read or protect against a compromised Store.

Before admission, queued evidence must fit and a fixed release candidate with
worst-width safe timestamp/large finite cost must fit, including 16 extra bytes
of cost-format headroom. Before settlement begin, the accepted combined
Job/outcome and a worst-width local receipt reference/timestamp are checked.
Sizing placeholders are returned to no caller and are never stored or passed
to settlement/finish. Actual terminal references require their rail-specific
shape/category, exact payer/amount, and no unexpected fields. Release artifacts
contain no failed output/provider error, settlement reference, tree artifact or
fee accrual. Accepted artifacts retain the input outcome's validated intended
output and known cost. The existing output validator is its documented subset,
not a new complete JSON-Schema engine or fresh schema-security review.

The trusted pipeline must call prepareSessionOutcome before begin/settle and
pass that frozen outcome to settledSessionTerminal; the terminal builder is not
a second remote verification/dispatch barrier. F5 still validates terminal
relationships and owns atomic persistence. This review does not establish
one-shot pipeline ownership, uncertainty recovery, child-ledger isolation or
output withholding before finish; those remain the separate integration review.

Only this ignored review was written. No production/test/dependency/public-doc
edit, Git operation, full suite, network, operational wallet/Keychain/ambient-env
read, live spend, F1 authority reuse or G/H work occurred. Ephemeral offline
fixture signing above is explicitly distinct from reading or using an account.

## Narrow canary delta — September 6, 2026, approximately 02:14 IST

**CLEAN for the approved canary addition.** The preceding baseline section is
preserved. Its pre-append report hash was
`6afef303caedce50bf2f9dbcdc8675b690c0f4fcadd8f554a2fd11fe5f71458d`.
The baseline's source/test hashes and 22-case result remain historical; current
pure source and final shared test file are:

```text
505269de0137d9e4cd083cc4890262268b44b3a4f3fa6a7ab7b7f9ee22841389  apps/hub/src/session-call.ts
346b7db6a34f8d6bb3e4b4dad92fa5dabd3a9cbfb637bc9179aa0f7387b220de  apps/hub/test/session-call.test.ts
```

Read complete current pure source and the added unit case. Independently removed
only the two optional canary declarations/comment, prepared-context literal-true
projection, shared receipt projection and one new unit case in memory. Both
original baseline hashes reconstructed exactly. That intermediate test hash was
`4170565ce81b8afa0548d026e60ba3f3fdf56e494b5bb7b65f0b5507718915fc`.
G14 then changed only router mocks to use getSessionTerminal. Read those spans;
reversing exactly the five mock identifiers and one wrapped Job/Receipt mock
value in memory reconstructed the intermediate hash exactly. Thus the admission
section did not change again. No reconstruction wrote a file or used Git.

The addition accepts only literal trusted `args.canary === true`, retains it on
the frozen prepared context and stamps both settled/released receipts through
their shared builder. It does not stamp Job or binding. Existing preterminal
receipt size probes include the marker. The pure helper does not independently
verify canary ownership: the router must derive that trusted flag only after
verified payer matches configured canary address, never from request/runner
data. That provenance path still belongs to the full router review.

Repeated the same admission-only command twice: intermediate file **23 passed /
21 skipped**, exit 0, 1.09 s; final shared test file **23 passed / 21 skipped**,
exit 0 at 02:13:48 IST, 926 ms. These are two runs of the same 23 admission cases,
not 46 distinct tests; the router cases were not executed here. G14 reports the
new omission Red at 02:09:37 before correction; this reviewer observed the Greens,
not that historical Red.

A new fileless offline helper check exercised five trusted flag values: true,
false, omitted, string and number, always with input.canary:true. **20 assertions
passed**, exit 0, 99 ms: only literal true stamps both settled/released receipts;
no case stamps Job/binding, and input data cannot classify a canary. Used actual
local TestRail verification and pure terminal builders, no settle/dispatch.

After G14 confirmed router/mock quiescence and the parent getter interface was
present, repeated the exact two-root compiler procedure without weakened options:
**EXACT_F8_CANARY_ROOTS=2 DIAGNOSTICS=0 WATCHED_STABLE=true**, exit 0. The current
pure pair plus router, pipeline, ledger and Store hashes all stayed unchanged
during that check. This supersedes the baseline pure typing checkpoint only;
it is not acceptance of those transitive implementations. No production edit,
collected fixture, full suite, network, live activity or Git operation occurred.
