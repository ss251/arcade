> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F6 implementation readiness — thin durable-session service only

September 5, 2026. Planning only; F5 is still G14-owned, evolving and unreviewed.
No F6 source or collected test exists as a result of this brief. Read full literal
Task 6, adjacent Task 7, the complete parent decisions including semantic retries,
the F5 implementation brief, current Job/Receipt, Store, Rails/Rail/SettledPayment,
F2 request replay and F3 settlement behavior, current paid-pipeline consumers and
the actual H1/H4 privacy/link contracts. No network, key, live run or full gate.

## Smallest proposed ownership

After F5 has frozen, passed independent review and committed, release only new
`apps/hub/src/sessions.ts` and `apps/hub/test/sessions.test.ts`, plus an ignored
task report. Add an owned SQLite wrapper test only if the already-tested F5 Store
cannot demonstrate a particular service delegation property through existing
fixtures. No new DB tables, ledger transitions, Receipt fields, global session
map, broker, token generator, endpoint, rail implementation, payer signing,
deposit, browser or pipeline work belongs to F6.

F5 already owns the optional Receipt fields and pure/core accounting types.
Import its frozen `SessionStore`, `SessionBinding`, `SessionTerminal` and
`SessionSnapshot` contracts; do not duplicate their structure or assert-cast a
future API. Names below are proposals to align after its freeze, not a claim that
the current draft is approved. Preserve the useful plan export names where safe,
but reject the literal amount-only signatures rather than adding unsafe overloads.

## Proposed thin service

Prefer one import-safe `makeSessions({ store, rails, chain, newId? })` factory.
It receives the actual F4 configured `Rails` and explicit trusted ready chain
configuration; never read a network, secret or provider from environment at import.
No new Context/Layer is required unless the parent wants one for existing wiring.
The factory has no mutable accounting state and never calls a rail.

| Method | Delegation / result |
| --- | --- |
| `newSessionId()` | Fresh UUID-derived full 32 lowercase hex digits after `ses_`; no plan's 20-character truncation, IO, retry loop or secret |
| `openSession({buyer, budgetAtomic, rail?, openedAtMs})` | Resolve only `rails.get` / exact configured default, supply trusted chain CAIP-2 and fresh ID, then one `store.openSession`; return committed Session |
| `snapshot(sessionId)` | One authoritative `getSessionSnapshot`; absent becomes typed SessionNotFound, never invented zero counters |
| `reserve(binding, queuedJob)` | One `reserveSessionJob`; return original `{created, jobId}` unchanged so F8 never dispatches an idempotent retry |
| `beginSettlement(sessionId, jobId)` | One `beginSessionSettlement`; preserve `claimed:false` as no-send, never a second settlement permit |
| `commit(settledTerminal)` | One `finishSessionJob` with full immutable job/receipt and actual rail result, never a caller boolean or amount |
| `release(releasedTerminal)` | One `finishSessionJob` for a definite pre-barrier nonsettlement and full terminal evidence; no release-by-amount fallback |
| `markUncertain(sessionId, jobId)` | One durable marker operation; failure propagates and the prior settling hold remains authority |
| `inFlightAtomic(sessionId)` | Effect reading current snapshot.heldAtomic, including reserved, settling and uncertain; no synchronous global Map |
| `closeSession(sessionId, atMs)` | One atomic Store close; project its returned committed snapshot, not a separate stale read |
| `sessionReceipt(closedSnapshot)` | Bounded pure projection of an actually closed complete snapshot; no arbitrary receipts argument and no fallback current time |

The explicit timestamps are trusted caller operation times, validated as safe
nonnegative integers. Capture once before the write. A convenience injected
clock can be discussed, but projection never fills missing closedAtMs with
Date.now and never makes an open session look closed. Any closed retry behavior
must preserve F5's exact already-committed artifact, not overwrite time. F7 may
choose its documented 409 policy without mutating that artifact.

Opening must not imply funded balance, escrow, a credit line or a new authorization.
Suggested defense in depth: refuse a non-test rail when `store.sessionStorage`
is volatile, using the backend-derived fact rather than an ARCADE_DB string.
F5 may support volatile stores for pure tests; F6/F7 must not turn that into a
production paid-session guarantee. Parent should confirm whether this check is
in F6 or only F7. Stable-secret capability configuration remains an F7 requirement,
not a reason to pass the secret into accounting. F4 Rail exposes only name, not
its chain, so the trusted assembly must build the registry and supply this chain
consistently; F8 additionally compares actual verified network to the binding.

