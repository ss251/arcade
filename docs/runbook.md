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
| `ARCADE_DB` | hub | Path to the sqlite file, **which must be inside a mounted volume**. Container filesystems are ephemeral: point it anywhere else and sqlite writes into the container, receipts persist across a process restart *inside* it, and durability fails only on redeploys — which nobody thinks of as restarts, and which happen on every push. Provision and mount the volume **before the first deploy**, because the first thing you do after one is push a fix. DoD "a receipt survives a restart" is only true on a host with a volume; the sqlite Layer alone does not get you there. **Now enforced** — see below. |

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
