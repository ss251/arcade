# J9 — buyer-owned escrow lifecycle

Continue after [explicit hub boot](task-8d5-report.md). J4/J5 live stay paused;
J6 treasury confirmation and the independently reproduced contract-size blocker
remain. Single thread, four workers, one sequential full gate per atomic commit,
prompt exact fast-forward, no push or replay of historical approvals.

1. **9A: offline intent and pre-create facts.** Extend the identity-checked reader
   with a deployment-only read, without a fictitious job ID or weaker historical
   checks. Capture locally trusted deployment/call/expiry, compare the actual
   closed challenge, enforce principal and explicit total gas limits, and prepare
   exact create/approve/fund calldata from freshly bound job facts. No IO/signing
   authority is created by preparing an intent or calldata.
2. **9B: transaction proofs and private durable execution.** Independently verify
   signed sender/chain/nonce/calldata/gas, mined transaction, canonical receipt,
   correct-emitter events and full job readback. Preserve private capability,
   action claims, signed hash-before-send and uncertain outcomes in owned durable
   storage. One send per claimed action; read-only polling can back off, writes
   cannot retry in a loop. Budget proof precedes approval/funding. No automatic
   refund, allowance reset, opposite action or ambiguous-send recovery.
3. **9C: actual SDK/MCP/CLI composition.** Require explicit buyer pins/private
   journal/gas budget before escrow selection; preserve max amount, root-only,
   ENS payTo/resource checks and existing rails. Hub health metadata must agree
   with independently trusted local pins, not become its own trust source.
   Use the implemented closed `{input,payment}` budget envelope and private
   capability root header, not the plan's obsolete bare-job-ID sketch. Retain the
   accepted job token durably before polling; terminal root POST is not recovery.

Arc's native USDC and ERC-20 USDC share one underlying balance with 18- and
6-decimal views. Reserve principal converted by 10^12 plus remaining gas together;
do not treat them as separate balances or infer principal from a balance delta
that also includes gas. Match the ERC-20 event emitter and six-decimal amount.
[Official stablecoin model](https://docs.arc.io/arc/concepts/stablecoin-native-model).

Use synthetic chain/owned loopback and ephemeral fixture keys only. Public SDK
evidence must contain verified transaction hashes, never capability, signed raw
bytes or private diagnostics. Browser-safe imports must not acquire Bun SQLite.
Existing authorization validity, replay and session policies remain unchanged.
Task9 remains incomplete until all three checkpoints compose; no live claim.
