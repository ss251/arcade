# J8B3a — private provider signing reservations

Continue the [Task8B boundary](task-8-brief.md) after the
[canonical read-only preflight](task-8b2-report.md). This checkpoint implements
captured public signing intent and a separate Bun-only SQLite signature journal,
not a signer, chain reader, socket authority or broadcast/replay API.

Intent binds request ID, complete action context, budget/submit kind, issuance
time, uint72 nonce, the existing exact600-second provider deadline and, for
submit only, actual hub job/output hashes. The runtime still must prove those
come from its original socket and local completion; data alone is not authority.
Canonical decimal serialization preserves uint256 values. EIP-712 builders are
the existing ERC8183/1 builders; no validity constant, cap or replay policy on
any existing rail changes. Historical signature verification uses captured
issuance time and does not imply that the authorization is currently valid.

The journal requires an already-owned canonical0700 parent and0600 single-link
regular file. Creation uses exclusive/no-follow open and file/parent fsync;
SQLite DELETE/EXTRA/fullfsync matches the action journal's durability boundary.
Each operation checks file identity/permissions and canonical private parent.
The boundary assumes cooperating processes and OS/filesystem fsync semantics,
not hostile same-user disk edits or physical power-loss guarantees.

Atomic claims reserve one chain/escrow/job/kind, unique request ID and unique
chain/provider/nonce. Complete context must match previous stages; an uncertain
budget blocks submit, and submit prevents later budget. Already-funded jobs may
begin with submit only after the future runtime's independent chain/local checks.
Up to10,000 rows are retained without automatic pruning or recovery. A signature
is checked against the exact typed intent/provider before a compare-and-swap
from claimed to signed. An uncertainty write can win while signature recovery
is pending; the late signature then refuses. A saved signature stays reserved,
including after restart; there is deliberately no cached-signature retrieval or
resend method. Only public context and signatures are stored privately, no keys.
Reopen validates canonical rows/digests and stage coherence, not chain authority.

TDD: missing module Red, then8actualSQLiteBun tests/40assertions PASS. Cases cover
two handles, reopen at claimed/signed/uncertain, changed bindings, request/nonce
reuse, wrong provider/typed data, asynchronous late signature, malformed/getter
input, permissions/symlink/hardlink/path replacement, corrupt rows and close.
10focusedVitest/2files PASS, including5new intent tests and existing authorization
tests; real ephemeral fixture signatures match both typed actions. Full integer
roundtrip, exact issuance bounds, canonical decoding and getter-free capture
are checked. Five-root strict check:0diagnostics.

Final audit:10paths,80local links,empty index,privacy scan no matches; five code
pins unchanged from freeze. Sole full gate74406 PASS:5,030Vitest/229files/71.16s;
981Bun/73files/7,681assertions/174.63s;root/web strict and client/SSR builds.
Remaining8B must compose
the actual sign-only runtime and original-socket completion ownership, then8C/8D
atomic admission/pipeline and9 buyer lifecycle. No owner keys, live RPC, payment,
deployment, activation, consumed approval replay or push. J4/J5/J6 live pauses
and existing authorization-window/cap/replay rules remain unchanged.
