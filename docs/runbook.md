# Runbook — deploying and operating a public hub

Everything here was learned by doing it. Where something failed quietly, that is written
down as the reason rather than the rule, because the rule alone is forgettable and the
failure is not.

---

## The six environment variables that matter

`bun run hub` works on a laptop with no configuration at all. Every one of those defaults is
wrong on a host anyone can reach, and each fails **quietly** — which is why the hub now
refuses to start when `ARCADE_PUBLIC_URL` is set and the load-bearing ones are missing
(`apps/hub/src/server.ts`, `preflight`).

| variable | on | why it is load-bearing |
|---|---|---|
| `ARCADE_PUBLIC_URL` | hub | The origin written into every 402 challenge and into `/openapi.json`. Behind a proxy it must be the URL buyers can reach, not the socket Bun bound — otherwise the challenge names an unreachable resource. **Setting it is also the signal that this is a public deployment**, which turns on the refusals below. |
| `ARCADE_HUB_SECRET` | hub | Job tokens are `HMAC(secret, jobId)`. Unset, a fresh secret is minted **every boot**, so every buyer holding a 202 loses access to work they already paid for. Harmless while the store was in RAM (the receipt died too); with `ARCADE_DB` set, this is what strands paying buyers. Pin it. |
| `ARCADE_FACILITATOR_KEY` | hub | The key that broadcasts settlements. Unset, the hub generates an ephemeral one with no gas and **every settlement fails after the work is already done** — the seller has burned inference and nobody gets paid. |
| `ARCADE_DB` | hub | Path to the sqlite file. Unset means in-memory: every restart forgets every receipt and rating. On Railway **every deploy is a restart**, so unset here means the marketplace page is empty for a judge who arrives after a push. |
| `ARCADE_FEE_SPLITTER` | **runner** | The seller's `FeeSplitter`. **On the runner, never the hub** — see below. |
| `ARCADE_RAIL` | hub | `eip3009` (proven), `gateway`, or `test`. `test` simulates settlement and moves no USDC; the preflight warns loudly if it is set on a public origin. |

Optional: `ARCADE_FEE_BPS` (default 500), `PORT`, `ARCADE_TEST_BALANCE` (test rail only).

---

## The fee splitter goes on the RUNNER

**Deployed for this pilot:**

```
FeeSplitter  0xf95c8afefae677fdcfc7bd5b8aaaf3702db99206   (Arc testnet)
  seller     0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF
  treasury   0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF   ← same address, deliberately
  feeBps     500  (5%)
```

Set it on the runner:

```bash
export ARCADE_FEE_SPLITTER=0xf95c8afefae677fdcfc7bd5b8aaaf3702db99206
```

**Why not the hub.** `FeeSplitter.seller` is immutable — one contract can only ever pay one
address. The hub used to read a single global `ARCADE_FEE_SPLITTER` and substitute it for
*every* listing's payout, which is correct with one seller and loses money with two: the
second seller's buyers would sign authorizations paying the first seller's contract, and the
immutability that makes the contract safe is exactly what makes those funds unrecoverable.
It now travels per seller in the signed handshake. Setting it on the hub does nothing and
logs a warning saying so.

**It is inside the signed digest** (`helloDigest`, v2). An unsigned payout-routing field
would be a valid signature over everything except where the money goes.

**`feeBps` is checked at handshake.** The contract's `feeBps` is immutable while receipts are
computed from `ARCADE_FEE_BPS`; the hub reads `feeBps()` from the announced splitter and
refuses the connection on a mismatch, because a receipt stating a split the chain did not
perform is the one number on the public page a judge can check against the contract.
Fail-closed on disagreement, fail-**open** on an unreadable RPC.

**treasury == seller is deliberate for the pilot.** The split still genuinely happens on
chain: `settle` does `accruedFees += feeAmount`, transfers only `sellerAmount`, and emits
`Settled(buyer, total, sellerAmount, feeAmount, nonce)`. The fee sits in the contract until
someone calls `withdrawFees()`. So the take-rate is real and checkable; what coincides is
only the eventual destination. The page discloses this rather than calling it platform
revenue.

**Replacing it later** is deploy-a-new-one plus a runner restart to re-announce — not a
migration, because the address is per-seller and announced. **Withdraw any accrued balance
from the old contract first**: `withdrawFees()` is permissionless, so anyone *can* call it
and therefore nobody will.

