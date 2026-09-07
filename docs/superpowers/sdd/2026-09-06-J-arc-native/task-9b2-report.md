# J9B2 — one-purchase private durable journal

Implements the [storage brief](task-9b2-brief.md) using the
[buyer transaction proofs](task-9b1-report.md). This is real storage with offline
fixtures, not a network/signing driver or live purchase.

One file can claim one logical purchase, once. Only the original claiming handle
can advance it; other handles can read status but cannot reuse the claim object.
Reopening never resumes actions, even if the old claim ID is known. Accepted
result tokens remain privately readable; a new purchase requires a fresh path.
This does not lock the wallet across other files or unrelated programs.

The captured private source retains the capability and exact ordered JSON body.
The body must match the request hash and fit the existing131072-byte budget
envelope, including payment metadata and a maximum-length job ID, before claim.
The concrete flow requires distinct buyer/evaluator accounts and exactly three
buyer transactions; it neither reuses a partial approval nor includes the
evaluator's relay gas in the buyer's cap. Public status omits input, capability,
signed bytes and result token.

Durable phases enforce create→budget relay→approve→fund→root admission, with
intent, verified signed hash, attempt and qualified proof boundaries. Historical
snapshots reconstruct exact calldata only; they are not current sending authority.
Fresh preflight facts cannot predate the preceding proof. Buyer nonces advance
sequentially and hashes cannot be reused. Each signed gas cap fits the remaining
total, and proven buyer gas is accumulated separately from the budget relay.
The pending request's accepted job/token/poll URL must match the exact hub origin
and result route before storage. Uncertainty is irreversible; late async signature
verification cannot advance it. Late cancellation cannot erase accepted metadata.

SQLite uses an exact single-row schema, canonical bounded private serialization,
digest/revision CAS, DELETE/EXTRA/fullfsync, with owned0700 parent and owned0600
single-link file. Creation is exclusive/NOFOLLOW with file/directory fsync;
operations check inode, parent and permissions. Retained auxiliary files, broken
symlinks and files over2MiB refuse. Existing unrelated schemas are checked before
changing persistent SQLite settings. No automatic repair or replay is supplied.
These guards assume the OS honors fsync and do not defend hostile same-user disk
rewrites or prove the RPC origin of supplied proof data. The actual driver must
use the J9B1 verification functions and fresh pinned reader before every send.

## Verification

Initial scaffold failed on the absent journal module. An overflow fixture was
corrected to actually exceed the envelope bound (the original body still fit),
and a getter fixture now returns the properly typed verified serialized value.
No production limit changed. Final focused13Bun/1file,96assertions passed917ms;
two-root strict checking reported zero diagnostics. The sole sequential full gate
passed5,204Vitest/237files in72.24s and1,250Bun/85files with10,048assertions
in190.62s, then root/web strict checks and client/SSR builds. Eight paths and
129local links passed scope/privacy audit; two frozen code/test pins are
checked again before commit and exact-one main fast-forward.

Tests use real owned temporary SQLite, two handles/reopen/crash phases, full
synthetic create/budget/approve/fund proof sequence, private result recovery,
nonce/gas/phase and mixed-proof refusals, late-write races, accessor rejection,
schema/digest corruption, inode replacement, hardlinks, retained/broken sidecars,
permission and size guards. Ephemeral generated signatures only; no owner key,
RPC, send, spending, existing validity/cap/replay change or push.

Next: bounded once-only buyer driver and concrete Arc ports, then actual SDK/
MCP/CLI integration. J4/J5 live and J6 treasury/size pauses remain unchanged.
