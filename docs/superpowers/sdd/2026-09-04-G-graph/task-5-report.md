> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G5 registry mapping author report — September 6, 2026

Seven owned source/test paths are frozen after the final focused native run at
03:02:46.284UTC. **61 real Matchstick AS/store tests passed: unchanged G4 27 plus
G5 34 (identity16, reputation11, validation7).** No source correction is pending
from the author. Independent final review, parent full gate/Graph build,
publication and commit remain separate; no live registry coverage is claimed.

Read complete actual Task5, full readiness and post-G4 parent release/decisions,
current schema, staged ABIs, frozen G4 helpers/tests and installed Graph/AS host
types. The ts-testing skill informed tests-first source preparation, real store
execution, and honest separation of setup failures from behavior regressions.

## Owned implementation and exact interfaces

Own only src/identity.ts, reputation.ts, validation.ts, registry.ts and their
three tests/identity.test.ts, reputation.test.ts, validation.test.ts suites, all
under subgraph/. Integrator independently owns schema/renderer/template/checks/
README and its one codegen; there were no cross-edits to those seven files.
No ids.ts, fee-splitter.ts, existing G4 suite, matchstick configuration, ABI,
splitter list, package/lock, hub, buyer or payment implementation was changed.

Generated imports are templates/IdentityRegistry/IdentityRegistry and the exact
analogous ReputationRegistry/ValidationRegistry namespaces. Handler names:
handleRegistered, handleTransfer, handleURIUpdated, handleMetadataSet;
handleNewFeedback, handleFeedbackRevoked; handleValidationRequest,
handleValidationResponse. Entity lists were fixed with the integrator before
drafting: Agent/ListingClaim/RegistryEvent; Agent/Feedback/RegistryEvent;
Agent/Validation/RegistryEvent. No placeholder mapping was supplied for codegen.

registry.ts contains fixed Arc registry addresses, closed kind/disposition
constants, beginRegistryEvent/finishRegistryEvent, knownAgent/counter validation,
full-width integer/address/hash bounds and strict text/claim parsers. It consumes
G4's occurrenceId and chain-scoped agentEntityId without modifying them.

- Event emitter, tx/hash/log range and block/timestamp coordinates validate
  before state writes. Existing occurrence marker returns before mutation;
  conflicting recorded registry/kind/coordinates refuse. Markers retain exact
  event coordinates and fixed disposition strings, never arbitrary metadata.
- Only actual Registered creates an Agent with a nonzero actual owner. Unknown
  prerequisite events are remembered skips, not deferred work; replay after a
  later registration/request/feedback cannot fabricate backfill. Unsupported
  metadata keys create neither marker nor claim nor Agent mutation.
- Transfer of a known Agent follows its actual nonzero recipient even if `from`
  predates observation, updates timestamp and clears agentWallet. Known burn
  refuses before writes under required-owner schema; this is an unsupported
  representation policy, not proof the deployed implementation supports burn.
  URIUpdated's operator never becomes owner; invalid URI clears stale URI.
- Four independently immutable ListingClaims record exact supported key/value
  types, registry/agent and occurrence facts. Key hash must match unindexed key;
  raw metadata bytes are strictly UTF8/scalar/control/length validated before
  host conversion. Listing ID, nonzero exact hex address and canonical uint256
  decimal each have separate grammar bounds. Endpoint is bounded opaque text.
  No claim establishes Listing/Splitter ownership, code identity or provenance.
- Feedback retains signed int128, full uint64 index, raw uint8 decimals and
  bounded optional text. Logical duplicate/conflict preserves first facts and
  revoked status; final comparison includes all retained normalized optional
  text. Revoke decrements once, and counter contradiction fails before writes.
- Requests preserve first identity/time/request facts; later responses require
  the same Agent and validator. PASSED is explicitly local50..100 policy,
  FAILED otherwise, retaining raw0..255. Pass count is newPassed-oldPassed;
  old exact response replay cannot rewind. Request count stays unchanged on
  responses, and negative/impossible counter transitions refuse before saves.
- Nothing creates canonical Listing/Splitter/Marketplace or instantiates any
  template. Counters describe accepted/observed bounded registry records, not
  full history, verified service payments or complete marketplace statistics.

## Dated tag1 policy clarification

Parent explicitly accepted the bounded indexed-tag policy before first codegen:
tag1 must be Unicode scalar text with no C0/DEL, <=2048 UTF8 bytes, empty allowed.
Early UTF16-length and scalar/byte counting happen before encoding/hash. Invalid
tag1 yields an invalid_tag remembered skip with no Feedback/count change; a
valid tag must match indexedTag1. Other optional tag2/endpoint/feedbackURI text
can be omitted independently. This avoids unbounded hashing or accepting an
unverified indexed binding. Integrator was informed for its README scope note.

## Actual chronology — no manufactured initial Red

1. Wrote all three suites before the four production modules existed. Their
   initial hashes were identity725aee8353d58d218755954db15ce1a6c1bcb74e75d498d245934427a98fe82d,
   reputation5a3868f69befed5727727de5f91e325e9ffeef7410702ff84e61da57225f8d1a,
   validation1f5c1f487dc40727af7353c37d5a45fe4ebed9e0b1604ff9a6e3a017981338a1.
   No missing-module/native run was claimed as a behavior Red. All four complete
   real drafts were then written, enabling the integrator's successful one codegen.
2. First actual native invocation at02:56:31.488UTC failed compilation, exit101,
   child44451 reaped/1421ms. Installed AS0.19.23 crashed in compileBinaryOverload
   on nullable Bytes/BigInt equality. Replacing those null comparisons with
   strict reference checks resolved that crash; no test had been collected.
