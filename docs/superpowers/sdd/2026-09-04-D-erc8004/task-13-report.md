> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# D13 — bounded, independently verified testnet evidence harness

Executable shell wrapper and import-safe TypeScript runner require six pairwise-distinct OWNER-funded roles, explicit full ERC-721 operator consent, canonical Arc testnet RPC/chain, and the seller's V2 splitter/canonical USDC/500bps fee. OWNER action command updated with splitter and explicit operator-address placeholders; no role provisioned/funded/substituted/accessed by this executor. Direct shell help verified offline. No package shortcut added: documented direct bash invocation avoids a parent Bun command auto-loading dotenv before the wrapper disables it.

Isolated config/database/skill copy, allowlisted child env, disabled dotenv/injection options, owned-PID cleanup and parent/orphan deadlines. Mint and full operator approval verified before a single fixed $0.01 USDC flow-check purchase. No automatic resend/remint. Final proof checks exact fresh-range successful mint/approval/payment/registry transactions and raw events, role/agent/job/amount/tree correlation, current validation/feedback, and matching durable/served/committed compact bytes. PASS only after owned processes are reaped. Private store/output stays local; public exports contain no keys. Temporary loopback URIs intentionally stop after cleanup and are explicitly not a persistent public deployment.

31 offline Bun tests/150 assertions and tsc Green after missing-module TDD, real subprocess/no-dotenv/error-redaction regressions, pre-mint V2/USDC check and independent review's receipt-correlation fix. The review caught that discovered attestation hashes were not enforced on RPC receipt responses; two genuine regressions reproduced mismatched receipts/removed or cross-transaction logs, then assertReceiptCorrelation became mandatory for every actual receipt() read. Root read complete source, tests, wrapper and fix; all actionable findings resolved. Details task13-implementation.md. Fullgate/commit in ledger.

Live D13 proof remains OWNER-pending six funded roles/matching seller splitter. Offline simulation is not chain evidence. Separately, main handoff now marks A9/C10 role prerequisites provided; root confirmed those two Keychain items exist without reading secrets and prepares safe live proof resumption after reviewed process-lifecycle hardening.

## Approved live proof and final integration — 2026-09-05

The earlier OWNER-pending status is superseded. Root's explicitly approved six-role run passed independent verification at `2026-09-05T04:42:24.773Z` on Arc testnet `eip155:5042002`. All six derived public addresses matched the approved roles before mutation. The run registered agent `891730`, verified the separately approved full ERC-721 operator grant, and settled exactly one $0.01 childless job `job_7f4b653b140843c4b6a4` through existing FeeSplitterV2 `0x9e304ec13dd862c81ee8caa8fd262dac426fbedf`, plus registration/approval/settlement/attestation gas. No automatic resend or replacement role was used.

- Registration: `0xcef7afe3ee60519d355aae8008b0b8fcda8dc92a93e3ffd584f835057f001f52`.
- Operator approval: `0xa388ce6152823e42e8520d9739f50a423970f5e315e239aeb20c837cc80307f9`.
- Settlement: `0x2d8b135488f63af0c4ddf580f1e1d39609af373f06b7f8388a3746edb6520e3e`.
- Validation request: `0x1be2a35ae56cdd2eeb8ea2b237519ed5b16e74a0073c5cf8f463df4071509611`.
- Validation response: `0xd356b19c8e7d28537e59d15248c78175d36fd956eb08c56ea799eef47e86e5db`.
- Feedback: `0x41c84d417a0674fccbff2f413bee5f3f2a91981034f1f8830afd75828e05afb6`.

Public proof `<LIVE_RUN_ARTIFACT>` identifies the exact roles, agent/job, transaction hashes and committed document hashes. Independent checks covered successful correlated receipts/logs, current owner/URI/operator, actual USDC transfers and childless `Settled`, validation/feedback state, and served/persisted document bytes. Owned services were confirmed stopped before PASS. The registration URI `http://127.0.0.1:51806/listings/usdc-flow-check/agent-registration.json` is now stopped temporary loopback, not a persistent public deployment. Retained public document exports match the commitments; private journals and SQLite job store remain local and must not be published. The approved blanket operator grant remains on-chain; no unrequested revocation/transfer was performed.

Atomic live-evidence documentation commit `cc5a683` follows A `6eb44c5` and rebased C `6eed333`, and is merged into main. Root reports the final required all-four main gate GREEN: 1,656 Vitest, 113 Bun, TypeScript checks, web production build and 16 Forge tests. This private ledger update changes no tracked file, performs no live action and does not rerun those gates; it records the completed root-owned checks. Historical TDD results above are preserved.
