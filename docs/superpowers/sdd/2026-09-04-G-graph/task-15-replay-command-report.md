# G15V bounded read-only operator replay

The [replay-command brief](task-15-replay-command-brief.md) adds --replay to the
existing shell/native CLI. It reads only a complete current-source assessment
from the fixed OS-account parent. Missing/partial/corrupt/claimed state refuses;
there is no initialization, materialization, claim acquisition or paid fallback.
No root/source/endpoint/run-ID override, --live or reset is added. No-argument
status remains inert/NOT_RUN and now identifies the actual remaining release gaps.

One owned Bun child invokes the private read-only worker using fixed arguments,
--no-env-file/--no-install, empty environment and ignored stdin/stderr. Synchronous
verification and pipe consumption are bounded by spawnSync's6000ms SIGKILL timeout
and8192-byte stdout limit. The parent requires successful exit/pipe completion,
strict UTF-8, canonical JSON and an exact field whitelist before emitting output.
Partial/malformed/oversized/duplicate output or nonzero/uncertain child exit
returns only graph_cogs_replay_refused. Arbitrary worker diagnostics never pass
through. There is no unawaited background process, shell command or live consumer.

The public projection preserves original transaction/cost, Graph block, query/
cache/proof/source/ledger/artifact hashes, acquisition/completion times, quota
counts and the conservative verdict. It reports NOT_RUN/local-retained-consistency,
zero newPaidQueries, false freshConsumerRun and zero attesterSettledCount. It
omits raw response/identity details, private paths, signatures and provider errors.
The projection validator is a format boundary, not authentication of supplied
data. Current-source and retained-history verification happens in the fixed worker.

## Executed checks

The missing-entry test failed with readGraphOwnerReplay undefined before
implementation, then passed.14 focused native tests/107 assertions/18.15s and
exact two-root strict0 PASS. No subsequent source/fixture correction was needed
for that selected run. Tests cover canonical formatting, duplicate/extra fields,
quota and time inconsistencies, unknown Graph block representation, forbidden
payment/allow/settled claims, invalid hashes and private diagnostic fields.

An actual owned child replays the original two-query consumer fixture's retained
assessment, with all retained file digests unchanged. Its key/consumer/factory/
signer entry functions and global network are trapped; none are entered. The
fixture OS-home mapping is mocked and all initial protocol/chain data and owner
derivation are synthetic. No owner authentication or live payment is claimed.
Separate actual children refuse missing/corrupt/global-claimed artifacts without
materializing or removing anything. All invocations check the exact production
worker executable/arguments, empty environment, pipe settings and bounds before
substituting only their explicitly owned fixture script.

Actual child success, nonzero exit, malformed/duplicate/invalid UTF-8 output,
overflow and busy-loop timeout cover the CLI output boundary. The timeout child
ignores TERM and is killed by SIGKILL with ETIMEDOUT; its fixture completed in
6079.65ms and verifies the PID is gone. Overflow returns ENOBUFS and the child is
also gone. These fixtures perform no payment or key access. A protocol-success
fixture alone is labeled protocol coverage; the separate retained-worker test
is the actual local readback check.

The read-only worker has no descendant path. Its timeout tests do not prove
shutdown of a future key/signing/live-consumer process or protection against
arbitrary OS/storage faults or coherent owner rewrites. No original payment
validity/cap/replay, budget decoder/writer or consumer behavior changed. Reversing
only the new replay block/import and declared CLI text/branch edits restores the
prior harness exactly, SHA256
`94b00f5676a6e5e590bdea16ebf514f16d8021abf811c6c0099805d0aae2a84c`.
Shell only adds --replay. Sole sequential full gate31875 PASS:5371Vitest/242files
69.92s;1821Bun/98files14184assert307.24s;root/web strict, client/SSR332/164ms.
Nine-path audit checks six local links, no privacy matches and six unchanged
source/brief/public-doc pins. Atomic local commit/mainFF follows; no full repeat,
operational root read/creation, real RPC/key/payment or push.

## Next three steps

1. Finish scope/freeze, sole full gate, final audit and atomic local commit/mainFF.
2. Resolve the separate live-scope decision and owned live-process lifecycle;
   do not use the read-only CLI or injected fixture capability as spend approval.
3. Only after release, initialize the fixed owner budget and run the explicitly
   authorized bounded evidence sequence. Arc-settled G15 remains separate.
