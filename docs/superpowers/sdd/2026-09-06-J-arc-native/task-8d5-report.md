# J8D5 — explicit hub activation and owned shutdown

Implements the [boot brief](task-8d5-brief.md) after the
[request-bound routes](task-8c2-report.md). The code can now explicitly compose
the guarded escrow rail, original Store/broker, durable journal and pipeline.
No live configuration was installed; no usable ARCADE deployment pins exist
while J6's size and treasury checkpoints remain unresolved. Buyer lifecycle
is Task9 and live combined proof is Task10, neither claimed here.

## Activation contract

Both ARCADE_ESCROW_CONFIG and ARCADE_ESCROW_JOURNAL are required. No flags means
no file/journal/key/network lookup; unknown escrow variables fail closed. Armed
configuration requires Arc5042002, a gateway/eip3009 default, explicit canonical
ARCADE_DB, a bare HTTP(S) public origin, stable secret(at least32characters,
at most4096UTF8bytes) and the known
ARCADE_FACILITATOR_KEY matching the pinned evaluator. No ephemeral fallback.
The existing Gateway/exact/provider authorization validity policies are unchanged.

The public JSON contains exactly the full ten identity pins, canonical positive
decimal gasCapWei, explicit expiresInSeconds and operationTimeoutMs. These use
the existing J7 validation ranges, not new authorization policy. Config is
canonical/owned/single-link/NOFOLLOW, not group/world writable, ≤32768bytes with
strict UTF8. DB/action parents must be owned0700. DB and existing sidecars must
be owned regular single-link non-writable-by-others files. Config, DB, action
journal and their SQLite auxiliary names cannot collide. Action journal sidecars
are refused rather than implicitly recovered. The private action file remains
owned0600 with its existing DELETE/EXTRA/fsync guarded journal.

Preflight reads no journal and creates no DB. Invalid public config fails before
key acquisition. A valid preflight derives only the evaluator address from the
explicit key; the returned frozen public plan contains no secret. Runtime accepts
only that original captured plan, rechecks config bytes/paths and concrete Store/
broker availability, then opens the journal. Signer acquisition revalidates the
current process key and cancellation immediately before signing. No key or path
value is included in configuration refusals. Construction performs no chain IO.
Fresh guarded chain checks remain mandatory before any actual action.

## Process lifetime and reproduced failure

The initial actual-process tests caught a real ordering defect: the journal
closed before verification cleanup; an admitted root was still executing when
that close marker appeared. Effect's layer provision owns an inner scope, so
wrapping the provided application in an outer scope let the layer release its
journal before application finalizers. The application now creates its scope
inside layer provision, so request cancellation, admitted child-fiber cleanup,
tree closure and durable uncertainty precede journal release. No deadline was
widened to fix this. SIGINT/SIGTERM feed the actual runtime AbortSignal only when
armed; repeated graceful signals keep waiting for the same cleanup. Exit occurs
after finalizers. A fixture-only duplicate signal originally killed a terminating
process; the harness now sends intentionally and verifies repeated-signal behavior.
The existing legacy Store close/migration behavior is not changed.

## Verification

The initial scaffold reported the absent module. Final focused49Bun/2files,
194assertions passed in2.84s; five-root strict checking reported zero diagnostics.
Earlier68Bun/3files,477assertions passed in9.17s including unchanged legacy boot.
Actual subprocess tests assert one concrete journal/Store/rail construction,
invalid signer refusal before files/listener, private diagnostics, repeated
SIGTERM/SIGINT verification cleanup, budget-action cleanup, and independently
read SQLite uncertainty/closed tree/no fabricated receipt after admitted-job
shutdown. All subprocesses/listeners are bounded and cleaned up.

Fixtures use generated ephemeral keys, real owned files/SQLite/journals and
synthetic verification/inference/action ports with external fetch forbidden.
They do not prove a live signature/capability/funding/settlement or deployment.
The sole sequential full gate passed5,106Vitest/235files in71.29s and
1,237Bun/84files,9,954assertions in190.11s; root/web strict checks and both
client/SSR builds also passed. Twelve paths/134local links passed scope/privacy
audit; five frozen code/test pins are checked again before commit.
No owner key, real RPC, transaction, spending, deployment, approval replay,
existing validity/cap/replay change, production configuration or push.

Next: Task9 journaled buyer escrow lifecycle, offline until live prerequisites
are resolved. J4/J5 live and J6 treasury/size pauses remain in force.