3. Next compiler run at02:57:17.293UTC, child45237 reaped/2458ms, exit101,
   reported explicit u8-versus-i32 comparison and nullable-string narrowing
   diagnostics. Corrected the UTF8 range-local types and strict null narrowing.
   This also remained setup/compilation failure, not a behavioral Red.
4. First compiled production/store execution passed all28 G5 tests at
   02:57:40.647UTC, child46292 exit0/reaped/5398ms. Tests were not weakened and
   production was not intentionally made incorrect to create a failure.
5. Parent requested supplemental decoded256/-1 integer, scalar-surrogate,
   exact Unicode2048/2049-byte and conflicting occurrence-coordinate checks.
   Those are new passing branch coverage, not asserted preimplementation Reds.
   Reviewer separately identified an actual disposition defect: the initial
   logical feedback comparison omitted retained optional tag2/endpoint/URI.
6. Added a behavioral regression against that unchanged comparison. At
   03:00:43.470UTC: **33 pass,1 fail,34 total**, exit1, child49860 reaped/5423ms.
   The actual stored marker said ignored_duplicate when changed retained text
   required ignored_conflict. First feedback facts/counters were already safe;
   the defect was truthful disposition, not resurrection or double counting.
   Reputation source at that Red was
   f568d31124e02cfbdd8ea6d2fdf59baedf2cd1af90a28f1b50a4609db9fd64a3.
7. Narrowly normalized the three optional fields once and included each in
   the existing comparison; reused those captured values for first insertion.
   The unchanged34-case selection passed at03:01:14.608UTC, child50428
   exit0/reaped/5287ms. No marker/counter/revocation policy was relaxed.
8. Parent requested the existing G4 suite alongside all three G5 suites for
   final focused runtime acceptance. One fresh compiling invocation at
   03:02:46.284UTC passed61/61, child53164 exit0/reaped/6812ms. G4's27 are
   separately attributed, not34 additional new tests or a root full-suite run.

No AS assertion total is invented. Expected-failure cases establish refusal;
source review checks that validations precede saves. This report does not claim
a separate transactional rollback/crash experiment or arbitrary first-delivery
reordering. All suites directly assert store facts and no invented entities;
every G5 suite checks all four template instance counts stay zero.

## Exact native execution boundary

Pre-provisioned executable only:
`<owned-runtime-directory>/binary-macos-12-m1`, SHA256
cd05611b588649e629e42e4ea0915d811d1ddbb73e8edd392a718c81b4361dbd,
rechecked before every invocation. Earlier selections used arguments
`-r identity reputation validation`; final selection was
`-r fee-splitter identity reputation validation`, with cwd subgraph/.

Fileless launcher used Bun --no-env-file; native child environment contained
only PATH=<verified-node-bin>:/usr/bin:/bin. Stdin
ignored, stdout/stderr separately capped524288bytes,60000ms SIGKILL fuse and exact
child awaited/reaped in finally. No fuse or overflow fired; all native runs
exited themselves. Matchstick may compile its selected suites internally; only
one owned native invocation was active at a time. Final stderr was empty.
G4's two stored-null negative controls print expected assertion diagnostics and
are correctly classified PASS, not new failures.

No bare graph test, download, dependency install, codegen/build, full repository
gate, network, secret/environment lookup, signing, transaction, deployment or
Git operation was performed by this author. B9 separately reports135 focused
Bun checks/289expect and exact four-root TS0; those are integrator checks, not
executed or added to my AS count. Actual AS compilation validates this dialect;
it is not mislabeled as a root TypeScript strict check.

## Frozen seven-path SHA256 inventory

```text
c9686c6c284ecd2a8905a4f55fa1ff43fa1d5c8a759bdb62e811d37ff1ddc810 subgraph/src/identity.ts
ba448181295f4a2c87e8846d7828ce85266c4cb9c4b62ceeecb4e710ff9657fe subgraph/src/reputation.ts
049347854a9ad81b1c6d07435b313de88d48c63f2d90367bec83adbb61a83d65 subgraph/src/validation.ts
72fecf0bc69da5342e5f3809d4e9a224109a13ef87df82571876259c87e757a9 subgraph/src/registry.ts
09c8aa39b9dbd6cbfaabc80f8de10787b7d1a60ccaa62de2a609e460bd09727c subgraph/tests/identity.test.ts
a629b8b49c3f7c68d554eb75cc55bdf97bfe5876e8194aa4bbcc75dc075afac4 subgraph/tests/reputation.test.ts
b33922173c861e04103c851aea7990b4fdfa39d0a9bd89e3cd6536d8dc134c97 subgraph/tests/validation.test.ts
```

G4 preservation pins unchanged:

```text
cd7d84e90188cd49b494fd6d6f7c0d477f8f682901483e1e7e768ea6cd0427db subgraph/src/ids.ts
50d8a7d5c4fb28b228f420321f1facdfb23887d6f4c54228aa764be9fa1ba642 subgraph/src/fee-splitter.ts
e1fcae5efd9d149e5e0548ee467406233650b80675a4bc22345c26f4441d9c6f subgraph/tests/fee-splitter.test.ts
9036856089a6cb23c0733464f624285652d4ab574c0ba05425af87529589b124 subgraph/matchstick.yaml
```

All author processes ended; four source modules and three tests are held for
independent review. This is real local synthetic AS/store execution, not live
graph-node persistence, source/proxy identity, creation-to-head coverage, trusted
listing assignment or a paid query. G5 static registries remain inactive, G1's
deployment approval remains consumed, and unrelated paid-query authority is
parent-owned and unused by this slice.
