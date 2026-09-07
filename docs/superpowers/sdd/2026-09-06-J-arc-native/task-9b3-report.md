# J9B3 — durable purchase coordinator and bounded HTTP

Implements the coordinator portion of the [driver brief](task-9b3-brief.md)
after [private storage](task-9b2-report.md). Concrete buyer Arc ports are the
next bounded checkpoint, J9B4; SDK/MCP/CLI and armed health metadata are J9C.
This checkpoint does not enable a live buyer or claim settlement.

## Implemented

- One invocation owns one durable purchase before HTTP, signing or spending.
  Existing ENS/request authority must return explicit approval before any gas
  and again before each signature/send. Input bytes, capability commitment,
  local full pins, principal/gas and existing expiry/margin are captured.
- Three distinct once-only port instances execute create, exact approval and
  fund. Durable intent, independently recovered wire and hash-attempt precede
  broadcast. Fresh deployment/job, provider EOA, shared native-USDC reserve,
  allowance and nonce are rechecked after signing and storage.
- Create's full canonical receipt/job proves its ID. One budget POST yields
  only a hash hint; independent mined provider authorization, events and full
  job readback must prove it before approval. Buyer gas is cumulative; relay
  gas is separate. Funding evidence is expressly not settlement evidence.
- HTTP accepts only canonical root URLs, HTTPS or loopback, matching actual
  canonical JSON input and capability. No redirects/cookies, fixed JSON wire,
  bounded UTF-8 response reads and closed status/budget/queued shapes. Health
  must match independent local pins and advertise Arc escrow; it is not trust.
- One root POST uses the original capability. The real32lowercasehex job token
  and same-origin poll URL persist privately before returning a bounded202.
  Cancellation during that storage step retains the accepted result. Other
  uncertain outcomes stop without write retries, refunds, allowance reset,
  replay or a silently regenerated capability. Reopening cannot buy again.
- Existing per-RPC/HTTP/signing5second bounds and overall operation maximum
  300000ms remain. The aggregate receipt wait allows bounded read-only backoff
  (at most65000ms inside that same overall deadline), not a larger RPC timeout
  or payment-authorization lifetime. Cleanup is bounded to1000ms.

## Verification

Focused tests use generated ephemeral accounts, source-shaped synthetic chain
receipts, fake fetch and owned temporary private SQLite only. They cover the
complete sequence, a second driver/file handle, durable phases before writes,
after-sign balance/allowance/provider/nonce/time/authority drift, invalid signed
bytes/terms/budget proofs, failed receipts/storage/HTTP, cancellation and deadlines.
The HTTP negatives cover request binding, local health pins, closed response
fields, actual32hex result tokens and stalled body cancellation.

Initial HTTP tests exposed six missing input/capability/health checks, now fixed.
The coordinator happy-path fixture initially used `0.30`, while the actual
existing formatter emits `$0.30`; corrected the fixture, not wire validation.
Targeted TypeScript checks caught exact-optional fetch, union inference and a
Bun fetch fixture cast; corrected without policy changes. Final focused checks:
32Bun/232assertPASS2.51s;22Vitest1PASS825ms;4-rootstrict0. Sole sequential
full gate9678PASS:5,226Vitest238/72.15s;1,282Bun86/10,282assert192.40s;
root/web TypeScript and client/SSR builds. Ten-path scope/privacy audit and
133 local documentation links pass; four frozen code/test pins are checked
again before the atomic commit/exact-one main fast-forward. No main gate replay.

## Limits and next work

Injected chain ports establish tested ordering, not real RPC honesty or live
authority. J9B4 must provide independent full-pinned canonical reads, bounded
buyer signer acquisition and exact wire reconstruction from mined transaction
signature fields; the evaluator-only port cannot be reused as the buyer actor.
J9C must connect actual listing/ENS-bound SDK/MCP/CLI and armed health metadata.
J4/J5 live pauses and J6 treasury/code-size blockers remain. Zero owner-key
reads, real RPC/payment calls, sends, deposits, grants, deployments, new spend,
existing validity/cap/replay changes or pushes occurred.
