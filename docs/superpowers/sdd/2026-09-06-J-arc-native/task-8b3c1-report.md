# J8B3c1 — explicit runner escrow configuration and socket execution

Continue [Task8B](task-8-brief.md), connecting the
[session runtime](task-8b3b-report.md) to the actual runner daemon and CLI.
Hub broker correlation, durable admission and pipeline activation remain separate
unfinished work. These tests use a real local daemon and a controlled loopback
test hub, not the production hub or live Arc chain.

## Explicit configuration; inactive by default

The start command accepts both --escrow-config and --escrow-journal, exactly
once each. No flags means no escrow journal/config discovery. Unknown, missing
or duplicate escrow flags refuse. Both paths must be absolute and canonical;
they cannot identify the same file. The public JSON file contains exactly:

- identity: all10 independently verified deployment identity fields accepted by
  captureEscrowIdentity (chain5042002, escrow, implementation, hook, evaluator,
  treasury, native USDC token and the three full runtime code hashes).
- operationTimeoutMs: an explicit positive integer at most300000, an IO bound,
  not a payment-authorization validity setting.

The config is an owned regular single-link file, at most32768 bytes and not
group/world-writable. No-follow bounded reads reject symlinks, malformed JSON,
unknown fields, wrong chain or incomplete identity before opening a journal.
The signature journal retains its existing private0700-parent/0600-file checks.
Neither file stores a wallet key. CLI acquire/use/release closes its journal;
its Bun-only module is loaded only for opt-in. Invalid configuration refuses
before the existing seller-key resolution. There is no deployed configuration
to use yet: J6 size and treasury checkpoints remain unresolved.

Future invocation, after independently verified J6 deployment evidence exists
(not executed by this checkpoint):

```sh
arcade start --skills /path/to/skills \
  --escrow-config /path/to/verified-escrow.json \
  --escrow-journal /path/to/private/escrow-signatures.sqlite
```

Do not populate the identity from a payment request or the same untrusted RPC
response being checked. The public config is not deployment approval or a live
proof, and no operator config, environment or wallet was changed here.

## Actual daemon boundary

JobAssignment now preserves an optional closed EscrowContextWire. Malformed
escrow context fails decoding rather than being erased into ordinary work.
An escrow-marked assignment on a disabled runner fails before execution. Enabled
assignments must be root-only, match message skill/version/timeout and the actual
local listing, and pass session-local assignment checks. Ordinary assignments
retain their old path and Hello v2 remains unchanged.

Each real websocket owns a separate signing session. Liveness requires that exact
current open socket and an accepted Ack, not merely a reused runner ID. Local
listing/agent/resource are derived from the daemon's serving map and config.
The already-held Hello seller account supplies a sign-only projection; it is
never passed to the child. Budget/submit requests call the guarded authorizer,
and replies are sent only to the still-current original socket. Closing or
replacing a socket aborts its signing session and clears completion authority.

The actual execSkill child receives the captured input. Only its resulting local
outcome enters the private completion closure, before JobResult is sent. Failed
completion validation yields a fixed failed outcome without granting a signature.
No daemon broadcast capability was added. Broker-side connection retention after
JobResult is still required next; this does not yet complete Task8 end-to-end.

## Verification

TDD started with a missing config module and two genuine wire failures: the old
decoder dropped valid escrow context and ignored malformed context. An actual
owned-loopback test then demonstrated that a disabled runner executed an
escrow-marked assignment as ordinary work. Explicit preservation and pre-exec
refusal fixed these failures. A fixture syntax error and script input-envelope
assumption were also corrected; they were not product defects.

Six actualWebSocket/daemon/child-execution Bun tests passed (26assertions,
3.95s): budget, successful local submit, disabled escrow, mismatched metadata,
request before Ack and reconnect during execution. Actual ephemeral signatures
verify; the skill child reports no seller key in its environment. A replacement
connection refuses the prior job's submit. All chain responses are encoded fake
RPC facts and no send method is invoked. Owned service/fiber/journal/temp/env
cleanup also covers setup failure paths.

Three config/actualCLI refusal tests passed (28assertions): no guessing, bounded
identity file, no same-file journal overwrite, permissions/link/size/identity
refusals and invalid config before key resolution or journal creation. The CLI
test uses an invalid explicit dummy environment key to prevent any Keychain
fallback even if the guard regresses.21focusedVitest/3files passed, including
existing ENS daemon and local-completion behavior plus the two new wire tests.

Ten-root focused strict check passed with zero diagnostics. The sole full gate
(62068) passed:5,032Vitest/230files/70.84s;1,015Bun/76files/7,831assertions/
179.02s; root/web strict and client/SSR builds. Frozen scope:14paths,86valid
local links, no privacy matches; nine code pins retained through the gate.

Next8B3c2 implements
hub broker request/reply ownership, then8C/8D atomic admission/pipeline and9 buyer
lifecycle. No owner keys, real RPC, money, deployment, activation, consumed
approval replay, existing window/cap/replay changes or push. J4/J5/J6 live pauses
remain unchanged.
