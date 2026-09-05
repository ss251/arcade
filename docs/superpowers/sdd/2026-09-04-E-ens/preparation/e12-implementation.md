> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# E12 helper implementation — frozen

Owned source: `apps/hub/src/ens.ts`; tests: `apps/hub/test/ens.test.ts`.
Root owns server wiring, real HTTP fixtures and the ordered commit. No keys, live RPC,
payments, git staging or commits were used. Context7 tools were unavailable; existing
core naming helpers, hardened buyer ENS policy and installed project Effect patterns
were used without adding a provider or framework.

## TDD evidence

- 08:58:43 genuine missing-module Red.
- Initial 31 helper tests Green at 09:02:11, then global typecheck clean.
- 09:04:14 genuine Red: a malformed truthy current-snapshot callback admitted metadata.
  Current checks now require explicit boolean true.
- Root review found fixed-order starvation. 09:04:59 genuine fake-clock Red showed that
  two bounded cycles with three stalled prefix names never reached a later live name.
  The cursor now advances before every attempted lookup, including timeouts, and rotates
  the next cycle. A preceding test syntax typo was corrected and is not product evidence.
- 09:05:22: 38/38 helper tests Green; `bunx tsc --noEmit` and `git diff --check` exit 0.
- 09:06:20: 41/41 combined helper + root actual hub HTTP tests Green. The HTTP fixture
  uses the real router/signed job flow with simulated payments; it is not live proof.

## Contract and safety adaptations

- Required plan exports preserved: makeEnsWatch, EnsWatch, handleNames. Added exported
  EnsListingSnapshot, parseEnsSellerLabels, seller-aware isExpired(id,seller?), current
  snapshot callback, and guarded metadata callback as agreed with root.
- Public mapping is bounded to 256 full lowercase nonzero seller addresses and 64 KiB
  JSON; canonical labels use the setup's actual labelId rule (1–63 characters). The
  setup permits one-character custom labels although automatic sellerLabelFor requires
  at least three. Mapping and snapshots are copied; getters are not read as data.
- Full resolveEnsListing uses the hardened E8 exact-registration-aware reader, not raw
  stock text presence. Missing required records produce the legacy observed-expired
  state, with honest absent/misconfigured wording. Unavailable/malformed RPC or mismatched
  seller/skill endpoints preserve the prior observation and never annotate the listing.
- Name route is public-only and distinguishes missing (404 ens_name_expired) from
  unavailable/invalid/disabled (503 ens_resolution_unavailable). Price uses decimal bigint.
- No root means zero reads, callbacks or scheduling. Active workers are singleton,
  single-flight and stop/restart generation guarded. Snapshot state includes seller,
  runner and publication identity; vanished or ambiguous identities are pruned.
- At most 512 snapshots per sweep, sequential four-record lookups, 30-second cycle,
  11-second lookup wrapper (E8 has its own 10-second full-body deadline), 1-second
  current/metadata hooks, and 5-second listing supplier. Callback guards become false
  after timeout, completion, stop or restart; old cleanup cannot stop a new worker.
- Cancellation invalidates watch work immediately. Already-started read-only E8 calls
  may finish within that reader's own deadline; they cannot mutate observations or
  publish metadata after the generation is invalidated.
- Metadata callback callers must still compare the fresh store row's seller/runner/
  publication and the supplied isActive guard immediately before writing. Root implements
  this check in one synchronous Effect sequence. No Store API or settlement path changed.
- Logging defaults to no output in the pure helper; root explicitly supplies operational
  logging. All diagnostics are fixed or contain only validated public names.

The ts-testing skill drove true failure-first regressions, fake-clock cancellation and
fairness tests, with the real hardened resolver rather than mocked policy internals.
