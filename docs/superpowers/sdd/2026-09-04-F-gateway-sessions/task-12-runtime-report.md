> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F12 owned runtime fixture — 2026-09-06

## Scope and checkpoint

This is the three-path runtime slice of the offline F12 evidence harness. The
orchestrator, collected test and evidence record belong to the other author.
No operational key, Keychain, live RPC, provider, funding, deployment, Git action
or full repository suite was used by this author. Live F12 is NOT RUN.

At this checkpoint the native stdin observation correction is frozen and strict
checks pass. The orchestrator author's fresh corrected twenty-call run is still
pending. Earlier incomplete integrated runs are failures, not successful evidence.

Tracked source SHA256:

- `scripts/fixtures/gateway-session-runtime.ts`: `ecc19a1297a99510b64957c31f692e6069761d3bce2f1f53c124737cf9c510fc`
- `scripts/fixtures/gateway-session-probe/arcade.json`: `d0761fc42d98994caea1f5e34b4dabef623df1482c49bd9f43c2310d57ea7db5`
- `scripts/fixtures/gateway-session-probe/run.ts.txt`: `6c5f8c871f62c9320bc88e103a856c6072386e3c277d33050b5f78878edae3c6`

## Actual implementation boundary

The entry is import-safe and accepts only `--hub` or `--runner`. A closed bounded
stdin start record binds version/run identity/role, the actual parent PID, a
canonical owned 0700 directory and a deadline no more than 120 seconds away.
Hub-only ephemeral authentication and runner-only literal loopback origin are
separate fields. Later controls are only snapshot/stop on the same stdin stream.
No HTTP control endpoint or arbitrary executable/module selector is added.

The hub uses the actual server, router, Broker and persistent SQLite Store. The
only Store factory adaptation delegates to that Store while counting successful
reservation and actual begin/finish calls. It does not synthesize Job/Receipt
state or Broker completion. Known boot RPC reads and the exact finite Gateway
verify/settle transport are local responses in this dedicated child; they never
call an external network. Gateway requests are independently recovered and bound
to the synthetic buyer, seller, token, price and actual nonce. Twenty unique
successful settlement replies receive twenty distinct opaque UUIDs, not mined
transaction hashes. No actual transfer or seller credit follows from these replies.

The runner calls actual `startDaemon`, receives actual WebSocket assignments and
uses actual `execSkill` to spawn the fixed probe entry. The owned spawn observer
retains every native child handle and delegates bytes/methods to the native
process. Private bounded records correlate assignment input/output digests,
positive PID, actual exit and actual outgoing successful result. No failed result
is relabeled success. No production daemon, exec, Broker or payment code changed.

The probe is a credential-none script with no secrets, egress or hire capability.
Its only input is index 1..20; its closed output repeats that index with an offline
proof label and known zero inference cost. The real source contains its own four-
second and parent-death guards. The installed copy is byte-identical; original and
executed hashes are computed separately rather than equated by assumption.

Dedicated children keep deny/counting network, spawn and quiet-output fences
through process exit. Startup promises remain owned during cancellation. Runner
teardown interrupts the real daemon and independently awaits captured child exits,
with bounded TERM then KILL escalation. This is a reviewed cooperative fixture,
not a universal hostile-code operating-system network sandbox or a claim that the
production daemon's detached job cancellation has been redesigned.

## Evidence chronology: failures versus inspection and supplemental checks

1. The orchestrator author captured the missing fixture module import before
   creation. That loader failure is distinct from later behavioral regressions.
2. Initial focused compilation exposed a Bun spawn type mismatch; the fixture
   options type was corrected. Actual manifest decode and publish gate passed.
3. Root/self-review identified premature restoration of child fences, startup
   ownership and teardown ordering risks. These were corrected before integration;
   they are source-inspection hardening, not reproduced external leak claims.
4. The first owned hub setup rejected a noncanonical temporary-directory alias.
   The orchestrator now resolves its fresh directory canonically. Later silent
   roughly 1.5-second pre-ready exits were default-sandbox loopback bind failures.
   An escalated diagnostic reached real hub ready with four RPC reads and zero
   unexpected/paid requests. It intentionally observed the deadline rather than
   sending normal stop, so its eventual exit1 is not a graceful-stop PASS.
5. Independent installed-source inspection and an intercepted keyless actual
   `createChainRpc` call observed that `eth_chainId` omits `params`. The fixture now
   accepts only absent or empty params for that method. The intercepted probe did
   not independently assert the old predicate's rejection; the default-sandbox
   boot failures must not be represented as a demonstrated RPC compatibility Red.