Use `Effect.suspend` around Store invocation so synchronous throws are contained
along with failed Effects. Preserve the fixed approved SessionError tags;
unexpected defects become a fixed local storage failure. Never attach raw SQL,
provider prose, authorization, nonce or arbitrary input to errors. Do not add
`retry`, timeout-based release, fire-and-forget mutation or compensating writes.
F5 synchronous transactions are authoritative; timing out a response cannot
prove a write or settlement did not occur.

## Closed artifact and status projections

Derive SessionReceipt only from one validated closed snapshot: session ID, buyer,
rail/network, budget/spent/held, bounded calls, settled-call count, distinct
settlement references, openedAtMs and the actual persisted closedAtMs. Require
complete and held zero; an uncertain/pending/open snapshot is not a closed receipt.
Calls already carry their immutable state, price, job/skill identity and reference
kind. Do not join against global allReceipts, silently drop corrupt calls, invent
missing receipts or recalculate authoritative spend from an unrelated array.

Money stays BigInt in the service. The later HTTP boundary serializes atomic
fields as exact decimal strings and preserves the planned price strings with
declared units. No Number conversion. Core SessionCall schema shape alone is not
the ledger invariant; F5's authoritative snapshot is the source of its arithmetic.
Optional pure projection validation may check consistency, never repair it.

`settlementRefs` is only distinct recorded references. Current Gateway values are
transfer-acceptance UUIDs; N calls need not become one reference or one mined batch.
F3 returns a locally correlated accepted transfer, not available recipient balance
or independent on-chain proof. Its SettledPayment has payer/amount/reference/kind,
not recipient/nonce/log coordinates, so F8 must keep the exact verified binding
and result together; F6 cannot manufacture stronger provenance from that object.
Unknown reference semantics are refused or typed unknown, not labeled onchain.

## Failure-first service tests after release

Start with actual missing-export Reds, then behavioral tests against a real F5
memory Store using the configured test rail. Use spies only for dispatch/delegation
boundaries and an adversarial failing Store; never duplicate the ledger algorithm.

1. Import/factory inertness; full canonical unique ID format; no rail challenge,
   verify, settle, provider fetch, deposit or account callback at open/read/close.
2. Opening picks only the configured default or exact built name; unknown/prototype
   rail names and invalid buyer/budget/network/time refuse before mutation. Real
   rail plus volatile backend refuses at the parent-selected preflight layer.
3. Same semantic retry with changed proposed job/time returns original job ID and
   created:false; wrapper never dispatches, alters binding or constructs another
   reservation. Changed input/version remains typed conflict from the Store.
4. Two 60-of-100 service reservations admit one; same-price independent jobs cannot
   release or commit one another. Held comes from current Store state, not a cached
   Session argument. Two service objects sharing one Store have no separate budget.
5. Only one begin returns claimed:true. Repeated begin, post-barrier refusal,
   timeout, typed failure, defect and uncertain state never reopen the budget.
   Store-marker failure is propagated without a compensating release.
6. Commit delegates the exact correlated terminal evidence once, preserves unknown
   outcomes and does not call putJob/putReceipt/putSession separately. Conflicting
   duplicate completion refuses; identical completion is F5's no-op. Service
   tests use simulated results and do not claim rail/pipeline execution proof.
7. Close refuses all pending states. Missing/open snapshot cannot produce a closed
   artifact; actual close time is preserved even if a test clock later advances.
   Corrupt counts/references never become a partial-looking complete receipt.
8. Bounded canonical calls array, deep-copy independence, exact >2^53 values and
   transfer UUID metadata survive projection; no nonce/signature/input/private
   diagnostics appear. No hardcoded one-batch count or Gateway explorer URL.
9. A Store function throwing before returning an Effect and one returning a typed
   failure both have fixed channels and cause no follow-up mutation. No dangling
   promises, global reset helper, retry loops or import-time clock/IO state.

