# G15F — private durable response recorder

Release only the existing offline harness/test and this plan's brief/report/
index/progress. No client/payment/consumer behavior edits, key/RPC access,
operational state initialization or live authority. Existing reservation and
authorization limits remain unchanged. Reuse the existing response-observer
type, source bindings and private exclusive-file/claim helpers.

Create a fresh query-digest directory under an explicit private offline parent.
Persist the binding manifest and exact bounded response snapshots as immutable
hash-chained records with file/directory fsync before acknowledgement. Retain
partial files/claim after errors, interruption, deadline or source changes;
never overwrite, recover a claim, retry a request or clear a reservation.
Clean close releases only the owned claim, not evidence files.

Record original status/selected headers/base64 body and hashes, including failed
paid responses. Enforce private ownership/modes, no aliases, closed data shapes,
fixed query/RPC destinations and query-body correlation. Bound each file2MiB,
total records16MiB,32 snapshots and each acknowledgement5s. These are new
offline recorder limits, not changes to any existing payment/session validity,
cap or replay guard. Synchronous filesystem calls cannot be forcibly canceled;
check the signal/clock before and after IO and never acknowledge late success.

This is captured-response evidence only: no receipt verifier, validated-result
cache, reusable success, owner-root budget authority or spending capability.
Provider bytes are potentially sensitive; never emit them in CLI/public output.
Offline fixtures cover corruption, aliases, malformed snapshots, partial writes,
actual child exit after file sync, re-entry, cancellation/deadline and source
changes. No unapproved live route is inferred from this implementation release.
One exact strict pass, one sequential full four-worker gate, atomic commit/main
fast-forward, no push. Keep the existing client source entirely unchanged.
