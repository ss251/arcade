# Runbook — deploying and operating a public hub

Everything here was learned by doing it. Where something failed quietly, that is written
down as the reason rather than the rule, because the rule alone is forgettable and the
failure is not.

## Plan A — Evidence: lineage

`skills/loop-probe` buys `wallet-risk-note` (which buys `usdc-flow-check`), then attempts
to hire itself. A successful demo reports `lineage_cycle` for the refused self-hire and
settles the useful work. The root costs $0.30 and permits $0.25 of descendant purchases.
The root receipt lists all descendants; individual child receipts carry their hop and
ancestor skill ids. The refused cycle creates no job or payment.

The current harness starts its own loopback hub, private SQLite database and isolated
three-skill runner (`maxConcurrency=3`). It never edits saved runner configuration or
uses an existing hub. After direct approval for the three testnet purchases and gas:

```bash
ARCADE_BUYER_KEY="$(security find-generic-password -s arcade-buyer-key -w)" \
ARCADE_SUBBUY_KEY="$(security find-generic-password -s arcade-subbuy-key -w)" \
ARCADE_SELLER_KEY="$(security find-generic-password -s arcade-deployer-key -w)" \
ARCADE_FACILITATOR_KEY="$(security find-generic-password -s arcade-deployer-key -w)" \
ARCADE_FEE_SPLITTER=0x9e304ec13dd862c81ee8caa8fd262dac426fbedf \
ARCADE_NETWORK=arc-testnet bash scripts/e2e-lineage.sh
```

Supply the existing distinct buyer/subbuyer keys; these public roles and the seller's
splitter are checked before purchase. Overrides for an existing hub, other input, rail,
network or payment RPC are refused. Canonical unsigned challenges must route the exact
$0.30/$0.05/$0.01 amounts through this V2 splitter. The buyer launches once with a $0.35
ceiling: total buyer/subbuyer expenditure is $0.36 plus facilitator gas. No funding or
uncertain-send retries occur. Canonical flow reads use Arc's alternate public RPC;
payments and independent proof use `https://rpc.testnet.arc.io`.

The harness stops its spending-capable processes before checking three actual receipts,
two committed reservations, exact payer deltas, a root-only `SettledTree`, two ordinary
child `Settled` events, their USDC transfers, nonces and rebuilt tree hash. A passive
observer must also capture the actual unsigned HTTP402 `lineage_cycle` refusal, with no
fourth job or payment. PASS requires successful cleanup. Private checkpoints are retained;
reconcile them and the chain before any manual rerun after uncertainty.

**Live PASS — independently verified at `2026-09-05T04:38:07.372Z` on Arc testnet
(`eip155:5042002`).** The owner-approved run settled all three useful jobs:

