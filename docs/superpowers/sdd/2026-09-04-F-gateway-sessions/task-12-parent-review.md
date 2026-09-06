> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F12 parent review — September 6, 2026

In progress, not a frozen-source or offline-run verdict. F11 committed325bd47;
F12 live is unimplemented/NOT RUN under no-new-spend. F1 is never replayed.

## Accepted boundary

Fully read source handoff, evidence readiness, runner-seam check and parent
decisions. G14 owns four orchestrator/test/evidence paths; B9 owns three fixed
runtime/probe paths. Root owns gates/commit; G3 independently audits persistence
and runtime ownership. No general-purpose harness or production source changes.
Private bounded IPC may correlate raw job IDs/nonces, never capability/signature
material; public output remains hashes/counts/amounts. Child input and snapshots
are closed, one run/role bound, finite. Original and actual executed source hashes
must match their observed bytes, not be assumed equivalent.

## Root actual startup regressions

Two real subprocess diagnostics were run against the initial active draft,
without offline mode, owned server, operational environment/key or network:

1. `env -i PATH=/usr/bin:/bin /bin/sh scripts/e2e-gateway-session.sh`
   exited1 with `$1: unbound variable`, rather than fixed refusal2. The shell
   used `$1` in its count-and-mode case before checking an absent argument.
2. Actual Bun `--help`, with only PATH plus a synthetic invalid ARCADE_NETWORK,
   exited1 and printed that synthetic value and a stack. Static core/ledger/wire
   imports reached core/chain.ts's ambient loadChainConfig before argument parsing.

These initial draft bytes were displayed but no full source SHA was captured
before author editing. Do not label them a frozen baseline or invent a hash.
The correction defers legacy dependency imports until an explicit operation and
uses an async persisted verifier; the accepted proposal fixed API names, not a
synchronous return type. The shell safely handles an absent first argument.

Independent root recheck on TS5f603629b9c21ec41d87169f4fb1c062e1af2d5f3fd5cf88fe6d2215f0234a8d
and shell3f79d9db3d5437eaf4e40ab61f95ce60b963ed184f8e7b4dd093a3a980f65124:
same hostile-selector --help exits0 with fixed help; same no-args shell exits2
with fixed refusal; direct import under that selector exits0 with only the
test's INERT_IMPORT_OK marker. No offline topology was run by these checks.

## Source review and corrected inference

Root read the initial entire runtime/probe and current cleanup corrections.
Keep dedicated-child denial and raw-log fences through exit, rather than restore
native APIs while failed or detached work may remain. B9 independently made this
change and attempts each captured job reap even if daemon interruption fails.
This was a source-review improvement, not a reproduced external network leak.

Root initially suggested ledger bindingOf might accept a zero nonce, having
omitted the shared hex helper definition. B9/G14 checked the actual helper:
it already excludes all-zero. The consistent zero-nonce fixture is supplementary
Green, not a defect or Red. Explicit F12 validation may restate the same contract.

Parent fully read G3 persistence checklist9cb57e68b525927894df24888ff15ba1c85edd655d1efe35cd0835a2c61d0440
and publication coverage check6e9808cddffb430394625e733b644e274e89475c2daca4645dcddd5ac3c3e565.
No missing F1–F11 public artifact found:97 F records,303 local links checked.
This does not count external links as fetched or confer F12 execution evidence.

## Pending

Actual real-hub/runner twenty-call and failure-path evidence, independent frozen
review, parent repeated run, collected tests/strict/full gates, scrubbed public
task artifacts and commit. Cleanup and global readonly SQLite correlation must
pass before any offline PASS. F14 stays separately scoped after this checkpoint.

## Integration checkpoint — 2026-09-06 05:49 IST

Parent fully read the expanded orchestration sequence. Requested pre-open source/
policy journaling with independently read actual manifest/source/installed bytes,
and retention of the original closed wire artifact in exclusive0600 fsynced
closed.json. Author implemented these. Wire-artifact hashing must not be confused
with core bigint canonicalization; current author correction keeps them separate.
That mismatch was caught as a source-level concern, not a root executed Red.

Parent did execute the exact new policyHash serialization expression with the
actual ChainConfig class and actual sessionJson. It returned the fixed diagnostic
POLICY_SERIALIZATION_REFUSED/exit1 rather than completing. The canonical codec
does not whitelist ChainConfig instances. Plain own-data capture or explicit
fields are required; no codec/production scope change. This pure expression probe
did not run the entire orchestrator or access a key/network/database.

Author-reported zero-paid hub startup under default sandbox failed silently with
exit1 in about1.5s, while B9's scoped escalated diagnostic reached ready/four RPC
fixture calls. Parent identified server.ts's console-suppressed final catch and
loopback-bind permission difference. Author repeated with scoped loopback and
passed1test/5assertions. These boot failures are not attributed to product code
or claimed as the omitted-params fixture Red. The latter remains independently
source-grounded and B9-observed in intercepted actual viem requests.

Author separately reproduced incomplete-UTF8 EOF acceptance under the correct
loopback permission: normal exit0 instead of expected refusal1. B9 corrected
the child decoder flush and added stopped-send fencing, current3672e8248254b7e633c88c3bf044b3a218dad322f99fac6680b781b44ebaad89.
Correction verification remains pending; parent stdout decoder has the same
explicit final-flush requirement. G3's original two-finding report is preserved.