Use the existing Vitest runner and exact root compiler options including the
nested test file. Any added SQLite test owns fresh local files/handles and awaits
cleanup, without a hub process or real rail. Parent owns full gates and publication.
These are intended tests, not currently executed Reds or Greens.

## F7 / F8 / H compatibility gates

- F7's documented GET shape uses `session_id`, rail, budget, spent, remaining,
  closed and **calls: SessionCall[]**. Its literal implementation incorrectly
  returns receipts.length; preserve the bounded array, not a numeric replacement.
  Add network, held and complete deliberately for authoritative uncertainty display.
  Remaining is budget minus spent minus held, never budget minus spent alone.
- Closed POST returns the core SessionReceipt artifact; do not confuse its
  `sessionId`/`budgetAtomic` fields with the GET's snake_case/price-string fields.
  No fabricated settlementTx property: calls use settleRef/settleRefKind.
- F7 handles canonical session IDs and canonical 32-hex `x-session-token` only.
  The plan's URL-token fallback is forbidden; every success/error is no-store,
  token errors do not enumerate existence, and the server—not F6—bounds HTTP
  bodies/deadlines and verifies stable capability configuration before real use.
- Parent explicitly requires a **pre-release F7/F8 failure-first public projection
  correction**: sessionId must never escape public receipts. FROOT still has the
  pre-H rest spread at receipts-feed.ts:26–48; reconcile a narrow compatible fix
  with HROOT's already-committed explicit H1 whitelist on its later canonical
  merge. Do not move H1 ahead of full F or edit that source in F6. Preserve all
  existing public privacy and canary fields, and later test tokenless HTTP bytes.
- Actual H4 txLink requires an explicit ready known network, eip3009, settled and
  full nonzero hash. Gateway transfer/batch labels get no fake Arcscan link;
  private session pages may display a validated opaque reference honestly.
- F8 must branch before legacy putJob/putReceipt, which F5 now guards for session
  jobs. It preserves admission's original job ID/createdAtMs, prevalidates bounded
  terminal candidates, commits the one-shot barrier before the rail call (including
  synchronous throws), and publishes output only after atomic accepted completion.
  Current pipeline's generic false-settlement catch is not safe for this branch.
- Initial session plus non-root lineage is refused before challenge/admission.
  Seller-funded sub-hires never inherit buyer session authority. No implicit
  dual-ledger accounting, scheduler, expiry release or automatic reconciliation.

F5 remains unreviewed; this proposal must be rebased conceptually on its frozen
approved interface before F6 source release. F1 spending authority is consumed;
this document authorizes no F13 session live proof or additional payment.

## September 6 additive F5 reference-contract correction

The opening and closing unreviewed/evolving wording records this brief's original
planning checkpoint, not the current F5 source state. F5 is now frozen and its
independent six-file reference correction review is CLEAN. Parent full gate has
passed; public review and atomic commit remain before any F6 source release.
The actual API/source freeze is recorded in task5-reference-correction.md and
task5-reference-review.md; use the full task6-parent-decisions.md for the approved
thin-facade and backend-durability policy. No F6 export is implemented by this note.

Supersede any inherited EIP/test-to-onchain normalization assumption. Only a
bound test rail normalizes its actual omitted optional payment kind to the
explicit test category. Its lowercase 0xtest reference contains ten nonce hex
characters and at least four counter hex characters, bounded to 128 characters.
The unchanged actual TestRail is simulated local evidence. Only EIP-3009 may
normalize omission to onchain with a nonzero 32-byte hash-shaped reference;
Gateway still requires explicit gateway-transfer and a canonical UUID. No current
terminal or closed Gateway artifact accepts the reserved gateway-batch category.
None of these categories independently proves mining or recipient credit.

F6 must preserve the actual F5 SessionCall/SessionReceipt category and closed-rail
correlation rather than reconstructing the literal plan's stale union. Use real
TestRail-shaped fixture results for test sessions; do not edit the payment result
type, actual rail or manufacture onchain hashes. Keep F7/F8/H projections honest:
test references and Gateway transfer UUIDs never acquire transaction explorers.
Status/close still derive one authoritative bounded snapshot and must not repair
contradictory evidence. Parent source release is still required; F1's one-shot
approval remains consumed, with no new key, network, payment or session live run.
