# J8B3b — sign-only provider session runtime

Continue [Task8B](task-8-brief.md), composing the
[read-only preflight](task-8b2-report.md) and
[private signing journal](task-8b3a-report.md). createEscrowProviderSession has
assign, authorize and close methods. It is not yet connected to the actual
daemon/websocket/broker; those transport/ownership handlers are the next8B3c
checkpoint, not claimed complete by these session tests.

The factory captures independently pinned deployment identity, local provider,
current local listing/agent and resource lookup, original-socket liveness,
durable journal, bounded operation/clock and a sign-only acquisition port.
There is no transaction or broadcast capability. Closing aborts active IO and
clears completion authority. One signing operation runs at a time; requests are
not queued or retried. Per-session bounds retain at most1,000 request IDs and
1,000 job records, with64 active local assignments; no existing rail limits change.

assign validates and copies actual input/current listing before local execution.
It returns that input and a completion closure for the local exec caller only.
The private cache stores context/listing/output hashes, never raw input/output;
the execution closure holds its captured input only for that execution's use.
Completion uses the existing shared schema validator, output bound and
shouldSettle. Duplicate/failed completion cannot later become successful.
No API accepts a hub-supplied completed object as authority. Submit must match
the original session's actual hub job, full context, listing and output hash.
The current full public listing hash is rechecked, including same-version schema
changes. Pure data helpers alone remain forgeable and do not confer authority.

authorize decodes the closed socket request, checks configured resource/provider/
agent/listing/deployment and local completion, draws one CSPRNG uint72 nonce and
runs the concrete canonical read-only provider preflight. It uses the existing
exact600-second provider deadline, then durably claims before signer acquisition.
Each awaited step rechecks the original session, monotonic clock, deadline,
current listing, snapshot freshness and unchanged budget/submit state predicates.
The acquired account and returned EIP-712 signature must match the local provider
and exact intent. The signature is durably recorded before a second canonical
chain read and final checks permit a signed reply. Relay must still perform its
own independent pre-send checks; this is not a settlement proof.

All external awaits are bounded by the operation deadline; acquisition/signing
use the existing five-second IO bound. Unknown attempts retain their journal
reservation. A late claim acknowledgement is fenced as uncertain; a late signer
or signature cannot resume the operation after disconnect/timeout. Uncertainty
cleanup is bounded separately and never erases a previously durable signature.
Errors/refusals use fixed public strings and never expose provider diagnostics.
The existing daemon already holds its seller key for Hello; future wiring must
guard escrow signing operations without claiming that daemon boot is keyless.

TDD: missing module Red, followed by25actualSQLite/fakeRPCBun tests/96assertions
PASS (1.225s). Two additional genuine Reds showed stale facts or a crossed
budget lifetime floor after slow journal work still acquired the signer. Reusing
the unchanged provider predicates after awaits fixes both, with zero acquisition.
Coverage includes both valid signatures/no broadcast, wrong socket/completion/
output/input/listing/agent/resource/deployment/state/nonce, changed schema or fee,
wrong signer/signature, competing requests, timeout, late claim/signature,
disconnect during execution and malformed wire/config. Four-root strict check
PASS after correcting literal inference in test helpers; no production typing
suppression. All13existing local completion tests passed after sharing listing/
input validation. No existing validity constants, caps or replay rules changed.

Final audit:8paths,84local links,empty index,privacy scan no matches; three code
pins unchanged from freeze. Sole full gate28750 PASS:5,030Vitest/229files/68.87s;
1,006Bun/74files/7,777assertions/174.16s;root/web strict and client/SSR builds.
Next8B3c must connect this
to real daemon/socket execution and retain the exact original broker connection
after JobResult, then8C/8D atomic admission/pipeline and9 buyer lifecycle.
No owner key reads, real RPC, money, deployment, activation, consumed approval
replay or push. J4/J5/J6 live pauses remain unchanged.
