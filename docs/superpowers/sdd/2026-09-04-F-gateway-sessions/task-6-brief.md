# F6 brief: a thin service over durable session accounting

September 6, 2026. F6 follows the reviewed F5 foundation commit `8b8ebb2`.
The delegated author has frozen only the session service and its collected tests.
Independent implementation review, the parent's F6 repository gate, public review
and atomic commit remain pending at this publication checkpoint.

The [work order](../2026-09-04-A-settlement-core/work-order.md) and
[Plan F Task 6](../../plans/2026-09-04-F-gateway-sessions.md#task-6-session-lifecycle--open-reserve-commit-close)
call for the session lifecycle. The accepted implementation replaces the literal
plan's unsafe process-local aggregate holds with a stateless facade over
[F5's authoritative Store](task-5-brief.md). It does not add another ledger,
mutable accounting map, payment effect or session endpoint.

## Decisions and recorded evidence

- [Implementation readiness](task-6-implementation-readiness.md) retains the
  original proposal and its additive correction for honest TestRail references.
- [Independent readiness review](task-6-readiness-review.md) examines the proposed
  interface and failure boundaries. It is a design audit, not source approval.
- [Parent decisions](task-6-parent-decisions.md) resolve admission, input,
  interruption and closed-receipt behavior before implementation release.
- [Author report](task-6-report.md) records the implemented contract, genuine
  failures, focused commands and frozen source fingerprints.

These historical copies preserve their dated pending/held statements. The later
F5 commit and F6 implementation do not rewrite those statements into earlier
successes. A separately delegated reviewer is checking the frozen F6 source;
the parent retains final review, full-gate and commit authority.

## Current bounded contract

`makeSessions({store, rails, chain, newId?})` delegates job-correlated lifecycle
operations to F5. `newSessionId()` keeps all 32 UUID hex digits.
`sessionReceipt(snapshot)` projects one complete, actually closed snapshot;
neither an open empty session nor a fabricated current timestamp proves closure.
Begin reads authoritative identity/rail before its single atomic one-time claim.
Semantic retries preserve the original Job even after closure; duplicate close
still returns the Store's closed error.

Input normalization precedes routing reads. Commit/release preserve their exact
terminal variants. Real-rail volatile admission refuses, but already-attempted
terminal evidence and uncertainty remain recordable. Original interruption causes
survive; unexpected Store defects have fixed errors and never cause compensation.
Returned status/receipt objects are fresh, frozen and whitelisted. Exact held,
spent, remaining, time, call and reference relationships are checked, not repaired.

The author passed 23 F6 Vitest tests and a focused 80-test group across F6, the
F5 kernel/core and F4 registry, plus exact-root-options typing of both owned files
and their dependencies with zero diagnostics. Two genuine draft failures concerned
foreign-network and zero-priced closed projections; they are distinct from the
initial missing-module failure. Other adversarial checks passed when added and
are coverage, not additional claimed Reds. These are author results, not a new
public-copy rerun or a completed independent/full-repository gate.

One test drives the actual offline TestRail outside the facade, then commits its
unchanged simulated result through F5. It is not Gateway payment or mining proof.
Test locators, EIP hash categories and Gateway transfer UUIDs remain distinct;
there is no current Gateway batch completion or explorer inference. No new SQLite
restart/death experiment was needed or claimed for this delegation layer.

F7–8 still own header-only capabilities, private/no-store routes, stable-secret
preflight, public receipt session-ID exclusion, verified authorization binding,
pre-barrier terminal-size validation and withheld uncertain output. F1's one-shot
live approval is consumed; F6 grants no key, deposit, transfer, withdrawal or new
live evidence authority. Full F remains ahead of G, H and I.

The document-generation skill guided the separation of current contract,
historical planning and measured evidence. Original private files are unchanged;
only the standard banner and an exact private-report-to-public-report locator
replacement were needed. No private journal, fixture source or handoff is copied.
