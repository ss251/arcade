# Owner actions — ETHOnline 2026 "Charizard" week

Every step in Plans A–I that a human must perform, in the order they are needed. Executors
**stop** at these and hand the command to the owner; nothing here may be worked around on a
retry, an error-recovery path, or "to unblock the build".

Three of them are hard rules from the repo's `CLAUDE.md`, not conveniences:

1. Circle's Terms of Use are never accepted on the owner's behalf (`circle terms accept`,
   `CIRCLE_ACCEPT_TERMS=1`).
2. Secrets live in the Keychain. `security add-generic-password -w` reads the value from the
   terminal prompt — never from `argv`, never from a file, never pasted into a prompt or a
   commit. An agent must not `find-generic-password` a key just to look at it.
3. The video's voice is a real human recording. ETHGlobal requires it; TTS disqualifies.

The **Blocks** column names what stalls if the action has not happened.

---

## Fri Sept 5 – Sat Sept 6 — before the parallel streams start

| # | Action | Plan · task · step | Blocks |
|---|---|---|---|
| 1 | **Fund the demo keys from the Arc faucet.** The buyer, the `wallet-risk-note` seller (it pays for its own hires out of working capital) and the facilitator (gas). `POST https://api.circle.com/v1/faucet/drips {"address","blockchain":"ARC-TESTNET","usdc":true}` — `"native": true` is **rejected**; USDC *is* the native gas token on Arc. | A · Task 9 · Step 1 | The three-hop live evidence, and every later live run in C, D, F, G |
| 2 | **Fund a throwaway buyer key for the Gateway 4-hour gate.** Same faucet. The gate deposits real testnet USDC. | F · Task 1 · Step 2 | The PASS/FAIL decision that picks Plan F's main track vs its EIP-3009 fallback track — must be recorded before Mon Sept 8 |
| 3 | **Accept Circle's Terms of Use.** Print the live `termsOfUseUrl`, `privacyPolicyUrl` and `termsNotice` verbatim, then the owner runs `circle terms accept --output json` **in their own shell**. Resume only when `circle terms show --output json` reports `data.accepted: true`. | I · Task 1 · Step 4 | The whole Circle CLI interop lane (I Tasks 1–3) |
| 4 | **Log in to the Circle CLI (email + OTP).** The owner supplies the email address — never guess it — and the OTP from their inbox. The OTP must not pass through agent storage. | I · Task 1 · Step 5 | Same as above |

## Sun Sept 7 — the day the parallel streams open