---

## Repointing the runner at the public hub

`~/.arcade/config.json` still holds development values:

```json
{ "hubUrl": "http://localhost:8792", "hubWsUrl": "ws://localhost:8792/ws" }
```

**Both must change** to the public origin (`https://` and `wss://`). If they do not, the
runner stays happily connected to a local hub and the public URL serves an **empty
catalogue** — and it looks healthy from both ends, because the runner *is* connected, just
not to the host anyone is reading.

```bash
bun run arcade init --seller 0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF --hub https://<public-host>
```

---

## Restart semantics

**What survives:** receipts, ratings, jobs. They are the evidence the page's statistics are
computed from, and a buyer holds a token for a job.

**What deliberately does not:** listings and runners. A listing is only valid while its
runner is connected, so restoring one would advertise a skill nobody serves — the single
property `/openapi.json`, `/.well-known/x402` and `/skill.md` exist to guarantee. Runners
reconnect with backoff and re-announce within seconds. Verified: after a kill-and-restart the
receipt was intact and all three listings were back before the hub finished booting.

**Jobs in flight are reaped, not resumed.** Any row still `queued` or `running` at boot
belonged to a dead process and is marked `failed`. Nothing was settled, so the buyer was
never charged and the receipt reads `settled=false` for the same reason as any other failure
path. Re-dispatching would double-burn the seller's inference and might run against an
expired authorization window.

**The residual is the seller's:** their runner may have burned inference on a job the hub has
given up on, and will find its result dropped. That is the mirror of settle-on-success. It is
logged, not hidden.

---

## Arc RPC traps

**Well-known test keys are blocklisted.** Deploying from `0x7099…` (the standard anvil
account) returns `Blocked address` from `https://rpc.testnet.arc.network`. Use a real
address. The deployer for the splitter above is a throwaway generated for the purpose,
holding leftover faucet gas:

```
deployer  0xcf821769ED3c0E55e152745377bb833d7155A78a
key       Keychain, service `arcade-deployer-key`, account = that address
```

It retains **no authority** over the deployed contract — every field is immutable, there is
no owner, and `withdrawFees` is permissionless — so a throwaway is the correct choice and the
seller's payout key was never needed.

**`-32011 request limit reached` is a rate limit, not a failure.** The splitter deploy
succeeded and then the script's own verification read tripped this, which makes a successful
deploy look failed. Never `waitForTransactionReceipt` against the public RPC; poll one
receipt per tick with backoff. **If a deploy appears to fail this way, check the chain before
re-broadcasting** — you may be about to deploy a second contract.

**Funding an address:**

```bash
curl -s -X POST https://api.circle.com/v1/faucet/drips \
  -H "Authorization: Bearer $(security find-generic-password -s circle-api-key -w)" \
  -H "Content-Type: application/json" \
  -d '{"address":"0x…","blockchain":"ARC-TESTNET","usdc":true}'
```

HTTP 204 means funded; 20 USDC per address per 2h. `"native": true` is **rejected** — on Arc
USDC *is* the native gas token, at 18 decimals, while the ERC-20 interface at the same
address is 6 decimals. Reading the wrong one is the most common bug on this chain: use
`balanceOf` for money, `getBalance` for gas.

---

## Host requirements

The runner dials **out** over a websocket and the hub holds that connection open, so the host
must support a **persistent process with wss upgrade and no scale-to-zero**. That rules out
serverless. Railway works; `railway` is the CLI installed here.

The hub is Bun-only — `Bun.serve` provides the websocket upgrade and `bun:sqlite` the store.

---

## Deploy checklist

1. `ARCADE_PUBLIC_URL`, `ARCADE_HUB_SECRET`, `ARCADE_FACILITATOR_KEY`, `ARCADE_DB`,
   `ARCADE_RAIL=eip3009` set on the host. The hub refuses to boot without the middle two.
2. Facilitator key funded — it pays gas for every settlement.
3. Persistent volume mounted for `ARCADE_DB`, or the store is lost on each deploy.
4. Runner repointed at the public `https`/`wss` origin, with `ARCADE_FEE_SPLITTER` set.
5. `GET /` and `GET /openapi.json` both serve.
6. One paid call round-trips end to end, and the receipt carries a real tx hash.
7. Restart the host and confirm the receipt is still on the page and the listings came back.
