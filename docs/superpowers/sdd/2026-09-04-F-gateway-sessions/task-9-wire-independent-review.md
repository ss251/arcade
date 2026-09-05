> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F9 independent wire review — September 6, 2026

Verdict: **CLEAN after one author-owned correction**, limited to frozen
`packages/buyer/src/session-wire.ts`. This is not final F9 lifecycle, HTTP,
Promise/native integration, MCP or full-gate acceptance.

Read the complete original182-line wire module; complete task9 source handoff and
parent decisions (including the later active-session quote refinement); core
Session/SessionCall/SessionReceipt, Receipt and JobOutcome contracts; payment
requirements types and F2 requirement/signing guards; relevant committed F7 status/
close and F8 challenge/result projections. Read repo instructions, existing test/
compiler configuration and the author's pure test group. The ts-testing skill
informed the isolated deterministic behavioral checks, with no new framework.

## Finding and correction chronology

Original frozen SHA-256:
`8ef937395a5e7b7a36d2d9feac519a7b66e8574e194329ad44624461197a1e75`.

`sessionData` did not normalize reflective exceptions: a Proxy trap for each of
getPrototypeOf, ownKeys and getOwnPropertyDescriptor throwing a synthetic private
sentinel escaped as its original Error, not SessionWireInvalid, retaining that
sentinel. Independently observed all three using a wire-only unsigned in-memory
`bun --no-env-file -e` probe. Each output was `false true` for
`instanceof SessionWireInvalid` / sentinel retention. This diagnostic probe exited0
by design; it is not claimed as a failing test-suite exit. Root and author were
notified before correction. No outer SDK leak was asserted: that evolving boundary
was outside this review. Ordinary accessor descriptors already refused without
invocation; reflective proxy execution is not sandboxed by this decoder.

Author reproduced a separate collected Red and added only an outer fixed-error
normalization wrapper, then froze current source:
`ea2b7e792482cc94ea71939ab0e99afbd29caa474e40d4e1db968220a15c0bef`.
Read the correction. Independently removed that wrapper and restored the original
function declaration **in memory only**; reconstructed SHA exactly matched the
original frozen hash. No other production wire delta was needed or observed.
All three private regression cases now enforce the fixed error class/message.

## Independent executed evidence

- Coordinated quiescent shared test imports with G14 before execution:
  `bun --no-env-file x --no-install vitest run packages/buyer/test/session.test.ts -t 'buyer session wire boundary'`
  at03:01:52 IST: **14 passed, 19 skipped, 1 file**, exit0. This was deliberately
  a pure subset, not all33 tests or full lifecycle acceptance. At run entry the
  shared test hash was `5097f02ac92160156b6082d977acff61fa3a3c872b7840a0edf88adacc107f06`
  and transitively imported session.ts was
  `23a32ec8b2eee7a8acd814484916aa863f666bc642dafc754a8bb650bb4f5862`.
  Author was released to continue those two files immediately afterward; these
  hashes are a historical run checkpoint, not their final freeze.
- `bun --no-env-file [private standalone wire regression fixture]`:
  **21 cases / 415 assertions / 0 failures**, exit0, about130ms. Standalone
  non-collected fixture; imports only wire/core, uses unsigned synthetic values,
  no session.ts, signer, credential, transport, real account or external IO.
  Its exact filename was disclosed to root before creation.
- Exact TypeScript program using repository tsconfig options, explicit roots
  `packages/buyer/src/session-wire.ts` and the standalone fixture, transitive
  dependencies retained: **2 roots / 0 diagnostics**, exit0. Executed through
  `bun --no-env-file -e` with installed TypeScript's readConfigFile,
  parseJsonConfigFileContent, createProgram and getPreEmitDiagnostics.
- Current wire hash remained `ea2b7e...` through final checks. No production
  source/test edit, full suite, Git, network, key, signature, live payment,
  dependency or public-artifact operation was performed by this reviewer.