| # | Action | Plan · task · step | Blocks |
|---|---|---|---|
| 5 | **Mint and fund the canary key.** A funded Arc testnet key distinct from the facilitator's, stored as Keychain item `arcade-canary-key`, then dripped from the faucet. | C · Task 10 · Step 3 | The auto-delist / relist live evidence; without it the canary simply does not run and the UI honestly says "not pay-tested" |
| 6 | **Mint and fund the three ERC-8004 hub keys.** `arcade-operator-key`, `arcade-validator-key`, `arcade-attester-key` in the Keychain, each dripped. The **attester must be a third address** that is neither the agent's owner nor its operator, or every `giveFeedback` reverts by design. | D · Task 13 · Step 3 | Identity registration, the validation round-trip and the settlement feedback — the four Arcscan links in D's evidence |
| 7 | **Fund the seller key.** Gas on Arc is USDC, so `arcade identity register` refuses (`UnfundedSeller`) on an address that has never been paid. | D · Tasks 3, 6, 13 | Any ERC-8004 registration |
| 8 | **Choose and approve the ENS parent label.** `pickAvailableLabel` proposes `arcade`, then `arcade-hub`, then `arcadelabs`. The agent prints its pick and stops. The 2LD is public, permanent for the event, and appears in every demo name and in the submission. | E · Task 5 · Step 6 | Every ENS name in the demo |
| 9 | **Fund the two Sepolia ENS keys with Sepolia ETH** (any public faucet) and store them as `arcade-ens-owner` and `arcade-ens-daemon`. The registrar's fee is MockUSDC, which the script mints itself; only gas needs funding. | E · Task 5 · Step 6 | The namespace bootstrap, liveness renewal, and the three ENS demo beats |
| 10 | **Note the one production step the ENS script deliberately does not take**: it never calls `revokeRootRoles(...)` on the parent pointer. Locking is irreversible and the namespace is still being built. Acknowledge and let it be recorded in `docs/runbook.md`. | E · Task 4 | Nothing — it is a disclosure, not a blocker |
| 11 | **Create the Base-mainnet Graph payer key and fund it with a few dollars of USDC** (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`), stored as Keychain item `graph-x402-payer`. Never a key used anywhere else. | G · Task 12 · Step 7 | The cost-of-goods skill's paid Base query, and the "remove the key → no Arc settlement" beat |

## Mon Sept 8 — check-in day

| # | Action | Plan · task · step | Blocks |
|---|---|---|---|
| 12 | **Create the Subgraph Studio account and subgraph.** Open <https://thegraph.com/studio/>, connect a wallet, create **`Arcade Ledger Arc Testnet`**, and hand back the **deploy key** and, separately, a **query API key** from the "API keys" page (`ARCADE_GRAPH_KEY`). Both stay out of the repo and out of any prompt. | G · Task 1 · Step 5; used again in G · Task 6 · Step 4 | The whole ARCADE subgraph half; without it Plan G takes its documented fallback (hub-computed stats) and the day is not lost |
| 13 | **Post the Sept 8 ETHGlobal check-in** — before 09:29 IST, from the owner's account. | I · Task 11 · Step 3 | Event compliance |

## Tue Sept 9 – Wed Sept 10

| # | Action | Plan · task · step | Blocks |
|---|---|---|---|
| 14 | **Approve and fund the Gateway deposit.** `arcade-buy gateway-deposit --amount 0.5` moves testnet USDC into Circle's Gateway Wallet; `scripts/gateway-withdraw.ts` moves it back. Confirm the buyer is faucet-funded and approve the amount. | F · Task 11 · Step 2 | The twenty-call, one-settlement session evidence (F Task 12) |
| 15 | **Review the twelve page screenshots** (six pages × light/dark) and rank the defects. A green test suite is not evidence a page looks right. | H · Task 14 · Step 3 | The visual quality of every page in the video |
| 16 | **Drive a real purchase through the chat UI with a funded browser wallet**, then re-shoot. A screenshot of an empty marketplace is not evidence of a marketplace. | H · Task 14 · Step 4 | Usable frames for the submission |

## Thu Sept 11

| # | Action | Plan · task · step | Blocks |
|---|---|---|---|
| 17 | **Post the Sept 11 ETHGlobal check-in** — before 09:29 IST, from the owner's account. | I · Task 12 | Event compliance |

## Fri Sept 12 (freeze at noon) — capture

| # | Action | Plan · task · step | Blocks |
|---|---|---|---|
| 18 | **Record the voice.** Read each `docs/narration/ethonline-2026/beat-N.txt` aloud, one file per recording, in a quiet room with a USB or headset microphone — **not a phone**, and **no TTS**: ETHGlobal requires a real human voice, and `scripts/narrate.sh` (ElevenLabs) must not be run for this cut. Eight files, together under 240 s. | I · Task 9 · Step 3 | The video, and therefore the submission |

## Sat Sept 13 — submission

| # | Action | Plan · task · step | Blocks |
|---|---|---|---|
| 19 | **Submit on the ETHGlobal dashboard**, before **12:00pm EDT**. The agent prepares every field — checklist, video, repository link, the three partner selections (max three; a partner with several tracks counts once) — and submits none of them. | I · Task 13 · Step 3 | Everything |

## Wed Sept 16 — the mainnet flip (after submission, inside the Arc prize's Sept 30 window)

| # | Action | Plan · task · step | Blocks |
|---|---|---|---|
| 20 | **Execute the mainnet flip, step by step, on explicit confirmation.** The only task in the week that spends mainnet funds. Confirm the immutable seller address **before** deploying `FeeSplitterV2`; fund the facilitator with mainnet USDC; prove the failing job first (no transaction) and the succeeding job second. If any published mainnet parameter is still missing, **stop** and leave the manifest `pending` — that is the correct documented state. | I · Task 15 (whole task; Steps 1, 4 and 5 in particular) | The "Push to Mainnet" evidence appended to the README |

---

## Standing rules for the executors

- A step marked **OWNER** stops the agent. Print the exact command, wait, resume on confirmation.
- Never set `CIRCLE_ACCEPT_TERMS=1`, and never re-attempt a terms gate on an error path.
- Faucet drips are `{"address","blockchain":"ARC-TESTNET","usdc":true}`. `"native": true` is
  rejected — on Arc, USDC *is* the native gas token (18 decimals as gas, 6 as an ERC-20).
- Keys reach a process as `KEY=$(security find-generic-password -s <item> -w)` inside the
  command that needs them, and never in a file, a log line, a commit or a prompt.
- If the owner is unavailable, take the documented fallback rather than the shortcut: no
  Studio key → Plan G's hub-computed stats; no Gateway PASS → Plan F's EIP-3009 track; no
  canary key → the UI says "not pay-tested" and claims nothing.
