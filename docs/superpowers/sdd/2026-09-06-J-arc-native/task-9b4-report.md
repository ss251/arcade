# J9B4 — buyer-specific Arc ports and owned-loopback composition

Completes concrete ports from the [brief](task-9b4-brief.md) for the
[durable buyer coordinator](task-9b3-report.md). No live activation or proof.

## Implemented

- Original locally pinned buyer intent and fixed create/approve/fund action per
  port. Shared fixed Arc5042002 transport retains per-IO5seconds,400observations,
  at most one broadcast, disabled retries and bounded response/error handling.
  No signer acquisition or spending occurs on import or read-only observations.
- Full deployment/current/historical job reads reuse the existing finalized
  code-hash/proxy-slot/domain/fee/treasury/token/hook checks. Provider code,
  native balance and allowance use a captured block with closing canonical
  checks. Historical allowance is fenced by a fresh head but is not mistaken
  for a current signing snapshot.
- Buyer gas proposal retains the existing estimate ceiling1.2× and fee2×,
  zero priority fee and explicit remaining total gas cap. Native balance must
  cover principal plus remaining gas together. Signing requires the exact
  buyer address and recovered wire; canceled/late acquisition never signs.
  Proposal, signature and send are once-only. Existing fundBy applies before
  proposal/sign/send; no validity constant or margin was changed.
- Receipt backoff is read-only, with fresh finalized head/canonical receipt
  block checks. Mined raw EIP1559 bytes are rebuilt from independent RPC fields
  and signature, with exact hash and recovered sender. Buyer or evaluator
  roles are distinguished by the later exact buyer/budget proof, not HTTP data.
- Actual driver + concrete ports + owned-loopback HTTP + real private SQLite
  compose the whole create/budget/approve/fund/root sequence against a synthetic
  chain. A bad budget response stops before approval; the accepted32hex result
  capability is saved privately before returning a bounded202. Fixtures allow
  an explicit local origin solely to bind their actual request description.

## Verification

No owner keys or real chain calls. RPC data uses real viem ABI/JSON-RPC formats
and generated ephemeral signatures. Tests cover full identity/fees, same-block
reads, exact buyer nonce/signing, all three buyer receipts and the independent
budget relay, gas/shared-balance refusal, wrong signer/wire/kind/hash, unknown
send outcomes without retries, late acquisition, historical reads versus fresh
authority, block mutation/reorg/stale heads, expiry and400observation limits.

Initial concrete18tests and two owned-loopback tests passed. Additional receipt
reorg/stale-head cases pass with the affected132Vitest4suite. Focused TypeScript
caught a self-referential fixture server return-type inference and an overly
broad test-array cast; fixed the fixture types, no production policy relaxation.
Final focused checks:132Vitest4PASS1.36s;47Bun3/779assertPASS3.20s including
both owned-loopback cases;5-root TypeScript diagnostics0. Sole sequential full
gate30793PASS:5,246Vitest239/74.12s;1,284Bun87/10,731assert191.83s;
root/web TypeScript and client/SSR builds. Eleven-path scope/privacy audit and
138 local documentation links pass; five frozen code/test pins are checked
before atomic commit/exact-one main fast-forward. No main gate replay.

## Remaining

J9C must wire actual SDK selection, independently captured current listing and
ENS authority, explicit local deployment/gas/journal configuration, MCP/CLI
exposure and armed health pins. No automatic capability reset/retry or public
raw journal/token export is allowed. Funding/queued evidence is not settlement.
J4/J5 live and J6 treasury/code-size pauses remain; no owner keys, real RPC,
payments, deposits, grants, deployments, replayed approvals, new spending,
existing validity/cap changes or pushes occurred.