## Concrete coverage and retained limits

Own-data copies are detached/frozen; ordinary getters never run. Checked cycles,
non-JSON values/prototypes, sparse arrays, forbidden/symbol keys, early key/value
UTF-8 and escaped-JSON byte bounds, depth/node bounds and fixed reflection errors.
Checked exact money above2^53, uint256 ceiling, canonical display round trips,
origin ambiguity and six-field open projection without retaining remote notes.

Validated pending/reserved/settling/uncertain versus released/settled accounting,
positive prices, bounded unique jobs and distinct rail-correct references; complete
does not mean closed. Closed artifact must be complete, zero-held, temporally
valid, exact identity/budget/settled sum/reference set and agree with enclosing
status calls, including timestamps/references independent of JSON property order.
No fabricated close time or duplicate-ref deduplication is accepted.

Checked narrow listing projection, exact challenge amount/resource/payee/network/
domain/category/timeout, direct versus EIP splitter rules, opaque accepted token
and exact query-free same-origin result URL. F2 paymentRequirementsKind supplies
the actual pinned verifying-contract guard; malformed challenges cannot bypass it.
Its fixed local refusal is distinct from SessionWireInvalid, but contains no
untrusted diagnostics. Splitter ownership/fee remains the explicitly accepted
trusted-hub assertion, not independently verified pre-sign authority.

Checked terminal linkage to captured session/buyer/seller/skill/version/nonce/job/
root lineage/amount/rail/network; bigint fee arithmetic and exact displays;
safe timestamps, optional cost/canary, category-specific explorer and no extra
receipt-signature/tree fields. Empty success output refuses; released output is
strictly null with no settlement reference. Exact pending202 and uncertain503
carry no output. Test/Gateway references remain unlinked; neither a reference nor
an EIP explorer URL is independent proof of mining, batching or withdrawal credit.

These stateless decoders validate one snapshot/result. Cross-snapshot monotonicity,
duplicate terminal references across separate result responses, issued exposure,
call/status/close races and token retention must still be checked in the final
session.ts review. HTTP JSON parsing/framing/UTF-8/cancellation and actual dual/
three-header delivery belong to the separate transport/integration reviews.
The production F7/F8-shaped fixtures used here are not a live hub execution.

## Provenance inventory (SHA-256)

- Current wire: `ea2b7e792482cc94ea71939ab0e99afbd29caa474e40d4e1db968220a15c0bef`
- Private standalone fixture: `704fbfef460e07f56a22c79637e52c1fa994dfa8173fb0a8ef70cbe0c176ca0b`
- task9-parent-decisions.md (204 lines): `649ec58efc239dc4ba177da447075d64012186e7c2ec6f9a6163a1811794f7c8`
- task9-source-handoff.md: `472df04aa4b580a5347bccd6c7f79c2f3e08da0d4412239806b3f3873a9ecff4`
- packages/core/src/session.ts: `dacf26d4279a6bfde6c0f606c8c827a59baf07a8170669fd4882dbbf40c8cc4e`
- packages/core/src/receipt.ts: `91fdc4768350f24ae1ae70f3de2eae8cb65d09fe4d2781bd96e2b154fd3a07cd`
- packages/core/src/job.ts: `f729bdcf18df602e2b767ad76f11f44b2557976ffb5f7aada4e91841dc1bb7b8`
- packages/payments/src/types.ts: `c4f6ef0ab92af7d98f0f616fa311b2a7b12028f6316e483c35e5a2cd15548d04`
- packages/payments/src/gateway-sign.ts: `6b8621b0ea5aa793441d877f07877523f377e0274de9c2feeda998e438a28893`
- apps/hub/src/server-sessions.ts: `af7c3467a69c94873200f08cf92f53b50f61d61aab1167841a85548139445968`
- apps/hub/src/server-session-calls.ts: `10b5a25bc9c3ab365e2a9db8b395d67954a7880912bd464d8f1a5f14f007103c`