| skill / hop | USDC paid (6-decimal atomic) | verified settlement |
|---|---|---|
| `loop-probe` / 0 | $0.30 (300,000) | [root transaction](https://testnet.arcscan.app/tx/0x0d02f5f9793bc7baede3d88b65666052be2b549bc10ea4024d74ecacce28e23d) |
| `wallet-risk-note` / 1 | $0.05 (50,000) | [child transaction](https://testnet.arcscan.app/tx/0x315c65b65a03a4a7ab381263d22e7eaf1d435544486d71caac80037c52abf656) |
| `usdc-flow-check` / 2 | $0.01 (10,000) | [grandchild transaction](https://testnet.arcscan.app/tx/0xe944dc51e6a14b762336bcc04bef9020b63368280c8207692792065fd23d3be3) |

Total buyer/subbuyer expenditure was **$0.36 plus facilitator gas**; the root's
committed descendant total was 60,000 atomic ($0.06). The independently rebuilt tree
hash was `0x87cb3b5b32d849ebb6d5777ac247bdbdb15aa532b226fb86a591c491fa8f4a28`.
The observed self-hire returned HTTP 402 `lineage_cycle` **before payment**
(`hadPayment: false`), with no fourth job or settlement. All owned services were
confirmed stopped before PASS. Public proof is retained in the run's `evidence.json`;
the private SQLite checkpoint is retained separately for reconciliation, not published
or included in a public database dump.

## Plan B — Evidence: publish adapters

Verified on **2026-09-05 IST**. The CLI generated the two read-only Arc Docs MCP
listings and the Frankfurter OpenAPI listing; fixture-equality tests verify the
committed manifests are generator output, not hand-edited demos.
Plan C subsequently adds public `canaryInput` samples; tests still compare every generated
field exactly and permit only that explicitly asserted enrichment.

```bash
bash scripts/e2e-publish-adapters.sh --only search-arc-docs --only fx-rate
```

This explicitly **partial** live run returned `succeeded / end_turn` for both selected
adapters (MCP output 42,790 bytes; FX output 69 bytes) and exited 0. It named `diff-triage`
as excluded. At that earlier checkpoint the default three-adapter run was still key-gated;
the later owner-selected free-route result below supersedes that blocker. Local adapter execution does not itself validate
output schemas at the hub or prove a payment.

A separate **paid FX purchase** through a real loopback-only hub and FX-only runner
did exercise the hub's validation and EIP-3009 settlement on Arc testnet:

- Network: `eip155:5042002`; only Arc-testnet faucet USDC was used.
- Buyer: `0xdaACA688cE93d6EA0BDf4cdA9925C5526f3cA5e1`.
- Seller/facilitator: the existing testnet-only demo identity
  `0xcf821769ED3c0E55e152745377bb833d7155A78a` (see the burned-demo-key warning below).
- FeeSplitterV2: `0x9e304ec13dd862c81ee8caa8fd262dac426fbedf`.
- Price 10,000 atomic ($0.01); seller 9,500 atomic ($0.0095); platform fee 500 atomic
  ($0.0005), accrued in the splitter. No fee withdrawal was performed.
- Receipt: `settled: true`, `reason: ok`, rail `eip3009`, no descendant purchases.
- Transaction: [0xb0cbe2a5…c1aca613](https://testnet.arcscan.app/tx/0xb0cbe2a50de1c4daa1f56d2a33acadfb9ac32649bc33e2f99b7ec6e3c1aca613).

The buyer command used a $0.01 ceiling and the verified local seller:

```bash
ARCADE_BUYER_KEY="$(security find-generic-password -s arcade-buyer-key -w)" \
  ARCADE_NETWORK=arc-testnet bun run arcade-buy fx-rate \
  --hub http://127.0.0.1:28787 \
  --seller 0xcf821769ED3c0E55e152745377bb833d7155A78a \
  --input '{"base":"USD","symbols":"EUR"}' --max-amount 0.01
```

The result was base `USD`, date `2026-09-04`, rates.EUR `0.86044`, upstream cost $0.
One independent `eth_getTransactionReceipt` call to `https://rpc.testnet.arc.io`
confirmed status `0x1`, the expected splitter destination, and ERC-20 transfers of
10,000 atomic into the splitter and 9,500 atomic to the seller (6 decimals, distinct from
Arc's parallel native 18-decimal transfer logs). No `waitForTransactionReceipt` loop
was used. The temporary services were stopped afterward; saved runner configuration,
Keychain items and mainnet were not changed. This paid single-call proof is separate
from Plan A's subsequently verified descendant-lineage demonstration below.

### B13 free-route follow-up — full local execution PASS

On main `c6f6676`, within **2026-09-05 08:56:14–08:57:28 UTC**, the actual default
`scripts/e2e-publish-adapters.sh` exited 0: **3 succeeded, 0 failed**. No `--only`
selection, adapter/capability removal, hub or wallet was used.

| Listing | Adapter | Result | Output bytes |
| --- | --- | --- | --- |
| diff-triage | skill | succeeded / end_turn | 1,173 |
| search-arc-docs | mcp | succeeded / end_turn | 42,790 |
| fx-rate | openapi | succeeded / end_turn | 69 |

The owner-selected model alias is exactly `glm-5.3-flash` through the existing
Anthropic-Messages-compatible loopback API at port 8317, using its API key rather
than a subscription. The two model manifests explicitly declare the base URL and
API-key environment names. The native custom-route guard supplies only a random
per-job local capability to the CLI, binds the exact upstream model/tool surface,
refuses redirects and uncertain resends, buffers bounded complete responses, and
closes with the job. Bun children and shell previews disable dotenv loading.

The consuming command used only the inline Keychain proxy key, an otherwise empty
environment, private umask and a 360-second timeout. It did not restart/reconfigure
the shared proxy or write preview listings. A read-only post-run check at08:57:35 UTC
confirmed the consuming process was absent; the observer arrived after exit and
did not independently sample the former native descendant tree. The actual native
cleanup fixtures and runtime cleanup gate are separate evidence.

This result proves local adapter execution, **not** the hub's output-schema gate or
a new payment. The paid FX transaction above remains separate. Direct Messages
pricing gives only this exact alias zero token rates; server-tool costs remain
accounted, and native SDK cost is not independent provider billing.
`counterparty-brief` web-search/hiring capabilities remain unproven on this route.
The [public SDD follow-up](superpowers/sdd/2026-09-04-B-publish-adapters/free-route-integration.md)
records genuine test failures, the three commits, independent reviews and all gates.

---

## The environment variables that matter

`bun run hub` works on a laptop with no configuration at all. Every one of those defaults is
wrong on a host anyone can reach, and each fails **quietly** — which is why the hub now
refuses to start when `ARCADE_PUBLIC_URL` is set and the load-bearing ones are missing
(`apps/hub/src/server.ts`, `preflight`).

| variable | on | why it is load-bearing |
|---|---|---|
| `ARCADE_PUBLIC_URL` | hub | The origin written into every 402 challenge and into `/openapi.json`. Behind a proxy it must be the URL buyers can reach, not the socket Bun bound — otherwise the challenge names an unreachable resource. **Setting it is also the signal that this is a public deployment**, which turns on the refusals below. |
| `ARCADE_HUB_SECRET` | hub | Job tokens are `HMAC(secret, jobId)`. Unset, a fresh secret is minted **every boot**, so every buyer holding a 202 loses access to work they already paid for. Harmless while the store was in RAM (the receipt died too); with `ARCADE_DB` set, this is what strands paying buyers. Pin it. |
| `ARCADE_FACILITATOR_KEY` | hub | The key that broadcasts settlements. Unset, the hub generates an ephemeral one with no gas and **every settlement fails after the work is already done** — the seller has burned inference and nobody gets paid. |
| `ARCADE_DB` | hub | Path to the sqlite file, **which must be inside a mounted volume**. Container filesystems are ephemeral: point it anywhere else and sqlite writes into the container, receipts persist across a process restart *inside* it, and durability fails only on redeploys — which nobody thinks of as restarts, and which happen on every push. Provision and mount the volume **before the first deploy**, because the first thing you do after one is push a fix. DoD "a receipt survives a restart" is only true on a host with a volume; the sqlite Layer alone does not get you there. **Now enforced** — see below. |
| `ARCADE_CANARY_KEY` | hub | Dedicated funded Arc-testnet key used to buy listings through the ordinary paid HTTP path. Read it from Keychain only in the consuming command. Unset disables automatic purchases; existing dated evidence remains visible, and untested listings say so. Key creation/funding is an OWNER action. |
| `ARCADE_CANARY_INTERVAL` | hub | Minimum time between attempts for each seller/listing. Default `24h`; use `10m` for an explicitly funded demo. Accepts `45s`, `10m`, `24h`, `1d`, or bare seconds; explicit `ms` values are also supported. Zero, negative, fractional, and overflowing timers are refused. |
| `ARCADE_CANARY_MAX_PRICE` | hub | Maximum price per automatic purchase, not a total spending budget. Default `$0.25`. Dearer listings say "not pay-tested — priced above this hub's canary cap". Use a dedicated limited-balance key; shortening the interval or adding listings increases spending. |
| `ARCADE_CANARY_TICK` | hub | How often the loop checks due listings. Default `30s`; clamped to at least `1s` unless the interval is explicitly shorter, and never longer than the interval. The first check runs immediately after startup. |

The canary needs the same durable `ARCADE_DB` as receipts: three consecutive failed
pay-tests hide a listing from discovery and refuse ordinary signed purchases. Reconnecting
alone does not clear that verdict; only a successful canary purchase does. Its receipts
are marked `canary`, so automated testing is not presented as independent buyer demand.
Absent delisted runners are not repeatedly probed until they reconnect. Unsupported input
schemas and listings above the cap are skipped, while a declared input that demonstrably
violates its own schema is a failed test. All purchases are sequential, and the loop is
scoped to the hub process. On `ARCADE_RAIL=test`, the same mechanism runs with explicitly
simulated settlement and moves no funds.

### `ARCADE_DB` is checked, and so is where it points

This one was the last hole in the preflight and the worst-shaped. `StoreFromEnv`
(`apps/hub/src/store-sqlite.ts:213`) reads an **absent** `ARCADE_DB` as a legitimate
configuration and returns the in-memory store — correct on a laptop. So its absence raised
no error at all: the hub booted on a public origin, passed preflight, served the page,
accepted payments, wrote receipts to RAM, and lost them on the next push. The absence of a
value did not produce a failure, it produced a working system with a quietly different
guarantee — and it was the guarantee DoD item 2 rests on.

The preflight now refuses on both halves:

- **unset** → refuses, and names the volume path to use if the platform exposes one.
- **set, but outside the mounted volume** → also refuses. This is the nastier case: the
  file is created, every write succeeds, and the container filesystem is discarded on
  redeploy. Silent loss that looks *more* correct than the unset case.

Verification is real rather than declared: Railway injects **`RAILWAY_VOLUME_MOUNT_PATH`**
(verified against the running service, which reports `/data` alongside
`ARCADE_DB=/data/arcade.db`), and the check is that the db path sits under it. Fly and
Render mount volumes at operator-chosen paths with no comparable variable, so there the hub
**warns that durability could not be verified** rather than pretending it checked — a
refusal there would be a false positive, and a silent pass would be the failure this whole
section is about.

Pinned by `apps/hub/test/preflight.test.ts`, which boots the real process with real
environments rather than unit-testing a copy of the guard.
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

FeeSplitterV2 was deployed and verified on Arc testnet on 2026-09-05. It adds the
`settleWithTree` receipt-tree commitment while preserving the same immutable split:

```
FeeSplitterV2  0x9e304ec13dd862c81ee8caa8fd262dac426fbedf
  deploy tx    0x34f657969d408d4d5d00848c5d0933d40ae7914859a4d6aeb976cd765d2d88f4
  seller       0xcf821769ED3c0E55e152745377bb833d7155A78a
  treasury     0xcf821769ED3c0E55e152745377bb833d7155A78a
  feeBps       500  (5%)
  version      2
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

**Verified live on Arc**, not asserted — a $0.01 call settled through it
([tx `0x9a706d57…`](https://testnet.arcscan.app/tx/0x9a706d5760f11ba0c5aa1fe30afc6f4fa87e908bafa4a78cdafe3af1415eefd2))
and the split was then read off the chain rather than off the receipt:
`accruedFees` = 0.0005 USDC (5%) and the seller balance rose by exactly 0.0095 (95%).

**Buyers must not be well-known test accounts either.** A settlement pulling USDC *from* a
blocklisted address fails at broadcast with `RpcFailure`, after the work is done — the job
succeeds, nothing settles, and the buyer is correctly not charged. The blocklist applies to
the authorization's signer, not just the transaction sender, so a demo buyer needs a real
funded address. Test buyer for this pilot: `0xdaACA688cE93d6EA0BDf4cdA9925C5526f3cA5e1`,
key in Keychain as `arcade-buyer-key`.

**Replacing it later** is deploy-a-new-one plus a runner restart to re-announce — not a
migration, because the address is per-seller and announced. **Withdraw any accrued balance
from the old contract first**: `withdrawFees()` is permissionless, so anyone *can* call it
and therefore nobody will.

---

## Repointing the runner at the public hub

`~/.arcade/config.json` still holds development values:

```json
{ "hubUrl": "http://localhost:8792" }
```

**One field, on purpose.** `hubWsUrl` used to be stored alongside it and derived only when
absent, with nothing reconciling the two — so this step was two edits wearing the shape of
one. Change `hubUrl` to the public origin, leave `hubWsUrl` on localhost, and the runner
reads listings from production while announcing over the local socket. Every surface then
reports health: `checkHub` pings production and says up, the daemon logs "connected to
ws://localhost…" and genuinely is, and the public catalogue stays empty for a reason
visible from neither end. It is the empty-catalogue trap with a second way in, opened by
the step that fixes the first one.

`hubWsUrl` is now **derived from `hubUrl` and never written to disk** (`wsUrlFor`:
`https` → `wss`, `http` → `ws`). Two values that must agree cannot disagree when only one
is written down. A leftover `hubWsUrl` in an older config is ignored, and if it disagreed
the runner says so on startup rather than quietly announcing somewhere else.

**Proven in production, not just in tests.** The first real repoint ran against a config
that still carried `hubWsUrl: ws://localhost:8792/ws`, so the stale field disagreed for the
first time rather than hypothetically. The runner said so at startup and named all three
values:

```
[runner] ignoring stale hubWsUrl: it said ws://localhost:8792/ws, but hubUrl is
https://arcade-hub-production.up.railway.app, so the socket is
wss://arcade-hub-production.up.railway.app/ws
```

Note the derived socket is **`wss`**. Under the old behaviour the runner would have read
listings from production while announcing over a cleartext local socket — reading from one
hub and serving to another, with both halves individually reporting health. Deleting the
field silences the notice; the derivation is unaffected either way.

```bash
bun run arcade init --seller 0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF --hub https://<public-host>
```

**The public catalogue is only populated while a runner is dialled into it.** Point the
config back at localhost and the public URL immediately serves zero listings — correctly,
because a listing is valid only while its runner is connected. So the public host is a live
demo rather than a standing shopfront. Two things follow: **shoot the video with the runner
pointed at production**, and if you send the link to a judge, send it while a runner is up
or say plainly that it serves what is actually being served. That framing is the stronger
one anyway — an empty catalogue is the discovery guarantee working, and most marketplaces
cannot make that claim about themselves.

**Live deployment:** `https://arcade-hub-production.up.railway.app` (Railway project
`arcade-hub`, personal workspace, volume mounted at `/data`).

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

## The commands in this file are unverified claims

Every command printed here is an instruction whose success signal is that a reader
succeeds — which makes it exactly the kind of artifact that can be silently wrong, in the
same family as a gitignore that drops source or a pathspec that can never match. One has
already been wrong: `arcade` is **not on PATH**. The invocation is `bun run arcade …` from
the repo root, through the package script.

Worth a gate eventually — asserting that every command a doc prints at least *resolves* to
a real binary or package script belongs with the hygiene tests. Not built, deliberately
recorded rather than rediscovered by a judge.

---

## The seller identity and its key

`arcade status` reporting `key MISSING` is not a new requirement — the runner has always
needed a signing key. It simply had one implicitly, from a shell that happened to export
`ARCADE_SELLER_KEY`, and the repoint is what surfaced that the implicit path was the only
one.

**Where it actually is.** The keychain holds `arcade-buyer-key`
(`0xdaACA688…`) and `arcade-deployer-key` (`0xcf821769ED3c0E55e152745377bb833d7155A78a`)
but no `arcade-seller-key`. The settled receipt on the production hub names
**`0xcf821769…`** as its seller — the deployer key's address — so that is the identity that
served the paid call, and its key is already stored.

The config currently names `0x3b2Bbb84…`, which no keychain item controls. `resolveSellerKey`
refuses a key whose address does not match the configured one rather than using it, so this
mismatch fails loudly instead of announcing the wrong seller — but it means listings stay at
zero until the two agree. Either point `sellerAddress` at `0xcf821769…` and run
`bun run arcade wallet import 0x<deployer-key>`, or supply the key for `0x3b2Bbb84…`.

Reusing `0xcf821769…` has one advantage for a recording: the receipt tape and the live
listings would then name the same seller, instead of showing a settled call from one address
beside listings served by another.

---

## The seller key is BURNED — demo only

`0xcf821769ED3c0E55e152745377bb833d7155A78a` is the seller, its key is in the Keychain as
`arcade-deployer-key`, and **that key has been exposed in plaintext**. `bun run` echoes the
resolved command line, so `bun run arcade wallet import 0x<key>` printed it — piping from
the Keychain to avoid a `cat` did not help, because the wrapper prints argv.

Not rotated, deliberately. The only settled receipt on the production hub names this
address — `usdc-flow-check`, tx
[`0x6366215e…`](https://testnet.arcscan.app/tx/0x6366215e96a33e97e4a177453c858e9b1b8639fcff4bb72e1e7dcf5459fc8143),
10000 atomic split 9500/500 at 500bps — and it is the single most valuable artifact in the
submission: a real on-chain settlement showing the exact split this marketplace argues from.
Rotating would make the only proof on the tape name an address that is no longer the seller,
recreating the receipt-versus-listing mismatch the repoint just closed, and would force a
third splitter because `seller` and `treasury` are immutable. The exposure is a testnet key
holding faucet USDC worth $0, on its owner's own machine. Containment sized to the exposure
is a label, not a rotation.

**So the constraint travels with the credential:** this address is demo-only and faucet-only.
Never fund it beyond faucet USDC, never reuse it on mainnet, never carry it into a real
deployment. If ARCADE is ever operated for anyone else, it starts with a fresh key that has
never been printed.

`arcade wallet import` now reads `--stdin` by default for exactly this reason. The
positional form still works and warns, because scripts use it.

---

## Host requirements

The runner dials **out** over a websocket and the hub holds that connection open, so the host
must support a **persistent process with wss upgrade and no scale-to-zero**. That rules out
serverless. Railway works; `railway` is the CLI installed here.

The hub is Bun-only — `Bun.serve` provides the websocket upgrade and `bun:sqlite` the store.

---

## `apps/web` is a second service, on the same runtime

The chat surface deploys separately from the hub. It needs `ARCADE_HUB` (the public hub
origin — it holds no key and can only read) and `ANTHROPIC_API_KEY` (without it `/api/chat`
returns a 503 saying so; discovery still works through the hub's own API).

**Let Railway tell it the hub's address rather than typing one.** Both services live in the
same project, so the platform already knows the answer:

```
ARCADE_HUB=https://${{ arcade-hub.RAILWAY_PUBLIC_DOMAIN }}
```

Same principle as arming the hub's preflight off `RAILWAY_*` and deriving the treasury
disclosure from the contract: read the fact, don't restate it. A typed URL is a second place
for the truth to live, and it goes stale silently when the service is renamed.

`apps/web` refuses to boot if `ARCADE_HUB` is unset **or points at loopback** while a
hosting platform is detected. That check exists because the failure it prevents is
invisible: `ARCADE_HUB` defaults to `http://localhost:8787`, nothing listens on 8787 inside
a container, and the resulting fetch failure lands in a tool result → the model's context →
the model's prose. SSR returns 200, the page renders, the chat streams, the model answers —
and the only broken thing is the entire point of the app, phrased as "I wasn't able to
reach the marketplace just now", which a judge cannot tell from a transient. A missing
`ANTHROPIC_API_KEY` only warns, because that is honest degradation of one feature rather
than a deployment pointed at nothing.

On boot it logs the hub it resolved (`[web] hub: …`), so a local run never leaves you
guessing which hub you were actually watching.

### Set the web service's Config File Path, or you get two hubs

Railway's monorepo guide says it outright: **"The Railway Config File does not follow the
Root Directory path. You have to specify the absolute path for the `railway.json` or
`railway.toml` file."**

So a second service in this project inherits the **root** `railway.json` — which pins the
**hub's** Dockerfile — even if you give the service its own root directory. It would then
build a perfectly valid Dockerfile, succeed, and start a **second hub**. Railway reports a
healthy deploy. You would have two hubs, no web service, and two URLs both serving a
settlement page; if the second gets its own volume, two divergent receipt stores, both
looking authoritative, with no way for a visitor to tell which is real.

When creating the web service, set **Config File Path → `apps/web/railway.json`**. That
file pins `apps/web/Dockerfile`. Both exist and are asserted by
`packages/core/test/repo-hygiene.test.ts`, which requires every deployable app outside the
hub to carry its own pair.

**Decide the canonical URL before both exist.** The hub's public origin is the one that goes
in the submission; the chat links out to it, never the reverse.

### The Dockerfile COPY list is enumerated, and that already broke once

Both Dockerfiles `COPY` every workspace manifest, including ones the image never runs,
because `bun install --frozen-lockfile` resolves the whole workspace graph. The hub's list
enumerated five workspaces and was correct until `apps/web` was added — after which its
build failed with `lockfile had changes, but lockfile is frozen`, and nothing said so,
because the last successful deploy predated the new workspace. Adding a workspace means
adding a `COPY` line to every Dockerfile; the hygiene test fails until you do.

**It is not a Node service.** TanStack Start's Vite build emits `dist/server/server.js` whose
default export is `{ fetch(request): Response }` — the Web-standard handler shape, which is
also what `Bun.serve` takes. `apps/web/server.ts` is the twenty lines that serve `dist/client`
and fall through to it, so this runs on the same `oven/bun` image as the hub. Verified: `bun run
build` completes with **`node` absent from `PATH` entirely**, because Bun's script runner execs
`vite`'s bin itself rather than honouring its `#!/usr/bin/env node` shebang. The musl rollup
binaries are in `bun.lock` and esbuild's Linux build is statically linked Go, so Alpine's two
usual native-binary failures do not apply either.

If a future toolchain change breaks that, the fix is a build stage with Node ≥ **22.12.0** —
not 22. `@tanstack/react-start` declares `>=22.12.0` and vite `^20.19.0 || >=22.12.0`; an image
satisfying "22" but not "22.12" dies the same way Nixpacks did on Node 18. That floor is
declared in `apps/web/package.json`, **not** the root, whose `engines` names only Bun.

Two things that only show up at runtime, both found by running it:

- The router entry must export **`getRouter`**. Any other name builds cleanly and fails on the
  first request with `getRouter is not a function` — there is no compile-time signal.
- `apps/web` has its **own** tsconfig and is excluded from the root project. The root types
  against `bun`; merging them lets `Bun.*` typecheck inside code that ships to a Vite bundle
  where no such global exists. `bun run typecheck` runs both projects.

---

## Deploy checklist

1. `ARCADE_PUBLIC_URL`, `ARCADE_HUB_SECRET`, `ARCADE_FACILITATOR_KEY`, `ARCADE_DB`,
   `ARCADE_RAIL=eip3009` set on the host. The hub refuses to boot without any of them, and
   refuses if `ARCADE_DB` is not under the mounted volume.
2. Facilitator key funded — it pays gas for every settlement.
3. Persistent volume mounted for `ARCADE_DB`, or the store is lost on each deploy. Confirm
   with `railway variables --kv | grep -E 'ARCADE_DB|VOLUME_MOUNT'` — the db path must
   start with the mount path, and the preflight will now refuse the deploy if it does not.
4. Runner repointed at the public `https`/`wss` origin, with `ARCADE_FEE_SPLITTER` set.
5. `GET /` and `GET /openapi.json` both serve.
6. One paid call round-trips end to end, and the receipt carries a real tx hash.
7. Restart the host and confirm the receipt is still on the page and the listings came back.

## Plan A: mainnet migration runbook

Use [How to move ARCADE to Arc mainnet](mainnet-runbook.md) for the future OWNER-confirmed migration: published parameters, chain checks, per-seller FeeSplitterV2, facilitator funding, failure/success canaries, rollback and evidence. Mainnet remains pending today; writing that procedure does not authorize a mainnet transaction. Network changes require rebuilding the web bundle and verifying each skill's private RPC/egress settings, not just changing the hub environment.

## Plan C — Evidence: automatic delisting and recovery

`bun run e2e:canary` prepares an isolated loopback hub, one real `usdc-flow-check`
runner and a fresh sqlite database. It uses the ordinary scheduled buyer and EIP-3009
settlement on Arc testnet. The dedicated canary key must be distinct from both seller
and facilitator; creating and funding it is an **OWNER** action. No existing key is a
substitute. Once that prerequisite is complete:

```bash
ARCADE_NETWORK=arc-testnet \
ARCADE_CANARY_KEY="$(security find-generic-password -s arcade-canary-key -w)" \
ARCADE_FACILITATOR_KEY="$(security find-generic-password -s arcade-deployer-key -w)" \
ARCADE_SELLER_KEY="$(security find-generic-password -s arcade-deployer-key -w)" \
ARCADE_FEE_SPLITTER=0x9e304ec13dd862c81ee8caa8fd262dac426fbedf \
bun run e2e:canary
```

The command requires two $0.01 purchases plus facilitator gas. It never initializes or
overwrites saved runner configuration, fetches keys itself, funds accounts, or accepts
terms. It rejects other chains, simulated rails, alternative RPCs and reused canary keys.
The copied skill retains its actual chain-reading implementation; a temporary local
execution gate holds recovery until the script verifies that reconnecting alone did not
clear the delist. The production scheduler, buyer, runner and settlement path are unchanged.

Offline runners correctly return **404** from both detail routes. That alone does not
prove delisting: the script also checks three new durable failed pay-tests for the exact
seller/listing and omission from all four catalogues. After reconnect it verifies the
delisted explanation, releases execution, and requires a distinct passing transaction
before claiming recovery. It then stops its owned services and independently checks both
durable marked receipts, ERC-20 transfers and FeeSplitterV2 childless `Settled` events using bounded RPC
reads. An extra paid receipt, missing evidence or failed cleanup makes the command fail.
The printed temporary evidence directory is retained with public proof and local sqlite
history, never keys. All child environments are allowlisted.

**Live PASS — independently verified at `2026-09-05T04:40:08.403Z` on Arc testnet
(`eip155:5042002`).** The owner-provided dedicated canary
`0x2890ccF322155641545c6B4482Ea896B479aa937` completed exactly two scheduled
`usdc-flow-check` purchases through the splitter above:

- Initial pass: **$0.01 (10,000 atomic)**,
  [verified transaction](https://testnet.arcscan.app/tx/0xab8cd630b7e187eef9f788ae43d3fe08f6203a6789205e3940d2510d465eea03).
- Paid recovery: **$0.01 (10,000 atomic)**,
  [verified transaction](https://testnet.arcscan.app/tx/0x98a30e9aa65f4a237696755fc81c3e34ce020bbc65d9139d16ae5dc3b178dd5c).

Total canary spending was **$0.02 plus facilitator gas**. Between these payments,
three durable failed pay-tests had empty job IDs and no settlement. Both offline detail
routes returned 404 and all four discovery surfaces omitted the listing; those are
off-chain observations, not payment proofs. Reconnecting still showed the delisted
explanation. Only the distinct new paid pass restored discovery. Both successful marked
receipts were independently matched to actual ERC-20 transfers and childless `Settled`
events. All owned services were confirmed stopped before PASS. The public `evidence.json`
is retained; the private SQLite history stays local and is not published or dumped with
the public proof.

## Plan D — ERC-8004 identity and settlement evidence

The hub exposes `GET /erc8004` with public registry/role addresses and
`GET /listings/:id/agent-registration.json`. Sellers mint with their own key:
`arcade identity register <skill> --approve-operator <public-operator-address>`.
The flag is explicit consent: ERC-721 approval allows that operator to transfer **all
current and future identity NFTs** owned by this seller in the registry. It is not a
validation-only permission. `arcade identity status` is offline. The runner config
durably journals mint intent and submitted hashes; an uncertain broadcast must be
reconciled before another registration is attempted. Confirmed identity is saved before
approval, so approval failure never requires a second mint.

Hello announces only serving identities. Ownership is checked on chain, and the worker
checks again before writing evidence. After receipt persistence, a bounded asynchronous
queue writes validation requests/responses and settled-payment feedback. These writes
never decide payment. All applicable compact, hash-only documents persist before the
first broadcast; conflicting bytes or failed persistence stop attestation. These routes
serve immutable stored bytes even after the runner disconnects or the hub restarts:

- `/receipts/:jobId/validation-request.json`
- `/receipts/:jobId/validation-response.json`
- `/receipts/:jobId/feedback.json`

Raw inputs, outputs and provider diagnostics are not published in these documents.
The detail page and `arcade_describe_skill` expose measured counts from this hub's
validator/attester only. Transferred/unverified ownership and stale/unreadable data
withhold counts. A displayed registration transaction is **announced**, not independently
verified by the ownership read. Catalogue polling does not query every agent's registry.

### OWNER-gated live proof

`bash scripts/e2e-erc8004.sh --help` is offline and needs no keys. The actual run requires
six distinct, funded Arc-testnet role keys: seller, buyer, facilitator, operator,
validator and attester. Creating/funding/storing them is an **OWNER** action. No role is
silently borrowed from another key. The seller's `ARCADE_FEE_SPLITTER` must already be
its FeeSplitterV2 with canonical Arc USDC and a 500-bps fee; preflight verifies seller,
version, token and fee before any mint. Do not reuse the demo splitter unless its
immutable seller equals this run's seller. If needed, the owner chooses the immutable
treasury and deploys a matching splitter:

```bash
DEPLOYER_KEY="$(security find-generic-password -s arcade-seller-key -w)" \
SELLER='<seller-public-address>' TREASURY='<owner-chosen-treasury-address>' \
FEE_BPS=500 ARCADE_NETWORK=arc-testnet \
bun --no-env-file run scripts/deploy-splitter.ts --v2 --network arc-testnet
```

After provisioning, the owner runs this from the repository root, substituting only
the two public placeholders (never private keys). Supply secrets only to this command:

```bash
ARCADE_NETWORK=arc-testnet \
ARCADE_SELLER_KEY="$(security find-generic-password -s arcade-seller-key -w)" \
ARCADE_BUYER_KEY="$(security find-generic-password -s arcade-buyer-key -w)" \
ARCADE_FACILITATOR_KEY="$(security find-generic-password -s arcade-facilitator-key -w)" \
ARCADE_OPERATOR_KEY="$(security find-generic-password -s arcade-operator-key -w)" \
ARCADE_VALIDATOR_KEY="$(security find-generic-password -s arcade-validator-key -w)" \
ARCADE_ATTESTER_KEY="$(security find-generic-password -s arcade-attester-key -w)" \
ARCADE_FEE_SPLITTER='<matching-seller-v2-splitter-address>' \
bash scripts/e2e-erc8004.sh --approve-operator '<operator-public-address>'
```

This creates an isolated config/database and loopback hub/runner; it never initializes
or modifies the owner's saved runner configuration. Child environments are allowlisted
and automatic dotenv loading is disabled. It registers once, verifies the mint,
current ownership, exact token URI and operator approval **before** buying one fixed
`usdc-flow-check` job for $0.01. Native Arc USDC is also needed for registration,
approval, settlement and registry gas; registration's own preflight requires at least
0.05 native USDC on the seller. The script does not fund any account or resend an
uncertain transaction.

Success requires independently checked successful transaction receipts and exact
registry/USDC/splitter events, current validation/feedback state, and matching served,
durable and committed document bytes. Event scans are bounded to the fresh run.
`PASS` prints only after owned processes are confirmed stopped. Failure retains the
isolated registration journal/database for reconciliation; **do not blindly rerun**.
The minted registration URI is temporary loopback and stops serving on cleanup. Public
document exports are retained as evidence; this is not a persistent public deployment.
Keep the private SQLite job store local; do not upload it with public proof artifacts.

**Live PASS — independently verified at `2026-09-05T04:42:24.773Z` on Arc testnet
(`eip155:5042002`).** Agent **891730** served the single $0.01 `usdc-flow-check` job
`job_7f4b653b140843c4b6a4`. All six key-derived public addresses matched the owner's
approved roles before any mutation:

| Role | Verified public address |
| --- | --- |
| Seller | `0xcf821769ED3c0E55e152745377bb833d7155A78a` |
| Buyer | `0xdaACA688cE93d6EA0BDf4cdA9925C5526f3cA5e1` |
| Facilitator | `0xbE8EfcCA100f618Bd1e6C694f865069eADAE5f8b` |
| Operator | `0xEd7FB16e4E0FE0961222A1ba3fFD0896a8e35669` |
| Validator | `0xF6Da48DF7f3Fee4D43e796d6893CC74323F5C859` |
| Attester | `0x936F452e5E2fA53548B7920f3148f0abf6594B53` |

The run reused FeeSplitterV2 `0x9e304ec13dd862c81ee8caa8fd262dac426fbedf`,
independently checking its seller, Arc USDC asset, version and 500bps fee. The paid job
transferred 10,000 atomic USDC in, paid the seller 9,500 and accrued 500 as the fee;
registry and facilitator gas were additional. No fee withdrawal occurred.

| Confirmed operation | Independent transaction proof |
| --- | --- |
| Identity mint | [Registered](https://testnet.arcscan.app/tx/0xcef7afe3ee60519d355aae8008b0b8fcda8dc92a93e3ffd584f835057f001f52) |
| Explicit blanket operator grant | [ApprovalForAll](https://testnet.arcscan.app/tx/0xa388ce6152823e42e8520d9739f50a423970f5e315e239aeb20c837cc80307f9) |
| Childless payment | [Settled and USDC transfers](https://testnet.arcscan.app/tx/0x2d8b135488f63af0c4ddf580f1e1d39609af373f06b7f8388a3746edb6520e3e) |
| Operator request | [ValidationRequest](https://testnet.arcscan.app/tx/0x1be2a35ae56cdd2eeb8ea2b237519ed5b16e74a0073c5cf8f463df4071509611) |
| Validator response | [ValidationResponse](https://testnet.arcscan.app/tx/0xd356b19c8e7d28537e59d15248c78175d36fd956eb08c56ea799eef47e86e5db) |
| Attester feedback | [NewFeedback](https://testnet.arcscan.app/tx/0x41c84d417a0674fccbff2f413bee5f3f2a91981034f1f8830afd75828e05afb6) |

Fresh ownership, token URI, operator approval, each transaction's exact events and the
current validation/feedback state matched. Served and persisted document bytes matched
these on-chain commitments:

- Request: `0xf55f89faa96336c46f8e55504295f1003f3c869248f67c68a48f31b783fbb2e2`.
- Response: `0xa35cfe1993fa658751686e97d9c7fac1684974174f79952782436120f83e99b4`.
- Feedback: `0x4002d5d2e6d2da0eadc9c1690829113926db27256c846e92dd3f837968b6ef07`.

All owned services were confirmed stopped before PASS. Public document exports and
`evidence.json` are retained separately from the private SQLite checkpoint. The token URI
still names the now-stopped loopback server; it is **not** a durable public endpoint.
The explicitly approved blanket operator grant remains on-chain and covers every current
and future identity NFT owned by this seller in this registry. No identity transfer,
unrequested revocation or automatic remint/retry was performed.

## ENS namespaces (Sepolia)

### Status and verified deployment preflight

Read-only verification on 2026-09-05 at 01:07:42 UTC used Sepolia chain11155111
via `https://ethereum-sepolia-rpc.publicnode.com`. Both manifest roots returned their
own expected `.eth` registry and both registrar addresses had deployed code. Runtime
discovery selected **set A**, the current ENS docs/app deployment. This verifies the
root links and registrar code presence, not every ABI, resolver route or contract's
security; it does not claim any ARCADE namespace has been registered.

Addresses live only in `config/ens/sepolia.json`; the shared resolver reads the root
links with bounded requests and refuses a reported wrong-chain RPC. The beta registrar
uses `isAvailable(string)`, not the plan's stale `available(string)` signature. Role
grant functions and resolver authorizations return `bool`. ABIs were checked against
the [ENS deployment sources](https://docs.ens.domains/learn/deployments/) and
[deployed registrar source](https://github.com/ensdomains/contracts-v2/blob/97a57293f3b4279d94b571e678edb53ce62638f4/contracts/src/registrar/ETHRegistrar.sol).

The owner subsequently approved the exact parent label `arcade` and the two distinct,
funded Sepolia roles on September 5, 2026. A fresh keyless check at04:59:12 UTC,
block11638194, confirmed deployment A's resolver routing, `arcade` available, owner
`0x8260C32f90593f1B3B3bcba0Ec1D40ff8C189469` holding0.699977751775519 ETH and daemon
`0x88797d820C111205eCd993BE850D4f35687909e3` holding0.3 ETH. Availability is not a
reservation or registration. ENSv2 is beta, and deployment addresses may change.

**The owner-approved isolated demo passed on September 5, 2026 at 06:47 UTC.**
Registration, renewal, by-name Arc settlement, scoped price revocation, synthetic
pre-signature refusal and genuine expiry-driven catalogue removal are proved below.
All demo services are stopped; these are not production URLs. The first run completed
setup but failed its short renewal-confirmation window and stopped safely. That failed
result remains separate from the later explicitly approved owner-renewal continuation;
no registration or unknown transaction was repeated. Fresh independent post-cleanup
checks proved all six records and owner update authority even after leaf expiry.
ENS naming uses Sepolia (`11155111`); paid jobs settle on Arc testnet (`5042002`).

Setup registers only explicitly selected skills. Ordinary publishing does not register
a name. Enabling `ARCADE_ENS_ROOT` on a hub is a namespace-wide discovery policy: it
derives candidate names for valid listings and can hide names whose required records
are successfully observed missing, including names never registered. An unavailable
RPC does not expire a listing. Do not enable this policy on unrelated production
listings merely to stage the demo.

Parent pointers and root administration are deliberately not irreversibly locked with
`revokeRootRoles`: the owner retains migration and grant authority. The scoped daemon
is not a substitute for trusting that administrator. Contracts-v2 is beta, not a final
mainnet deployment; update the manifest and reverify source/runtime compatibility when
deployments change.

### Configuration

| Setting | Consumer and behavior |
| --- | --- |
| `ARCADE_ENS_ROOT` | Hub/stock buyer reader: normalized `.eth` second-level parent; unset or blank disables resolution/observation. Runner: optional consistency check against state, not its enable switch. |
| `ARCADE_ENS_STATE` | Setup/runner: absolute normalized `.json` path, default `$HOME/.arcade/ens.json`. Validated public namespace addresses, skill names/prices and `ttlSeconds`; no wallet keys. Missing state is inert, malformed state is a diagnostic. |
| `ARCADE_ENS_OWNER_KEY` | Setup and explicitly authorized owner demo operations only. Must match the approved public owner. Never pass it to the runner or hub. |
| `ARCADE_ENS_DAEMON_KEY` | Separate scoped Sepolia account, validated by setup and used by the runner. Owner, seller and daemon must differ. Missing key disables runner ENS writes. |
| `ARCADE_ENS_RPC` | HTTPS Sepolia JSON-RPC without credentials/query/fragment. Setup/runner default to `https://ethereum-sepolia-rpc.publicnode.com`; stock buyer uses viem's Sepolia default. Set explicitly for reproducibility; the chain is independently checked. |
| `ARCADE_ENS_UNIVERSAL_RESOLVER` | Stock buyer/hub: optional manifest-pinned override, not an arbitrary resolver. Actual `ROOT_REGISTRY` routing must match the selected deployment. Setup/runner use verified state. |
| `ARCADE_ENS_CHECK_MS` | Hub interval after each bounded observer cycle; default `300000` (5min), integer `1000`–`2147483647`. `60000` suits a demo but does not guarantee an exact removal time. |
| `ARCADE_ENS_SELLER_LABELS` | Hub: optional JSON map of lowercase public seller addresses to canonical seller labels when setup `--seller-label` differs from the default `s` plus the first ten address hex digits. Labels are not ownership proof. |
| `ARCADE_ENS_CCIP_ORIGINS` | Stock reader: comma-separated allowlist of up to four trusted HTTPS gateway origins. Empty by default; unknown gateways are unavailable. No redirects, literal IP/local hosts or arbitrary fallback. Allowlisted DNS ownership remains operator trust. |
| `ARCADE_ENS_SETUP_JOURNAL` | Setup: defaults to `<state path>.setup.json`. Private request-bound journal, including the registration commitment secret. Never publish it or delete its lock to force a retry. |
| `ARCADE_ENS_JOURNAL` | Runner: defaults to `ens-pending.json` beside state. Separate from the state file; retains intent, known hashes and confirmed results for reconciliation. |
| `ARCADE_ENS_DEMO_JOURNAL` | Price-lock demo owner journal; default `<state path>.demo.json`. Request-bound private journal, distinct from setup, runner, state and config paths. |
| `ARCADE_ENS_DEMO_DAEMON_JOURNAL` | Price-lock demo daemon journal; default `<state path>.demo-daemon.json`. Must also differ from the demo owner journal. Retain both after an uncertain write. |

**TTL comes from setup `--ttl` and persisted state, not `ARCADE_ENS_TTL`.** The latter
is not read by the runtime. Default `--ttl 6h`; an owner can choose `--ttl 15m` for a
short demo. Accepted TTL is 60 seconds through one year. `--seller-ttl` defaults to
`90d` and must cover the skill TTL; parent registration lasts one year.

The runner checks on its heartbeat and normally renews a served name once per quarter
TTL after the initial renewal. Six hours means a 90-minute cadence, approximately
**16 renewals/day/skill**, plus startup/restart and changed-price transactions, not four.
Fifteen minutes gives roughly 3.75 minutes between renewals. This is best-effort timing,
not a gas-cost ceiling or guarantee. Unserved/missing manifests are not renewed.

### Owner-approved setup

1. Approve the exact parent label, public namespace owner, existing public Arc seller,
   separate public Sepolia daemon, selected skill IDs and actual hub/web origins. Only
   supply `--mcp` for a real endpoint; do not invent one or substitute Arc wallet roles.
2. The owner provisions and funds the two Sepolia accounts. Canonical Keychain services
   are `arcade-ens-owner` and `arcade-ens-daemon`, without a `-key` suffix. No account,
   key, faucet or terms action is delegated by these instructions.
3. Replace the quoted public placeholders and run the keyless availability proposal:

   ```bash
   ARCADE_ENS_RPC=https://ethereum-sepolia-rpc.publicnode.com \
   bun --no-env-file run scripts/ens-setup.ts \
     --seller '<seller-public-address>' --skills usdc-flow-check \
     --root-label '<proposed-label>' --dry-run
   ```

   This may propose a fallback and prints `ownerApprovalRequired: true`; it neither
   reserves a label nor validates every live prerequisite. Approve the exact fresh result.
4. Serve the selected listings. Setup probes each listing's real `canaryInput`, requires
   a matching unsigned Arc-USDC 402 and independently verifies FeeSplitterV2 version,
   seller, USDC and 500bps fee. `payTo` is that splitter, not necessarily the seller EOA.
   Optional `--agent-id` requires current Arc IdentityRegistry ownership.
5. The following is an **owner-only mutating template, not executed or authorized by
   this document**. Replace public placeholders only and approve the sequence/gas first:

   ```bash
   env -i PATH="$PATH" /bin/bash --noprofile --norc -c '
     set +x
     set -euo pipefail
     test -f ./scripts/ens-setup.ts # Run from the repository root.
     ARCADE_ENS_OWNER_KEY="$(/usr/bin/security find-generic-password -s arcade-ens-owner -w)"
     ARCADE_ENS_DAEMON_KEY="$(/usr/bin/security find-generic-password -s arcade-ens-daemon -w)"
     export ARCADE_ENS_OWNER_KEY ARCADE_ENS_DAEMON_KEY
     export ARCADE_ENS_RPC=https://ethereum-sepolia-rpc.publicnode.com
     export ARCADE_ENS_STATE="<owner-chosen-absolute-state-path>.json"
     exec bun --no-env-file run scripts/ens-setup.ts \
       --seller "<seller-public-address>" \
       --owner "<owner-public-address>" --daemon "<daemon-public-address>" \
       --skills usdc-flow-check \
       --root-label "<approved-label>" --confirm-root-label "<approved-label>" \
       --hub "<actual-hub-origin>" --web "<actual-web-origin>" --ttl 15m
   '
   ```

   This may perform multiple Sepolia transactions: proxy deployment, parent/subname
   registration, records and scoped grants. The beta registrar uses MockUSDC; setup
   can mint a shortfall, sets the exact quoted allowance and refuses a quote above
   `100000000` atomic units. This is separate from Arc job payments and is not zero-cost.
6. Start only the intended runner with that state and the **daemon key only**, using
   its normal owner-approved seller/config launcher. Start the intended hub with the
   same root/RPC, any custom seller-label map and `ARCADE_ENS_CHECK_MS=60000`. Expect
   `[ens] confirmed renewal of <name> (<hash>)`; independently verify the receipt and
   changed expiry. Do not pass the owner key to either service.

The private journal fixes the request, deployment, records, roles and chain-derived
expiries. Setup does not silently adopt an existing namespace. Changed arguments,
conflicting records/grants, expired names, crash-held locks or ambiguous broadcasts
require reconciliation, not a new journal or blind rerun. A returned hash alone is not
confirmation. Runtime state IO lives in the runner package, not browser-safe core.

### Resolution, buying and the web card

`GET /names/<name>` is unsigned. A successful projection contains `name`, `skillId`,
`seller`, `endpoint`, `payTo`, `chain`, advisory `priceAtomic` (or null) and `expired:false`.
Missing required records returns 404 `ens_name_expired`; unavailable RPC/configuration
returns 503 `ens_resolution_unavailable`. The legacy missing-record code is broader
than proved expiry: a name may be expired, unregistered or misconfigured.

The reader verifies onchain-only `UniversalResolver.findOwner(dnsName)` for the exact
name before bounded text/allowed CCIP reads. Raw text is not liveness proof: an expired
leaf can still route through an ancestor resolver holding old records. See the pinned
[resolver traversal](https://github.com/ensdomains/contracts-v2/blob/97a57293f3b4279d94b571e678edb53ce62638f4/contracts/src/universalResolver/libraries/LibRegistry.sol)
and [registry expiry behavior](https://github.com/ensdomains/contracts-v2/blob/97a57293f3b4279d94b571e678edb53ce62638f4/contracts/src/registry/PermissionedRegistry.sol).

The SDK accepts either `{name, input, account, ...}` or `{hubUrl, seller, skillId,
input, account, ...}`, never both. By-name lineage also requires `expectedHubUrl`.
The actual-input 402 must agree with resolved payee/chain/endpoint before signing;
ENS price is advisory, not a replacement for the caller's spending cap. MCP
`arcade_call_skill` likewise accepts exactly one `name` or `skillId`. Its session
budget retains reservations for uncertain signed calls.

The `arcade-buy` CLI remains ID-only. By-name callers use the SDK, not a fictional
`arcade-buy <name>` mode. The web card shows a name only after its actual-input quote
verifies the `/names` result against endpoint, seller, skill, payee and chain.
An advertised listing name alone is insufficient. Relay checks precede signature
forwarding; result polling is bounded and same-origin. A signed, unconfirmed
authorization may remain redeemable: reconcile settlement evidence before retrying.

For an **owner-approved live by-name purchase**, select the registered `usdc-flow-check`
name and actual hub, replace public placeholders, and explicitly approve one purchase
of at most `10000` atomic USDC ($0.01) plus the facilitator's Arc gas before running:

```bash
(
set +x
env -i PATH="$PATH" \
ARCADE_DEMO_NAME='usdc-flow-check.<seller-label>.<approved-label>.eth' \
ARCADE_DEMO_HUB='<actual-hub-origin>' \
ARCADE_ENS_ROOT='<approved-label>.eth' \
ARCADE_ENS_RPC=https://ethereum-sepolia-rpc.publicnode.com \
ARCADE_BUYER_KEY="$(/usr/bin/security find-generic-password -s arcade-buyer-key -w)" \
bun --no-env-file -e '
  import { callSkillPromise } from "@arcade/buyer";
  import { privateKeyToAccount } from "viem/accounts";
  try {
    const result = await callSkillPromise({
      name: process.env.ARCADE_DEMO_NAME,
      expectedHubUrl: process.env.ARCADE_DEMO_HUB,
      input: {address: "0xAeB742d58cc7F5CF656fCD9Beb07Bf0C1ACa6f5b"},
      account: privateKeyToAccount(process.env.ARCADE_BUYER_KEY),
      maxAmountAtomic: 10000n
    });
    console.log(JSON.stringify({jobId: result.jobId, status: result.status, receipt: result.receipt}));
  } catch {
    console.error("By-name outcome unavailable; reconcile any signed authorization before retrying.");
    process.exitCode = 1;
  }
'
)
```

This uses the public Promise API, so the root command needs no undeclared `effect`
dependency. The displayed receipt is a remote outcome, not independent chain proof.
Correlate the successful Arc transaction and exact splitter/USDC events before adding
it to the evidence ledger. Do not rerun automatically after a signed uncertain outcome.

### Evidence and recovery boundaries

The three-beat harness requires an explicit beat and selected name; it must not choose
the first skill or default to a mutating `all` run. Price-lock/all additionally requires
exact-name write consent. These invocation templates are separate from the dated live
results in the public evidence ledger below.

First inspect the key-free help:

```bash
bun --no-env-file run scripts/ens-demo.ts --help
```

After the namespace exists, these **read-only templates** use its explicit state file
and exact name. Replace all quoted public placeholders. They do not need wallet keys:

```bash
env -i PATH="$PATH" \
  ARCADE_ENS_STATE='<absolute-state-path>.json' \
  ARCADE_ENS_RPC=https://ethereum-sepolia-rpc.publicnode.com \
  ARCADE_HUB='<actual-hub-origin>' \
  bun --no-env-file run scripts/ens-demo.ts tampered-402 \
    --name '<skill>.<seller-label>.<approved-label>.eth' --timeout-ms 120000

env -i PATH="$PATH" \
  ARCADE_ENS_STATE='<absolute-state-path>.json' \
  ARCADE_ENS_RPC=https://ethereum-sepolia-rpc.publicnode.com \
  ARCADE_HUB='<actual-hub-origin>' \
  bun --no-env-file run scripts/ens-demo.ts expiry \
    --name '<skill>.<seller-label>.<approved-label>.eth' \
    --timeout-ms 1500000 --poll-ms 5000
```

For expiry, keep the intended runner serving until the harness confirms its live
baseline. Then stop only that runner and record the stop time; leave the hub running.
A 15-minute TTL fits the 25-minute maximum wait only if competing renewers have also
been stopped. Timeout or unavailable public state exits nonzero, without claiming
expiry. This script does not stop services or change their saved configuration.

The **mutating price-lock template below is owner-only and not executed or authorized
by this document**. First approve the selected name and exactly two Sepolia writes plus
gas: the daemon raises its persisted baseline price by `1000` atomic units, then the
owner revokes that name's scoped price grant. Quiesce competing price writers before
starting. The bumped price and revoked grant are intentionally left in place.

```bash
env -i PATH="$PATH" /bin/bash --noprofile --norc -c '
  set +x
  set -euo pipefail
  test -f ./scripts/ens-demo.ts # Run from the repository root.
  export ARCADE_ENS_STATE="<absolute-state-path>.json"
  export ARCADE_ENS_RPC=https://ethereum-sepolia-rpc.publicnode.com
  export ARCADE_HUB="<actual-hub-origin>"
  ARCADE_ENS_OWNER_KEY="$(/usr/bin/security find-generic-password -s arcade-ens-owner -w)"
  ARCADE_ENS_DAEMON_KEY="$(/usr/bin/security find-generic-password -s arcade-ens-daemon -w)"
  export ARCADE_ENS_OWNER_KEY ARCADE_ENS_DAEMON_KEY
  exec bun --no-env-file run scripts/ens-demo.ts price-lock \
    --name "<skill>.<seller-label>.<approved-label>.eth" \
    --confirm-name "<skill>.<seller-label>.<approved-label>.eth" \
    --timeout-ms 300000
'
```

`all` runs price-lock, synthetic tampered-402 and expiry in that order, and requires the
same exact-name consent; it is never the default. Prefer separate beats when collecting
evidence so recovery and runner-stop timing remain explicit. A nonzero result after a
write may mean the transaction was submitted but its outcome could not be proved.
Inspect retained journals and chain state before retrying; do not delete locks, repeat
unknown submissions, or treat silence as a failed transaction.

- **Price-lock** deliberately changes the price and revokes only that name's daemon
  price permission. The owner first quiesces competing price writers. A denial must
  decode the pinned `EACUnauthorizedAccountRoles` error for the selected daemon,
  name resource and role16; RPC errors or arbitrary reverts are not proof. Public
  simulation is not a mined revert transaction.
- **Price recovery** is separate owner work: restore the intended price, confirm it,
  then regrant only `authorizeTextRoles(dnsNameOf(name), "arcade.priceAtomic", daemon,
  true)` on the exact resolver and verify the scoped role. Never grant root, wildcard
  or payee authority. Rerunning setup is not general recovery: it rejects populated
  differing records. Price revocation does not revoke renewal permission.
- **Tampered 402** exercises the actual buyer SDK with synthetic conflicting challenges
  and zero signatures/paid retries. Even with real ENS resolution, this is not a paid
  Arc job or settlement proof.
- **Passive expiry** needs an initially live registration, actual Sepolia block time
  reaching the leaf's expiry, retained registration lineage, absent current exact-name
  owner and successful catalogue observation. A failed fetch is not expiry. If runner
  disconnect removed the row, report “registration expired and catalogue absent;
  removal cause unproven.” Stronger watcher proof requires a matching detail200 with
  `ensExpired:true` plus catalogue absence. The harness never kills an arbitrary runner.
- **Revival** requires separately authorized owner/root-RENEW action: the limited
  daemon can maintain an unexpired name but cannot revive it. Do not broaden its role
  or silently register a replacement. Verify fresh hierarchy/resolution after recovery.
- **Delist by unregister** is the authorized `skillRegistry.unregister(labelId(skillId))`
  call. It invalidates a registration immediately, distinct from passive expiry and the
  hub's canary `delisted` flag. Do not unregister to manufacture an expiry result. No
  unregister/re-register convenience CLI is supplied.

### Production re-point — pending owner action before September 13

Prerequisites: deploy/verify the production hub and web separately; they must already serve the same seller's real `usdc-flow-check` at the canonical V2 payout. Stop competing owner record writers. Select the existing state and one dedicated journal path; never substitute a fresh journal to bypass an uncertain prior attempt. The command is deliberately scoped to the local demo's one skill, with no MCP/agent-registration addition. It permits the retained leaf to be live or expired: **text-only re-pointing never revives it**. This command does not start services, deploy contracts, register names, transfer ownership, restore price, regrant daemon roles or change payout/chain.

The retained state and old local origin below identify the approved September 5 demo. After cleanup, an unchanged private recovery copy was retained under gitignored `handoff/ens-demo-2026-09-05/` (directory mode0700); the original temporary checkpoints were not moved or overwritten. Replace only the two production-host placeholders after separately deploying and verifying those services. Read only `arcade-ens-owner` inside the consuming shell; no daemon, seller, buyer or facilitator key is needed. Run from the main repository root after the E implementation is merged. This command is documented, not executed; it does not authorize a production change. Keep the exact same parameters and journal for reconciliation; an error after signing is not permission to retry with new coordinates.

```bash
env -i PATH="$PATH" \
  ARCADE_ENS_STATE="$PWD/handoff/ens-demo-2026-09-05/ens.json" \
  ARCADE_ENS_REPOINT_JOURNAL="$PWD/handoff/ens-demo-2026-09-05/owner-repoint.json" \
  ARCADE_ENS_REPOINT_NAME='usdc-flow-check.scf821769ed.arcade.eth' \
  ARCADE_ENS_EXPECTED_OLD_ORIGIN='http://127.0.0.1:51989' \
  ARCADE_ENS_PRODUCTION_HUB='https://<actual-production-hub-host>' \
  ARCADE_ENS_PRODUCTION_WEB='https://<actual-production-web-host>' \
  ARCADE_ENS_RPC=https://ethereum-sepolia-rpc.publicnode.com \
  /bin/bash --noprofile --norc <<'SH'
set +x
set -euo pipefail
test -f ./scripts/ens-setup-driver.ts # Run from the repository root.
test "$(git branch --show-current)" = main
ARCADE_ENS_OWNER_KEY="$(/usr/bin/security find-generic-password -s arcade-ens-owner -w)"
export ARCADE_ENS_OWNER_KEY
exec bun --no-env-file - <<'JS'
import { resolve } from "node:path";
import { encodeFunctionData, keccak256, parseAbi, stringToHex } from "viem";
import { namehash } from "viem/ens";
import { privateKeyToAccount } from "viem/accounts";
import { ALL_ROLES, ENS_TEXT_KEYS, PERMISSIONED_RESOLVER_ABI, VERIFIABLE_FACTORY_ABI, loadEnsDeployments, skillTextRecords } from "@arcade/core";
import { ensStatePath, readEnsState } from "./packages/runner/src/ens-state.ts";
import { ensJournalPath } from "./packages/runner/src/ens-journal.ts";
import { parseSetupArgs } from "./scripts/ens-setup.ts";
import { setupPublicClient } from "./scripts/ens-setup-runtime.ts";
import { prepareSkillRecords } from "./scripts/ens-setup-skills.ts";
import { openSetupSession } from "./scripts/ens-setup-driver.ts";
import { demoObservation, demoPublicClient } from "./scripts/ens-demo.ts";
import { EnsNameExpired, resolveEnsListingPromise, sepoliaEnsReader } from "@arcade/buyer";
const check = value => { if (!value) throw Error("owner re-point refused"); };
const same = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
let session, observer, closingSession, closing, cancelled = false;
const controller = new AbortController();
const closeSession = () => {
  if (!session) return Promise.resolve();
  if (closingSession === session && closing) return closing;
  closingSession = session; closing = Promise.resolve().then(() => session.close()); return closing;
};
const cancel = () => {
  cancelled = true; controller.abort();
  try { observer?.close(); } catch { /* The hard deadline still applies. */ }
  void closeSession().catch(() => {});
};
const timer = setTimeout(cancel, 300000);
const hardTimer = setTimeout(() => {
  try { cancel(); } finally {
    console.error("Owner re-point deadline reached; retain journal/hash and reconcile. No automatic resend.");
    process.exit(1);
  }
}, 330000);
process.once("SIGTERM", cancel); process.once("SIGINT", cancel);
const fetcher = request => {
  check(!cancelled);
  return fetch(new Request(request, {redirect:"error", credentials:"omit", signal:AbortSignal.any([request.signal,controller.signal])}));
};
try {
  const path = ensStatePath(), state = await readEnsState(path);
  check(state?.root === "arcade.eth" && state.owner && state.daemon);
  const name = process.env.ARCADE_ENS_REPOINT_NAME, skill = state.skills.find(s => s.name === name);
  check(skill?.skillId === "usdc-flow-check" && name.length < 220);
  const hub = new URL(process.env.ARCADE_ENS_PRODUCTION_HUB), web = new URL(process.env.ARCADE_ENS_PRODUCTION_WEB);
  check([hub, web].every(u => u.protocol === "https:" && u.pathname === "/" && !u.username && !u.password && !u.search && !u.hash));
  const old = new URL(process.env.ARCADE_ENS_EXPECTED_OLD_ORIGIN);
  check(old.protocol === "http:" && old.hostname === "127.0.0.1" && old.port && old.pathname === "/" && !old.username && !old.password && !old.search && !old.hash);
  const args = parseSetupArgs(["--seller", state.seller, "--owner", state.owner, "--daemon", state.daemon, "--skills", skill.skillId,
    "--root-label", "arcade", "--confirm-root-label", "arcade", "--seller-label", state.sellerLabel, "--ttl", `${state.ttlSeconds}s`, "--hub", hub.origin, "--web", web.origin]);
  const plans = await prepareSkillRecords(args, state.root, fetcher), plan = plans[0];
  check(plans.length === 1 && plan.name === name);
  const rpc = process.env.ARCADE_ENS_RPC, pub = setupPublicClient(rpc, fetcher), deployment = loadEnsDeployments().find(d => d.set === state.deploymentSet);
  check(deployment && await pub.getChainId() === 11155111);
  observer = demoPublicClient(rpc, fetcher);
  const snapshot = await demoObservation(state, name, observer).snapshot();
  check(same(snapshot.latestOwner,state.seller) && (snapshot.status === 2 && snapshot.expiry > snapshot.timestamp && same(snapshot.owner,state.seller) ||
    snapshot.status === 0 && snapshot.expiry <= snapshot.timestamp && /^0x0{40}$/i.test(snapshot.owner)));
  const rolesAbi = parseAbi(["function roles(uint256 resource,address account) view returns(uint256)"]);
  for (const [proxy, implementation] of [[state.sellerRegistry, deployment.userRegistryImpl], [state.skillRegistry, deployment.userRegistryImpl], [state.resolver, deployment.permissionedResolverImpl]]) {
    check(same(await pub.readContract({address:deployment.verifiableFactory, abi:VERIFIABLE_FACTORY_ABI, functionName:"verifyContract", args:[proxy]}), implementation));
    check(await pub.readContract({address:proxy, abi:rolesAbi, functionName:"roles", args:[0n,state.owner]}) === ALL_ROLES);
  }
  const node = namehash(name), text = key => pub.readContract({address:state.resolver, abi:PERMISSIONED_RESOLVER_ABI, functionName:"text", args:[node,key]});
  const before = Object.fromEntries(await Promise.all(Object.values(ENS_TEXT_KEYS).map(async key => [key, await text(key)])));
  const proposed = Object.fromEntries(plan.records.map(r => [r.key,r.value]));
  check(same(before[ENS_TEXT_KEYS.payTo], proposed[ENS_TEXT_KEYS.payTo]) && before[ENS_TEXT_KEYS.chain] === proposed[ENS_TEXT_KEYS.chain]);
  check(before[ENS_TEXT_KEYS.endpoint] === `${old.origin}/x/${state.seller}/${skill.skillId}` || before[ENS_TEXT_KEYS.endpoint] === proposed[ENS_TEXT_KEYS.endpoint]);
  check(before[ENS_TEXT_KEYS.web] === `${old.origin}/skill/${skill.skillId}` || before[ENS_TEXT_KEYS.web] === proposed[ENS_TEXT_KEYS.web]);
  check(before[ENS_TEXT_KEYS.mcp] === "");
  const currentPrice = before[ENS_TEXT_KEYS.priceAtomic];
  check(/^(0|[1-9][0-9]{0,77})$/.test(currentPrice));
  const context = proposed[ENS_TEXT_KEYS.context].split("\n\n")[0];
  check(before[ENS_TEXT_KEYS.context].startsWith(`${context}\n\n`));
  const records = skillTextRecords({name, endpoint:proposed[ENS_TEXT_KEYS.endpoint], webUrl:proposed[ENS_TEXT_KEYS.web],
    payTo:before[ENS_TEXT_KEYS.payTo], caip2:before[ENS_TEXT_KEYS.chain], priceAtomic:BigInt(currentPrice), context});
  const updates = records.filter(r => [ENS_TEXT_KEYS.endpoint, ENS_TEXT_KEYS.web, ENS_TEXT_KEYS.context].includes(r.key));
  check(updates.length === 3);
  const call = {address:state.resolver, abi:PERMISSIONED_RESOLVER_ABI, functionName:"multicall", args:[updates.map(r => encodeFunctionData({abi:PERMISSIONED_RESOLVER_ABI, functionName:"setText", args:[node,r.key,r.value]}))]};
  const journal = resolve(process.env.ARCADE_ENS_REPOINT_JOURNAL);
  check(![path, `${path}.setup.json`, ensJournalPath(process.env), `${path}.demo.json`, `${path}.demo-daemon.json`].map(p => resolve(p)).includes(journal));
  const binding = keccak256(stringToHex(JSON.stringify({format:"owner-repoint-v1",state,name,old:old.origin,updates})));
  check(!cancelled);
  const ownerKey = process.env.ARCADE_ENS_OWNER_KEY;
  check(/^0x[0-9a-fA-F]{64}$/.test(ownerKey) && same(privateKeyToAccount(ownerKey).address,state.owner));
  session = await openSetupSession({path:journal,privateKey:ownerKey,rpcUrl:rpc,binding,root:state.root,owner:state.owner,seller:state.seller,daemon:state.daemon,
    ttlSeconds:state.ttlSeconds,sellerTtlSeconds:state.ttlSeconds,fetch:fetcher});
  check(!cancelled);
  const step = `owner-repoint:${name}`, metadata = {name,resolver:state.resolver,hub:hub.origin,web:web.origin};
  await session.driver.simulate(call);
  await session.driver.checkpoint({step,state:"intent",metadata});
  const txHash = await session.driver.send(step,call);
  await session.driver.checkpoint({step,state:"confirmed",txHash,metadata});
  for (const [key,value] of Object.entries(before)) check(await text(key) === (updates.find(r => r.key === key)?.value ?? value));
  const afterSnapshot = await demoObservation(state,name,observer).snapshot();
  check(afterSnapshot.tokenId === snapshot.tokenId && same(afterSnapshot.latestOwner,snapshot.latestOwner));
  const resolutionExpectedAbsent = afterSnapshot.status === 0 && afterSnapshot.expiry <= afterSnapshot.timestamp && /^0x0{40}$/i.test(afterSnapshot.owner);
  if (!resolutionExpectedAbsent) check(afterSnapshot.status === 2 && afterSnapshot.expiry > afterSnapshot.timestamp && same(afterSnapshot.owner,state.seller));
  const reader = sepoliaEnsReader({env:{ARCADE_ENS_ROOT:state.root,ARCADE_ENS_UNIVERSAL_RESOLVER:state.universalResolver,ARCADE_ENS_RPC:rpc},fetch:fetcher});
  if (resolutionExpectedAbsent) {
    let absent = false;
    try { await resolveEnsListingPromise(reader,name); } catch (error) { if (error instanceof EnsNameExpired) absent = true; else throw error; }
    check(absent);
  } else {
    const resolved = await resolveEnsListingPromise(reader,name);
    check(resolved.endpoint === proposed[ENS_TEXT_KEYS.endpoint] && same(resolved.payTo,before[ENS_TEXT_KEYS.payTo]) && resolved.chainCaip2 === before[ENS_TEXT_KEYS.chain]);
  }
  for (const proxy of [state.sellerRegistry,state.skillRegistry,state.resolver]) check(await pub.readContract({address:proxy,abi:rolesAbi,functionName:"roles",args:[0n,state.owner]}) === ALL_ROLES);
  check(!cancelled);
  await closeSession(); observer.close(); check(!cancelled);
  console.log(JSON.stringify({name,txHash,changedKeys:updates.map(r=>r.key),pricePreserved:currentPrice,endpoint:proposed[ENS_TEXT_KEYS.endpoint],resolutionExpectedAbsent}));
} catch { console.error("Owner re-point not proved; inspect the retained journal and chain before any retry. No automatic resend."); process.exitCode = 1; }
finally {
  cancelled = true; controller.abort();
  try {
    try { observer?.close(); } catch { console.error("Owner observer cleanup requires reconciliation."); process.exitCode = 1; }
    try { await closeSession(); } catch { console.error("Owner journal cleanup requires reconciliation."); process.exitCode = 1; }
  } finally {
    clearTimeout(timer); clearTimeout(hardTimer);
    process.removeListener("SIGTERM",cancel); process.removeListener("SIGINT",cancel);
  }
}
JS
SH
```

The command atomically updates only the endpoint, web and context text keys. It refreshes the context JSON's routing and embedded price to match the current raw price. It preserves that raw price (including a deliberately bumped demo price), payee, chain, optional identity records, ownership and grants. A current MCP record refuses this narrow command rather than leaving a stale local MCP claim. An existing ERC-8004 registration URI is a separate registry field and is not rewritten by this ENS operation. A production web URL must be independently verified to serve before invocation; setup preflight validates its shape, not its HTML.

### Expiry and recovery are separate operations

Re-pointing text is not renewal. An expired leaf's resolver records remain owner-editable via root SET_TEXT, but guarded ENS resolution remains absent. The runnable command verifies the changed raw records and owner/root authority, checks the unchanged token/latestOwner and returns `resolutionExpectedAbsent:true` only when chain state and typed guarded-name absence both agree. It does not call that a live endpoint. For the same retained registration, an explicitly approved owner/root-RENEW call would be `skillRegistry.renew(labelId(skill.label), <fixed-approved-future-expiry>)`, using the existing driver with a **different recovery journal and binding** and the intent→send→confirmed→readback discipline above. This is a separate future operation, not part of the executable re-point command. Verify owner root RENEW, retained token/latestOwner against the demo proof, live parents, and a fixed future expiry on actual Sepolia time. Do not unregister/register/transfer or grant daemon root RENEW. Recheck per-name daemon roles after revival; restore only the exact scoped grant if absent and separately approved.

Price recovery is also separate: owner `setText(namehash(name), "arcade.priceAtomic", "10000")`, confirm direct/hardened readback, then `authorizeTextRoles(dnsNameOf(name), "arcade.priceAtomic", daemon, true)` only if explicitly approved. The former price-lock journal is not reused for these opposite operations. Setup's original expiry/record binding means rerunning setup is not a migration or recovery command. No recovery transaction is implied by this note's existence.

### Public evidence ledger — first run and completed continuation

The September 5 approved isolated run used deployment **A** and
`usdc-flow-check.scf821769ed.arcade.eth`. Setup finished at05:46:57 UTC. ENS owner
`0x8260C32f90593f1B3B3bcba0Ec1D40ff8C189469`, seller
`0xcf821769ED3c0E55e152745377bb833d7155A78a` and daemon
`0x88797d820C111205eCd993BE850D4f35687909e3` were distinct and matched their approved
keys before mutation. No wallet keys were printed, persisted or passed to the wrong role.

The [ENS app profile for arcade.eth](https://app.ens.dev/arcade.eth) independently
displayed the approved owner and September 5, 2026–September 5, 2027 parent registration
when read on September 5. Parent availability does not imply the expiring skill leaf is
live; its current exact-name state must be checked separately.

| Namespace component | Verified address |
| --- | --- |
| SellerRegistry under `arcade.eth` | `0x80f1ba46a19702eedc3aa4fe28f6c2071a2a0928` |
| SkillRegistry under `scf821769ed.arcade.eth` | `0xdafbdd2d7109d4706999573f60a3d1c17a96bdc6` |
| PermissionedResolver | `0x7070e0805ec7ef405c02e3f38fef453ecb712190` |

| Confirmed Sepolia operation | Transaction proof |
| --- | --- |
| Parent registration | [Register arcade.eth](https://sepolia.etherscan.io/tx/0xf20d14c99278b133f7567bb6050c317526df2c54d86b57e024434851e0681bed) |
| Seller subname registration | [Register scf821769ed.arcade.eth](https://sepolia.etherscan.io/tx/0x021ec6bd72c2ef2a678e156a57ab2b9bee2d46fc871e637b9478d1fd67333aff) |
| Skill subname registration | [Register usdc-flow-check](https://sepolia.etherscan.io/tx/0xd7d2470b13a97d2229ce65e5ad3e42ba515e8726a40856228a0a50244ba7b2da) |
| Initial six text records | [Set records](https://sepolia.etherscan.io/tx/0xda352327b520f72dca2f6f4498f21a2188329061f640081972c34f41dff96a5c) |
| Per-name daemon renewal grant | [Authorize renewal](https://sepolia.etherscan.io/tx/0x6bdf44c5182aad4abcea70c9331f159b1f4916e61a900f8b359e3ea0df4b3426) |
| Per-name, per-key daemon price grant | [Authorize price](https://sepolia.etherscan.io/tx/0x12ed2aed1e59acb7154ac5b9b6662e2943904d47b9f444b98492f8c7af1c9f0e) |
| Initial daemon renewal | [Renew the existing leaf](https://sepolia.etherscan.io/tx/0x412e2c70961f2582fbbbc53f2bb5e18f56cfb1386e1856233592f8df32d7d1bb) |

The renewal increased expiry from1788587784 to1788588119. Its exact signer,
recipient and `renew(labelId("usdc-flow-check"),1788588119)` calldata were independently
correlated with successful block11638428/hash
`0xee6bddf5368b377cee6aea43ab9b98a078bf4e129e94df353c9f53ee42ec4155`.
The initial runner's four-receipt/3.5-second polling window missed that confirmation.
The first supervisor therefore **failed and stopped all owned services at05:49:59 UTC**,
before any by-name purchase or price mutation. That failed result is retained; a later
continuation does not rewrite it as success or repeat registration/renewal automatically.

Independent keyless reads **after cleanup**, at Sepolia block11638471/hash
`0xea5e4a84902eb4b7e968368ddfa0a36e325b9ab6a020f2ee917b5a3f92101123`, verified the three
current proxy implementations and parent mounts, owner raw `ALL_ROLES` and daemon root0
on each, and all six exact text records. Same-value owner `setText` simulations succeeded
for every written key, proving retained update authority without signing. The leaf was
still live at that block, with unchanged token/latestOwner and expiry1788588119.

The actual endpoint was
`http://127.0.0.1:51989/x/0xcf821769ed3c0e55e152745377bb833d7155a78a/usdc-flow-check`;
the web record was `http://127.0.0.1:51989/skill/usdc-flow-check`, which returned HTML200
during the run. **These URLs served only during the owned run and stopped after cleanup.**
Independent post-cleanup GET received connection refusal. They are not public production
endpoints or judge-accessible services. The production re-point command above is pending.

The first run's evidence is partial; no Arc settlement, price revocation or watcher
removal is claimed by it. After explicit approval of one fresh 15-minute window, the
owner renewed the **same retained registration**, without new setup or grants:
[Owner renewal](https://sepolia.etherscan.io/tx/0xb06f82ad01e791ecd27a57cde0a141842f6f2ce3a9362965436fc8c48fa5b6f2).
Independent readback at block 11638640, hash
`0xa3d6532c3370aec400d21469e5d76671cfdbf1163ffdb0daaf3a678aab78f473`, confirmed expiry
1788590760 (**2026-09-05 06:46:00 UTC**), unchanged token/latestOwner, all six records,
and owner update authority. The continuation independently checked both renewal
transactions' exact signers, calldata and successful receipts before starting a
non-renewing seller runner at the original loopback origin. Its purchase, revocation,
tampered-challenge, watcher-expiry and final cleanup proof follow separately below.

The actual by-name purchase completed at **06:32:45 UTC**: job
`job_eed1146faa6a45c0912a`, [Arc settlement](https://testnet.arcscan.app/tx/0xf3d8b2eef12c3d68c96f8641be5f1f94d31f29f29a6ca65da8e04baadecca4ef).
Independent receipt and USDC/splitter event verification found exactly **10,000 atomic
USDC ($0.01)**, split into 9,500 for the seller and 500 in fees. Arc block 60536850 has
hash `0xc7e7cb65db59af56bdbc27b71e61fd67554c2bbc6decb7df49934c6d765c4394`.
This was a real ordinary job, not a fabricated canary receipt: **one name on Sepolia,
one settlement on Arc**.

The scoped price-lock beat completed at **06:34:16 UTC**:

| Operation | Confirmed transaction / result |
| --- | --- |
| Daemon price update, 10,000 → 11,000 atomic USDC | [Update price](https://sepolia.etherscan.io/tx/0x007e6bec63896613711ffab3628245cdaf320c48cb84ec0738ba631e23fa0ffb) |
| Owner revokes only that daemon's price grant | [Revoke scoped grant](https://sepolia.etherscan.io/tx/0x2442e78156df1d7fd58c19e124b91c16ac83beea32d966f52c7e1919431cd3fc) |
| Subsequent same-daemon `setText` simulation | Exact `EACUnauthorizedAccountRoles`, selector `0x4b27a133`; expected account, resource and role checked |

Known non-price routing/context records stayed unchanged. **Price remains 11,000 and
the scoped price grant remains revoked.** No restoration or regrant was performed.
The typed denial is a simulation, not another submitted transaction.

At **06:34:27 UTC**, the real buyer SDK rejected two synthetic challenge substitutions
(wrong payee and wrong chain), both with `ens_payto_mismatch`: **zero signatures and
zero paid requests**. These probes exercised pre-signature refusal but are not additional
payment evidence. The passive-expiry baseline was observed at Sepolia block 11638654
with expiry 1788590760.

**Passive expiry and cleanup passed:** no further renewal, unregister or replacement
registration was sent. The seller served without the daemon renewal key throughout
the observation, and the hub watcher marked the matching detail record `ensExpired`
while it still returned HTTP200. The catalogue successfully omitted the skill. This
distinguishes real expiry-driven removal from a disconnected runner or failed fetch.

| Observation | Verified UTC / chain coordinate |
| --- | --- |
| Renewal disabled, seller still serving | 06:32:51 UTC; fixed expiry 1788590760 |
| Registration expiry | 06:46:00 UTC (1788590760) |
| Guarded name absence and watcher-driven catalogue removal confirmed | 06:46:59 UTC; block 11638715, chain timestamp 1788590808 |
| All owned services stopped | 06:47:00.333 UTC |
| Supervisor's post-cleanup proof and PASS | 06:47:10.487 UTC; block 11638715, hash `0xe8faeedc519be10bc92075fe03840353e3bf7c3818ccea3ac309b275a315fb0f` |
| Separate keyless verification after the run | Block 11638719, hash `0x5ec46dd8e11213de49e80618d98c1b77c383c0462def18996e9515d68f6927bd`, chain timestamp 1788590856 |

That separate verification re-read current proxy implementations, parent mounts,
owner raw `ALL_ROLES` and daemon root0 on all three proxies, and all six exact records.
Six same-value owner `setText` simulations succeeded **after expiry and cleanup**.
The registration is now status0 with zero current owner; token/latestOwner are retained.
Its token is
`23970333715751076124179036471974348465258195195405327158223653295910559940609`;
the expired resource equals that token, advancing from the live resource (token−1).
Actual GET to the loopback origin received connection refusal. Thus the URLs served
**only during the two owned runs and stopped after each cleanup**, while every written
record remains updatable by `arcade-ens-owner`.

The raw price is still **11,000**; the untouched context JSON still describes its original
10,000 price, and the daemon's scoped price permission remains revoked. Production
re-pointing, a future owner-root renewal, intended raw-price restoration and scoped
price regrant remain distinct pending owner actions. None was silently performed.
The original daemon journal's submitted entry is retained with its successful chain
reconciliation; it was not resent or automatically rewritten. The exact production
re-point command above refreshes routing and context only, not liveness or raw price.

### Evidence checklist for future runs

| Evidence | Required observation |
| --- | --- |
| Deployment | UTC/block, actual chain11155111, selected set and live root/UniversalResolver links. The dated keyless preflight above remains separate. |
| Parent/namespace | Approved name, owner, successful registration hashes, seller/skill registries and resolver with proxy provenance, exact ownership/expiry/pointers/records/grants. Only then publish name-specific ENS-app and Sepolia transaction links. |
| Renewal | Exact daemon/name/registry, confirmed hash, previous/new expiry and observed block. A log line alone is insufficient. |
| By-name payment | Resolved authority, correlated real job/receipt, successful Arc transaction and independently checked splitter/USDC events and amounts. A signature or HTTP result is not settlement. |
| Revocation | Before/after price, daemon-write and owner-revoke hashes, exact decoded simulation denial and unchanged known non-price records; explicit recovery status. |
| Expiry | Live baseline token/owner/resource/expiry; owner stop time; final chain state/time; first guarded record absence and successful catalogue absence; detail200/404 distinction. Passive expiry advances the derived resource's low32-bit version while retaining token/latestOwner. |
| Cleanup/recovery | Authorized restoration/regrant/revival hashes and readbacks; unresolved journal operations; processes stopped or intentionally retained. |

Publish only that public evidence subset. Keep setup journals, commitment secrets,
keys, headers, raw job stores and provider credentials private. No placeholder hash,
offline receipt, or pre-existing unrelated Arc transaction substitutes for a missing beat.
