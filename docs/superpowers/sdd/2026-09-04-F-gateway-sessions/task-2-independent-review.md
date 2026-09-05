> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F2 independent review — September 5, 2026

Reviewed all seven frozen files and the complete implementation report, then
the full F2 plan, unchanged configured-EIP3009 tests/source, and actual ENS caller
authority. The original report remains unchanged with SHA256
f029726d0b07769d75b83e013c8baa5f9a012b5edfc4673497185e9784f98aab.
All seven source/test hashes matched that report before this review's tests.
F3 files are outside this review's mutation scope.

## Result: two actionable findings; original focused suite passes

1. `packages/buyer/src/fetch-with-payment.ts:221–223`: the new Gateway paid retry
   still reflects `error.message`. An injected paid transport threw an error
   containing the **actual dummy payment-signature header produced by the signer**;
   RpcFailure returned that complete authorization. It is valid for the Gateway
   window and must not enter diagnostics. This catch predates F2, but the new
   Gateway path now reaches it. The parent's requested narrow correction is
   appropriate: only kind===gateway gets a fixed paid-transport message saying an
   authorization was issued and the outcome is unknown/requires reconciliation.
   Preserve method fetch(paid), the one-retry rule, legacy USDC behavior and the
   deliberate unsigned structured policy-refusal path. Do not call this unsigned.

2. `packages/buyer/src/fetch-with-payment.ts:58–63`: the Blob snapshot is not always
   immutable in the actual Bun runtime. `Bun.file(ownedFixture)` is instanceof Blob;
   `Blob.prototype.slice.call(...)` retains a lazy file-backed source. An original
   body consumed by the probe was changed in beforeSign; the paid retry consumed
   the changed bytes. Observed requests were ORIGINAL_BODY then MUTATED__BODY.
   Therefore the new replay guarantee is false for this supported body form.
   Either explicitly refuse file-backed bodies before the probe, or make a bounded
   eager byte snapshot before either request. Any asynchronous snapshot needs the
   approved 1 MiB cap, a finite deadline/cancellation, and no unbounded whole-file
   allocation. Normal immutable Blob/string/URLSearchParams/view behavior should
   remain covered; do not broaden into unrelated response-transport work.

Both are genuine new failure-first regressions in the ignored file
`internal/task2-independent-regressions.bun.test.ts`. The first run completed
after the original 13:04:41 UTC Vitest start and before the 13:06:35 UTC clock
check: 0 passed / 2 failed, 7 assertions, exit1. Boolean assertions deliberately
avoid printing even the dummy issued header. No production fix had been applied.
The file-backed fixture was newly owned and removed in finally. All requests
were injected functions; no external call, real key or payment was made.

## Reviewed behavior without another finding

- Pinned ready chain/USDC/Gateway coordinates, positive canonical uint256 amounts,
  exact payee/value and Gateway604900-second lifetime are checked before signing.
  Named wrong/missing domain metadata refuses instead of becoming USDC. Explicit
  chain assertions cannot select another deployment. No eip3009.ts source change.
- The signer request has separate frozen message/domain/type objects; offline
  recovery binds the returned signature to the canonical account and request.
  Mutation through the signer request and valid but unrelated signatures refuse
  once with fixed signer diagnostics. This is local signature proof, not settlement.
- beforeSign's existing ENS refusal precedes full signing-domain validation; cap
  checks and immutable requirements preserve its authority. The original URL,
  method, header snapshot and copied string/URLSearchParams/ArrayBuffer/view bodies
  survive callback mutation. Multipart and streams explicitly refuse before probe.
- Both actual HTTP attempts use redirect:error and credentials:omit. No extra
  signature is produced after another402. Modern/legacy preexisting-payment guards
  remain. The actual owned two-origin fixture proves a paid307 does not forward
  the signature/lineage to its other origin and that signer rejection sends no
  paid request. Listener cleanup is awaited and post-stop refusal asserted.
- Generic probe/402 decoding and legacy diagnostics remain outside this narrow
  fix. The report correctly does not claim a general bounded response/deadline
  redesign, successful payment, by-name live purchase or batch proof. A callback
  supplied by local code is still a caller seam, not protection against arbitrary
  unrelated code mutating imported runtime globals.

## Independent commands and observed results

- `bun --no-env-file x --no-install vitest run packages/payments/test/gateway-sign.test.ts packages/buyer/test/fetch-with-payment.test.ts packages/buyer/test/ens-hire-by-name.test.ts packages/payments/test/chain-config.test.ts`
  — 128/128, four files, exit0; start18:34:41 IST (13:04:41 UTC).
- `bun --no-env-file test packages/buyer/test/gateway-fetch.bun.test.ts`
  — 3/3,24 assertions, exit0; invoked after13:06:35 UTC,511ms. Explicitly permitted
  owned random loopback listeners only; no external network.
- Actual root TypeScript options with all seven files plus the new private
  regression explicitly targeted — zero diagnostics, exit0. This also checks the
  nested Bun and Vitest tests which normal root globs do not necessarily include.
- Original report, gateway-sign and fetch source hashes rechecked unchanged after
  the runs. The new regression is ignored. No source/dependency/Git/live-state
  mutation occurred. The TypeScript-testing skill guided actual public-boundary
  reproduction and explicit fixture cleanup, not invented import-only failures.

Review is not CLEAN until the two defects are fixed and their real regressions
pass. Parent owns the correction/release decision and full gates. Preserve this
initial review and the original implementation report; append follow-up evidence
instead of replacing the failed checkpoint.
