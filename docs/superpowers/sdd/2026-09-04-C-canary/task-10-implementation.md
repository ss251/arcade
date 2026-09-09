> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# Task 10 — evidence harness implementation

Status: code and offline verification complete; live proof is OWNER-blocked, not claimed.

Owned files: `scripts/e2e-canary.sh`, `scripts/e2e-canary.ts`, `apps/hub/test/canary-evidence.test.ts`.
Root owns package script, runbook/owner notes, full gates and commit.

## TDD evidence

- 2026-09-05 04:15:48 IST: missing-controller-module Red captured before implementation.
- 04:20:35: 16 offline cases passed; root TypeScript, Bash syntax and diff checks passed.
- 04:23:10: two true regression failures added: restored detail did not verify its identity; actual gated Bun child had no readiness marker.
- 04:23:34: 19/19 cases green after identity checking/readiness marker; `bunx tsc --noEmit`, `bash -n scripts/e2e-canary.sh`, `git diff --check` green. Shell executable mode set.
- Real subprocess checks use no credentials/network: Bash help from unrelated cwd, missing-key refusal before setup, Bun original skill stub cannot run until release file exists. All owned temporary test files/processes cleaned up.

## Literal-plan corrections

- No runner init: it mints an identity and overwrites config. Temporary wrapper calls the real daemon with a fresh in-memory RunnerConfig and isolated skill copy, with no HOME/config change.
- Disconnect means 404 on `/listings/:id` and `/skill/:id`. It is not itself a delist proof. Require three fresh, jobless failed rows in sqlite for the exact skill/seller, plus both 404s and omission from all four discovery surfaces.
- Reconnect barrier: only the private entry is replaced by a local gate that then imports the byte-copied real usdc-flow-check. Public manifest fields, source operation, scheduler and payment pipeline are unchanged. Gate stays closed until detail says delisted and every catalog omits it, then the normal scheduled canary can succeed.
- Real EIP-3009 only on chain 5042002, fixed approved RPC, original $0.01 skill, explicit FeeSplitterV2. No simulation switch in live entry point. Require canary address distinct from seller/facilitator.
- Retain fresh sqlite/evidence directory but no key files or child logs. Allowlisted child env scopes separate hub credentials from seller credentials; no sub-buy key passed. Owned ChildProcess handles only, PID > 1, awaited TERM/KILL/close; wrapper parent-exit guards prevent an orphan waiting process. No detached tasks.
- Stop services before independent chain verification. A PASS requires exactly two settled receipts, distinct hashes, matching marked durable canary receipts, successful transactions to the configured splitter from facilitator, both six-decimal ERC-20 transfers, and the matching FeeSplitterV2 SettledTree event (buyer, amounts, nonce, tree hash, zero children).
- At most one independent receipt request per retry with bounded exponential backoff; no waitForTransactionReceipt.

## Required owner/live contract

OWNER must first create and fund a dedicated `arcade-canary-key` in Keychain. No executor has generated, accessed, substituted or funded it. Existing seller/facilitator can use the legitimate testnet deployer item in a consuming command. Example after root registers `e2e:canary`:

Historical command (not current operator instructions):
```text
ARCADE_NETWORK=arc-testnet \
ARCADE_CANARY_KEY="$(security find-generic-password -s arcade-canary-key -w)" \
ARCADE_FACILITATOR_KEY="$(security find-generic-password -s arcade-deployer-key -w)" \
ARCADE_SELLER_KEY="$(security find-generic-password -s arcade-deployer-key -w)" \
ARCADE_FEE_SPLITTER=0x9e304ec13dd862c81ee8caa8fd262dac426fbedf \
bun run e2e:canary
```

The current helper requires `ARCADE_CANARY_KEY`, `ARCADE_FACILITATOR_KEY`, `ARCADE_SELLER_KEY`, `ARCADE_FEE_SPLITTER`. Optional SELLER must match the seller key. It refuses another network, a simulated rail, or a noncanonical RPC override before setup. Two intended $0.01 purchases plus facilitator gas; an unexpected extra successful purchase causes FAIL rather than a misleading two-purchase report.

No real funded key or live chain call was used during implementation. No live transaction hashes exist for C10 yet; no live evidence claim may be added to the runbook until this script actually passes.
