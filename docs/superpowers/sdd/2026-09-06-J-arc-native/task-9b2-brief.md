# J9B2 — one-purchase private durable buyer journal

Continue after [exact transaction proofs](task-9b1-report.md). Implement concrete
storage before the bounded buyer driver. This checkpoint cannot acquire a key,
call a network, sign or send. Existing J4/J5/J6 live pauses remain unchanged.

## Scope and lifetime

One explicitly owned journal file records one logical purchase. Only an empty
journal can claim a purchase, even if the previous purchase was accepted.
Reopening exposes status or the privately saved accepted result token, never
automatic action resumption. A new purchase requires an explicitly fresh path.
The concrete path requires distinct buyer and evaluator accounts: the relay's
gas/nonce belongs to the evaluator, not the three-transaction buyer budget.
This coordinates cooperating handles of the same file; it does not lock a buyer
account across other journals or unrelated wallet programs. Do not claim that.

Store the full captured private intent source/capability and exact JSON request
body. Verify its ordered input hash and the existing hub131072-byte budget
envelope bound before claiming. Public status/proofs contain neither raw input,
capability, signed bytes nor result token. Retain the token privately before SDK
delivery; a terminal root POST cannot recover it. Do not silently generate a new
capability after an incomplete or uncertain purchase.

Order: create intent→signed hash→attempt→proven create; budget HTTP attempt→
independently proven budget; exact approve intent→signed hash→attempt→proven
allowance; fund intent→signed hash→attempt→proven principal; root HTTP attempt→
validated accepted job/token. The concrete fresh-purchase driver will require
initial zero allowance and make all three buyer transactions. No implicit reset,
unlimited approval, skip/replay of an earlier partial approval or automatic refund.

Reconstruct captured original intents/actions and verify raw signed transactions.
CAS phase/digest transitions and nonce/hash checks fence duplicate handles.
Sum proven buyer gas only (not the evaluator's budget relay); every action's gas
cap must fit the remaining explicit total. Preserve any uncertainty without
rewinding, deleting, retrying or switching to the opposite action. Fixed errors
must never expose SQLite diagnostics or private data.

## Filesystem and tests

Bun-only subpath, not imported by browser-safe SDK/payment entry points. Require
canonical absolute path, owned0700 parent, owned0600 single-link regular file,
NOFOLLOW/exclusive creation and fsync. Refuse all retained SQLite auxiliary files
and broken symlinks before opening; no implicit recovery. Verify inode/parent/
permissions on operations, bounded canonical private serialization, schema and
digests, DELETE/EXTRA/fullfsync durability. Accepted readback remains private.

Test real owned temporary SQLite with two handles/reopen/corruption/permission/
sidecar/cancellation-adjacent phase fixtures and generated ephemeral signatures.
No owner key, live RPC or spend. One sequential full gate, atomic commit and exact
FF. The actual driver, SDK/MCP/CLI and live proof remain subsequent work.
