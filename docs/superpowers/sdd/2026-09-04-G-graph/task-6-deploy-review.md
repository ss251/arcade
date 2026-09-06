> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G6 deployment command — independent review

Initial frozen-source review, September 6, 2026. Parent and author were informed
of the narrow ownership finding below before any correction. No source/test edit
was made by this reviewer. This checkpoint is not final acceptance of a correction.

## Reviewed source and scope

Fully read current task6-parent-decisions.md, task6-deploy-report.md, the complete
deployment module and its complete27-case test file. Rechecked the actual installed
Graph CLI0.98.1 deploy implementation: the `subgraph_deploy` method, name,
ipfs_hash/version_label parameters and Bearer header correspond to the source
contract. The new command does not inherit the CLI's credential cache, key flag,
interactive version choice, build, upload or retry behavior.

The ts-testing skill guided behavioral assertion review, focused repetition and
an actual owned-child integration probe rather than a fabricated security Red.
No network, operational key, `/usr/bin/security`, Graph command/build, dependency,
Git or full repository suite was run. All native children below were inert Bun
children with deliberately public synthetic bytes and the actual key-reader
spawn injected to replace `/usr/bin/security`. No real credential was obtained.

| Initial frozen path | SHA-256 |
| --- | --- |
| scripts/graph-deploy.ts | 5b9b4d18559eef775631effc9f30bb78343580e3d2487cc10791eafebb9f1000 |
| scripts/graph-deploy.bun.test.ts | f73b9b371f30004af6873cc5b637fcf2224e944e063c47a709b14223edae0b92 |
| internal/task6-deploy-report.md | 4a7b4f310f2f804c6111dc346d3762cc10edc974647a9104c7f4eb383d1d8055 |

All source/test hashes were unchanged after the focused checks and probe.

## Narrow finding: operation return precedes native credential-child close

At source245 the key-reader Promise is raced by `bounded`. On external abort,
the outer Promise rejects immediately. The native `readDeploymentKey` correctly
starts TERM/KILL cleanup and waits for the child close, but the operation's finally
at279–284 does not join that outstanding key-reader Promise. It closes the journal
and returns while the child remains alive. The CLI then clears its25-second fuse.

Deterministic fileless reproduction used an owned0700 temporary directory and
fresh journal, approved-shape public synthetic CID/version, injected fetch with
an independent send counter, and:

1. `readKey: signal => readDeploymentKey(signal, syntheticSpawn)`.
2. The synthetic spawn executes only the current Bun binary with `--no-env-file`,
   empty env and the exact requested stdio. The child installs a SIGTERM handler,
   emits a public32-hex string, then stays alive on a harmless timer.
3. On the child's first stdout data event, abort the operation's external signal.
4. Record whether the exact child's close event occurred before the operation
   resolved, then independently await its close before test cleanup.

Actual observed scalar output:

```json
{"status":"refused","closedAtReturn":false,"closedEventually":true,"returnedAfterMs":19.765,"closedAfterMs":123.564833,"signalCode":"SIGKILL","sends":0}
```

The child was reaped and the test-owned journal/directory removed only after
close. This is an API-return/owning-process cleanup boundary, not a demonstrated
credential leak, late POST, duplicate deployment or unreaped final test process.
The existing direct `readDeploymentKey` test remains valid; it does not cover
the enclosing operation race. Parent/author decision and a narrow native-reader
cleanup correction, if required, remain pending at this initial checkpoint.

## Other inspected boundaries

No further concrete source issue was found in the bounded pass:

- Import and help are inert; options/dependencies are own-data captured before
  evaluation. Fixed CIDv0 multihash decoding refuses consumed smoke; endpoint,
  slug, version and success query URL are fixed. A valid CID is not build approval.
- Exact owner0700 parent, non-symlink ancestor walk, exclusive NOFOLLOW0600
  journal, descriptor/path/parent identity and hardlink checks precede mutation.
  Partial-write loops and file+directory synchronous fsync precede key acquisition
  and dispatch. Failed durability poisons the lease and retains evidence.
- One operation latch plus exclusive path prevents repeat/concurrent dispatch
  for that operation/path. It is deliberately not a global lock over arbitrary
  fresh paths or a replacement for separate exact owner authority.
- Pre/post-IO monotonic deadline checks, bounded transport and fatal UTF-8 cover
  headers/body. Wrong URLs/envelopes/framing or late results yield fixed unknown
  after dispatch. The body has actual byte/content-length and empty-chunk bounds.
- Provider prose/data and credential-bearing errors are never reflected.
  Only fixed rejection text and a validated int32 code can enter retained public
  results. Post-dispatch close uncertainty downgrades the returned outcome.
