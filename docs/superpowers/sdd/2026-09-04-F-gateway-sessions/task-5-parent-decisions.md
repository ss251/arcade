> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F5–8 parent decisions — 2026-09-05

Read the full independent `task5-accounting-review.md` and the original F5–8
plan/current store, SQLite, paid route and pipeline contracts. This is an approved
implementation adaptation, not shipped behavior, executed tests or live authority.

Adopt the review's smallest durable authority: `sessions` plus `session_calls`,
immutable canonical binding, exact bigint TEXT accounting, job-correlated states
`reserved`, `settling`, `uncertain`, `settled`, `released`, and a hub-wide unique
authorization claim (network/domain name/version/contract/payer/nonce). Retain
claims after release; matching retries return the existing handle without a new
execution. No signature/token/private key is persisted in the new ledger.

Use a shared pure transition kernel for memory parity and SQLite transactions.
SQLite mutations read current disk inside synchronous BEGIN IMMEDIATE; commit
durably before publishing any in-memory result. Reads query current disk, not a
stale cached session Ref. Validate redundant fields/canonical amounts and fail
closed on corruption. Exact session admission and terminal writes include the
queued/terminal Job and Receipt atomically; do not compose unsafe memory-first
legacy writes and claim crash safety. No unrelated legacy store rewrite.

Approve the proposed bounded interfaces and fixed tagged errors in the review,
including one-shot `beginSessionSettlement`, `finishSessionJob`,
`markSessionUncertain`, authoritative snapshots and pending-safe close. Keep
`putSession` only as create-or-identical checking if compatibility needs it. No
stale-snapshot mutable spend overload. Cap 100 lifetime calls per session and
10,000 retained sessions per store; retain unresolved evidence at capacity. Use
a finite SQLite busy timeout and explicit bounded per-row data.

Settling must be durable before invoking a rail, including synchronous exceptions.
Post-barrier ambiguity remains fully held, with fixed uncertainty and no output,
retry, false "not charged" claim, or timeout/expiry release. Accepted Gateway
spend means the facilitator's correlated transfer acceptance, never mined batch
or withdrawable credit. Terminal acceptance must match binding and allowed
reference shape; no caller boolean can establish it. Duplicate terminal writes
are identical no-ops only; conflicts cannot replace earlier evidence.

Nested calls: never inherit the root buyer's session into seller-funded sub-hires.
For the initial F5–8 implementation, explicitly refuse an incoming request that
combines a session header with non-root lineage before any admission or signing
challenge. This bounded limitation avoids claiming atomicity across the existing
tree ledger and new session ledger. Ordinary sessionless sub-hires keep existing
behavior and own funding. A future same-buyer nested session extension requires
one atomic dual-ledger transition and its own crash/uncertainty tests; do not
silently relax the refusal. Document this limitation for F9/F10/H consumers.

Private session namespace uses canonical header-only capability, no-store on
every response/error, request/body/deadline/count bounds, configured rail lookup,
and stable configured hub secret plus durable store for real paid sessions.
Opening never deposits or signs. Status exposes bounded calls, held, remaining
and completeness; close refuses pending holds. Preserve actual H1 public receipt
whitelist and H3 canonical ASCII token guard on later integration.

Release F5 as store/types foundation only after F2 review fixes are frozen and
before F6/F7/F8 source. F6 is the thin correlated accounting service; F7 routes and
F8 pipeline follow independent review of this foundation. Require the review's
genuine Reds for disk/memory parity, two handles, nonce races, commit failure,
restart, atomic evidence and immutable/corrupt records before implementation
freeze. Full repository gate and atomic commits remain parent-owned.

F1's .5 USDC deposit and .001 USDC payment approval is consumed. No F13/live
sessions, new authorization, settlement, withdrawal or credential retrieval is
approved by this design decision.

## Foundation source release after F4

F2 `02b6921`, F3 `f2292f2`, and F4 `a5a3f4e` are separate reviewed/full-gated
commits. The source freeze boundary is now released for F5 only, using the exact
core/kernel/store/test ownership proposed in task5-implementation-brief.md.
Approve the optional Receipt sessionId and settleRefKind schema additions moving
forward from F6 so atomic terminal persistence can decode the real contract.
Approve minimal existing store-test empty-state parity only when a genuine
missing-field diagnostic demonstrates the need; retain all assertions.

Approve a backend-derived readonly `sessionStorage: "durable" | "volatile"`
service fact: memory and SQLite :memory: are volatile. A disk-backed SQLite claim
means tested local restart durability, not a promise about host/volume retention.
Approve new-session-path bounds of 16 KiB binding/accounting metadata and 1 MiB
each serialized Job/Receipt, UTF-8 bytes, maximum structured depth 64 and 65,536
visited nodes. Reject cycles, accessors and malformed/non-data values without
coercing them. These are explicit new session-path limits, not legacy promises;
F8 must prevalidate predictable terminal size before the one-shot settle barrier.