6. The reviewer found missing fatal UTF-8 EOF flushing. The orchestrator reproduced
   this under owned escalated loopback: after real ready/four reads, byte `0xc3`
   followed by EOF returned exit0 instead of expected1. The same regression passed
   after the decoder flush (one test/five assertions). A stopped-send check was
   also added as supplemental source hardening, not an independently proven leak.
7. Actual integrated attempts admitted only the first call and did not complete
   a job/settlement/close. The second fixed counter checkpoint had hub reads4,
   verify1, begin0, finish0, settle0, unexpected0; runner spawned1, exited0,
   results0, unexpected1. Those retained incomplete journals are not resumed.
8. A direct keyless native-child probe reproduced the fixture defect: assigning
   `child.stdin.write` throws before any write because Bun's FileSink method is
   readonly. The actual child was killed/reaped under a 1.5-second owning fuse.
   The narrow fixture-only child/sink proxy preserves the original receiver and
   delegates the observed write once. The corrected native echo probe observed
   the write, exit0, exact output, empty stderr and the original native PID.
   This does not substitute for the pending full actual-runner integration.

## Supplemental committed-probe guard checks

Ignored test `[private standalone probe-guard regression fixture]` SHA256:
`584b6c1265b5bbdde9f3351f94c461f228e917818920663e1dec44aa43067e75`.

`bun --no-env-file test [private standalone probe-guard regression fixture]` passed two tests,
17 assertions, 4.25 seconds using scoped owned-process permission. These were
immediately passing supplemental cases, not manufactured Reds. The earlier
14-assertion checkpoint preceded the additional exact OS identity assertions.

- Exact copied probe bytes with deliberately blocked stdin: awaited the directly
  owned child exit92 in approximately 4.026 seconds; stdout/stderr were empty.
- A directly owned parent spawned the same copied probe. Initial OS PPID, full
  executable/entry command and start time were captured. The parent was actually
  SIGKILLed and reaped; the descendant disappeared under OS `ESRCH` observation
  within the bounded check (test approximately 211ms). The observer did not reap
  that orphan and did not observe or assert its exit code. Any fallback signal
  requires matching the captured PID's exact start time and fresh-entry command.

Root independently repeated the unchanged private fixture: two tests/17 assertions,
4.28 seconds (direct case approximately4042ms, disappearance case217ms). No network,
signer or separate twenty-call run was used for either repetition. These tests
prove the committed probe guard, not an arbitrary production daemon job fault.

## Exact focused type check and remaining gates

After the native sink correction, the TypeScript compiler API used the actual root
tsconfig options and host with `noEmit:true`, `incremental:false`, explicit roots
for runtime, private guard test and a virtual `.ts` view of the exact probe `.txt`
bytes. Result: three roots, zero diagnostics. No type assertion was weakened.
The literal virtual file is not written or collected as a second executable.

The orchestrator owns fresh actual twenty-call integration, persistent post-close
correlation, closed result projection, final collected tests and evidence export.
Root owns full suite/type/build gates and publication. A later dated appendix may
record that final checkpoint; this section preserves the pending state above.

## Corrected actual-runner checkpoint — 2026-09-06 05:57 IST

The orchestrator author subsequently reported the actual twenty-call test PASS:
one Bun test/eight assertions, 4.112 seconds. This is attributed integration
evidence from that author's owned execution, not a second run by this author.
The case is `runs real SDK, Gateway, hub, runner, WebSocket and SQLite before
reporting cleanup-complete PASS` in `scripts/e2e-gateway-session.bun.test.ts`.

The run held runtime SHA `ecc19a1297a99510b64957c31f692e6069761d3bce2f1f53c124737cf9c510fc`
and orchestrator SHA `ceaffb565334bc56b12e776c7e99fea627d3066246afbf7fe8a670c1ba9539c3`
stable before/after. All three owned source hashes above were independently
reread unchanged after the reported run. The actual twenty `execSkill` outputs
and child exits, twenty begin/finish and verify/settle observations, read-only
persistent data/artifact/journal checks and cleanup completed successfully.
The reported public outcome is offline PASS, 20 calls, 20 opaque transfer
references and 200000 atomic simulated spend; fundsMoved is false, live evidence
is NOT_RUN and minedBatchesProved is zero. Probe original/executed hashes still
refer to the same actual copied bytes, not a synthetic completion result.

This appendix does not erase either failed first-call run or turn the separate
guard and source-inspection checks into a twenty-call proof. The broader collected
matrix, independent review, full repository gate and public evidence publication
remain owned by the orchestrator/reviewer/root and are not claimed complete here.
