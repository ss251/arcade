> Sanitized historical G1 checkpoint, September 5, 2026. Original retained unchanged; only the banner and explicitly recorded privacy substitutions differ. This report records its own observation time, not a complete G1 live gate. Later dated progress supersedes pending statements.

# G1 private Studio consuming runtime — frozen offline checkpoint

September5,2026,13:12UTC. Implemented only internal/g1-studio-deploy.ts and
extended the parent-authored internal/g1-studio-deploy.bun.test.ts. No tracked
source, dependency, Graph CLI authentication/configuration, Git, key retrieval,
external network, deployment, upload, query or live action was performed here.
The parent owns the authorized consuming command and independent live evidence.

## Reviewed exact operation

The closure accepts an exact32-hex deploy credential and a synchronous durable
event callback, then can be invoked once only (including concurrent calls, intent
failure and unknown outcomes). It sends exactly one JSON-RPC2.0/id1
subgraph_deploy POST to https://api.studio.thegraph.com/deploy with the reviewed
slug arcade-ledger-arc-testnet, versionv0.0.1-smoke and already-uploaded CID
QmePuPnHraVaV9TmxaAwCCMKwTD8iFW96eoEUfSA1BoCW8. It does not re-upload this CID.
The operation and bearer-header shape follow installed graph-cli0.98.1
dist/commands/deploy.js:154–170. No auth command or --deploy-key argument is used.

Headers are constructed locally; redirect:error, credentials:omit and identity
encoding are fixed. A maximum20-second shared headers/body deadline aborts the
request. Responses are capped at16KiB, fatal UTF-8 decoded, JSON content-type
checked and exactly compared to Content-Length when present. Safe capped chunked
responses are accepted. Compression, redirects, mismatched RPC IDs/versions,
result/error contradictions and malformed responses become fixed unknown outcomes.
Late bodies from transports ignoring abort are canceled; cleanup waits at most100ms.
No request or outcome is automatically retried.

Only an exact Studio query path for this slug and reviewed version (or
version/latest) is projected from result. Userinfo, ports, fragments, query
parameters, arbitrary hosts and unreviewed paths cannot become output URLs.
Explicit RPC refusals are separately projected as rejected/code/message; credential
text, long hex values, control characters and arbitrary URLs are redacted, and the
message is bounded. Transport or projection failure never becomes a guessed
unsupported-network conclusion. A deployment acknowledgement does not prove
indexing, query availability, ledger contents or authentication policy.

## Durable CLI and compatibility

The import-safe CLI accepts only --journal ABSOLUTE_FRESH_FILE (plus --help).
The supplied ARCADE_GRAPH_DEPLOY_KEY environment value is read and deleted by
main; import alone does not read it. Help performs no key retrieval or network
request, but does read/delete that already-supplied environment value. The runtime
does not fetch a Keychain item or accept a key through argv.

Every ancestor must be a real directory, without symlinks; the direct parent must
be owned by the current UID and mode0700. File creation uses exclusive create,
no-follow and mode0600, never overwriting an existing path. Parent/file identity,
ownership, modes, link count and expected length are rechecked before persistence.
Each public record is appended and the file and parent directory are fsynced
before the intent callback returns. A completion failure cannot overwrite intent.

The journal is deliberately append-only JSONL, not a rewritten JSON document:
each line is {format:'g1-studio-deploy-v1',policy,event}. Events are intent followed
by completion or unknown where persistence permits. Policy contains only the
fixed endpoint/slug/CID/version; events contain public timestamps and projected
outcomes. A writer failure latches, retains the durable prefix and never attempts
repair. Existing files prevent a second command invocation from resubmitting.
The parent must treat a truncated final line or retained intent as ambiguous,
not recreate the journal or resend. There are no secrets in journal records.

CLI exits are0 for a durably recorded deployment acknowledgement,2 for a durably
recorded explicit rejection, and1 for refused/unknown. Unknown output is fixed
and warns against retry. File descriptors close in finally. A25-second event-loop
fuse remains installed through network cleanup and synchronous persistence;
as with all JavaScript timers it cannot preempt an OS-blocked synchronous syscall,
so the parent should retain its independent owning-command deadline.

## Failure-first and verification

The parent captured8/8 genuine missing-module Reds at12:54:30UTC. The first
implementation passed all8. A subsequent actual isolated-CLI regression failed
because a rewritten single-document journal had only one record; append-only
persistence then passed. At13:08:33UTC, an asynchronous journal callback's rejected
Promise produced a genuine unhandled private diagnostic; the runtime now rejects
asynchronous durability while consuming native Promise rejection without reflection.

Final focused suite:17/17 Bun tests,129 assertions, at13:10:07UTC. Coverage includes
exact dispatch/body/header and intent ordering, once-only/concurrent latching,
invalid keys, malformed or oversized RPC bodies, encoding/truncation checks,
stalled and late transport cancellation, explicit sanitized refusal, unavailable
completion persistence, real isolated CLI private file/no-overwrite/symlink/mode
guards, retained intent after dispatch failure, import/help and invalid arguments.
Tests use dummy credentials and an injected fetch only. The actual CLI fixtures
replace fetch in a private test preload; there is no production endpoint override.
Owned subprocesses are awaited with finite TERM then KILL escalation; temp files
are removed only after the child exits. No external listener or service is used.

Exact root tsconfig options compiled both private source and test files with zero
diagnostics, including a repeat after final cleanup typing. The final edit was
only the accurate help-test title noted above. The ts-testing skill guided genuine
regressions and actual process/file assertions. No full-repository gate was run.

Frozen SHA256:

- g1-studio-deploy.ts: a26a6c20dca3fb0fd7970a1e103409112a75788c6a6fe86e9b4d5f54fe5c44d4
- g1-studio-deploy.bun.test.ts: 075d78000b4094310d12a07298cb3d3bd2501f0f860b2a2a69ff06b4b0eaf3b1

This is ready for independent review. No live success or failure is asserted.