The existing boot reaper must exclude session-ledger jobs; opening a second live
store handle cannot reap/release another handle's admitted or settling work.
Nested session roots remain the explicit parent-approved restriction above.
Do not write F6 service, F7 routes, F8 pipeline, buyer/CLI/UI or any live command
in this release. Focused Reds/Greens and exact-target checks only; the parent
owns independent review, public preparation, full gates and commits.

## Admission retry and evidence boundaries

For an already-claimed authorization, compare every immutable semantic binding
coordinate, including session, buyer, rail/network, asset/domain, recipient,
amount, nonce, time bounds, skill ID and explicit skill version, and the bounded
canonical request digest recomputed from queued input. An otherwise identical
retry returns the ORIGINAL job ID without execution even if its caller proposes
a fresh job ID or queue timestamp. Ignore those two proposed identity fields
only in this existing-authorization lookup; do not rewrite the original row.
Reject any conflicting existing job ID, different semantic input or binding.
Job has no version field: validate the explicit version in the immutable binding
and against terminal Receipt rather than claiming to derive it from Job.

Approve refusing reserved `__bigint` keys in raw new-session input to prevent
collision with the legacy SQLite JSON revival convention, with focused tests
and a documented new-path-only limit. Existing sessionless inputs are unchanged.

Legacy putJob/putReceipt must not rewrite session-owned job evidence. Reject
those narrow cases with fixed local errors while preserving existing signatures
and other legacy behavior; also reject a legacy receipt inventing a sessionId
without an actual ledger binding. Exclude session receipts from legacy fee-sweep
backfill. All session terminal evidence is written through the atomic session
API. These guards require genuine regression tests, not a broad store redesign.

## Parent corruption and bounded-query review corrections

The parent review reproduced legacy-ID reuse on an otherwise matching retry,
missing reserved/released call rows erasing holds/tombstones, and global evidence
loading making unrelated corruption block a selected session. Preserve these
genuine regressions. Check a proposed job ID's current ownership before returning
an existing authorization, including legacy Job and Receipt ownership.

Approve redundant session call_count and held_atomic with a canonical header
envelope, plus a nullable UNIQUE settlement_key on session_calls. Selected reads
and transitions load only the chosen session and at most 100 lifetime calls with
their corresponding jobs and receipts. Global authorization/reference conflicts
use exact indexed lookups inside BEGIN IMMEDIATE. Compare selected rows against
header metadata; persist counters atomically. Validate missing rows and orphans
before the boot reaper. Use TEXT/BigInt money, never SQL money SUM/CAST.

Legacy allReceipts/statsFor are inherently global APIs, not newly paginated ones.
They must include fresh session terminal receipts after cross-handle writes and
restart, with bounded per-row validation/correlation rather than repeated global
session/job scans. Do not omit corrupt evidence or lose fresh session statistics.
An unrelated corrupt Job must not block a selected session status read; corruption
in that session's own evidence fails closed.

For mutation admission only, approve a count-only global preflight inside BEGIN
IMMEDIATE: compare the retained integer call_count total from at most 10,000
headers with actual session_calls COUNT before nonce admission. This closes the
active second-handle deletion/reuse gap without decoding global evidence or
aggregating money. Prove deletion followed by same-nonce admission in a different
session with a genuine Red. Avoid cache/data_version complexity. The documented
corruption envelope catches missing/extra rows against retained counters; it does
not claim protection against adversarial coordinated rewriting of all redundant
metadata. No API deletes retained calls or authorization tombstones.

## Superseding actual TestRail compatibility correction

Independent B9 review reproduced an actual makeTestRail challenge/verify/settle
round trip whose real 0xtest reference could not finish after the durable barrier.
The earlier parent EIP/test normalization decision assumed a hash-shaped test
result; actual source disproves that assumption. Supersede it: only EIP-3009
normalizes an omitted kind to onchain. A bound test rail normalizes it to the new
explicit test category, never onchain. Gateway continues to require its explicit
canonical transfer kind. Do not change actual TestRail or its optional payment
result type to manufacture compatibility.

Approve test in core SessionRefKind, Receipt.settleRefKind and the session ledger
reference type. Bound its lowercase 0xtest reference to the actual rail's prefix,
ten nonce hex characters and at least four counter hex characters, within the
existing128-character limit. This is simulated local evidence only. A settled
test call cannot use an onchain hash/category and vice versa. Closed SessionReceipt
must also correlate each settled call's category with its declared rail; Gateway
UUID validation uses the same canonical version/variant shape as the ledger.
Current foundation has no accepted gateway-batch terminal path; do not make that
reserved future category usable as a current Gateway completion.

Preserve the earlier frozen task5-report unchanged as historical. Add a correction
report with exact new source hashes and the review Red chronology. Add collected
actual RailTest roundtrip and persisted/reopened test-reference coverage. Synthetic
test-rail fixtures must use the correct reference shape/category; explicitly record
that change, retain EIP hash coverage. The original private reproduction used the
previous compatibility category; its intentional contract correction must be
documented before rerunning. No live rail, key, external network or F6–8 release.
