# G15J shared supplied-receipt consistency

This is a G15 checkpoint, not Plan J arc-native. The
[receipt-reuse brief](task-15-receipt-reuse-brief.md) releases a pure wrapper
around the client's original receipt/log and receipt-block checks. The client
calls those shared helpers in its original chain check, bounded receipt polling,
block request and failure-handling sequence. No RPC, signing, forwarding or
payment-authority behavior is added by the wrapper.

The exported checker accepts closed expected payer/transaction/nonce/receipt/
block fields, rejects noncanonical or zero expected hashes and returns frozen
references labeled `supplied-receipt-and-block`. It reuses exact successful
receipt, pinned-token transfer amount/recipient, authorization nonce, log-index/
transaction/block consistency and receipt-block checks. Unrelated well-formed
other-contract logs retain their original acceptance.

This verifies supplied data consistency only. Synthetic coherent data can pass:
it does not authenticate RPC acquisition, establish independent consensus,
prove an owner signature or confer paid/cache authority. Full bounded capture,
network, challenge, intent, settlement and result correlation remain pending.
Receipt block and Graph result metadata block are distinct concepts.

## Executed checks

Observed missing-export Red preceded implementation. Final focused checks:
100 Vitest tests/one file596ms; seven actual owned-loopback/native-child Bun
tests/108 assertions2.97s; exact three-root strict0. Tests obtain receipts from
the actual installed client with a public synthetic signer and injected network,
then call the pure checker without extra signing or transport. Meaningful
mismatches include expected payer/transaction/nonce, receipt status, token,
amount/recipient, removed/duplicate events, wrong log transaction, duplicate log
index, internally consistent zero/noncanonical references and block number/hash/
timestamp. Malformed closed inputs/getters refuse without invoking getters.
No owner key, actual endpoint, operational state or payment was used.

A mechanical guard compares both moved bodies after indentation normalization,
then reverses only the extraction and restores the entire original client
byte-for-byte: SHA256
`145c1f26b8a61fbc200270326a7aeb4fda9a70c90170c38422759ac391eb33bd`.
Original validity constants, caps, nonce/signature rules, network order, polling,
settlement checks and replay/uncertainty handling are therefore unchanged.
The sole sequential four-worker gate47023 passed:5369Vitest/242files69.14s;
1507Bun/98files with12629assertions199.73s;root/webstrict and client/SSR
builds455/185ms. Final six-path/three-link/privacy audit and three source/brief
pins are checked after three result annotations. No full suite repeat, real
key/endpoint/spend, authority change or push.

## Next three steps

1. Correlate bounded captured RPC requests/responses with original challenge,
   intent and settlement validation before applying this shared receipt checker.
2. Persist verified per-query results without refreshing corrupted/incomplete
   evidence through spending; keep historical no-key replay clearly qualified.
3. Integrate fixed owner-root accounting and fresh pre/post balance observations
   before any separately released live run. Existing owner pauses stay in force.
