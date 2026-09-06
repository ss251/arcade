> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F12 actual-runner seam check — September 6, 2026

Read-only feasibility check of the accepted handoff/readiness/parent decisions.
Only this private note was written. No runner, test, child, network, key, RPC,
AI, live operation, Git action or full suite was run. The six F11 CLI paths stay
frozen. TypeScript-testing guidance was used to distinguish real execution from
synthetic completion and to identify required ownership assertions.
Source locators below use `runner/src` for `packages/runner/src`; bare daemon.ts,
exec.ts, skills.ts and config.ts use that directory, and server.ts is
`apps/hub/src/server.ts`. These are read-only source references, not runtime paths.

## Smallest usable seam

Use the already accepted mode-checked **owned runner child** in
scripts/fixtures/gateway-session-runtime.ts. Inside it, call the actual
startDaemon({config, skillsDir, ensTickerFactory: async () => undefined}).
DaemonArgs already exposes that inert ENS seam (runner/src/daemon.ts:36–40,
186–191). It avoids reading a user ENS state file or enabling its writer without
replacing jobs, authentication or settlement. No production edit is required.

Supply one captured RunnerConfig with owned hub origin, wsUrlFor(origin),
maxConcurrency:1 and empty agents/pendingAgents; alternatively read the explicit
owned ARCADE_CONFIG_PATH through readConfig. Neither route requires defaultConfig,
global config or a changed user HOME (runner/src/config.ts:79–95,108–133).
The runner child needs an explicit **public synthetic fixture** seller key that
matches sellerAddress: resolveSellerKey takes a matching nonempty environment key
before its OS-keychain fallback (runner/src/wallet.ts:183–208). There is no injected
seller-key factory in DaemonArgs, so keep this out of a shared/in-process test env.
Do not omit that fixture variable and accidentally enter Keychain fallback.
No operational key is needed, and none was obtained in this check.

The child PATH must contain the directory of the reviewed current Bun binary:
execSkill actually spawns literal `bun --no-env-file run ABS_ENTRY`, not
process.execPath (runner/src/exec.ts:184–204). PATH:"" would fail this real path.
Use only the explicit binary directory; no ambient PATH/loader/canary/AI/ENS/
sub-buy/splitter credentials. The job env is built afresh; the script adapter
does not need provider grants (exec.ts:38–43,74–138). The job's HOME=skillDir is
the existing product sandbox policy, not a change to the user's home/config.

Place exactly one canonical probe directory under skillsDir. loadSkills reads
its arcade.json and decodes the real manifest (skills.ts:14–44); daemon gates it
and derives both the public listings and dispatch map from the same sellable set
(daemon.ts:90–112). Use adapter:script, credential:none, entry:run.ts, no secrets,
egress or hire capability, bounded input/output and finite timeout. Record the
original run.ts.txt, manifest and guarded executable hashes separately.

## Real execution and evidence path

The native WebSocket is opened at daemon.ts:196. Real Hello ownership is signed
at 203–240 and verified by the production hub at server.ts:494–538; the hub stores
the actual listing/runner and registers its Broker connection at 662–724.
Do not replace this with direct broker.register/complete or a fake WebSocket.
The production /ws upgrade is at server.ts:790–794.

JobAssignment decoding, dispatch/capacity checks and execSkill call are at
daemon.ts:258–331. The actual script receives the stdin job/input envelope and
its output is consumed at exec.ts:207–260; successful stdout becomes JobOutcome
at 393–409. Daemon sends the encoded result at 342–350. Hub JobResult verifies
the current authenticated socket and assigned runner before broker.complete
(server.ts:728–742). These are usable unchanged for the finite twenty-call path.

Count actual exact-entry Bun.spawn launches/handles in the owned fixture child,
and correlate twenty successful exits and expected nonempty per-input output
digests with twenty real JobResults and persisted terminal bundles. Counting
Broker completion alone is not runner evidence. Do not forward raw daemon/job
logs; emit only bounded whitelisted control facts. No external RPC/AI is needed
by the dedicated inert script. Gateway boot/facilitator seams remain the accepted
separate finite external fixtures, not changes to runner execution.

## Concrete lifecycle limitation to cover before PASS

An in-process daemon Fiber interrupt **alone is insufficient**: each incoming job
is run by detached Effect.runPromise (daemon.ts:258–353); the outer finalizer only
closes WS/timers/ENS/broker (373–385), not those job fibers. execSkill's scope sends
kill but does not await process exit (exec.ts:151–175), and timeout is at 410–423.
These are observed source facts, not an executed failure regression in this note.

Keep exact-entry spawn tracking and an admission-stop flag inside the isolated
runner child's lifetime. On teardown prevent later entry spawns, interrupt its
daemon, TERM→KILL/reap all captured job handles, and report cleanup only after
exit/stream completion. The orchestrator must also own/reap the runner child and
hub. Do not let shared-process global wrappers outlive their test scope.
The accepted guarded probe source supplies independent parent-death and hard
deadline exit; scripts/e2e-lineage.ts:213–216 is an existing narrow precedent.
Record that added source, and test a stalled job plus runner/orchestrator death
before claiming descendant cleanup. Keep the guard active until the isolated
runner exits; merely restoring a spawn wrapper while detached work remains is
not teardown proof. Empty capability lists are not an OS egress sandbox for an
arbitrary script; the reviewed inert source and isolated fixture boundaries must
support the narrower no-network claim.

No new architecture or source scope is required by this check. The child-owned
seam is feasible in the accepted seven F12 paths, but actual twenty executions,
failure-path reaping, zero external attempts and SQLite post-shutdown validation
remain unimplemented/untested here. Funding/withdrawal proof gaps do not prevent
this funding-independent offline work. Live twenty-call evidence remains NOT RUN.

Read fingerprints: daemon a9685270b530ea1555d996e7d044c02cb04e14ec7334e8d954d08f921cd3e101;
exec a3dd91e881913605d911f65a7dcc75b00ddb2bb58c8954c462e511eb52430df5;
hub server b0a9a2d8ffee922cf2e0a695e4ce27ab4ad40159cf275bd34bba6bbed5446e22.
Accepted handoff d68c0a724bf1f2e8d8f0566475a396269f2b7ee6fa94bbc8aaec417795dc3e2b;
current parent decisions 05484ffc8cdb68926e5fd5f5afd3b88f7d35fa27ce21c87f57aec4f7315e2b6b;
readiness 22bcb235d527bf1d88500d9947bf3ba5398e963f8a77bd9f43c7aa5326202561.