B9 reports two supplemental private probe-only tests/14 assertions: direct
blocked-stdin child awaited exit92 in about4.06s; separate actual parent death
followed by OS-observed orphan disappearance about220ms. The observer cannot
reap a reparented orphan or infer its exit status. Actual daemon/twenty-call and
fault integration are not established by these probe-only tests.

## Parent executed checkpoint — 2026-09-06 06:07 IST

Fully read B9's frozen runtime report3854e2c98823eac133d38f32aa169464ba911a2c79e18874e6d6c3819e79c9c9
and the complete private106-line guard test. Parent repeated that unchanged
test at584b6c1265b5bbdde9f3351f94c461f228e917818920663e1dec44aa43067e75:
2tests/17assertions PASS4.28s, directly awaited blocked-child case4042ms and
separate observed orphan disappearance217ms. Exact probe6c5f8c bytes unchanged.
The corrected evidencePolicyHash also independently returned a valid hash/exit0,
resolving the earlier actual class-serialization refusal.

On the six-path frozen checkpoint, parent made the launcher executable (755,
content unchanged) and ran its actual --offline CLI under an empty explicit
environment and scoped owned-loopback permission. Exit0/PASS in approximately
5.16s:20calls,20distinctreferences,200000atomic simulated spend, fundsMoved:false,
liveEvidence:NOT_RUN,minedBatchesProved:0. Original/installed probe hashes match.

Parent then independently located that fresh owned run by its original closed
artifact hash after CLI exit, verified journal chain/order/policy and reconstructed
observations from its20 actual journal result events, not the prior in-memory
array. Reopened only the existing SQLite read-only with global bounded queries
and revalidated against the retained original closed wire artifact.87journal
records/20results and both hashes match; no writer restart/bootstrap/reaper,
network, signing or evidence rewrite. Private run remains retained; no runtime
locator or raw capability is published.

- closedHash e415c91b77b868e69ed63536155d0fcc1a3b1101dbe120498461b441ab16fa4a
- persistedHash74ffb2acfed6964568aa76fad23c69cb894848f7af41eaa2ef2d613ddba51512
- journalHash9f2d612746f7a065317e070b3f83acddbd4451ea90e82bc1eb22ec0b87500c50

All six source/test hashes were unchanged before/after: orchestrator4d6893f5a4b50143dd522983baf36a4391374edca3d615fe1ea3ebe1ab7649c7,
test335c11bb39eb7b3f46ef778787297798139989c87729994bf6da50c5d0119b15,
shell3f79d9db3d5437eaf4e40ab61f95ce60b963ed184f8e7b4dd093a3a980f65124,
runtimeecc19a1297a99510b64957c31f692e6069761d3bce2f1f53c124737cf9c510fc,
manifestd0761fc42d98994caea1f5e34b4dabef623df1482c49bd9f43c2310d57ea7db5,
probe6c5f8c871f62c9320bc88e103a856c6072386e3c277d33050b5f78878edae3c6.

This checkpoint is preserved independently of the later narrow review request:
explicitly observe private outbound session/job header continuity and absence on
public routes. Existing persisted results prove accepted calls but do not alone
assert every quote/header placement. The requested fixture-audit improvement is
not a reproduced production SDK defect. Final correction review, full gate and
public-copy audit still precede commit; no F14 source/gate contamination.

## Final source and full gate — 2026-09-06 06:20 IST

Parent read the full final author report2b117ad2297e7b9c92ef5b79a2089a808c4035a95647a77e72240cd3104e00e0
and independent report3f588fb0e94a726724d17e8c1d3102e35e2f16e4e9b99fef98dbaf6cf14e3db3.
The narrow header observation correction is CLEAN. Root separately read its
entire helper, integration and two tests against the actual F9 call sequence.
It observes stable session/job capabilities only in a private closure; first
status capture is permitted, public/open capabilities forbidden. No product
auth rewrite or raw response-body capture. Author's introduced first-status
incompatibility is preserved as a harness Red, not an original SDK defect.
Independent19 childless tests/80 assertions and exact3 strict0 passed; parent
requested the final comment-only removal of an unverified balance claim.

The sole complete repository test/type gate exited0 at06:20IST: Vitest phase
passed, with123 cached file results and zero failed files; its aggregate test
count was truncated in captured output and is not inferred. Bun passed529tests/
41files/4681assertions, including the actual final twenty-call path in4.009s.
The repository Bun collector also includes ignored historical review fixtures,
including the private two-case probe guard; those are NOT extra tests to add to
529 or all public-checkout coverage. Root and web strict TypeScript both passed.
No web source changed in F12; web build/Forge remain full-F merge gates after F14.

All six source hashes match the final inventory after the complete gate:
orchestrator2f78e4a1bae87689beae6de74dbce6b3c295b700c827481e3c11056460f56b07,
testcc9c02a89b7e657b82d55eee0e4fce5cfb1338020f4af3c0bd925669caa06662;
other four unchanged from the earlier parent inventory. Original115-line F1
evidence prefix7d818b7c7a804d3e0ea907004475f2419e7684b84afbd15fa2ba6f8d7b4678c8
is unchanged. Git diff whitespace check passes; F14 remains held until commit.

The commit subject deliberately describes twenty offline calls, not the plan's
unproved one-batched-settlement wording. No live path is implemented or run;
fundsMoved:false/liveEvidence:NOT_RUN and zero mined batches remain the boundary.
Full public historical-copy audit and the atomic commit follow this checkpoint.
