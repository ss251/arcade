> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H10b2 single-threaded browser signer checkpoint

September 6, 2026, after H10b1 `ef44e50`. The owner machine-load restriction
remains active. Parent authored and self-reviewed this small signing boundary;
no delegate, parallel or independent-review claim.

## Implementation and evidence chronology

Read the actual existing browser signer/wallet, H10a context, H10b1 approval,
payment Gateway classifier/domain/signer, EIP3009 signer/verifier/shared types,
wire schemas and existing Gateway mutation/recovery tests. The existing active
browser signer always selects the USDC domain; the actual Gateway implementation
uses GatewayWalletBatched/1 and the pinned wallet. This source-composition finding
is not presented as a native-browser reproduction.

Wrote the brief and51 focused tests before implementation; no missing-module run
was manufactured as a product Red. First implementation passed51/51 at14:09:54IST
(1.07s total/267ms tests) and exact two-root nested-web strict returned0.

Self-review added11 cases, including null deadline, high-s flip-v with independently
recovered equivalence, invalid/backward clocks, expired authorization, zero nonce,
accessor options and listener cleanup. The14:11:39 run had five failures: one
real null-deadline validation defect and four fixture failures caused by retaining
the deliberately failed dependency evaluation after the invalid-environment test.
The latter was corrected with scoped module-cache cleanup, not production changes.
Also corrected array table fixtures so each account-list case receives the actual
array, and made the high-s equivalence proof observable outside the provider callback
so a swallowed assertion cannot satisfy a refusal test.

The14:12:38 run, with production unchanged, retained exactly the null-deadline
failure (61 passed/1 failed). Replaced nullish defaulting with explicit undefined
defaulting. Final14:13:01 focused run passed164 across four files:62 new signer,
44 H10b1 approval,3 passive import and55 unchanged shared Gateway signer tests.
Exact two-root nested-web strict again returned0. No full gate was repeated.

## Boundary and limitations

The helper captures closed complete context, buyer, options and provider method
before any await. Imports of environment-selecting payment modules occur only
inside the bounded explicit action. Shared classification refuses unsupported
selected coordinates and malformed Gateway without fallback. Existing shared
domain/types are copied/frozen; actual original payee/amount and random nonce are
retained for recovery. EIP3009 keeps validAfter0; Gateway uses the actual600second
backdate and604900second window. Both use the original challenge lifetime.

The one overall monotonic deadline covers lazy imports, pre-sign account/chain
reads, one frozen JSON-RPC signature request, local canonical65byte low-s recovery,
and post-sign account/chain reads. Invalid/backward clocks, mismatched account,
wrong domain/message/signer and late authorization refuse. Only own numeric4001
is a wallet-reported decline, never provider-message regex/coercion. Fixed messages
do not reflect private errors or assert that outside funds were not charged.

Abort closes local continuation and removes listeners/timers; it cannot close an
already displayed wallet prompt, revoke a signature, interrupt synchronously
blocking hostile provider JavaScript or sandbox global tampering. Late callbacks
are observed and cannot resume wallet reads or return a signature. The controller
must separately consume H10b1 authority and verify fresh actual-input/ENS quote
before signing and forwarding. This helper does not create approval authority.

Returned signed data is browser-private. No HTTP/storage/broadcast/retry/connect/
switch or current Chat/Confirm/relay/sign.ts/payment-package mutation. The new
helper is not active until complete UI integration. No native wallet/browser,
real key, live payment, previously approved one-shot, production configuration,
ENS, deployment, mainnet action or push was exercised.

## Frozen source pins

- `apps/web/src/lib/ordinary-payment-sign.ts`: `e0370e93cdca980c7d399bf7252cc8aae27a2cf8d1f20f47474cb94c5199c66f`
- `apps/web/test/ordinary-payment-sign.test.ts`: `b27c75386069a5aca6caff16aae167275bd59965e69faed2aa2e97ee1af953e5`

A read-only sanitized process inventory found no active gate/worker candidates.
The sole full gate started at14:14IST with Node-hosted Vitest maxWorkers4/
minWorkers1/maxConcurrency4, then sequential Bun max-concurrency4 without parallel,
root/web strict and actual client/SSR builds with envDir:false. Source is frozen.
This written checkpoint is in-flight, not full-gate success or H10 completion.

## Completed sole full gate

The same gate started14:14:06IST and closed exit0. PASS:3,714 Vitest/154files
(48.53s),834 Bun/54files/6,091 assertions (162.71s), root/web strict and actual
client310ms/SSR161ms builds. No full sweep repeated, no overlapping gate.
The existing application build is not evidence that this still-unused helper
was exercised in a native browser. Source remains frozen for public audit and
the explicit six-path atomic commit, with no active UI or production change.
