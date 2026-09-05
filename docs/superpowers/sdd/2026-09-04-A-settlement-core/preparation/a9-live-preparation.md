> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# A9 live lineage evidence preparation — read-only, awaiting GO

Prepared 2026-09-05. This is a design/review report, not live evidence. No keys retrieved, services launched, RPC queried, transactions submitted, owner configuration changed, or A9 source edited. Read full A9 task brief/report, e2e-lineage.sh, verify-lineage-evidence.ts, relevant runner/pipeline/payment/contract code and the three canonical skill manifests/entries. Used the ts-testing skill to identify concrete regression cases. Root supplied public wallet facts; funding is owner-reported, not independently verified here.

## Fixed current scope

- Seller/facilitator: 0xcf821769ED3c0E55e152745377bb833d7155A78a.
- Buyer: 0xdaACA688cE93d6EA0BDf4cdA9925C5526f3cA5e1.
- Newly provisioned subbuyer: 0xd3Ad4D10D4d24bD57740A5430ED5Fd28c6824634 (owner reports 20 USDC).
- Existing FeeSplitterV2: 0x9e304ec13dd862c81ee8caa8fd262dac426fbedf.
- Arc testnet chain 5042002, canonical https://rpc.testnet.arc.io, actual eip3009 rail. No other roles are required for A9; disable canary and ERC-8004 automatic writes by not providing those keys.
- Current prices: loop-probe $0.30, wallet-risk-note $0.05, usdc-flow-check $0.01. Expect three settlements, two descendants and exactly $0.06 subbuyer spend; later Plan G prices are not current. Root maxSubSpendUsd is $0.25 and wallet maxSubSpendUsd is $0.02. One root buy, explicit $0.35 ceiling, no automatic retry.

## Concrete existing harness defects requiring TDD before live execution

1. Runner default maxConcurrency is 2, but loop-probe -> wallet-risk-note -> usdc-flow-check holds three active jobs simultaneously. The third job can fail at capacity. Isolated config must allow at least 3 (prefer exact 3); validate with a finite offline real-runner cycle.
2. Existing verifier trusts buyer output and the public receipt feed. It does not read chain receipts/events, require eip3009 rail, prove buyer/seller/splitter/fees/amounts, require unique transaction/job IDs, or bound the descendants to exactly two. Plausible simulated receipts can pass. Public receipt projection removes the IDs/nonce needed to independently rebuild the tree; inspect owned private SQLite/authenticated data internally and export only public/redacted commitments.
3. Cycle refusal proof is just seller-controlled output containing lineage_cycle. Observe the actual scoped HTTP response without mocking it, plus exactly three durable jobs/receipts and no payment for a refused fourth call. A narrow passive test preload can record only path, status, error code and booleans for capability/payment-header presence; never record headers or capability tokens. Require 402 lineage_cycle on the nested loop-probe probe with no payment signature.
4. Current shell overwrites the network selector, accepts an arbitrary existing hub URL, inherits dotenv/injection/secret environment, tees raw buyer output, has unbounded curl, and starts no owned services. Replace only after GO with an isolated owned-process entry point, safe per-role environment, actual loopback port 0 discovery, bounded IO/cleanup and no raw diagnostics.
5. Current SDK poll envelope uses job_id while SkillResult is typed jobId; hire broker can display an undefined child ID. Do not trust displayed hired IDs for evidence. Use durable actual IDs. Avoid unrelated SDK API changes in the evidence task.
6. Simply copying the skill into an OS temp directory may break @arcade/buyer/hire module resolution. Importing the original run.ts through the D13 guard wrapper suppresses loop-probe's import.meta.main. Preserve the canonical executable behavior with an explicit tested dependency-resolution strategy; prove temporary entry/guard behavior offline before any spending.
7. The review exposed a shared C10/D13 fixture mistake: childless jobs use ordinary Settled, not zero-child SettledTree. Root assigned disjoint TDD corrections before live execution. D13 correction is recorded in task13-implementation.md. No chain proof may be inferred from the previous synthetic fixtures.

## Independent chain/tree checks

- Preflight actual RPC chain ID, expected derived role addresses (seller may equal facilitator; buyer/subbuyer/seller distinct), exact listing prices/manifest inputs, native facilitator gas, buyer >= $0.30 and subbuyer >= $0.06, and actual V2 seller/usdc/version 2/feeBps 500. Start a fresh bounded block range.
- Require exactly three distinct successful transaction receipts, submitted by the facilitator to the expected V2; correlate every requested hash and all present log provenance and reject removed logs. Require exact USDC transfers and event amounts/nonces for each job.
- Root: ordinary buyer pays 300000 atomic; seller receives 285000, fee 15000. Require SettledTree with exactly 2 children, childTotalAtomic 60000, and the independently rebuilt treeHashOf(rootJobId, both durable children).
- Wallet child: subbuyer pays 50000; seller receives 47500, fee 2500. Flow child: subbuyer pays 10000; seller receives 9500, fee 500. Both emit ordinary Settled, not tree events: only the root aggregates all descendants on chain.
- Require exact parent chain loop -> wallet -> flow, shared rootJobId, hops 0/1/2, expected ancestors, two committed reservations, no remaining reserved/fabricated descendants, and exactly three jobs/receipts. Capture actual refusal without logging capability values.
- Expected buyer USDC delta is -300000, subbuyer -60000. Exact seller raw balance delta is unsuitable without gas adjustment because seller equals facilitator; use exact transfer events for 342000 total proceeds and 18000 fee accrual. No proof may rely only on aggregate balances or unrelated events.

## Isolated execution design after explicit GO

Create one owned temporary config/database/skills/socket directory and random runner ID. Do not use init, change HOME, write owner config, read keychain without separate authority, or share an existing service. Run hub at actual 127.0.0.1 port 0 with only facilitator key; seller runner only seller/subbuyer keys and expected splitter/config path; buyer only buyer key. Disable automatic dotenv and interpreter injection. Set runner maxConcurrency 3. Keep the three canonical no-provider skills only.

Launch only owned child handles with parent/deadline guards and bounded stdout/stderr drains. Prefixing a guarded private executable copy must preserve original import.meta.main and workspace module resolution; test this before live. Use finite per-operation and total deadlines. Stop/reap only owned processes, TERM then bounded KILL; cleanup failure prevents PASS. Never retry an uncertain paid request or resend an authorization. Retain private checkpoints for manual reconciliation after uncertainty.

After the single paid request, stop spending-capable processes before independent readback. Check exact owned durable rows, canonical tree hashes and actual chain receipts/events within the fresh bounded range. Export sanitized public evidence and receipt/document hashes, not secrets, capabilities or raw provider output. Keep private database artifacts private and local. Print PASS only after the independent checks and successful owned cleanup. Simulated offline cycle tests are harness validation, never live settlement evidence.
