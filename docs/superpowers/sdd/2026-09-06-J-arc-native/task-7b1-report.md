# J7B1 — request ownership and finalized escrow facts

Implemented offline root request binding and a read-only chain reader. No live
rail, hub route, provider relay, execution admission, settlement/refund send or
buyer lifecycle is activated by these exports.

## Wire decision

The jobId-only shorthand is insufficient: anyone can observe a funded job.
The buyer generates32CSPRNG bytes, retains the capability privately and commits
a domain-separated hash into the on-chain job description. Both the budget
request and funded retry must present the capability with the canonical decimal
jobId. The description binds deployment/chain/token, provider and agent id,
client, exact amount, resource/method, listing identity/version, input hash,
listing timeout and absolute job expiry. Changes to any field refuse.

The hub must reconstruct those fields from trusted current deployment/listing
and the actual request, never trust the accepted header as its source. JSON
input hashing follows existing hashJson property-order semantics; preserve the
same JSON input when creating the commitment and retrying. The raw capability
is absent from verified results and must never enter logs, public evidence,
receipts or on-chain fields. This supports contract-wallet clients without a
new EOA-only client signature; it does not constitute live Circle wallet proof.

Budget verification requires an unbudgeted Open job and returns stage budget;
funded verification requires Funded and returns stage funded. Both bind the
same capability, identity, full-job/payout/claim restrictions and remaining
lifetime. An Open result is not authorization to run the skill. Copied job ids,
wrong secrets and already-budgeted retries refuse. Durable SQLite reservation
and uncertain-transaction reconciliation remain mandatory before any relay or
execution; these pure helpers provide neither.

## Read contract

The reader takes trusted independently verified deployment addresses and full
runtime-code hashes; it does not discover or bless its own deployment. All
code/storage/getter/job/pending-claim reads use one finalized height, followed
by a canonical block-hash/timestamp and chain-id recheck. It checks all three
code identities, EIP1967 implementation slot, ERC8183/1 domain, unpaused state,
500bps platform/zero evaluator fee, exact treasury, allowed token/hook and the
hook's escrow/evaluator getters. It captures configuration and job facts.

This new reader rejects snapshots older than30seconds or more than5seconds in
the future, clock regression and cancellation between calls. Existing payment
windows, caps and replay rules are unchanged. Production still needs a bounded,
abort-aware transport with retries disabled; a signal check cannot cancel an
arbitrary injected client that ignores transport cancellation. Reads are
serial, with no signing or write method in the port. Upstream errors are
sanitized. A correct finalized snapshot is not a guarantee about later admin
changes; the guarded executor must refresh immediately before a send.

## Verification and remaining work

TDD started with missing-module failures. An initial domain-hash call omitted
viem's required EIP712Domain type declaration; the focused suite exposed that,
and an independently ABI-assembled test domain now checks it. Strict typing
also required bigint chainId for that explicit domain type.

Focused32Vitest/2files/24ms and five-rootstrict0PASS before the final stage
discriminator addition. Sole frozen37680 full gate PASS:4,883Vitest/218files/
66.33s;964Bun/69files/7,317assertions/172.66s;root/webstrict and client/SSR
production builds (SSR185ms). Five code/test pins unchanged through the gate;
11 scoped paths,57 local links and no privacy-scan matches. No repeated full
gate or concurrent test gate.

Next J7B2: bounded transport, durable guarded relay/action lifecycle and
pre-settlement receipt projection. Then Task8 typed hub/runner/SQLite/pipeline
integration and Task9 buyer lifecycle. J6 size/treasury and J4/J5 live pauses
remain; no key, signature, RPC request, send, deployment, spend or push occurred
in this checkpoint. RPC coverage uses fake clients only.
