# I4 — Git-derived continuity snapshot generator

Implements the [brief](task-4-brief.md), with the
[operator contract](../../../continuity-generator.md) documenting deliberate
corrections to the original template: distinct build/execution baselines,
all dated A–J tables, expanded paths, overlapping activity rather than exclusive
authorship, and a pinned snapshot that survives its own documentation commit.

The real repository run at aec5e43 produced112 inherited,1 planning,215
post-baseline and216 total event-period commits. All ten plans were discovered.
Rows report path activity only; no completed/live status is inferred.

## Verification

- Initial focused run failed on the absent generator, as intended.
- Final32 focused Bun tests/63 assertions passed in2.36s, using disposable
  real Git histories. They cover committed-versus-dirty plans, J discovery,
  overlap, snapshot stability after a later commit, duplicate plans, path
  syntax, strict flags, malformed markers, byte preservation and unsafe files.
- The two-root strict TypeScript check passed. An earlier check caught an
  incorrectly spread parameterized flag-test row and exact-optional arguments;
  those were corrected, not suppressed.
- Actual native help exited0. Actual check and write exited1 with
  continuity_markers_invalid before I5 marker placement. README SHA256 stayed
  85bdd1b5a94dbeba9c643163909c4ade6691658b714b12cb9b99fa29db9af997.
- Native import with no executable PATH exited0 with empty stdout/stderr.
  No Git action is triggered by import.

Final audit: seven scoped paths, eight new local links, empty index and no
privacy-pattern matches. Sole45344 sequential four-worker full gate passed:
5,327 Vitest tests/242 files (69.39s),1,394 Bun tests/93 files with11,776
assertions (193.40s), root/web typechecks and client/SSR builds (377ms/189ms).
Source/test and immutable documentation pins are rechecked before the atomic
commit and exact-one main fast-forward. No full gate replay.
No application/settlement source or dependency changed. I2/I3 live paused;
no wallet/key/chain call, authorization change, spending or push. Tests write
only their owned disposable histories; no real repository Git mutation is part
of the generator.
