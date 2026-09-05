> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

### Task 9: Live evidence — two settles, one refusal

**Files:**
- Create: `scripts/e2e-lineage.sh`
- Modify: `skills/wallet-risk-note/arcade.json` (ensure `maxSubSpendUsd`), add a second hiring listing `skills/loop-probe/` (script engine, hires `wallet-risk-note`, used only to demonstrate `lineage_cycle`)

**Cross-plan price resolution (settled here, once).** Plan G Task 14 re-prices
`wallet-risk-note` to `$0.15` and gives it a second hire (`counterparty-graph`, `$0.05`)
alongside `usdc-flow-check` (`$0.02`). The reservation ledger charges **every descendant
against the root's ceiling**, not the immediate parent's, so a `loop-probe` root sees a tree
of `0.15 + 0.05 + 0.02 = $0.22`. The numbers below are sized for that and are the only place
in the repo they are decided: **`loop-probe` price `$0.30`, `maxSubSpendUsd` `0.25`,
`e2e-lineage.sh --max-amount 0.35`.** Plan G asserts these and never edits them. (The review
brief proposed `0.20`; `0.20` is two cents short of the real tree, which would refuse the
third hire with `tree_budget_exceeded` and break the demo, so the ceiling is `0.25`.)

- [ ] **Step 1: OWNER — fund the demo keys from the faucet**

**OWNER.** The three-hop demo spends real testnet USDC from three addresses: the buyer, the
`wallet-risk-note` seller (which pays for its own two hires out of working capital) and the
facilitator (gas). Ask the owner to run the faucet drip for each address that reports a zero
balance, and to confirm before the live run in Step 3:

Historical command (not current operator instructions):
```text
curl -s -X POST https://api.circle.com/v1/faucet/drips \
  -H "Authorization: Bearer $(security find-generic-password -s circle-api-key -w)" \
  -H 'content-type: application/json' \
  -d '{"address":"0x…","blockchain":"ARC-TESTNET","usdc":true}'
```

`"native": true` is rejected — USDC *is* native on Arc. Needed **Sat Sept 6**, before Step 3.
See `docs/superpowers/plans/2026-09-04-01-owner-actions.md`.

- [ ] **Step 2: Add the demo listing**

`skills/loop-probe/arcade.json`: price `$0.30`, `bounds: {timeoutSec: 60, maxSubSpendUsd: 0.25}`, `engine: {adapter: "script", entry: "run.ts", capabilities: ["hire-skills"]}`, input `{address}`, output `{ok: boolean, hired: string[]}`. `run.ts` hires `wallet-risk-note` (which hires `usdc-flow-check`, and `counterparty-graph` once Plan G Task 14 has landed) and then attempts to hire `loop-probe` itself, expecting `HireRefused` containing `lineage_cycle`, and reports both in the output.

- [ ] **Step 3: Write the script**

`scripts/e2e-lineage.sh`: starts nothing (assumes hub + runner running per `docs/runbook.md`), runs `bun run arcade-buy loop-probe --input '{"address":"0xAeB742d58cc7F5CF656fCD9Beb07Bf0C1ACa6f5b"}' --max-amount 0.35`, then fetches the poll URL and prints the receipt tree with explorer links, asserting: root settled, two children (one settled `wallet-risk-note`, one child-of-child visible in `wallet-risk-note`'s own receipt), and `hired` includes the cycle refusal text. Exit non-zero on any assertion failure.

- [ ] **Step 4: Run it against the live testnet hub and paste the tx hashes into `docs/runbook.md` under "Evidence: lineage"**

- [ ] **Step 5: Commit**

Historical command (not current operator instructions):
```text
git add skills/loop-probe scripts/e2e-lineage.sh docs/runbook.md
git commit -m "test(e2e): live receipt tree with a refused cycle on Arc testnet"
```

---
