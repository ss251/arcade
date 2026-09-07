# G15D awaited private response observation

The [narrow release](task-15-observer-brief.md) adds an optional
`QueryOptions.observeResponse` inside the existing bounded response reader.
This is not a fetch wrapper and never substitutes the original Response.
No real endpoint, payer key, paid request, operational journal/cache or live
authority was exercised; actual signer/HTTP tests use public synthetic keys
and injected/owned-loopback responses only.

The frozen observation records challenge/paid/RPC phase, request URL/body SHA256,
original response URL/redirect flag/status, five selected header values, exact
complete body bytes as base64 and their SHA256. Header values are individually
bounded to16384 bytes and32768 combined; the existing response-body limits
remain authoritative. It contains no private key or signed request header.
Provider bytes may still contain sensitive material: this is a private-journal
seam, never public CLI/evidence output.

The callback is captured once per factory and awaited inside the existing
transport deadline before status/JSON/receipt interpretation. Its exceptions
remain fixed-error refusals; cancellation after a stalled callback prevents
late signing, proof requests or another paid dispatch. Complete signed402/500
responses are observed before refusal. Original malformed-policy checks still
reject after the raw challenge is observed; the callback cannot mutate headers
or repair the original response through the snapshot.

Only complete responses passing the existing transport bounds are observed.
Missing, redirected, partial, malformed-size or oversized responses may have no
snapshot; they remain unresolved and cannot become reusable cache entries.
This is not yet the durable recorder, before-sign/forward reservation hook,
fresh balance enforcement, validated cache, reconciliation or no-key replay.

## Executed checks and protected code

The failure-first actual synthetic-signing test obtained a result but observed
zero snapshots; its expected seven-phase sequence failed before implementation.
Final focused client suite: **66 Vitest tests,533ms**. Existing native fixtures:
**six Bun tests,74 assertions,2.93s** with loopback success/redirect/signed500
and bounded inert subprocess cleanup. Tests assert snapshot and header
immutability, exact request/body hashes, private-key/request-header exclusion,
original malformed policy, signed-error single capture, callback replacement,
unsigned timeout and signed timeout with no late proof/query retry. Owned
servers/children were joined by the existing fixture cleanup.

Exact three-root strict reported zero diagnostics. The complete source suffix
from proveReceipt through query/signing/paidQuery is byte-identical to parent
654be5f, SHA256:
`43f6188ad24298352f582e04af43658760490550a8e4f02ccc136e461419f924`.
No authorization validity, existing counters/caps, receipt rules or replay
protection changed. The optional observer uses the existing transport deadline.

The sole full four-worker gate24154 passed:5335Vitest/242files in69.39s;
1457Bun/98files with12193assertions in195.59s;root/webstrict and both web
builds. SSR took174ms; client timing was truncated in the retained output.
Final seven-path/three-link/privacy audit and four source/brief pins are checked
after three result annotations. No full suite repeat or live G15 claim.

## Next three steps

1. Bind one owner state root and complete request/source/balance intent before
   operational key lookup; retain global reservation accounting across runs.
2. Persist private response snapshots and per-query verified results with
   bounded exclusive writes; add narrowly reviewed before-sign/forward seams
   if needed for fsync and fresh pre-forward balance enforcement.
3. Add receipt reconciliation/cache replay without automatic refund/retry, then
   review live authority separately. Latest testnet-only wording versus retained
   Base approval and a new Arc purchase remain unresolved.
