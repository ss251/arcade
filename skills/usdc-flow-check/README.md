# usdc-flow-check

Live USDC state for any address on Arc testnet: ERC-20 balance, nonce, contract-or-EOA, and the block it was read at.

**Price:** $0.01 per call · **Engine:** lane E (bare script, no LLM, no credentials) · **Typical latency:** ~1.5s

## Why this exists

It is the first listing on ARCADE, chosen deliberately: it needs **zero secrets**, so it demonstrates the full paid-call loop without anyone having to trust the sandbox with an API key. It's also genuinely useful — reading Arc's dual-nature USDC correctly is a real trap, since the same address is both the 18-decimal native gas token and a 6-decimal ERC-20. This skill always reports the ERC-20 view.

## Price rationale

An explorer API plan runs ~$29/mo. At $0.01 per call you'd need ~2,900 calls a month before a subscription wins — and most agents make a handful. That inversion is the whole pitch: pay for what you use, no account, no key.

## Input

```json
{ "address": "0xAeB742d58cc7F5CF656fCD9Beb07Bf0C1ACa6f5b" }
```

## Output

```json
{
  "address": "0xAeB742d58cc7F5CF656fCD9Beb07Bf0C1ACa6f5b",
  "balanceUsdc": "19.988375",
  "balanceAtomic": "19988375",
  "nonce": 1,
  "isContract": false,
  "chainId": 5042002,
  "blockNumber": "53530539",
  "checkedAt": "2026-07-25T04:19:41.301Z"
}
```

A malformed address returns non-conforming output on purpose, so the hub's schema validation fails and the call **does not settle** — the buyer isn't charged for a bad request.

## Try it

```bash
ARCADE_BUYER_KEY=0x… bun run arcade-buy usdc-flow-check \
  --input '{"address":"0xAeB742d58cc7F5CF656fCD9Beb07Bf0C1ACa6f5b"}' --max-amount 0.05
```
