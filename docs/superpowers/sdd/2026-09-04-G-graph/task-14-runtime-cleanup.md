> Public execution record. Copied from the retained private task report; no live authorization or production state is implied.

# G14 runtime fixture cleanup follow-up — September 5, 2026

Scope is only skills/wallet-risk-note/test/runtime.bun.test.ts and this new private
report. The skill run.ts, manifest, verdict tests, shared execSkill implementation
and all earlier reports were left unchanged. This is offline fixture-lifecycle
evidence, not a product cancellation guarantee, downstream purchase cancellation,
live settlement, Graph purchase or F1 evidence. No keys, external network, Git
mutation, full suite or shared dependency change was used.

## Confirmed defects and narrow correction

The original execute helper placed Effect.runPromise(scoped execSkill) inside a
plain five-second Promise.race. When the observer rejected, its underlying Effect
and owned child continued running, potentially until the135-second production
bound. The new helper applies Effect.timeoutFail to the actual scoped Effect,
using the installed Effect3.22.0 API, so its five-second deadline interrupts that
Effect and invokes the production scope finalizer. It does not change that finalizer.

For a stronger fixture cleanup guarantee, a serial test-only Bun.spawn interception
records only the exact existing script command for this skill entry, restores the
original spawn function in finally and awaits those handles' exit. No PID search,
process-group signal or unrelated process is used. The common reaper sends TERM if
still running, waits250ms, then sends KILL if necessary and awaits exit for at most
another1000ms. It does not silently swallow a failure to reap.

Direct entry and import helpers now share observeProcess. An observer timeout there
still rejects with the fixed fixture error, but its finally always awaits the same
reaper and the stdout/stderr observation's completion with a further one-second
bound. Direct stdin-write failures also enter a reaping finally. The broker socket
disappearance check no longer suppresses failure; afterEach closes its owned server
and removes only its own mkdtemp directory in finally.

Per-test Bun ceilings now leave time for the existing observation deadline plus
bounded cleanup. They are explicit7/8/12seconds for the relevant short cases; no
production deadline, five-second execute deadline,32-second Unix request behavior,
36-second direct observer bound or existing behavior assertion was loosened. The
inert TERM-resistant fixture has a six-second test bound and a50ms observer bound.

The existing fake fetch also now supplies an explicit refusing preconnect member,
instead of an incompatible cast to Bun's fetch type. It does not access a network.

## Genuine Red and Green chronology (UTC)

- 11:58:13: real scoped-exec regression Red. The actual wallet entry made exactly
  one request to a newly owned stalled Unix socket. After the observer's five-second
  rejection, its tracked child still had neither exitCode nor signalCode. The
  regression failed specifically on that immediate not-reaped assertion, then its
  own bounded finally killed and reaped the child so the Red did not leak a process.
- 12:00:15: the first inert-child fixture attempt incorrectly consumed stdout for
  its readiness check; Bun refused a subsequent Response over the disturbed stream.
  This was fixture construction, not a cleanup product Red. Readiness was changed
  to an owned IPC READY message emitted after the child's TERM handler was installed.
- 12:00:45: genuine direct-helper Red. After the50ms observer rejection, the ready
  child that deliberately ignored TERM was still running. Again the regression's
  finally used its exact handle to KILL and reap it, even on failure.
- 12:02:42: both genuine cleanup regressions Green. Scoped child reaped in5.025s;
  TERM-resistant child reaped by KILL in0.326s. Exact-target strict checking then
  found only the existing fake fetch's missing preconnect; that fixture type was
  corrected, and the same strict check passed.
- 12:04:25 start: all11 runtime cases passed,45 assertions,38.10s total. The actual
  stalled Unix request returned its fixed refusal in32.038s and dispatched exactly
  once; all original framing/accounting/refusal/privacy assertions were retained.
- Final self-review added only the enclosing per-test cleanup headroom described
  above. At12:07:21 the final six-case cleanup/import/framing run was confirmed
  Green:23 assertions,5.87s. Exact-root-options targeted TypeScript and diff check
  both passed. There was no concurrent full-suite or live run by this agent.

Commands used the existing Bun runtime with --no-env-file and only the focused
skills/wallet-risk-note/test/runtime.bun.test.ts file. Strict checking loaded the
actual root tsconfig through TypeScript readConfigFile/parseJsonConfigFileContent
and createProgram with that explicit nested test target and its real imports.
The TypeScript-testing skill guided real failure-first lifecycle assertions rather
than substituting a fake execSkill or treating a sent signal as proof of cleanup.

## Frozen fingerprints (SHA-256, not chain transactions)

- runtime.bun.test.ts: 432d9bf6ed90587832953be20faee2e17ec54e2722070f706b8eb59de9ef94e8
- unchanged run.ts: 5317a6606120a84e25b9dc49d2a6239f27c4e8a683c09d3f6e84d4230823fa81
- unchanged arcade.json: 80fbfc74e842f2ec10467bf8f3c13412220163b5a157e20f8ab46da17b8ceff8
- unchanged verdict.test.ts: aec27152468e5932e36e30af73fe6031d02a141a6d04d1aa30845ffdb7881d2f
- unchanged task14-report.md: 3ca7b1717e01e634932541019b252b1181625f837c98017deb5871fdfa903053

Source and this follow-up are FROZEN for independent review and parent-owned gates.
