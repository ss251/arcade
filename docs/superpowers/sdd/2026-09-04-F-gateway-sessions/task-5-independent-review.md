> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F5 independent review — September 5, 2026

Review of all twelve frozen source/test files listed in `task5-report.md`, the
complete report, parent decisions and adversarial preparation. No production
source/test, dependency, Git or live changes. Private reproductions only.

## Findings, accepted by parent

1. **Actual offline TestRail result cannot finish an admitted session.** The real
   `makeTestRail.verify/settle` produces `0xtest<nonce-prefix><index>`, whereas the
   session kernel treats every non-Gateway result as an `onchain` category and
   requires a 32-byte hash. A real test session can open, reserve and claim its
   one-shot barrier, then `finishSessionJob` refuses the actual result. Existing
   success fixtures used invented hash-shaped test references, hiding this
   compatibility gap. No network or actual transfer is involved in the repro.
2. **Closed artifact schema omits rail/reference-category correlation.** A public
   `SessionReceipt` labeled `gateway` accepts a settled call with `onchain` plus
   a hash, while the ledger itself correctly rejects this combination. This is a
   schema consistency/defense gap, not an observed remote settlement exploit.

Private genuine regressions at **2026-09-05 15:20:41 UTC**:
`bun --no-env-file test [private independent regression fixture]`
returned **0 pass / 2 fail / 4 assertions**. The actual TestRail case reached its
finish call and received Left instead of Right; the contradictory closed artifact
did not throw. Original private test SHA256:
`129a5a22360d5f4c8e23ac37bd2a8e727f848170d8ce4aeea7ae26e4554aa62c`.

The original test used the then-supported `onchain` receipt category because the
foundation normalized omitted test-rail result kinds to it. Parent accepted an
explicit honest `test` category instead: preserve real RailTest output and its
omitted optional result kind, correlate each closed call with its session rail,
and keep Gateway transfer-only / EIP onchain-only. The private expectation will
changed only that receipt category to `test` before capturing the missing-schema
Red. At **15:26:05 UTC**, the same private command again produced **0 pass / 2 fail
/ 3 assertions**: the real-rail case now failed earlier at the Receipt constructor
because `test` was not in the schema, while the closed-artifact contradiction
still did not throw. This is a contract correction, not a claim the original test already named
the new category. Original implementation report is retained unchanged.

## Independent checks on the original frozen source

- **67/67 Vitest, five files**, 6.25s, exit 0: core sessions, memory/kernel, existing
  Store, pay-test Store and ERC-8004 document tests.
- **63/63 Bun, 264 assertions, five files**, 8.01s, exit 0: session SQLite, existing
  SQLite, tree ledger, pay-test history and document persistence.
- Exact real-root compiler options over all twelve source/test files PLUS the
  new private reproductions: **0 diagnostics**. Root include omissions were not
  used to avoid nested tests. `git diff --check` 0.
- All twelve source/test hashes matched the original report inventory. Original
  `task5-report.md` SHA256 remains
  `b9148c884ff13f295a559bf58811a87db11c4f52f043ac7296b8d71d7c5c7979`.

## Reviewed authority and remaining limits

The shared kernel normalizes bounded own-data copies before routing fields;
canonical semantic retries compare immutable binding/input and retain the
original job, except intentionally ignored proposed new job ID/time. Conflicting
legacy IDs refuse. Active holds include reserved/settling/uncertain; no post-barrier
release, second claimed permit, automatic retry, timeout-release or spend reset.
Terminal Job/Receipt amounts, membership, input/version and allowed reference are
correlated; duplicates cannot replace immutable evidence. Memory returns copied
session-owned evidence, and legacy writers/backfill cannot overwrite it.

Read the real SQLite transaction implementation and its query/trigger/COMMIT/
two-handle/death tests. Selected operations are bounded by 100 calls; the approved
global count-only preflight protects missing-row/tombstone detection without
claiming tamper authentication. New session writes read current disk under a
synchronous writer transaction and publish no pre-commit session state. Legacy
global receipt APIs remain global and separately validate receipt correlation.
Parent independently reviews this SQLite/counter/global-receipt scope too.

No other concrete blocker found in the bounded read. This does not prove a remote
service accepted payment, signature validity, mined Gateway batching, recipient
credit, production throughput or host-volume survival. F6–8 still must bind the
actual verified rail result, prevalidate terminal size, protect capabilities and
retain uncertainty. Final CLEAN requires review of the accepted corrections.