- No RAM erasure, authenticated journal, hostile same-user filesystem defense,
  power-failure durability experiment or arbitrary blocked-kernel watchdog is
  inferred beyond the explicit author limitations.

An additional source hypothesis about a trailing key newline was explicitly
withdrawn: an actual synthetic two-newline stdout probe was correctly refused
by `readDeploymentKey` after child close, with the fixed credential error. It did
not return a key or reach any fetch. This is a negative control, not a Red.

## Independently executed verification

At03:36:57 UTC checkpoint:

`bun --no-env-file test scripts/graph-deploy.bun.test.ts`

27 PASS,0 FAIL,235 expect calls, one file,3.02 seconds. This includes the actual
synthetic success, TERM-resistant/KILL, capped-output, silent2.5-second deadline,
import/help and invalid-argument child tests. Silent-child close was2506.47ms;
TERM-resistant direct key-reader test122.82ms. Children were reaped by their
owning tests; no real Keychain process or network transport was entered.

Exact typing used installed TypeScript, the parsed root tsconfig and exactly
`scripts/graph-deploy.ts` plus `scripts/graph-deploy.bun.test.ts` as root files,
with incremental/composite disabled. `getPreEmitDiagnostics`:2 roots,0 diagnostics.
These are focused checks, not the parent full gate.

The additional integrated-child and newline probes ran filelessly through
`bun --no-env-file -e`. The former exited0 after independently awaiting close;
the latter exited1 on the expected fixed credential refusal before creating its
planned temporary directory or issuing a fetch. No private regression file or
author test/source mutation was needed to establish these observations.

## Correction review — 03:42:46 UTC

CLEAN for the corrected bounded deployment slice. The entire initial114-line
review above remains unchanged, SHA256
`90f66514d9297cf6044f3b2b8291b67c9d4dab3940c541c84f0a9ce40ca014c2`.
The original finding is preserved, not retroactively relabeled as passing.

Read the complete narrow source delta, both new collected tests and the complete
author append. The operation retains `keyWork` and after abort waits for its
settlement through a separate500ms bounded cleanup window before returning.
The ordinary native TERM/100ms/KILL path now joins its close event. Rejection of
the native reader is settled only after close; a never-settling injected reader
remains bounded and cannot establish successful cleanup/deployment. The transport,
fixed policy, journal and one-shot behavior are unchanged.

An in-memory reversal of only the announced cleanup helper parameter, keyWork
declaration/assignment and final cleanup block exactly reconstructed original
source SHA5b9b4d18559eef775631effc9f30bb78343580e3d2487cc10791eafebb9f1000.
Removing only the two new collected cases reconstructed original test SHA
f73b9b371f30004af6873cc5b637fcf2224e944e063c47a709b14223edae0b92.
The author's original report prefix also exactly reconstructed
4a7b4f310f2f804c6111dc346d3762cc10edc974647a9104c7f4eb383d1d8055.
No file was rewritten during these byte-level comparisons.

Independently reran the unchanged fileless integration probe from the finding:

```json
{"status":"refused","closedAtReturn":true,"closedEventually":true,"returnedAfterMs":123.975209,"closedAfterMs":123.980625,"signalCode":"SIGKILL","sends":0}
```

The exact owned child had closed before operation return. No credential bytes
were printed, no fetch was entered, and all owned local resources were cleaned
after close. This verifies normal cooperative child cleanup, not recovery from
an unkillable OS process.

Independently executed on the corrected freeze:

```sh
bun --no-env-file test scripts/graph-deploy.bun.test.ts --test-name-pattern 'operation cancellation waits|injected key reader cannot'
```

2 PASS,0 FAIL,27 filtered,7 assertions,670ms. Native integrated cleanup passed
at132.02ms; an injected never-resolving key reader returned refusal with zero
sends at515.51ms. Exact two-root TypeScript again returned0 diagnostics.
The independent original27/235 full-file checkpoint remains historical; the
author separately reports the corrected full29/242, not represented here as a
second independent full-file execution. This is sufficient narrow correction
coverage because both old source/test preimages were reproduced exactly.

| Corrected final path | SHA-256 |
| --- | --- |
| scripts/graph-deploy.ts | 6e1397318b7f30e47842dc8fbd25994034fa33cd6cb084ba440fe3d1aca14de2 |
| scripts/graph-deploy.bun.test.ts | 8ce1071a0c4c5c80a2d730d85ad2d8ced5ecf2b678c10ffed1283736333d7907 |
| internal/task6-deploy-report.md | 41718777cd45fa7cc3a66165f202fce9d8ff29aeeb9fbf21a0c23f5028ace1ce |

Hashes remained stable after verification. No remaining concrete finding in
this bounded pass. Parent full gate, actual approved credential invocation,
upload/deployment and live query remain outside this independent offline review.
