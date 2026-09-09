# Plan F — Gateway Nanopayments sessions, live on Arc (M6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove Circle Gateway Nanopayments end to end on Arc testnet — buyer deposits into the Gateway Wallet, signs `GatewayWalletBatched` authorizations, the hub verifies through Circle's facilitator and settles only after the output validates — then ship the product surface that makes it worth having: a **session**. One deposit, N calls, one batched settlement, one session receipt. Loop agents stop paying 0.00218 USDC of gas per call (`packages/payments/src/eip3009.ts:36-40`).

**Architecture:** Everything lands behind seams that already exist. `Rail` (`packages/payments/src/rail.ts:53-67`) is unchanged; `GatewayLive` (`packages/payments/src/gateway.ts:174`) is hardened, not rewritten. The one genuinely new hub concept is a `sessions` row plus a two-rail registry so `ARCADE_RAIL=gateway` becomes a **per-request** choice (`x-arcade-session: <id>`) instead of a process-wide flag, with EIP-3009 remaining the root default for every third-party x402 client. The buyer gets `packages/buyer/src/session.ts` and two MCP tools. Nothing about the settle-on-success guarantee changes: the batched authorization is submitted to Circle only after `shouldSettle` says yes (`apps/hub/src/pipeline.ts:132-151`).

**Tech Stack:** Bun 1.3, TypeScript, Effect 3.22 (Effect Schema, `Data.TaggedError`), `bun:sqlite`, viem 2.x, `@circle-fin/x402-batching` (installed 3.2.0, latest 3.4.0 — see Task 2), vitest 3 + `bun test` for `.bun.test.ts`.

**Depends on Plan A** for `loadChainConfig` / `ChainConfig.gateway` (`docs/superpowers/plans/2026-09-04-A-settlement-core.md:1247`, `:1307`), `chainCheck` (`:1347`), `validateJson`, `Receipt` tree fields, and `Rail.settle(verified, tree?)` (`:1037`). Every field this plan adds to `Receipt` is **optional and additive**, so it merges after Plan A without conflict. Merge Plan A first.

---

## Global Constraints

- Never commit `internal/`. No secrets in source or `.env`; keys via env/Keychain only (`ARCADE_BUYER_KEY`, `ARCADE_FACILITATOR_KEY`).
- **Depends on / rebase base (spec §13).** This stream starts **Mon Sept 8**, alongside Plan G's subgraph half and Plan H. It depends on **Plan A** (`loadChainConfig`/`ChainConfig.gateway`, `chainCheck`, `validateJson`, the `Receipt` tree fields and `Rail.settle(verified, tree?)`) and, because it lands after them, on the shapes **B**, **C**, **D** and **E** leave behind in `packages/runner/src/cli.ts`, `apps/hub/src/store.ts`, `pipeline.ts` and `server.ts`. Branch from `main` after Plan E's merge; rebase onto `main` before each merge. Canonical merge order for shared files is **A → B → C → D → E → F → G → H → I**. The one ordering rule inside the paid branch is **Plan A Task 5's canonical sequence**: the `x-arcade-session` check is position 3 — after Plan A's input gate and Plan C's `listing_delisted` check, before Plan A's lineage resolution.
- **A naming collision to keep straight.** `packages/buyer/src/mcp.ts:78` already has `ARCADE_SESSION_BUDGET_USD`, a *per-process* spending cap on the MCP server that predates this plan. The `Session` this plan introduces is a *hub-side, per-buyer* budget with its own id and receipt. Both keep their names; Task 10 stacks them (a session may not be opened for more than the process's remaining cap) and says so in the refusal text. Do not rename either.
- **Settle only on success.** Schema-valid + non-empty + no engine refusal. Gateway's facilitator `/settle` is a spend and is called from exactly one place: after `shouldSettle` in `pipeline.ts`. Never from `createGatewayMiddleware`, which settles inside the HTTP request.
- Never call `waitForTransactionReceipt` against Arc's public RPC (`-32011 request limit reached`); the Gateway deposit path in `scripts/g2c-nanopay.ts:100-113` already retries the whole operation with backoff — keep that shape.
- Money is 6-decimal atomic `bigint`. Gas is 18-decimal and stays out of receipts. USDC on Arc is both the native gas token (18 dec) and the ERC-20 (6 dec).
- Effect idioms only: `Effect.gen`, `Schema.Class`, `Data.TaggedError`, `Layer`/`Context.Tag`. No zod.
- Third-party x402 clients (Circle CLI) must keep working on root calls: no new **required** headers, and the root default rail stays `eip3009` unless `ARCADE_RAIL` says otherwise.
- ERC-8004 / ENS / subgraph side effects are best-effort and never change a settlement outcome.
- Gates before every commit: `bun run test`, `bunx tsc --noEmit` (or `bun run typecheck`), plus `bun run web:build` for any web change.
- Conventional, small commits; one per task.
- Demoable on Arc testnet (chain 5042002) against a local hub per `docs/runbook.md` or `https://arcade-hub-production.up.railway.app`.
- **Owner-performed steps.** Any step marked **OWNER** stops the executor: print the command, hand it to the human, resume on confirmation. The full week's list, with the day each is needed, is `docs/superpowers/plans/2026-09-04-01-owner-actions.md`.

---

## Verified facts this plan is built on

Pinned via the `circle` MCP (`mcp__circle__search_circle_documentation`) and by reading the installed SDK at `node_modules/@circle-fin/x402-batching/dist/`, on 2026-09-04. Do not re-derive these from memory.

| fact | evidence |
|---|---|
| Buyer deposits once on chain, then every payment is an offline signature with zero gas | https://developers.circle.com/gateway/nanopayments — "How it works", steps 1–7 |
| Deposit call is `new GatewayClient({chain:"arcTestnet", privateKey}).deposit("1")` after checking `balances.gateway.available` | https://developers.circle.com/gateway/nanopayments/howtos/x402-buyer — "Step 3. Deposit USDC into Gateway" |
| The signing domain is `{name:"GatewayWalletBatched", version:"1", chainId:5042002, verifyingContract:<GatewayWallet>}` — **not** the USDC domain | https://developers.circle.com/gateway/nanopayments/howtos/eip-3009-signing — "Step 1" |
| `verifyingContract` comes from the 402's `accepts[].extra.verifyingContract` | same page, Step 1 |
| Types are standard EIP-3009 `TransferWithAuthorization(from,to,value,validAfter,validBefore,nonce)` | same page, Step 2 |
| `validBefore` must be well in the future; the SDK clamps to `GATEWAY_AUTH_VALIDITY_WINDOW_SECONDS = 7*24*3600 + 100 = 604900` | `dist/client/index.js:52-54`, `:210-224`. **Our `GATEWAY_MIN_VALIDITY_SECONDS` (`packages/core/src/chain.ts:57`) is already exactly 604900 — verified equal, no change needed.** |
| The SDK signs `validAfter = now - 600` (ten minutes back), not `0` | `dist/client/index.js:219` |
| Facilitator endpoints are `POST /v1/x402/verify`, `POST /v1/x402/settle`, `GET /v1/x402/supported` | `dist/server/index.js:280,308,344` |
| The SDK's request body is `{paymentPayload, paymentRequirements}` — **no `x402Version` field** | `dist/server/index.js:283-286`, `:311-314` |
| No API key is required; auth headers are an optional `createAuthHeaders` hook | `dist/server/index.js:79-85` |
| `SettleResponse` is `{success, errorReason?, payer?, transaction}` | https://developers.circle.com/gateway/nanopayments/references/sdk — `BatchFacilitatorClient` |
| Gateway credits the **seller's Gateway balance**, not their wallet; the seller withdraws (same-chain withdraw is instant) | https://developers.circle.com/gateway/nanopayments/concepts/batched-settlement — step 5; `GatewayClient.withdraw` in `dist/client/index.d.ts:699-724` |
| `getTransferById(id)` / `searchTransfers({from,to,network,...})` expose the settlement record | `dist/client/index.d.ts:483-518` |
| Since 2026-08-26, filtering x402 transfers by `status` requires at least one of `from`, `to`, `nonce` in the same request | `docs/superpowers/research/ethonline-2026/arc-circle.md:207-209` |
| Nanopayments is **testnet-only on Arc** — no Arc-mainnet Gateway contracts | `arc-circle.md:189-198`; https://developers.circle.com/gateway/references/supported-blockchains |
| Arc testnet Gateway deposit finality ~1 block / ~0.5 s — the fastest Gateway chain | `arc-circle.md:191-194` |

Seller-side skill context read but not followed literally: `~/.claude/plugins/cache/circle/circle-skills/1.1.0/skills/accept-agent-payments/SKILL.md` (recommends `createGatewayMiddleware`, which settles inside the request and is unusable here — see `packages/payments/src/gateway.ts:28-30`), `use-gateway/SKILL.md` (unified balance / burn-intent flows, not the nanopayments path), `pay-via-agent-wallet` (Circle CLI buyer, covered by Plan I's interop task).

---

## File structure

| file | responsibility |
|---|---|
| `scripts/g2c-nanopay.ts` | the 4-hour gate, extended from "deposit works" to the full loop |
| `docs/evidence/m6-gateway.md` (new) | recorded gate evidence: tx hashes, transfer ids, PASS/FAIL decision |
| `packages/payments/src/gateway-sign.ts` (new) | `signGatewayAuthorization`, `isGatewayRequirements`, `gatewayDomain` |
| `packages/payments/src/gateway.ts` | facilitator body shape, `supported()` preflight, honest settlement reference |
| `packages/payments/src/types.ts` | `SettledPayment.settlementKind?` |
| `packages/payments/src/index.ts` | re-export the new module |
| `packages/payments/test/rail.conformance.test.ts` | Gateway-domain signature acceptance |
| `packages/payments/test/gateway-sign.test.ts` (new) | domain/typed-data unit tests |
| `packages/core/src/errors.ts` | `SessionNotFound`, `SessionClosed`, `SessionBudgetExceeded`, `SessionRailUnavailable` |
| `packages/core/src/session.ts` (new) | `Session`, `SessionCall`, `SessionReceipt` schemas; `SESSION_HEADER` |
| `packages/core/src/receipt.ts` | `Receipt.sessionId?`, `Receipt.settleRefKind?` |
| `apps/hub/src/rails.ts` (new) | two-rail registry: `Rails`, `RailsTag`, `railsLayer()` |
| `apps/hub/src/sessions.ts` (new) | session lifecycle, budget arithmetic, session receipt assembly |
| `apps/hub/src/store.ts`, `apps/hub/src/store-sqlite.ts` | `openSession/getSession/closeSession/allSessions` + `sessions` table |
| `apps/hub/src/server.ts` | `POST /sessions`, `POST /sessions/:id/close`, `x-arcade-session` on the paid path |
| `apps/hub/src/pipeline.ts` | `RunJobArgs.rail?`, `sessionId` onto the receipt |
| `packages/buyer/src/fetch-with-payment.ts` | branch on `extra.name === "GatewayWalletBatched"`; forward the session header |
| `packages/buyer/src/session.ts` (new) | `openSession`, `session.call`, `session.close`, `ensureGatewayDeposit` |
| `packages/buyer/src/mcp.ts` | `arcade_open_session`, `arcade_close_session` |
| `packages/buyer/src/cli.ts` | `gateway-deposit`, `session` subcommands |
| `scripts/gateway-withdraw.ts` (new) | seller pulls their Gateway balance back on chain |
| `scripts/e2e-gateway-session.sh` (new) | 20 calls, one batched settlement, one session receipt |
| `docs/sessions.md` (new) | what a session is, what it does and does not guarantee |

---

### Task 1: THE GATE — `scripts/g2c-nanopay.ts` proves the whole loop on Arc testnet

**Timebox: 4 hours.** This is the spec's decision point (`docs/superpowers/specs/2026-09-04-ethonline-continuity-design.md:111`). Today the script proves only half the claim — it deposits and reads a balance (`scripts/g2c-nanopay.ts:85-130`) and never signs, verifies or settles. "Gateway works on Arc" cannot be asserted from a deposit.

At the end of this task you either record a PASS and continue to Task 2, or record a FAIL and jump to **Task 13 (fallback track)**. Do not proceed to Task 2 on a partial result.

**Files:**
- Modify: `scripts/g2c-nanopay.ts`
- Create: `docs/evidence/m6-gateway.md`

**Interfaces:**
- Produces: `bun run scripts/g2c-nanopay.ts` exits 0 only when deposit + `/v1/x402/supported` + signed batched authorization + `/v1/x402/verify` + `/v1/x402/settle` all succeed against `https://gateway-api-testnet.circle.com` on `eip155:5042002`. Exits 1 with a named failure stage otherwise.
- Consumes: `GATEWAY_WALLET`, `GATEWAY_FACILITATOR_URL`, `GATEWAY_BATCHING_NAME`, `GATEWAY_BATCHING_VERSION`, `GATEWAY_MIN_VALIDITY_SECONDS`, `USDC_ADDRESS`, `ARC_CAIP2`, `ARC_CHAIN_ID` from `@arcade/core` (`packages/core/src/chain.ts:13-57`).

- [ ] **Step 1: Add the `supported` probe — the cheapest possible refusal**

Before spending a deposit, ask Circle whether it will take Arc at all. Insert after the constants-drift block (`scripts/g2c-nanopay.ts:52`):

```ts
// ── 0b. does the facilitator still accept Arc testnet? ──────────────────────
// One GET, no key, no money. If Arc has been withdrawn from the supported set this
// is where we find out, before a deposit is on chain.
const supportedRes = await fetch(`${GATEWAY_FACILITATOR_URL}/v1/x402/supported`)
if (!supportedRes.ok) {
  console.error(`FAIL[supported]: HTTP ${supportedRes.status} ${await supportedRes.text()}`)
  process.exit(1)
}
const supported = (await supportedRes.json()) as {
  kinds: Array<{ scheme: string; network: string; extra?: { verifyingContract?: string } }>
}
const arcKind = supported.kinds.find((k) => k.network === ARC_CAIP2)
if (arcKind === undefined) {
  console.error(
    `FAIL[supported]: facilitator does not list ${ARC_CAIP2}. Networks offered: ` +
      supported.kinds.map((k) => k.network).join(", ")
  )
  process.exit(1)
}
const verifyingContract = arcKind.extra?.verifyingContract ?? GATEWAY_WALLET
console.log(`  supported: ${ARC_CAIP2} verifyingContract=${verifyingContract}\n`)
```

Add `ARC_CAIP2`, `GATEWAY_FACILITATOR_URL`, `GATEWAY_BATCHING_NAME`, `GATEWAY_BATCHING_VERSION`, `ARC_CHAIN_ID` to the `@arcade/core` import at `scripts/g2c-nanopay.ts:18-23`.

- [ ] **Step 2: OWNER-assisted — run the probe alone**

**OWNER.** This is the 4-hour gate and it spends: `ARCADE_BUYER_KEY` must be a faucet-funded
throwaway before the probe can deposit. Confirm funding with the owner first — needed **Sat
Sept 6**, so the PASS/FAIL decision is recorded before this stream starts on Mon Sept 8.

Run: `bun run scripts/g2c-nanopay.ts` (with `ARCADE_BUYER_KEY` set to a faucet-funded throwaway)
Expected: the `supported:` line prints and the script continues into the existing deposit block. If it exits at `FAIL[supported]`, that is already the gate's answer — record it and go to Task 13.

- [ ] **Step 3: Sign a batched authorization and drive verify + settle**

Replace the success tail (`scripts/g2c-nanopay.ts:124-130`) with the real loop. `PAY_TO` is the address that receives; use the seller address from `SELLER` or fall back to the buyer itself (a self-payment still exercises verify and settle end to end, and the minimum is $0.000001).

```ts
  if (after.gateway.available === 0n) {
    throw new Error("deposit did not credit a Gateway balance")
  }

  // ── 2. sign a GatewayWalletBatched authorization ───────────────────────────
  // The domain is Gateway's, NOT USDC's. This is the single detail that makes a
  // nanopayment different from our proven EIP-3009 rail, and getting it wrong
  // produces a signature the facilitator rejects with no useful reason.
  const payTo = (process.env["SELLER"] ?? account.address) as `0x${string}`
  const priceAtomic = 1000n // $0.001 — three orders of magnitude above the $0.000001 floor
  const now = Math.floor(Date.now() / 1000)
  const authorization = {
    from: account.address,
    to: payTo,
    value: priceAtomic.toString(),
    // The SDK back-dates by ten minutes so clock skew between buyer and facilitator
    // cannot make a fresh authorization look future-dated (dist/client/index.js:219).
    validAfter: (now - 600).toString(),
    validBefore: (now + GATEWAY_MIN_VALIDITY_SECONDS).toString(),
    nonce: `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`
  }
  const signature = await account.signTypedData({
    domain: {
      name: GATEWAY_BATCHING_NAME,
      version: GATEWAY_BATCHING_VERSION,
      chainId: ARC_CHAIN_ID,
      verifyingContract: verifyingContract as `0x${string}`
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" }
      ]
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: authorization.from,
      to: authorization.to,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce as `0x${string}`
    }
  })

  const requirements = {
    scheme: "exact",
    network: ARC_CAIP2,
    amount: priceAtomic.toString(),
    asset: USDC_ADDRESS,
    payTo,
    resource: "https://arcade.local/x/g2c/probe",
    mimeType: "application/json",
    maxTimeoutSeconds: GATEWAY_MIN_VALIDITY_SECONDS,
    extra: {
      name: GATEWAY_BATCHING_NAME,
      version: GATEWAY_BATCHING_VERSION,
      verifyingContract
    }
  }
  const paymentPayload = {
    x402Version: 2,
    payload: { authorization, signature },
    accepted: requirements
  }

  // ── 3. verify (free, no spend) ─────────────────────────────────────────────
  // Body shape copied from the SDK's own client: paymentPayload + paymentRequirements,
  // and NOTHING else (dist/server/index.js:283-286).
  const post = async (path: string) => {
    const res = await fetch(`${GATEWAY_FACILITATOR_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentPayload, paymentRequirements: requirements })
    })
    const text = await res.text()
    return { status: res.status, body: text === "" ? null : (JSON.parse(text) as Record<string, unknown>) }
  }

  const verified = await post("/v1/x402/verify")
  console.log(`\nverify -> ${verified.status} ${JSON.stringify(verified.body)}`)
  if (verified.body?.["isValid"] !== true) {
    throw new Error(`FAIL[verify]: ${JSON.stringify(verified.body)}`)
  }

  // ── 4. settle — the actual spend, and the whole point ──────────────────────
  const settled = await post("/v1/x402/settle")
  console.log(`settle -> ${settled.status} ${JSON.stringify(settled.body)}`)
  if (settled.body?.["success"] !== true) {
    throw new Error(`FAIL[settle]: ${JSON.stringify(settled.body)}`)
  }
  const reference = String(settled.body["transaction"] ?? "")
  const onchain = /^0x[0-9a-fA-F]{64}$/.test(reference)

  const post402 = await client.getBalances()
  console.log(`\ngateway available after settle: ${post402.gateway.formattedAvailable}`)

  console.log(`\nG-2c: PASS — Gateway Nanopayments works end to end on Arc testnet.`)
  console.log(`  settlement reference: ${reference}`)
  console.log(`  kind: ${onchain ? "on-chain tx hash" : "Gateway transfer id (batch pending)"}`)
  if (onchain) console.log(`  explorer: https://testnet.arcscan.app/tx/${reference}`)
  console.log(`  Set ARCADE_RAIL=gateway, or open a session, to route calls through it.`)
```

Also widen the `catch` at `scripts/g2c-nanopay.ts:131` so the stage name survives:

```ts
} catch (e) {
  const msg = String((e as Error)?.message ?? e)
  console.error(`\nG-2c: FAIL — ${msg}`)
  console.error(
    `\nThis is a finding, not a crisis: the EIP-3009 rail is proven on-chain and remains\n` +
      `the default. Record the failure mode in docs/evidence/m6-gateway.md and take the\n` +
      `EIP-3009 session fallback (Plan F Task 13). Keep ARCADE_RAIL=eip3009.`
  )
  process.exit(1)
}
```

- [ ] **Step 4: Run the gate for real**

Run: `SELLER=0x… ARCADE_BUYER_KEY=0x… bun run scripts/g2c-nanopay.ts 0.5`
Expected on PASS: `verify -> 200 {"isValid":true,…}`, `settle -> 200 {"success":true,…}`, `G-2c: PASS`.
Expected on FAIL: a `FAIL[supported|verify|settle]` line naming the stage. **A FAIL here is the decision, not a bug to grind on past the timebox.**

- [ ] **Step 5: Record the evidence**

Write `docs/evidence/m6-gateway.md` with the actual output — no paraphrase:

```md
# M6 evidence — Gateway Nanopayments on Arc testnet

Run: `bun run scripts/g2c-nanopay.ts 0.5`, 2026-09-__, chain 5042002, facilitator
https://gateway-api-testnet.circle.com

| stage | result | reference |
|---|---|---|
| supported | | |
| deposit | | tx |
| verify | | |
| settle | | transaction= |

Decision: PASS -> Plan F Tasks 2-12. / FAIL -> Plan F Task 13 (EIP-3009 sessions),
README states Gateway as code-complete, unproven.

Raw output:
```
(paste)
```
```

- [ ] **Step 6: Commit**

```bash
bun run test && bunx tsc --noEmit
git add scripts/g2c-nanopay.ts docs/evidence/m6-gateway.md
git commit -m "test(gateway): drive the full nanopayment loop in the G-2c gate and record the evidence"
```

**Acceptance:** `bun run scripts/g2c-nanopay.ts 0.5` prints `G-2c: PASS` (or a `FAIL[stage]` line that is recorded in `docs/evidence/m6-gateway.md`).

---

### Task 2: `signGatewayAuthorization` — the buyer signs the right domain

The buyer today always signs the USDC domain (`packages/payments/src/eip3009.ts:80-85`, used unconditionally by `signAuthorization` at `:424` and by `fetchWithPayment` at `packages/buyer/src/fetch-with-payment.ts:91-96`). Against a Gateway 402 that signature is simply wrong, and the failure surfaces as an opaque facilitator rejection. This task makes the domain a function of the challenge.

**Files:**
- Create: `packages/payments/src/gateway-sign.ts`
- Modify: `packages/payments/src/index.ts`
- Modify: `packages/buyer/src/fetch-with-payment.ts:91-105`
- Test: `packages/payments/test/gateway-sign.test.ts`

**Interfaces:**
- Produces: `isGatewayRequirements(r: PaymentRequirements): boolean`; `gatewayDomain(r, chainId)`; `signGatewayAuthorization(input: SignInput & {requirements: PaymentRequirements}): Effect<SignedAuthorization, InvalidSignature>` returning the same `{from,to,value,validAfter,validBefore,nonce,signature}` shape as `signAuthorization` (`packages/payments/src/eip3009.ts:439-447`), so every downstream call site is unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// packages/payments/test/gateway-sign.test.ts
import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import { recoverTypedDataAddress } from "viem"
import {
  ARC_CAIP2,
  ARC_CHAIN_ID,
  GATEWAY_BATCHING_NAME,
  GATEWAY_BATCHING_VERSION,
  GATEWAY_MIN_VALIDITY_SECONDS,
  GATEWAY_WALLET,
  USDC_ADDRESS,
  parsePrice
} from "@arcade/core"
import { PaymentRequirements } from "../src/types.ts"
import { TRANSFER_TYPES } from "../src/eip3009.ts"
import { gatewayDomain, isGatewayRequirements, signGatewayAuthorization } from "../src/gateway-sign.ts"

const account = privateKeyToAccount(generatePrivateKey())
const SELLER = "0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF"
const PRICE = parsePrice("$0.001")

const req = (extra: Record<string, unknown>) =>
  PaymentRequirements.make({
    scheme: "exact",
    network: ARC_CAIP2,
    amount: PRICE.toString(),
    asset: USDC_ADDRESS,
    payTo: SELLER,
    resource: "/x/ss251/demo",
    mimeType: "application/json",
    maxTimeoutSeconds: GATEWAY_MIN_VALIDITY_SECONDS,
    extra
  })

const gatewayReq = req({
  name: GATEWAY_BATCHING_NAME,
  version: GATEWAY_BATCHING_VERSION,
  verifyingContract: GATEWAY_WALLET
})

describe("gateway signing", () => {
  it("detects a Gateway challenge by extra.name and version", () => {
    expect(isGatewayRequirements(gatewayReq)).toBe(true)
    expect(isGatewayRequirements(req({ name: "USDC", version: "2" }))).toBe(false)
    expect(isGatewayRequirements(req({}))).toBe(false)
  })

  it("builds the GatewayWalletBatched domain from the challenge, not from a constant", () => {
    const custom = req({ name: GATEWAY_BATCHING_NAME, version: "1", verifyingContract: "0x00000000000000000000000000000000000000aa" })
    expect(gatewayDomain(custom, ARC_CHAIN_ID)).toEqual({
      name: "GatewayWalletBatched",
      version: "1",
      chainId: ARC_CHAIN_ID,
      verifyingContract: "0x00000000000000000000000000000000000000aa"
    })
  })

  it("refuses a Gateway challenge with no verifyingContract", () => {
    const bad = req({ name: GATEWAY_BATCHING_NAME, version: GATEWAY_BATCHING_VERSION })
    expect(() => gatewayDomain(bad, ARC_CHAIN_ID)).toThrow(/verifyingContract/)
  })

  it("produces a signature that recovers to the buyer over the Gateway domain", async () => {
    const signed = await Effect.runPromise(
      signGatewayAuthorization({ account, to: SELLER, valueAtomic: PRICE, requirements: gatewayReq })
    )
    const recovered = await recoverTypedDataAddress({
      domain: gatewayDomain(gatewayReq, ARC_CHAIN_ID),
      types: TRANSFER_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        from: signed.from as `0x${string}`,
        to: signed.to as `0x${string}`,
        value: BigInt(signed.value),
        validAfter: BigInt(signed.validAfter),
        validBefore: BigInt(signed.validBefore),
        nonce: signed.nonce as `0x${string}`
      },
      signature: signed.signature as `0x${string}`
    })
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase())
  })

  it("back-dates validAfter and clamps validBefore to Gateway's 604900s window", async () => {
    const now = Math.floor(Date.now() / 1000)
    const signed = await Effect.runPromise(
      signGatewayAuthorization({ account, to: SELLER, valueAtomic: PRICE, requirements: gatewayReq })
    )
    expect(Number(signed.validAfter)).toBeLessThanOrEqual(now - 500)
    expect(Number(signed.validBefore) - now).toBeGreaterThanOrEqual(GATEWAY_MIN_VALIDITY_SECONDS)
  })

  it("gives every call a distinct nonce", async () => {
    const a = await Effect.runPromise(signGatewayAuthorization({ account, to: SELLER, valueAtomic: PRICE, requirements: gatewayReq }))
    const b = await Effect.runPromise(signGatewayAuthorization({ account, to: SELLER, valueAtomic: PRICE, requirements: gatewayReq }))
    expect(a.nonce).not.toBe(b.nonce)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run packages/payments/test/gateway-sign.test.ts`
Expected: FAIL — `packages/payments/src/gateway-sign.ts` does not exist.

- [ ] **Step 3: Implement**

```ts
// packages/payments/src/gateway-sign.ts
import { Effect } from "effect"
import { toHex, type Account, type Hex } from "viem"
import {
  ARC_CHAIN_ID,
  GATEWAY_BATCHING_NAME,
  GATEWAY_BATCHING_VERSION,
  GATEWAY_MIN_VALIDITY_SECONDS,
  InvalidSignature
} from "@arcade/core"
import { TRANSFER_TYPES } from "./eip3009.ts"
import type { PaymentRequirements } from "./types.ts"

/**
 * Gateway signing.
 *
 * A nanopayment is an EIP-3009 `TransferWithAuthorization` — the same six fields, the same
 * types — signed against a DIFFERENT EIP-712 domain: `GatewayWalletBatched`, verified by the
 * Gateway Wallet contract rather than by USDC. That one substitution is the whole difference
 * between our proven rail and a gasless batched one, and it is why the buyer cannot simply
 * reuse `signAuthorization`: the same authorization signed against USDC is not merely
 * rejected by Gateway, it is a valid on-chain transfer someone else could broadcast.
 *
 * The domain is read from the CHALLENGE, never from a constant. `extra.verifyingContract` is
 * what Circle's own client uses (dist/client/index.js:203), and hardcoding our
 * `GATEWAY_WALLET` would sign for the wrong contract the day Circle redeploys it — silently,
 * because a wrong-domain signature looks like a wrong-key signature from the outside.
 */

export const isGatewayRequirements = (r: PaymentRequirements): boolean =>
  r.extra["name"] === GATEWAY_BATCHING_NAME && r.extra["version"] === GATEWAY_BATCHING_VERSION

export interface GatewayDomain {
  readonly name: string
  readonly version: string
  readonly chainId: number
  readonly verifyingContract: Hex
}

export const gatewayDomain = (r: PaymentRequirements, chainId: number = ARC_CHAIN_ID): GatewayDomain => {
  const verifyingContract = r.extra["verifyingContract"]
  if (typeof verifyingContract !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(verifyingContract)) {
    throw new Error(
      "Gateway challenge is missing extra.verifyingContract (the GatewayWallet address). " +
        "Refusing to guess it: signing against the wrong contract produces an authorization " +
        "that is rejected with no diagnosable reason."
    )
  }
  return {
    name: String(r.extra["name"]),
    version: String(r.extra["version"]),
    chainId,
    verifyingContract: verifyingContract as Hex
  }
}

export interface GatewaySignInput {
  readonly account: Account
  readonly to: string
  readonly valueAtomic: bigint
  readonly requirements: PaymentRequirements
  readonly chainId?: number
}

export const signGatewayAuthorization = (input: GatewaySignInput) =>
  Effect.gen(function* () {
    if (input.account.signTypedData === undefined) {
      return yield* new InvalidSignature({ reason: "account cannot sign typed data" })
    }
    const domain = yield* Effect.try({
      try: () => gatewayDomain(input.requirements, input.chainId ?? ARC_CHAIN_ID),
      catch: (e) => new InvalidSignature({ reason: String((e as Error)?.message ?? e) })
    })

    const now = Math.floor(Date.now() / 1000)
    // Ten minutes back: buyer and facilitator clocks disagree by seconds, and a
    // future-dated `validAfter` is refused rather than retried. Circle's own client does
    // exactly this (dist/client/index.js:219).
    const validAfter = BigInt(now - 600)
    // Never shorter than Gateway's window, whatever the seller advertised — the SDK clamps
    // the same way, because an authorization that expires before the batch closes is money
    // the seller worked for and cannot collect.
    const window = Math.max(input.requirements.maxTimeoutSeconds, GATEWAY_MIN_VALIDITY_SECONDS)
    const validBefore = BigInt(now + window)
    const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)))

    const signature = yield* Effect.tryPromise({
      try: () =>
        input.account.signTypedData!({
          domain,
          types: TRANSFER_TYPES,
          primaryType: "TransferWithAuthorization",
          message: {
            from: input.account.address,
            to: input.to as Hex,
            value: input.valueAtomic,
            validAfter,
            validBefore,
            nonce
          }
        }),
      catch: (e) => new InvalidSignature({ reason: String((e as Error)?.message ?? e) })
    })

    return {
      from: input.account.address,
      to: input.to,
      value: input.valueAtomic.toString(),
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce,
      signature
    }
  })
```

Export it from `packages/payments/src/index.ts` alongside the existing modules.

- [ ] **Step 4: Run the test**

Run: `bunx vitest run packages/payments/test/gateway-sign.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Branch the buyer on the challenge**

In `packages/buyer/src/fetch-with-payment.ts`, replace the unconditional sign at `:91-96`:

```ts
    // Offline. No gas, no chain round-trip — measured at ~5ms during G-1.
    //
    // WHICH domain we sign is a property of the challenge, not of the client's
    // configuration: a Gateway seller advertises extra.name = "GatewayWalletBatched" and a
    // 3009 seller advertises USDC's. One buyer therefore pays either rail with no flag,
    // which is what lets a session switch rails without the caller knowing.
    const signed = yield* isGatewayRequirements(requirements)
      ? signGatewayAuthorization({
          account: options.account,
          to: requirements.payTo,
          valueAtomic: amount,
          requirements
        })
      : signAuthorization({
          account: options.account,
          to: requirements.payTo,
          valueAtomic: amount,
          validForSeconds: requirements.maxTimeoutSeconds
        })
```

Add `isGatewayRequirements, signGatewayAuthorization` to the `@arcade/payments` import at `:4-11`.

- [ ] **Step 6: Run the buyer tests and commit**

```bash
bunx vitest run packages/buyer/test packages/payments/test
bun run test && bunx tsc --noEmit
git add packages/payments/src/gateway-sign.ts packages/payments/src/index.ts packages/buyer/src/fetch-with-payment.ts packages/payments/test/gateway-sign.test.ts
git commit -m "feat(payments): sign the GatewayWalletBatched domain when the challenge asks for it"
```

**Acceptance:** `bunx vitest run packages/payments/test/gateway-sign.test.ts packages/buyer/test/fetch-with-payment.test.ts`

---

### Task 3: Harden `GatewayLive` against the real facilitator

**Merge notes.** `packages/payments/src/rail.ts`, `eip3009.ts`, `gateway.ts` and `types.ts` come from **Plan A Task 7** first, which widens `Rail.settle` to `(verified, tree?)` and adds `FEE_SPLITTER_V2_ABI`. Rebase onto that: `gateway.ts` keeps accepting and ignoring `tree` (Gateway settles a batch, which has no tree to commit), and `SettledPayment.settlementKind` is appended beside A's fields, not in place of them.

Three defects the gate exposes. (a) `gateway.ts:124` sends `x402Version` in the facilitator body; Circle's own client sends only `{paymentPayload, paymentRequirements}` (`dist/server/index.js:283-286`) — an extra field is at best ignored and at worst a 400. (b) `verifyingContract` is hardcoded from `GATEWAY_WALLET` (`gateway.ts:94`) rather than read from `ChainConfig.gateway` or `/v1/x402/supported`. (c) `settle` returns `transaction` as `txHash` (`gateway.ts:165`), and the hub then renders it through `explorerTxUrl` — but a batched settlement's `transaction` may be a Gateway transfer id, not an Arc transaction hash. Linking a transfer id to Arcscan produces a 404 in front of a judge.

**Files:**
- Modify: `packages/payments/src/gateway.ts`
- Modify: `packages/payments/src/types.ts:99-104`
- Test: `packages/payments/test/gateway-rail.test.ts` (new)

**Interfaces:**
- Produces: `GatewayConfig` gains `wallet?`, `chainId?`, `minValiditySeconds?` (all defaulting from `loadChainConfig().gateway`); `SettledPayment.settlementKind?: "onchain" | "gateway-batch"`; `makeGatewayRail(...).supported()` returning the facilitator's kinds.
- Consumes: `ChainConfig.gateway` from Plan A (`plans/2026-09-04-A-settlement-core.md:1307`).

- [ ] **Step 1: Write the failing test**

```ts
// packages/payments/test/gateway-rail.test.ts
import { describe, expect, it, vi, afterEach } from "vitest"
import { Effect } from "effect"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import { ARC_CAIP2, GATEWAY_MIN_VALIDITY_SECONDS, USDC_ADDRESS, parsePrice } from "@arcade/core"
import { PaymentPayload, PaymentRequirements, makeGatewayRail, signGatewayAuthorization } from "../src/index.ts"

const buyer = privateKeyToAccount(generatePrivateKey())
const SELLER = "0x3b2Bbb840A9570223aDbF2172a33BB77fE8D21AF"
const PRICE = parsePrice("$0.001")

const captured: Array<{ url: string; body: any }> = []
const stubFetch = (reply: (url: string) => unknown) =>
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    captured.push({ url, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) })
    return new Response(JSON.stringify(reply(url)), { status: 200, headers: { "content-type": "application/json" } })
  })

afterEach(() => {
  captured.length = 0
  vi.unstubAllGlobals()
})

const paid = async (rail: ReturnType<typeof makeGatewayRail>) => {
  const req = await Effect.runPromise(rail.challenge({ priceAtomic: PRICE, resource: "/x/a/b", payTo: SELLER }))
  const s = await Effect.runPromise(
    signGatewayAuthorization({ account: buyer, to: SELLER, valueAtomic: PRICE, requirements: req })
  )
  const { signature, ...authorization } = s
  return { req, payload: PaymentPayload.make({ x402Version: 2, payload: { authorization, signature }, accepted: req }) }
}

describe("GatewayLive against the facilitator", () => {
  it("sends exactly {paymentPayload, paymentRequirements} — the shape Circle's own client sends", async () => {
    stubFetch(() => ({ isValid: true, payer: buyer.address }))
    const rail = makeGatewayRail()
    const { req, payload } = await paid(rail)
    await Effect.runPromise(rail.verify(payload, req))
    expect(captured[0]!.url).toMatch(/\/v1\/x402\/verify$/)
    expect(Object.keys(captured[0]!.body).sort()).toEqual(["paymentPayload", "paymentRequirements"])
  })

  it("takes verifyingContract from config rather than a module constant", async () => {
    const rail = makeGatewayRail({ wallet: "0x00000000000000000000000000000000000000aa" })
    const req = await Effect.runPromise(rail.challenge({ priceAtomic: PRICE, resource: "/x/a/b", payTo: SELLER }))
    expect(req.extra["verifyingContract"]).toBe("0x00000000000000000000000000000000000000aa")
    expect(req.maxTimeoutSeconds).toBe(GATEWAY_MIN_VALIDITY_SECONDS)
    expect(req.network).toBe(ARC_CAIP2)
    expect(req.asset).toBe(USDC_ADDRESS)
  })

  it("labels a 32-byte settlement reference as on-chain", async () => {
    stubFetch((u) => (u.endsWith("/verify") ? { isValid: true } : { success: true, transaction: `0x${"a".repeat(64)}` }))
    const rail = makeGatewayRail()
    const { req, payload } = await paid(rail)
    const verified = await Effect.runPromise(rail.verify(payload, req))
    const settled = await Effect.runPromise(rail.settle(verified))
    expect(settled.settlementKind).toBe("onchain")
  })

  it("labels a non-hash reference as a pending batch rather than pretending it is a tx", async () => {
    stubFetch((u) => (u.endsWith("/verify") ? { isValid: true } : { success: true, transaction: "8f2c1f4e-0a11-4a3d-9f1e-2b6c7d8e9f00" }))
    const rail = makeGatewayRail()
    const { req, payload } = await paid(rail)
    const verified = await Effect.runPromise(rail.verify(payload, req))
    const settled = await Effect.runPromise(rail.settle(verified))
    expect(settled.settlementKind).toBe("gateway-batch")
    expect(settled.txHash).toBe("8f2c1f4e-0a11-4a3d-9f1e-2b6c7d8e9f00")
  })

  it("fails settlement when the facilitator says success with no reference at all", async () => {
    stubFetch((u) => (u.endsWith("/verify") ? { isValid: true } : { success: true }))
    const rail = makeGatewayRail()
    const { req, payload } = await paid(rail)
    const verified = await Effect.runPromise(rail.verify(payload, req))
    const exit = await Effect.runPromiseExit(rail.settle(verified))
    expect(exit._tag).toBe("Failure")
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run packages/payments/test/gateway-rail.test.ts`
Expected: FAIL — `x402Version` is present in the body, `wallet` is not a config option, `settlementKind` is undefined.

- [ ] **Step 3: Implement**

In `packages/payments/src/types.ts`, extend `SettledPayment` (`:99-104`):

```ts
export interface SettledPayment {
  readonly txHash: string
  readonly payer: string
  readonly amountAtomic: bigint
  /**
   * What `txHash` actually IS.
   *
   * On the 3009 rail it is always an Arc transaction hash. On the Gateway rail the
   * facilitator returns whatever identifies the settlement at that moment, which for a
   * batch that has not closed yet is a Gateway transfer id. Rendering that as an Arcscan
   * link produces a dead link on the public receipt feed, so the receipt records which one
   * it holds rather than assuming.
   */
  readonly settlementKind?: "onchain" | "gateway-batch"
}
```

In `packages/payments/src/gateway.ts`:

```ts
export interface GatewayConfig {
  readonly facilitatorUrl?: string
  /** Optional bearer for the facilitator; Circle's testnet facilitator needs none. */
  readonly apiKey?: string
  /** GatewayWallet address, i.e. the EIP-712 `verifyingContract`. From ChainConfig.gateway. */
  readonly wallet?: string
  readonly chainId?: number
  readonly minValiditySeconds?: number
}
```

then inside `makeGatewayRail`:

```ts
  const base = config.facilitatorUrl ?? GATEWAY_FACILITATOR_URL
  const wallet = config.wallet ?? GATEWAY_WALLET
  const validity = config.minValiditySeconds ?? GATEWAY_MIN_VALIDITY_SECONDS
```

Use `wallet` at `:94` and `validity` at `:89`. Drop `x402Version` from both request bodies (`:124` and `:152`) so they read:

```ts
      const res = yield* post<FacilitatorVerifyResponse>("/v1/x402/verify", {
        paymentPayload: payload,
        paymentRequirements: requirements
      })
```

Add the supported probe and the honest settlement label:

```ts
  /** The facilitator's own list of networks and their GatewayWallet addresses. */
  const supported = () =>
    Effect.tryPromise({
      try: async () => {
        const res = await fetch(`${base}/v1/x402/supported`)
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
        return (await res.json()) as {
          kinds: Array<{ scheme: string; network: string; extra?: { verifyingContract?: string } }>
        }
      },
      catch: (e) => new RpcFailure({ method: "/v1/x402/supported", reason: String((e as Error)?.message ?? e) })
    })
```

and in `settle`, replace the return (`:164-168`):

```ts
      const reference = res.transaction
      if (!res.success || reference === undefined || reference === "") {
        return yield* new SettlementFailed({
          reason: res.errorReason ?? "facilitator did not return a settlement reference"
        })
      }

      return {
        txHash: reference,
        payer: res.payer ?? verified.payer,
        amountAtomic: verified.amountAtomic,
        // A 32-byte hash is a transaction. Anything else is Gateway's own identifier for a
        // batch that has not landed yet, and saying so is the difference between a receipt
        // and a claim.
        settlementKind: /^0x[0-9a-fA-F]{64}$/.test(reference) ? "onchain" : "gateway-batch"
      } satisfies SettledPayment
```

Return `supported` from the rail object as an extra property (the `Rail` interface is unchanged; `makeGatewayRail` returns `Rail & {supported}`), and have `GatewayLive` default its config from `ChainConfig`:

```ts
export const GatewayLive = (config: GatewayConfig = {}): Layer.Layer<RailTag> => {
  const cfg = loadChainConfig()
  if (cfg.gateway === null) {
    // Fail at Layer construction, not at the first payment. Gateway does not exist on Arc
    // mainnet (Circle: "Arc (testnet only)"), so a hub configured for it there must refuse
    // to boot rather than take money it cannot settle.
    throw new Error(
      `Gateway Nanopayments is not available on ${cfg.id}. Circle publishes no Gateway ` +
        `contracts for it; use ARCADE_RAIL=eip3009.`
    )
  }
  return Layer.succeed(
    RailTag,
    makeGatewayRail({
      facilitatorUrl: cfg.gateway.facilitatorUrl,
      wallet: cfg.gateway.wallet,
      chainId: cfg.chainId,
      minValiditySeconds: cfg.gateway.minValiditySeconds,
      ...config
    })
  )
}
```

- [ ] **Step 4: Run the tests**

Run: `bunx vitest run packages/payments/test/`
Expected: PASS — including the existing conformance suite, which asserts `extra.name`/`version`/`verifyingContract` on the gateway rail (`packages/payments/test/rail.conformance.test.ts:99-124`).

- [ ] **Step 5: Commit**

```bash
bun run test && bunx tsc --noEmit
git add packages/payments/src/gateway.ts packages/payments/src/types.ts packages/payments/test/gateway-rail.test.ts
git commit -m "fix(gateway): match Circle's facilitator body, read the wallet from ChainConfig, label batch references honestly"
```

**Acceptance:** `bunx vitest run packages/payments/test/gateway-rail.test.ts packages/payments/test/rail.conformance.test.ts`

---

### Task 4: A two-rail registry — the rail becomes a property of the request

`railLayer()` (`apps/hub/src/server.ts:180-206`) reads `ARCADE_RAIL` once at boot and builds exactly one `Rail`. That is right for a hub with one rail and wrong for a hub with sessions: a session must run on Gateway while root calls from the Circle CLI keep running on EIP-3009, in the same process, at the same time. Both Layers are built at boot; the request picks.

**Files:**
- Create: `apps/hub/src/rails.ts`
- Modify: `apps/hub/src/server.ts:180-213`, `:283-287`, `:567`, `:643-651`
- Modify: `apps/hub/src/pipeline.ts:29-44`
- Test: `apps/hub/test/rails.test.ts`

**Interfaces:**
- Produces: `interface Rails { readonly default: Rail; readonly get: (name: string) => Rail | undefined; readonly names: ReadonlyArray<string> }`; `class RailsTag extends Context.Tag("@arcade/hub/Rails")<RailsTag, Rails>() {}`; `railsLayer(): Layer<RailsTag | RailTag>`; `RunJobArgs.rail?: Rail`.
- `RailTag` keeps resolving to the **default** rail, so `pipeline.ts` and every existing test compile unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// apps/hub/test/rails.test.ts
import { describe, expect, it } from "vitest"
import { Effect, Layer, Ref } from "effect"
import { makeTestRail, makeTestState } from "@arcade/payments"
import { RailsTag, makeRails } from "../src/rails.ts"

const testRail = () => makeTestRail(Effect.runSync(Ref.make(makeTestState({}))))

describe("rail registry", () => {
  it("exposes every configured rail by name", () => {
    const rails = makeRails(testRail(), [testRail()])
    expect(rails.names).toContain("test")
    expect(rails.get("test")?.name).toBe("test")
  })

  it("returns undefined for a rail this hub did not build", () => {
    const rails = makeRails(testRail(), [])
    expect(rails.get("gateway")).toBeUndefined()
  })

  it("keeps the default addressable by name as well", () => {
    const rails = makeRails(testRail(), [])
    expect(rails.default.name).toBe("test")
    expect(rails.get("test")).toBe(rails.default)
  })

  it("is provided as a service", async () => {
    const rails = makeRails(testRail(), [])
    const got = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* RailsTag
      }).pipe(Effect.provide(Layer.succeed(RailsTag, rails)))
    )
    expect(got.names).toEqual(["test"])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run apps/hub/test/rails.test.ts`
Expected: FAIL — `apps/hub/src/rails.ts` does not exist.

- [ ] **Step 3: Implement the registry**

```ts
// apps/hub/src/rails.ts
import { Context, Layer } from "effect"
import { RailTag, type Rail } from "@arcade/payments"

/**
 * More than one rail, live at once.
 *
 * `ARCADE_RAIL` used to choose the hub's single rail at boot, which made "which rail" a
 * property of the DEPLOYMENT. Sessions make it a property of the REQUEST: a buyer who has
 * deposited into Gateway wants their twenty calls batched, while the Circle CLI hitting the
 * same listing one minute later must still get a plain EIP-3009 challenge it knows how to
 * pay. Both are correct simultaneously, so both Layers are built at boot and the paid path
 * selects per call.
 *
 * The default stays whatever `ARCADE_RAIL` says (eip3009 unless told otherwise), so nothing
 * about a root call changes and no third-party client needs to know sessions exist.
 */
export interface Rails {
  readonly default: Rail
  readonly get: (name: string) => Rail | undefined
  readonly names: ReadonlyArray<string>
}

export class RailsTag extends Context.Tag("@arcade/hub/Rails")<RailsTag, Rails>() {}

export const makeRails = (fallback: Rail, others: ReadonlyArray<Rail>): Rails => {
  const byName = new Map<string, Rail>()
  byName.set(fallback.name, fallback)
  for (const r of others) if (!byName.has(r.name)) byName.set(r.name, r)
  return {
    default: fallback,
    get: (name) => byName.get(name),
    names: [...byName.keys()]
  }
}

/** Both tags from one construction, so they can never disagree about the default. */
export const railsLayerFrom = (fallback: Rail, others: ReadonlyArray<Rail>): Layer.Layer<RailsTag | RailTag> =>
  Layer.merge(Layer.succeed(RailsTag, makeRails(fallback, others)), Layer.succeed(RailTag, fallback))
```

- [ ] **Step 4: Run the test**

Run: `bunx vitest run apps/hub/test/rails.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Wire it into the hub**

Replace `railLayer()` (`apps/hub/src/server.ts:180-206`) with a builder that constructs the default exactly as before and adds Gateway when the network supports it:

```ts
const makeRail = (name: string): Rail => {
  switch (name) {
    case "gateway":
      return makeGatewayRail({
        facilitatorUrl: CHAIN.gateway!.facilitatorUrl,
        wallet: CHAIN.gateway!.wallet,
        chainId: CHAIN.chainId,
        minValiditySeconds: CHAIN.gateway!.minValiditySeconds
      })
    case "test":
      return makeTestRail(Effect.runSync(Ref.make(makeTestState({}, parsePrice(process.env["ARCADE_TEST_BALANCE"] ?? "$1000")))))
    default: {
      const pk = process.env["ARCADE_FACILITATOR_KEY"]
      if (pk === undefined) {
        console.warn(
          "[hub] ARCADE_FACILITATOR_KEY not set — generating an ephemeral facilitator key.\n" +
            "      Settlement will fail without gas. Set it to a funded Arc testnet key."
        )
      }
      return makeEip3009Rail({ facilitator: privateKeyToAccount((pk ?? generatePrivateKey()) as `0x${string}`) })
    }
  }
}

/**
 * `ARCADE_RAIL` still names the DEFAULT rail. Gateway is additionally built whenever the
 * network has Gateway contracts, because a session may ask for it by name — and is silently
 * absent where it does not exist (Arc mainnet), which is what makes `session_rail_unavailable`
 * an honest refusal rather than a crash.
 */
const railsLayer = () => {
  const fallback = makeRail(RAIL)
  const extras: Array<Rail> = []
  if (RAIL !== "gateway" && CHAIN.gateway !== null) extras.push(makeRail("gateway"))
  return railsLayerFrom(fallback, extras)
}

const AppLive = Layer.mergeAll(StoreFromEnv(), BrokerLive, railsLayer())
```

`CHAIN` is `loadChainConfig()` from Plan A Task 10; add `const CHAIN = loadChainConfig()` near `const RAIL` (`:57`). In `main`, add `const rails = yield* RailsTag` beside `const rail = yield* RailTag` (`:287`) and widen the runtime type at `:283` to `StoreTag | BrokerTag | RailTag | RailsTag`. Report both in `/healthz` (`:567`) and in the discovery documents (`:648`):

```ts
      if (path === "/healthz") {
        return json({ ok: true, rail: rail.name, rails: rails.names, network: ARC_CAIP2 })
      }
```

In `apps/hub/src/pipeline.ts`, let a caller override the rail (`:29-44`):

```ts
export interface RunJobArgs {
  readonly jobId: string
  readonly listing: PublicListing
  readonly seller: string
  readonly input: unknown
  readonly verified: VerifiedPayment
  readonly feeBps?: number
  readonly accrualId?: string
  /** Session calls settle on the session's rail; roots use the hub default from context. */
  readonly rail?: Rail
  readonly sessionId?: string
}

export const runJob = (args: RunJobArgs) =>
  Effect.gen(function* () {
    const rail = args.rail ?? (yield* RailTag)
```

- [ ] **Step 6: Run the suites and commit**

```bash
bun run test && bunx tsc --noEmit
git add apps/hub/src/rails.ts apps/hub/src/server.ts apps/hub/src/pipeline.ts apps/hub/test/rails.test.ts
git commit -m "feat(hub): build both rails at boot and select per request"
```

**Acceptance:** `bunx vitest run apps/hub/test/ && curl -s localhost:8787/healthz | grep -q '"rails"'`

---

### Task 5: The `sessions` table and store methods

**Merge notes.** `apps/hub/src/store.ts` / `store-sqlite.ts` order is **A (`tree_reservations`) → C (`pay_tests`) → D (`erc8004_docs`) → F (this task, `sessions`) → H (`statsSource`) → G**. Four independent tables and four independent `StoreState` keys; append to `SCHEMA`, `empty()`/`emptyState()` and `initial` rather than rewriting them. `packages/core/src/receipt.ts` order is **A → C → F**: `sessionId` and `settleRefKind` go below A's tree fields and C's `canary`, and both are `Schema.optional` (see Plan A's Global Constraints, "Receipt field ownership").

**Files:**
- Create: `packages/core/src/session.ts`
- Modify: `packages/core/src/errors.ts`, `packages/core/src/index.ts`
- Modify: `apps/hub/src/store.ts:69-90`, `apps/hub/src/store-sqlite.ts:42-60`, `:149-160`, `:196`
- Test: `apps/hub/test/sessions-store.bun.test.ts`

**Interfaces:**
- Produces: `Session` (`{id, buyer, budgetAtomic, spentAtomic, rail, openedAtMs, closedAtMs?}`), `SESSION_HEADER = "x-arcade-session"`, errors `SessionNotFound`, `SessionClosed`, `SessionBudgetExceeded`, `SessionRailUnavailable`; store methods `openSession`, `getSession`, `putSession`, `allSessions`.
- Table: `sessions(id TEXT PRIMARY KEY, buyer TEXT NOT NULL, budget_atomic TEXT NOT NULL, spent_atomic TEXT NOT NULL, rail TEXT NOT NULL, opened_at_ms INTEGER NOT NULL, closed_at_ms INTEGER, json TEXT NOT NULL)`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/hub/test/sessions-store.bun.test.ts
import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import { Session } from "@arcade/core"
import { openSqliteStore } from "../src/store-sqlite.ts"

const tmp = () => `/tmp/arcade-sessions-${crypto.randomUUID()}.db`

const session = (over: Partial<Session> = {}) =>
  Session.make({
    id: "ses_abc",
    buyer: "0x1111111111111111111111111111111111111111",
    budgetAtomic: 1_000_000n,
    spentAtomic: 0n,
    rail: "gateway",
    openedAtMs: 1,
    ...over
  })

describe("session persistence", () => {
  it("survives a restart with atomic amounts intact", async () => {
    const path = tmp()
    const a = openSqliteStore(path, "boot_a")
    await Effect.runPromise(a.store.putSession(session({ spentAtomic: 123_456n })))
    a.close()

    const b = openSqliteStore(path, "boot_b")
    const got = await Effect.runPromise(b.store.getSession("ses_abc"))
    expect(got?.spentAtomic).toBe(123_456n)
    expect(got?.budgetAtomic).toBe(1_000_000n)
    expect(got?.rail).toBe("gateway")
    b.close()
  })

  it("records a close without losing the spend", async () => {
    const path = tmp()
    const s = openSqliteStore(path, "boot_a")
    await Effect.runPromise(s.store.putSession(session()))
    await Effect.runPromise(s.store.putSession(session({ spentAtomic: 50n, closedAtMs: 99 })))
    const got = await Effect.runPromise(s.store.getSession("ses_abc"))
    expect(got?.closedAtMs).toBe(99)
    expect(got?.spentAtomic).toBe(50n)
    s.close()
  })

  it("returns undefined for an unknown session rather than throwing", async () => {
    const s = openSqliteStore(tmp(), "boot_a")
    expect(await Effect.runPromise(s.store.getSession("ses_nope"))).toBeUndefined()
    s.close()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test apps/hub/test/sessions-store.bun.test.ts`
Expected: FAIL — `Session` is not exported and `putSession` does not exist.

- [ ] **Step 3: Implement the schema and errors**

```ts
// packages/core/src/session.ts
import { Schema } from "effect"
import { RailName } from "./receipt.ts"

/**
 * A session is a budget with a rail attached.
 *
 * It is deliberately NOT a credit line and not an escrow: no money moves when a session
 * opens, and closing one settles nothing that was not already settled per job. What it buys
 * is (a) a declared ceiling the hub enforces before any work starts, and (b) permission to
 * route these calls over Gateway so N settlements become one batch. Every guarantee the
 * per-call path makes still holds inside a session — a failed job settles nothing.
 *
 * `spentAtomic` counts SETTLED spend only. In-flight reservations live in the hub process
 * (see `apps/hub/src/sessions.ts`), because a reservation that outlives the process it
 * belongs to would permanently shrink a budget after a restart, and the boot reaper already
 * fails those jobs.
 */
export const SESSION_HEADER = "x-arcade-session"

export class Session extends Schema.Class<Session>("Session")({
  id: Schema.String,
  /** The address that must sign every authorization spent against this session. */
  buyer: Schema.String,
  budgetAtomic: Schema.BigIntFromSelf,
  spentAtomic: Schema.BigIntFromSelf,
  rail: RailName,
  openedAtMs: Schema.Number,
  closedAtMs: Schema.optional(Schema.Number)
}) {}

/** One line of a session receipt. */
export class SessionCall extends Schema.Class<SessionCall>("SessionCall")({
  jobId: Schema.String,
  skillId: Schema.String,
  priceAtomic: Schema.BigIntFromSelf,
  settled: Schema.Boolean,
  settleRef: Schema.optional(Schema.String),
  settleRefKind: Schema.optional(Schema.Literal("onchain", "gateway-batch")),
  createdAtMs: Schema.Number
}) {}

export class SessionReceipt extends Schema.Class<SessionReceipt>("SessionReceipt")({
  sessionId: Schema.String,
  buyer: Schema.String,
  rail: RailName,
  network: Schema.String,
  budgetAtomic: Schema.BigIntFromSelf,
  spentAtomic: Schema.BigIntFromSelf,
  calls: Schema.Array(SessionCall),
  settledCalls: Schema.Int,
  /** Distinct settlement references across the session — one for a closed Gateway batch. */
  settlementRefs: Schema.Array(Schema.String),
  openedAtMs: Schema.Number,
  closedAtMs: Schema.Number
}) {}
```

In `packages/core/src/errors.ts` add, in the existing `Data.TaggedError` style:

```ts
export class SessionNotFound extends Data.TaggedError("SessionNotFound")<{ sessionId: string }> {}
export class SessionClosed extends Data.TaggedError("SessionClosed")<{ sessionId: string; closedAtMs: number }> {}
export class SessionBudgetExceeded extends Data.TaggedError("SessionBudgetExceeded")<{
  sessionId: string
  budgetAtomic: bigint
  spentAtomic: bigint
  requestedAtomic: bigint
}> {}
export class SessionRailUnavailable extends Data.TaggedError("SessionRailUnavailable")<{ rail: string }> {}
```

Export `./session.ts` from `packages/core/src/index.ts`.

- [ ] **Step 4: Add the store methods**

`apps/hub/src/store.ts`: add to `StoreState` `readonly sessions: Map<string, Session>`, to `empty()`/`emptyState()` `sessions: new Map()`, to the `Store` interface:

```ts
  readonly putSession: (s: Session) => Effect.Effect<void>
  readonly getSession: (id: string) => Effect.Effect<Session | undefined>
  readonly allSessions: Effect.Effect<ReadonlyArray<Session>>
```

and to `makeStore`:

```ts
  putSession: (s) =>
    Ref.update(ref, (st) => {
      const sessions = new Map(st.sessions)
      sessions.set(s.id, s)
      return { ...st, sessions }
    }),

  getSession: (id) => Effect.map(Ref.get(ref), (st) => st.sessions.get(id)),

  allSessions: Effect.map(Ref.get(ref), (st) => [...st.sessions.values()]),
```

`apps/hub/src/store-sqlite.ts`: extend `SCHEMA` (`:42-60`):

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  buyer TEXT NOT NULL,
  budget_atomic TEXT NOT NULL,
  spent_atomic TEXT NOT NULL,
  rail TEXT NOT NULL,
  opened_at_ms INTEGER NOT NULL,
  closed_at_ms INTEGER,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_buyer ON sessions(buyer);
```

Amounts are stored as TEXT because atomic units are `bigint` and sqlite INTEGER is 64-bit signed — `toJson`/`fromJson` (`:66-79`) already tag bigints, and the columns exist for querying, with `json` remaining authoritative. Load them at boot beside receipts (`:125-131`), add the write-through statement beside `putRatingStmt` (`:157`), and mirror `putSession`:

```ts
  const putSessionStmt = db.query(
    `INSERT INTO sessions (id, buyer, budget_atomic, spent_atomic, rail, opened_at_ms, closed_at_ms, json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET spent_atomic = excluded.spent_atomic,
       closed_at_ms = excluded.closed_at_ms, json = excluded.json`
  )
```

```ts
    putSession: (s) =>
      Effect.tap(inner.putSession(s), () =>
        Effect.sync(() =>
          putSessionStmt.run(
            s.id, s.buyer, s.budgetAtomic.toString(), s.spentAtomic.toString(),
            s.rail, s.openedAtMs, s.closedAtMs ?? null, toJson(s)
          )
        )
      ),
```

- [ ] **Step 5: Run the test**

Run: `bun test apps/hub/test/sessions-store.bun.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
bun run test && bunx tsc --noEmit
git add packages/core/src/session.ts packages/core/src/errors.ts packages/core/src/index.ts apps/hub/src/store.ts apps/hub/src/store-sqlite.ts apps/hub/test/sessions-store.bun.test.ts
git commit -m "feat(hub): persist sessions — budget, spend, rail, open/close"
```

**Acceptance:** `bun test apps/hub/test/sessions-store.bun.test.ts`

---

### Task 6: Session lifecycle — open, reserve, commit, close

**Files:**
- Create: `apps/hub/src/sessions.ts`
- Test: `apps/hub/test/sessions.test.ts`

**Interfaces:**
- Produces: `newSessionId()`; `openSession({buyer, budgetAtomic, rail, rails})`; `reserve(session, priceAtomic)` → `Effect<void, SessionClosed | SessionBudgetExceeded>`; `release(sessionId, priceAtomic)`; `commit(sessionId, priceAtomic)`; `sessionReceipt(session, receipts, network)` → `SessionReceipt`; `inFlightAtomic(sessionId)`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/hub/test/sessions.test.ts
import { describe, expect, it, beforeEach } from "vitest"
import { Effect } from "effect"
import { Receipt, Session, parsePrice } from "@arcade/core"
import { __resetInFlight, commit, inFlightAtomic, release, reserve, sessionReceipt } from "../src/sessions.ts"

const s = (over: Partial<Session> = {}) =>
  Session.make({
    id: "ses_1",
    buyer: "0xbuyer",
    budgetAtomic: parsePrice("$1.00"),
    spentAtomic: 0n,
    rail: "gateway",
    openedAtMs: 1,
    ...over
  })

beforeEach(() => __resetInFlight())

describe("session budget", () => {
  it("admits a call that fits", async () => {
    await Effect.runPromise(reserve(s(), parsePrice("$0.25")))
    expect(inFlightAtomic("ses_1")).toBe(parsePrice("$0.25"))
  })

  it("refuses the call that would cross the ceiling, counting in-flight work", async () => {
    const session = s()
    await Effect.runPromise(reserve(session, parsePrice("$0.60")))
    const exit = await Effect.runPromiseExit(reserve(session, parsePrice("$0.60")))
    expect(exit._tag).toBe("Failure")
    expect(JSON.stringify(exit)).toContain("SessionBudgetExceeded")
  })

  it("frees the reservation when a job does not settle, so the budget is not silently burned", async () => {
    const session = s()
    await Effect.runPromise(reserve(session, parsePrice("$0.60")))
    release("ses_1", parsePrice("$0.60"))
    expect(inFlightAtomic("ses_1")).toBe(0n)
    await Effect.runPromise(reserve(session, parsePrice("$0.60")))
  })

  it("moves a settled reservation from in-flight to spent", async () => {
    const session = s()
    await Effect.runPromise(reserve(session, parsePrice("$0.30")))
    const next = commit(session, parsePrice("$0.30"))
    expect(next.spentAtomic).toBe(parsePrice("$0.30"))
    expect(inFlightAtomic("ses_1")).toBe(0n)
  })

  it("refuses every call on a closed session", async () => {
    const exit = await Effect.runPromiseExit(reserve(s({ closedAtMs: 2 }), 1n))
    expect(JSON.stringify(exit)).toContain("SessionClosed")
  })

  it("counts only settled calls as spend in the receipt, and dedupes the batch reference", () => {
    const r = (jobId: string, settled: boolean, ref?: string) =>
      Receipt.make({
        jobId, skillId: "demo", skillVersion: "1.0.0", buyer: "0xbuyer", seller: "0xseller",
        priceAtomic: parsePrice("$0.10"), sellerAtomic: parsePrice("$0.095"), feeAtomic: parsePrice("$0.005"),
        feeBps: 500, rail: "gateway", network: "eip155:5042002", latencyMs: 10, settled,
        reason: settled ? "ok" : "output failed schema", createdAtMs: 5,
        ...(ref === undefined ? {} : { settleTx: ref }),
        sessionId: "ses_1"
      })
    const receipt = sessionReceipt(
      s({ spentAtomic: parsePrice("$0.20"), closedAtMs: 9 }),
      [r("job_a", true, "0xbatch"), r("job_b", true, "0xbatch"), r("job_c", false)],
      "eip155:5042002"
    )
    expect(receipt.calls).toHaveLength(3)
    expect(receipt.settledCalls).toBe(2)
    expect(receipt.settlementRefs).toEqual(["0xbatch"])
    expect(receipt.spentAtomic).toBe(parsePrice("$0.20"))
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run apps/hub/test/sessions.test.ts`
Expected: FAIL — `apps/hub/src/sessions.ts` does not exist.

- [ ] **Step 3: Implement**

```ts
// apps/hub/src/sessions.ts
import { Effect } from "effect"
import {
  Session,
  SessionCall,
  SessionClosed,
  SessionBudgetExceeded,
  SessionReceipt,
  type Receipt
} from "@arcade/core"

/**
 * Session accounting.
 *
 * Two numbers, deliberately kept apart. `spentAtomic` is durable and counts only what
 * SETTLED — it is the number a buyer can check against the chain. In-flight reservations are
 * process-local: a job that is dispatched but not yet terminal must still count against the
 * ceiling, or twenty concurrent calls each see an empty budget and the ceiling means nothing.
 *
 * Keeping reservations out of sqlite is a choice, not an oversight. A reservation that
 * survived a restart would permanently shrink a budget nobody ever spent, and the boot
 * reaper (`store-sqlite.ts:100-120`) already fails every job that was in flight — so after a
 * restart the honest state is exactly "spent, and nothing pending".
 */

const inFlight = new Map<string, bigint>()

export const inFlightAtomic = (sessionId: string): bigint => inFlight.get(sessionId) ?? 0n

/** Exposed for tests. */
export const __resetInFlight = (): void => inFlight.clear()

export const newSessionId = (): string => `ses_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`

export const reserve = (session: Session, priceAtomic: bigint) =>
  Effect.gen(function* () {
    if (session.closedAtMs !== undefined) {
      return yield* new SessionClosed({ sessionId: session.id, closedAtMs: session.closedAtMs })
    }
    const pending = inFlightAtomic(session.id)
    if (session.spentAtomic + pending + priceAtomic > session.budgetAtomic) {
      return yield* new SessionBudgetExceeded({
        sessionId: session.id,
        budgetAtomic: session.budgetAtomic,
        spentAtomic: session.spentAtomic + pending,
        requestedAtomic: priceAtomic
      })
    }
    inFlight.set(session.id, pending + priceAtomic)
  })

export const release = (sessionId: string, priceAtomic: bigint): void => {
  const next = inFlightAtomic(sessionId) - priceAtomic
  if (next <= 0n) inFlight.delete(sessionId)
  else inFlight.set(sessionId, next)
}

/** Settled: the reservation becomes durable spend. Returns the row to persist. */
export const commit = (session: Session, priceAtomic: bigint): Session => {
  release(session.id, priceAtomic)
  return Session.make({ ...session, spentAtomic: session.spentAtomic + priceAtomic })
}

export const sessionReceipt = (
  session: Session,
  receipts: ReadonlyArray<Receipt>,
  network: string
): SessionReceipt => {
  const calls = receipts.map((r) =>
    SessionCall.make({
      jobId: r.jobId,
      skillId: r.skillId,
      priceAtomic: r.priceAtomic,
      settled: r.settled,
      ...(r.settleTx === undefined ? {} : { settleRef: r.settleTx }),
      ...(r.settleRefKind === undefined ? {} : { settleRefKind: r.settleRefKind }),
      createdAtMs: r.createdAtMs
    })
  )
  // Distinct, because the headline claim is "twenty calls, ONE settlement" and the only
  // honest way to make it is to count the references rather than assert the number.
  const refs = [...new Set(calls.filter((c) => c.settled && c.settleRef !== undefined).map((c) => c.settleRef!))]
  return SessionReceipt.make({
    sessionId: session.id,
    buyer: session.buyer,
    rail: session.rail,
    network,
    budgetAtomic: session.budgetAtomic,
    spentAtomic: session.spentAtomic,
    calls,
    settledCalls: calls.filter((c) => c.settled).length,
    settlementRefs: refs,
    openedAtMs: session.openedAtMs,
    closedAtMs: session.closedAtMs ?? Date.now()
  })
}
```

Add `sessionId` and `settleRefKind` to `Receipt` (`packages/core/src/receipt.ts`), both optional so Plan A's tree fields merge cleanly:

```ts
  /** Set when this call was made inside a session; absent for ordinary root calls. */
  sessionId: Schema.optional(Schema.String),
  /** Whether `settleTx` is an Arc transaction hash or a Gateway batch reference. */
  settleRefKind: Schema.optional(Schema.Literal("onchain", "gateway-batch")),
```

- [ ] **Step 4: Run the test**

Run: `bunx vitest run apps/hub/test/sessions.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
bun run test && bunx tsc --noEmit
git add apps/hub/src/sessions.ts packages/core/src/receipt.ts apps/hub/test/sessions.test.ts
git commit -m "feat(hub): session budget accounting with in-flight reservations and a session receipt"
```

**Acceptance:** `bunx vitest run apps/hub/test/sessions.test.ts`

---

### Task 7: `POST /sessions` and `POST /sessions/:id/close`

**Files:**
- Modify: `apps/hub/src/server.ts` (new routes before the paid endpoint at `:769`)
- Test: `apps/hub/test/session-endpoints.test.ts`

**Interfaces:**
- Produces:
  - `POST /sessions` body `{buyer, budgetUsd, rail?}` → `201 {session_id, session_token, rail, network, budget, note}` — exactly the six keys Step 3 emits. Refuses `400 input_invalid` on a malformed buyer or budget, `409 session_rail_unavailable` when the named rail is not built on this hub.
  - `POST /sessions/:id/close` (header `x-session-token`) → `200 SessionReceipt`. `404 session_not_found`, `409 session_closed`.
  - `GET /sessions/:id` (header `x-session-token`) → `200 {session_id, rail, budget, spent, remaining, calls, closed}`, where each element of `calls` is a `SessionCall`: `{jobId, skillId, priceAtomic, settled, settleRef?, settleRefKind?, createdAtMs}`. **This is the shape Plan H's `/buyer` dashboard renders** — there is no `sessionId`, no `budgetAtomic`, no `spentAtomic` and no `settleTx` on this route; the snake_case id and the `settleRef`/`settleRefKind` pair are deliberate, because a Gateway batch reference is not an Arc transaction hash and must never be linked as one.
- Consumes: `RailsTag` (Task 4), `sessions.ts` (Task 6), the existing `jobToken` HMAC pattern (`server.ts:301-315`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/hub/test/session-endpoints.test.ts
import { describe, expect, it } from "vitest"
import { Effect, Ref } from "effect"
import { makeTestRail, makeTestState } from "@arcade/payments"
import { makeRails } from "../src/rails.ts"
import { handleSessionRoute } from "../src/server-sessions.ts"
import { makeStore } from "../src/store.ts"
import { emptyStateForTests } from "../src/store.ts"

const store = () => makeStore(Effect.runSync(Ref.make(emptyStateForTests())))
const rails = makeRails(makeTestRail(Effect.runSync(Ref.make(makeTestState({})))), [])
const token = (id: string) => `token-for-${id}`

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  })

describe("session endpoints", () => {
  it("opens a session and returns an id and a token", async () => {
    const s = store()
    const res = await handleSessionRoute(post("/sessions", { buyer: `0x${"1".repeat(40)}`, budgetUsd: "1.00" }), s, rails, token)
    expect(res!.status).toBe(201)
    const body = await res!.json()
    expect(body.session_id).toMatch(/^ses_/)
    expect(body.session_token).toBe(`token-for-${body.session_id}`)
    expect(body.rail).toBe("test")
  })

  it("refuses a rail this hub did not build", async () => {
    const res = await handleSessionRoute(post("/sessions", { buyer: `0x${"1".repeat(40)}`, budgetUsd: "1.00", rail: "gateway" }), store(), rails, token)
    expect(res!.status).toBe(409)
    expect((await res!.json()).error).toBe("session_rail_unavailable")
  })

  it("refuses a malformed budget before creating anything", async () => {
    const s = store()
    const res = await handleSessionRoute(post("/sessions", { buyer: `0x${"1".repeat(40)}`, budgetUsd: "-3" }), s, rails, token)
    expect(res!.status).toBe(400)
    expect(await Effect.runPromise(s.allSessions)).toHaveLength(0)
  })

  it("closes a session and returns a receipt listing its calls", async () => {
    const s = store()
    const opened = await (await handleSessionRoute(post("/sessions", { buyer: `0x${"1".repeat(40)}`, budgetUsd: "1.00" }), s, rails, token))!.json()
    const res = await handleSessionRoute(
      post(`/sessions/${opened.session_id}/close`, {}, { "x-session-token": opened.session_token }),
      s, rails, token
    )
    expect(res!.status).toBe(200)
    const receipt = await res!.json()
    expect(receipt.sessionId).toBe(opened.session_id)
    expect(receipt.calls).toEqual([])
    expect(receipt.settlementRefs).toEqual([])
  })

  it("refuses a close without the token — the receipt names what a buyer bought", async () => {
    const s = store()
    const opened = await (await handleSessionRoute(post("/sessions", { buyer: `0x${"1".repeat(40)}`, budgetUsd: "1.00" }), s, rails, token))!.json()
    const res = await handleSessionRoute(post(`/sessions/${opened.session_id}/close`, {}), s, rails, token)
    expect(res!.status).toBe(404)
  })

  it("refuses a second close", async () => {
    const s = store()
    const opened = await (await handleSessionRoute(post("/sessions", { buyer: `0x${"1".repeat(40)}`, budgetUsd: "1.00" }), s, rails, token))!.json()
    const h = { "x-session-token": opened.session_token }
    await handleSessionRoute(post(`/sessions/${opened.session_id}/close`, {}, h), s, rails, token)
    const res = await handleSessionRoute(post(`/sessions/${opened.session_id}/close`, {}, h), s, rails, token)
    expect(res!.status).toBe(409)
    expect((await res!.json()).error).toBe("session_closed")
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run apps/hub/test/session-endpoints.test.ts`
Expected: FAIL — `apps/hub/src/server-sessions.ts` does not exist.

- [ ] **Step 3: Implement the routes in their own module**

`server.ts` is 930 lines and its `fetch` handler is already long; a separate module keeps the routes testable without booting Bun.serve — the same reason `openapi.ts` and `splitter.ts` are separate.

```ts
// apps/hub/src/server-sessions.ts
import { Effect } from "effect"
import { ARC_CAIP2, Session, formatPrice, parsePrice, timingSafeTokenOk } from "@arcade/core"
import type { Store } from "./store.ts"
import type { Rails } from "./rails.ts"
import { newSessionId, sessionReceipt } from "./sessions.ts"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2), {
    status,
    headers: { "content-type": "application/json" }
  })

/**
 * Sessions are opened by anyone and spent only by the buyer who signed for them.
 *
 * Opening costs nothing and moves nothing, so it needs no authentication — the ceiling it
 * declares is only ever enforced against a payer the paid path RECOVERS from a signature.
 * Reading or closing one is different: the receipt lists what this buyer bought, which is
 * exactly the privacy the public feed protects by omitting `jobId` and `buyer`
 * (`server.ts:690-693`). So the token gates the read, and it is the same derived-HMAC shape
 * as `jobToken` — nothing to store, nothing to expire.
 */
export const handleSessionRoute = async (
  req: Request,
  store: Store,
  rails: Rails,
  sessionToken: (id: string) => string
): Promise<Response | undefined> => {
  const url = new URL(req.url)
  const path = url.pathname

  if (path === "/sessions" && req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as {
      buyer?: string
      budgetUsd?: string | number
      rail?: string
    }
    if (typeof body.buyer !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(body.buyer)) {
      return json({ error: "input_invalid", detail: "buyer must be a 20-byte hex address" }, 400)
    }
    let budgetAtomic: bigint
    try {
      budgetAtomic = parsePrice(`$${String(body.budgetUsd ?? "")}`)
    } catch {
      return json({ error: "input_invalid", detail: "budgetUsd must be a positive USD amount" }, 400)
    }
    if (budgetAtomic <= 0n) {
      return json({ error: "input_invalid", detail: "budgetUsd must be greater than zero" }, 400)
    }

    const railName = body.rail ?? rails.default.name
    const rail = rails.get(railName)
    if (rail === undefined) {
      return json(
        {
          error: "session_rail_unavailable",
          detail: `this hub serves ${rails.names.join(", ")}; ${railName} is not built here`,
          rails: rails.names
        },
        409
      )
    }

    const session = Session.make({
      id: newSessionId(),
      buyer: body.buyer,
      budgetAtomic,
      spentAtomic: 0n,
      rail: rail.name,
      openedAtMs: Date.now()
    })
    await Effect.runPromise(store.putSession(session))
    return json(
      {
        session_id: session.id,
        session_token: sessionToken(session.id),
        rail: rail.name,
        network: ARC_CAIP2,
        budget: formatPrice(budgetAtomic),
        // Not a promise, a hint: an authorization signed for this session is valid for
        // Gateway's window, so a session left open past it stops being spendable.
        note:
          rail.name === "gateway"
            ? "Deposit USDC into the Gateway Wallet before calling; payments are gasless from that balance."
            : "Each call settles individually on chain."
      },
      201
    )
  }

  const close = /^\/sessions\/(ses_[A-Za-z0-9]+)\/close$/.exec(path)
  const read = /^\/sessions\/(ses_[A-Za-z0-9]+)$/.exec(path)
  const match = close ?? read
  if (match === null) return undefined
  if (close !== null && req.method !== "POST") return undefined
  if (read !== null && req.method !== "GET") return undefined

  const id = match[1]!
  const presented = req.headers.get("x-session-token") ?? url.searchParams.get("token")
  // 404 rather than 401 on a bad token: a distinguishable 401 tells a prober that this
  // session id exists, which is the same enumeration the receipt feed already refuses.
  if (!timingSafeTokenOk(sessionToken(id), presented)) return json({ error: "session_not_found" }, 404)

  const session = await Effect.runPromise(store.getSession(id))
  if (session === undefined) return json({ error: "session_not_found" }, 404)

  const receipts = (await Effect.runPromise(store.allReceipts)).filter((r) => r.sessionId === id)

  if (read !== null) {
    return json({
      session_id: id,
      rail: session.rail,
      budget: formatPrice(session.budgetAtomic),
      spent: formatPrice(session.spentAtomic),
      remaining: formatPrice(session.budgetAtomic - session.spentAtomic),
      calls: receipts.length,
      closed: session.closedAtMs !== undefined
    })
  }

  if (session.closedAtMs !== undefined) {
    return json({ error: "session_closed", closedAtMs: session.closedAtMs }, 409)
  }

  const closed = Session.make({ ...session, closedAtMs: Date.now() })
  await Effect.runPromise(store.putSession(closed))
  return json(sessionReceipt(closed, receipts, ARC_CAIP2))
}
```

Add `timingSafeTokenOk(expected, presented)` to `packages/core` by lifting the constant-time comparison already written inline at `server.ts:305-313`, and use it in both places so there is one implementation. Export `emptyStateForTests` from `apps/hub/src/store.ts` (it is the existing private `empty()`).

Wire it into `server.ts` immediately before the paid endpoint (`:769`):

```ts
      const sessionRes = await handleSessionRoute(req, store, rails, sessionToken)
      if (sessionRes !== undefined) return sessionRes
```

with `const sessionToken = (id: string) => createHmac("sha256", hubSecret).update(`arcade-session:${id}`).digest("hex").slice(0, 32)` beside `jobToken` (`:303`).

- [ ] **Step 4: Run the test**

Run: `bunx vitest run apps/hub/test/session-endpoints.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
bun run test && bunx tsc --noEmit
git add apps/hub/src/server-sessions.ts apps/hub/src/server.ts apps/hub/src/store.ts packages/core/src/index.ts apps/hub/test/session-endpoints.test.ts
git commit -m "feat(hub): POST /sessions and POST /sessions/:id/close with a session receipt"
```

**Acceptance:** `bunx vitest run apps/hub/test/session-endpoints.test.ts`

---

### Task 8: The paid path honors `x-arcade-session`

**Merge notes.** `apps/hub/src/server.ts` land order is **A → C → D → E → F (this task) → H → G**, and Plan A Task 5 holds the canonical order of checks inside the paid branch. Rebase before starting: A's input gate and lineage block, C's `delistRefusal`, D's routes and `AppLive`, and E's `ensWatch` are all already in the file. Add `railsLayer()` to the *existing* `Layer.mergeAll` rather than rewriting it, and rewrite `rail.challenge`/`rail.verify` to `callRail.…` in place. `apps/hub/src/pipeline.ts` order is **A → C → D → F**: `RunJobArgs` gains `rail`/`sessionId` alongside A's `lineage`, C's `canary` and D's `attest`, and the session commit/release joins D's attest hand-off in the best-effort block *after* `store.putReceipt`.

**Files:**
- Modify: `apps/hub/src/server.ts:769-859`
- Modify: `apps/hub/src/pipeline.ts:72-92`, `:141-151`
- Test: `apps/hub/test/session-call.test.ts`

**Interfaces:**
- Produces: on the paid endpoint, when `x-arcade-session` is present — the session's rail issues the challenge and verifies; `verified.payer` must equal `session.buyer` (else `403 session_buyer_mismatch`); the price is reserved before dispatch (`402 session_budget_exceeded` with the remaining budget); the receipt carries `sessionId`; settlement commits the reservation, any other outcome releases it.
- Absent the header, behavior is byte-identical to today: default rail, no session.

- [ ] **Step 1: Write the failing test**

```ts
// apps/hub/test/session-call.test.ts
import { describe, expect, it, beforeEach } from "vitest"
import { Effect, Ref } from "effect"
import { Receipt, Session, parsePrice } from "@arcade/core"
import { makeTestRail, makeTestState } from "@arcade/payments"
import { makeRails } from "../src/rails.ts"
import { __resetInFlight, commit, inFlightAtomic, release, reserve } from "../src/sessions.ts"
import { resolveSessionForCall } from "../src/server-sessions.ts"
import { emptyStateForTests, makeStore } from "../src/store.ts"

const rails = makeRails(makeTestRail(Effect.runSync(Ref.make(makeTestState({})))), [])
const BUYER = `0x${"1".repeat(40)}`

const withSession = async (over: Partial<Session> = {}) => {
  const store = makeStore(Effect.runSync(Ref.make(emptyStateForTests())))
  const session = Session.make({
    id: "ses_x", buyer: BUYER, budgetAtomic: parsePrice("$0.50"), spentAtomic: 0n,
    rail: "test", openedAtMs: 1, ...over
  })
  await Effect.runPromise(store.putSession(session))
  return { store, session }
}

beforeEach(() => __resetInFlight())

describe("session on the paid path", () => {
  it("returns the session's rail for a known session", async () => {
    const { store, session } = await withSession()
    const r = await resolveSessionForCall("ses_x", store, rails)
    expect(r.ok).toBe(true)
    expect(r.ok && r.rail.name).toBe("test")
    expect(r.ok && r.session.id).toBe(session.id)
  })

  it("refuses an unknown session id with a stable code", async () => {
    const { store } = await withSession()
    const r = await resolveSessionForCall("ses_nope", store, rails)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toBe("session_not_found")
  })

  it("refuses a closed session", async () => {
    const { store } = await withSession({ closedAtMs: 5 })
    const r = await resolveSessionForCall("ses_x", store, rails)
    expect(!r.ok && r.error).toBe("session_closed")
  })

  it("refuses a rail the hub no longer builds, rather than falling back silently", async () => {
    const { store } = await withSession({ rail: "gateway" })
    const r = await resolveSessionForCall("ses_x", store, rails)
    expect(!r.ok && r.error).toBe("session_rail_unavailable")
  })

  it("refuses a payer who is not the session's buyer", async () => {
    const { session } = await withSession()
    expect(session.buyer.toLowerCase()).not.toBe(`0x${"2".repeat(40)}`)
  })

  it("frees the reservation on a non-settling outcome", async () => {
    const { session } = await withSession()
    await Effect.runPromise(reserve(session, parsePrice("$0.30")))
    release(session.id, parsePrice("$0.30"))
    expect(inFlightAtomic(session.id)).toBe(0n)
  })

  it("commits the reservation on settlement", async () => {
    const { session } = await withSession()
    await Effect.runPromise(reserve(session, parsePrice("$0.30")))
    expect(commit(session, parsePrice("$0.30")).spentAtomic).toBe(parsePrice("$0.30"))
  })

  it("stamps the receipt with the session id", () => {
    const r = Receipt.make({
      jobId: "job_1", skillId: "demo", skillVersion: "1.0.0", buyer: BUYER, seller: "0xs",
      priceAtomic: 1n, sellerAtomic: 1n, feeAtomic: 0n, feeBps: 0, rail: "test",
      network: "eip155:5042002", latencyMs: 1, settled: true, reason: "ok", createdAtMs: 1,
      sessionId: "ses_x"
    })
    expect(r.sessionId).toBe("ses_x")
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run apps/hub/test/session-call.test.ts`
Expected: FAIL — `resolveSessionForCall` is not exported.

- [ ] **Step 3: Implement the resolver**

Append to `apps/hub/src/server-sessions.ts`:

```ts
export type SessionResolution =
  | { readonly ok: true; readonly session: Session; readonly rail: Rail }
  | { readonly ok: false; readonly error: string; readonly status: number; readonly detail: string }

/**
 * Turn an `x-arcade-session` header into a rail and a budget, or into a refusal with a
 * stable code. Every branch is a REFUSAL, never a fallback: a session that names a rail this
 * hub cannot serve must not quietly settle on a different one, because the buyer chose that
 * rail (and may have deposited into it) on purpose.
 */
export const resolveSessionForCall = async (
  sessionId: string,
  store: Store,
  rails: Rails
): Promise<SessionResolution> => {
  const session = await Effect.runPromise(store.getSession(sessionId))
  if (session === undefined) {
    return { ok: false, error: "session_not_found", status: 404, detail: `no session ${sessionId}` }
  }
  if (session.closedAtMs !== undefined) {
    return { ok: false, error: "session_closed", status: 409, detail: "this session is closed" }
  }
  const rail = rails.get(session.rail)
  if (rail === undefined) {
    return {
      ok: false,
      error: "session_rail_unavailable",
      status: 409,
      detail: `session rail ${session.rail} is not served by this hub (${rails.names.join(", ")})`
    }
  }
  return { ok: true, session, rail }
}
```

- [ ] **Step 4: Use it on the paid endpoint**

In `apps/hub/src/server.ts`, inside the `callMatch` block (`:771`), at **position 3 of Plan A
Task 5's canonical sequence** — after Plan A's input gate (which has already parsed the body
and returned `400 input_invalid` for a body the listing could not serve) and after Plan C's
`listing_delisted` refusal, and *before* Plan A's `resolveLineage` call, so a sub-hire inside
a session is still checked for cycles and depth:

```ts
        // The rail is per call. Absent this header nothing below changes — the default rail
        // issues the challenge, exactly as it does for the Circle CLI.
        const sessionId = req.headers.get(SESSION_HEADER)
        let session: Session | undefined
        let callRail = rail
        if (sessionId !== null) {
          const resolved = await resolveSessionForCall(sessionId, store, rails)
          if (!resolved.ok) return json({ error: resolved.error, detail: resolved.detail }, resolved.status)
          session = resolved.session
          callRail = resolved.rail
        }
```

Replace every `rail.challenge(...)` / `rail.verify(...)` in this block (`:784`, `:800`, `:802`) with `callRail.…`. After `const verified = verifiedE.right` (`:806`), add the buyer and budget gates:

```ts
        if (session !== undefined) {
          // The session declares whose budget this is; the SIGNATURE decides whose money it
          // is. Binding them means a leaked session id buys nothing — a stranger would still
          // have to sign as the session's buyer.
          if (verified.payer.toLowerCase() !== session.buyer.toLowerCase()) {
            return json(
              { error: "session_buyer_mismatch", detail: "this session belongs to a different buyer" },
              403
            )
          }
          const reserved = await run(reserve(session, priceAtomic).pipe(Effect.either))
          if (reserved._tag === "Left") {
            const e = reserved.left
            return json(
              {
                error: e._tag === "SessionClosed" ? "session_closed" : "session_budget_exceeded",
                detail:
                  e._tag === "SessionClosed"
                    ? "this session is closed"
                    : `budget ${formatPrice(session.budgetAtomic)}, spent ${formatPrice(session.spentAtomic)}, this call ${formatPrice(priceAtomic)}`,
                remaining: formatPrice(session.budgetAtomic - session.spentAtomic)
              },
              e._tag === "SessionClosed" ? 409 : 402
            )
          }
        }
```

Pass the rail and session into `runJob` (`:835`) and settle the accounting when it finishes:

```ts
        void run(
          runJob({
            jobId, listing, seller, input, verified, feeBps: FEE_BPS, accrualId,
            ...(session === undefined ? {} : { rail: callRail, sessionId: session.id })
          }).pipe(
            Effect.tap(({ receipt }) =>
              Effect.gen(function* () {
                if (session === undefined) return
                // Settled work becomes durable spend; everything else gives the budget back.
                // A failed job must leave the buyer's balance AND their budget untouched.
                if (receipt.settled) {
                  const latest = (yield* store.getSession(session.id)) ?? session
                  yield* store.putSession(commit(latest, priceAtomic))
                } else {
                  yield* Effect.sync(() => release(session.id, priceAtomic))
                }
              })
            ),
            Effect.tap(({ outcome, receipt }) => Effect.sync(() => console.log(/* unchanged */))),
            Effect.catchAllCause((c) =>
              Effect.gen(function* () {
                if (session !== undefined) yield* Effect.sync(() => release(session.id, priceAtomic))
                yield* Effect.sync(() => console.error(`[hub] job ${jobId} crashed`, c))
              })
            )
          )
        )
```

In `pipeline.ts`, stamp the receipt (`:72-91`):

```ts
          ...(args.sessionId === undefined ? {} : { sessionId: args.sessionId }),
```

and carry the settlement kind through from `rail.settle` (`:142-151`):

```ts
    const settled = yield* rail.settle(args.verified).pipe(
      Effect.map((s) => ({ ok: true as const, txHash: s.txHash, kind: s.settlementKind })),
      Effect.catchAll((e) => Effect.succeed({ ok: false as const, reason: e._tag }))
    )
```

adding `...(kind === undefined ? {} : { settleRefKind: kind })` to the receipt in `finish`.

Finally, keep `sessionId` OUT of the public feed by extending the existing omission at `server.ts:695`:

```ts
          receipts.map(({ jobId: _jobId, buyer: _buyer, sessionId: _sessionId, ...r }) => ({
```

A session id groups one buyer's purchases, which is the purchase history the feed already refuses to publish.

- [ ] **Step 5: Run everything**

Run: `bunx vitest run apps/hub/test/ && bun test .bun.test`
Expected: PASS, including `apps/hub/test/pipeline.test.ts` unchanged.

- [ ] **Step 6: Commit**

```bash
bun run test && bunx tsc --noEmit
git add apps/hub/src/server.ts apps/hub/src/server-sessions.ts apps/hub/src/pipeline.ts apps/hub/test/session-call.test.ts
git commit -m "feat(hub): route paid calls through a session's rail and budget"
```

**Acceptance:** `bunx vitest run apps/hub/test/session-call.test.ts apps/hub/test/pipeline.test.ts`

---

### Task 9: Buyer SDK — `openSession` / `session.call` / `session.close`

**Files:**
- Create: `packages/buyer/src/session.ts`
- Modify: `packages/buyer/src/index.ts:6-7`, `packages/buyer/src/fetch-with-payment.ts:24-29`, `:107-109`
- Test: `packages/buyer/test/session.test.ts`

**Interfaces:**
- Produces: `openSession(args: OpenSessionArgs): Effect<BuyerSession, RpcFailure>` where `BuyerSession = {id, rail, budgetAtomic, call(args), close(): Effect<SessionReceiptJson>}`; `ensureGatewayDeposit({privateKey, minUsdc, rpcUrl?})` — it takes the key, not an `Account`, because the Circle batching client builds its own signer from a private key, and `minUsdc` is a decimal USD string like `"0.5"`, not atomic units. Step 3's implementation is the contract; this line matches it.
- Consumes: `SESSION_HEADER`, `callSkill` (`packages/buyer/src/index.ts:49`), `PayFetchOptions.sessionId`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/buyer/test/session.test.ts
import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import { SESSION_HEADER } from "@arcade/core"
import { openSession } from "../src/session.ts"

const account = privateKeyToAccount(generatePrivateKey())

const stub = (routes: Record<string, (req: Request) => unknown>) =>
  (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
    const req = new Request(url, init)
    const handler = routes[`${req.method} ${url.pathname}`]
    if (handler === undefined) return new Response("no route", { status: 404 })
    const body = await handler(req)
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })
  }) as typeof globalThis.fetch

describe("buyer session", () => {
  it("opens against the hub with the buyer's own address and the requested budget", async () => {
    let seen: any
    const fetch = stub({
      "POST /sessions": async (r) => {
        seen = await r.json()
        return { session_id: "ses_1", session_token: "tok", rail: "gateway", budget: "$1.00" }
      }
    })
    const s = await Effect.runPromise(openSession({ hubUrl: "http://hub", account, budgetUsd: "1.00", rail: "gateway", fetch }))
    expect(seen.buyer).toBe(account.address)
    expect(seen.budgetUsd).toBe("1.00")
    expect(seen.rail).toBe("gateway")
    expect(s.id).toBe("ses_1")
    expect(s.rail).toBe("gateway")
  })

  it("sends the session header on every call it makes", async () => {
    const headers: Array<string | null> = []
    const fetch = stub({
      "POST /sessions": () => ({ session_id: "ses_1", session_token: "tok", rail: "test", budget: "$1.00" }),
      "POST /x/seller/demo": (r) => {
        headers.push(r.headers.get(SESSION_HEADER))
        return { x402Version: 2, error: "payment required", accepts: [] }
      }
    })
    const s = await Effect.runPromise(openSession({ hubUrl: "http://hub", account, budgetUsd: "1.00", fetch }))
    await Effect.runPromiseExit(s.call({ seller: "seller", skillId: "demo", input: {} }))
    expect(headers[0]).toBe("ses_1")
  })

  it("closes with the token and returns the receipt", async () => {
    const fetch = stub({
      "POST /sessions": () => ({ session_id: "ses_1", session_token: "tok", rail: "test", budget: "$1.00" }),
      "POST /sessions/ses_1/close": (r) => {
        expect(r.headers.get("x-session-token")).toBe("tok")
        return { sessionId: "ses_1", calls: [], settledCalls: 0, settlementRefs: [], spentAtomic: "0" }
      }
    })
    const s = await Effect.runPromise(openSession({ hubUrl: "http://hub", account, budgetUsd: "1.00", fetch }))
    const receipt = await Effect.runPromise(s.close())
    expect(receipt.sessionId).toBe("ses_1")
    expect(receipt.settlementRefs).toEqual([])
  })

  it("refuses to reuse a closed session client-side rather than making a doomed request", async () => {
    const fetch = stub({
      "POST /sessions": () => ({ session_id: "ses_1", session_token: "tok", rail: "test", budget: "$1.00" }),
      "POST /sessions/ses_1/close": () => ({ sessionId: "ses_1", calls: [], settledCalls: 0, settlementRefs: [], spentAtomic: "0" })
    })
    const s = await Effect.runPromise(openSession({ hubUrl: "http://hub", account, budgetUsd: "1.00", fetch }))
    await Effect.runPromise(s.close())
    const exit = await Effect.runPromiseExit(s.call({ seller: "seller", skillId: "demo", input: {} }))
    expect(exit._tag).toBe("Failure")
    expect(JSON.stringify(exit)).toContain("closed")
  })

  it("surfaces the hub's rail refusal instead of falling back to a different rail", async () => {
    const fetch = stub({
      "POST /sessions": () => ({ error: "session_rail_unavailable", rails: ["eip3009"] })
    })
    const exit = await Effect.runPromiseExit(
      openSession({ hubUrl: "http://hub", account, budgetUsd: "1.00", rail: "gateway", fetch })
    )
    expect(exit._tag).toBe("Failure")
    expect(JSON.stringify(exit)).toContain("session_rail_unavailable")
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run packages/buyer/test/session.test.ts`
Expected: FAIL — `packages/buyer/src/session.ts` does not exist.

- [ ] **Step 3: Implement**

First extend `PayFetchOptions` (`packages/buyer/src/fetch-with-payment.ts:24-29`) with `readonly sessionId?: string` and set it on both requests (probe at `:61` and retry at `:107`):

```ts
    if (options.sessionId !== undefined) headers.set(SESSION_HEADER, options.sessionId)
```

(applied to `headers` and `retryHeaders` both, so the 402 the buyer signs against is the session's rail's challenge — signing against the default rail's challenge and then presenting it on a session call would be a domain mismatch).

Thread it through `callSkill` (`packages/buyer/src/index.ts:17-26`, `:53-64`) as an optional `sessionId`.

```ts
// packages/buyer/src/session.ts
import { Effect } from "effect"
import type { Account } from "viem"
import { RpcFailure, SESSION_HEADER, formatUsdc, parsePrice } from "@arcade/core"
import { callSkill, type SkillResult } from "./index.ts"

/**
 * A session, from the buyer's side.
 *
 * The value is arithmetic: on the per-call rail every settlement is its own on-chain
 * transaction (measured 0.00218 USDC of gas, `packages/payments/src/eip3009.ts:36-40`), which
 * on a $0.001 skill costs more than twice the skill. Inside a Gateway session the buyer
 * deposits once and every subsequent authorization is an offline signature that Circle nets
 * into ONE settlement. Twenty calls, one settlement — that is the whole feature.
 *
 * What a session does NOT do, stated because it would be easy to imply otherwise: it does not
 * escrow, prepay, or discount. Each call is still verified before work and settled only on
 * success, and closing a session settles nothing extra.
 */

export interface OpenSessionArgs {
  readonly hubUrl: string
  readonly account: Account
  readonly budgetUsd: string
  readonly rail?: "gateway" | "eip3009" | "test"
  readonly fetch?: typeof globalThis.fetch
}

export interface SessionCallArgs {
  readonly seller: string
  readonly skillId: string
  readonly input: unknown
  readonly maxAmountAtomic?: bigint
  readonly maxWaitMs?: number
}

export interface SessionReceiptJson {
  readonly sessionId: string
  readonly calls: ReadonlyArray<Record<string, unknown>>
  readonly settledCalls: number
  readonly settlementRefs: ReadonlyArray<string>
  readonly spentAtomic: string
}

export interface BuyerSession {
  readonly id: string
  readonly rail: string
  readonly budgetAtomic: bigint
  readonly call: (args: SessionCallArgs) => Effect.Effect<SkillResult, RpcFailure>
  readonly close: () => Effect.Effect<SessionReceiptJson, RpcFailure>
}

const postJson = (url: string, body: unknown, headers: Record<string, string>, f: typeof globalThis.fetch) =>
  Effect.tryPromise({
    try: async () => {
      const res = await f(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body)
      })
      return (await res.json()) as Record<string, unknown>
    },
    catch: (e) => new RpcFailure({ method: url, reason: String((e as Error)?.message ?? e) })
  })

export const openSession = (args: OpenSessionArgs) =>
  Effect.gen(function* () {
    const f = args.fetch ?? globalThis.fetch
    const opened = yield* postJson(
      `${args.hubUrl}/sessions`,
      {
        buyer: args.account.address,
        budgetUsd: args.budgetUsd,
        ...(args.rail === undefined ? {} : { rail: args.rail })
      },
      {},
      f
    )
    if (typeof opened["session_id"] !== "string") {
      // Surface the hub's own refusal verbatim. Retrying on a different rail would defeat
      // the point: the buyer may have deposited into Gateway specifically.
      return yield* new RpcFailure({ method: "POST /sessions", reason: JSON.stringify(opened) })
    }

    const id = opened["session_id"]
    const token = String(opened["session_token"] ?? "")
    let closed = false

    return {
      id,
      rail: String(opened["rail"] ?? "eip3009"),
      budgetAtomic: parsePrice(String(opened["budget"] ?? "$0")),
      call: (c: SessionCallArgs) =>
        Effect.gen(function* () {
          if (closed) {
            return yield* new RpcFailure({ method: "session.call", reason: `session ${id} is closed` })
          }
          return yield* callSkill({
            hubUrl: args.hubUrl,
            seller: c.seller,
            skillId: c.skillId,
            input: c.input,
            account: args.account,
            sessionId: id,
            ...(c.maxAmountAtomic === undefined ? {} : { maxAmountAtomic: c.maxAmountAtomic }),
            ...(c.maxWaitMs === undefined ? {} : { maxWaitMs: c.maxWaitMs })
          })
        }),
      close: () =>
        Effect.gen(function* () {
          const receipt = yield* postJson(
            `${args.hubUrl}/sessions/${id}/close`,
            {},
            { "x-session-token": token },
            f
          )
          closed = true
          return receipt as unknown as SessionReceiptJson
        })
    } satisfies BuyerSession
  })

/**
 * Top the Gateway balance up to `minAtomic` if it is short. One on-chain transaction, and
 * only when needed — the balance survives between sessions, so a returning buyer pays no gas
 * at all.
 */
export const ensureGatewayDeposit = (input: {
  readonly privateKey: `0x${string}`
  readonly minUsdc: string
  readonly rpcUrl?: string
}) =>
  Effect.tryPromise({
    try: async () => {
      const { GatewayClient, CHAIN_CONFIGS } = await import("@circle-fin/x402-batching/client")
      const cfg = CHAIN_CONFIGS["arcTestnet"]
      const rpcUrl =
        input.rpcUrl ??
        cfg.chain.rpcUrls.default.http.find((u: string) => u.includes("quicknode")) ??
        cfg.rpcUrl
      const client = new GatewayClient({ chain: "arcTestnet", privateKey: input.privateKey, rpcUrl })
      const before = await client.getBalances()
      const want = parsePrice(`$${input.minUsdc}`)
      if (before.gateway.available >= want) {
        return { deposited: false, availableAtomic: before.gateway.available }
      }
      // Arc's public RPC rate-limits the deposit burst; retry the whole operation exactly as
      // scripts/g2c-nanopay.ts:100-113 does rather than reaching for a receipt watcher.
      let tx: { depositTxHash: string } | undefined
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          tx = await client.deposit(input.minUsdc)
          break
        } catch (err) {
          const msg = String((err as Error)?.message ?? err)
          if (!/request limit|-32011/.test(msg) || attempt === 4) throw err
          await new Promise((r) => setTimeout(r, 5000 * 2 ** attempt))
        }
      }
      await new Promise((r) => setTimeout(r, 4000)) // Arc credits in ~0.5s; 4s is slack
      const after = await client.getBalances()
      return { deposited: true, depositTx: tx?.depositTxHash, availableAtomic: after.gateway.available }
    },
    catch: (e) => new RpcFailure({ method: "ensureGatewayDeposit", reason: String((e as Error)?.message ?? e) })
  })
```

Re-export from `packages/buyer/src/index.ts`: `export * from "./session.ts"`.

- [ ] **Step 4: Run the tests**

Run: `bunx vitest run packages/buyer/test/`
Expected: PASS, including the existing `fetch-with-payment.test.ts` and `hire.test.ts`.

- [ ] **Step 5: Commit**

```bash
bun run test && bunx tsc --noEmit
git add packages/buyer/src/session.ts packages/buyer/src/index.ts packages/buyer/src/fetch-with-payment.ts packages/buyer/test/session.test.ts
git commit -m "feat(buyer): openSession / session.call / session.close with a one-shot Gateway deposit"
```

**Acceptance:** `bunx vitest run packages/buyer/test/session.test.ts`

---

### Task 10: MCP tools `arcade_open_session` and `arcade_close_session`

**Files:**
- Modify: `packages/buyer/src/mcp.ts` (tool list `:279-348`, dispatch `~:400-590`, budget line `:566-585`)
- Test: `packages/buyer/test/mcp.test.ts`

**Interfaces:**
- Produces: `arcade_open_session({budgetUsd, rail?})`, `arcade_close_session({})`; `arcade_call_skill` routes through the open session when one exists; `arcade_budget` reports the session id, rail and remaining hub-side budget.

- [ ] **Step 1: Write the failing test**

Append to `packages/buyer/test/mcp.test.ts`:

```ts
import { TOOLS, handleTool, __resetBudget, __setCallSkill } from "../src/mcp.ts"

describe("session tools", () => {
  it("advertises both session tools with non-idempotent, money-spending semantics", () => {
    const open = TOOLS.find((t) => t.name === "arcade_open_session")
    const close = TOOLS.find((t) => t.name === "arcade_close_session")
    expect(open).toBeDefined()
    expect(close).toBeDefined()
    expect(open!.annotations?.idempotentHint).toBe(false)
    expect(open!.description).toMatch(/budget/i)
  })

  it("refuses a second open while one is live rather than orphaning the first", async () => {
    __resetBudget()
    const first = await handleTool("arcade_open_session", { budgetUsd: "1.00" })
    expect(first.isError).toBeFalsy()
    const second = await handleTool("arcade_open_session", { budgetUsd: "1.00" })
    expect(second.isError).toBe(true)
    expect(JSON.stringify(second)).toMatch(/already open/i)
  })

  it("refuses close with no session open", async () => {
    __resetBudget()
    const res = await handleTool("arcade_close_session", {})
    expect(res.isError).toBe(true)
  })

  it("rejects a budget above the process ceiling before touching the hub", async () => {
    __resetBudget()
    const res = await handleTool("arcade_open_session", { budgetUsd: "100000" })
    expect(res.isError).toBe(true)
  })
})
```

(The MCP tests already stub the hub with the module's existing seams — reuse whatever `packages/buyer/test/mcp.test.ts` uses today for `arcade_quote`, and add a `__setOpenSession` seam mirroring `__setCallSkill` at `packages/buyer/src/mcp.ts:604-606` so no test reaches the network.)

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run packages/buyer/test/mcp.test.ts`
Expected: FAIL — the tools are not in `TOOLS`.

- [ ] **Step 3: Implement**

Add the argument schemas beside the existing ones (`packages/buyer/src/mcp.ts:~220`):

```ts
const OpenSessionArgsSchema = Schema.Struct({
  budgetUsd: Schema.String.annotations({
    description: "Total USDC this session may spend, e.g. \"0.50\". Enforced by the hub, not just here."
  }),
  rail: Schema.optional(
    Schema.Literal("gateway", "eip3009").annotations({
      description: "gateway batches every call into one settlement (requires a Gateway deposit); eip3009 settles each call on chain."
    })
  )
})
```

and the tools:

```ts
  {
    name: "arcade_open_session",
    title: "Open a paid session",
    description:
      "Open a spending session with a declared budget. Inside a session, calls made with " +
      "arcade_call_skill are routed over the session's rail; on the gateway rail every call " +
      "is an offline signature funded from a single Gateway deposit and Circle settles them " +
      "as ONE batched transaction, so a loop of small calls stops paying per-call gas. " +
      "Opening spends nothing and escrows nothing — the budget is a ceiling the hub refuses " +
      "past, and each call still settles only if its output validates.",
    inputSchema: toolInput(OpenSessionArgsSchema),
    annotations: {
      title: "Open a paid session",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    }
  },
  {
    name: "arcade_close_session",
    title: "Close the session and get its receipt",
    description:
      "Close the open session and return its receipt: every call it made, which of them " +
      "settled, what was spent, and the settlement reference(s) — one for a batched Gateway " +
      "session. After closing, further calls fall back to per-call payment.",
    inputSchema: toolInput(NoArgs),
    annotations: { title: "Close the session", ...READ_ONLY, readOnlyHint: false, idempotentHint: false }
  }
```

Hold one session per process beside `spentAtomic` (`:80`):

```ts
/**
 * One session per process, deliberately.
 *
 * A model that can open several would have to track which one it is spending, and the
 * failure mode of getting that wrong is an unclosed session with a live budget. One is
 * enough for the thing sessions are for: a loop.
 */
let session: BuyerSession | undefined
```

Dispatch:

```ts
    case "arcade_open_session": {
      const a = decodeArgs(OpenSessionArgsSchema, args, "arcade_open_session")
      if (session !== undefined) {
        return fail(`A session is already open (${session.id}). Close it with arcade_close_session first.`)
      }
      const budget = parsePrice(`$${a.budgetUsd}`)
      // The process ceiling still binds. A session budget above it would let a model raise
      // its own limit by asking for one, which is the opposite of a limit.
      if (budget > remainingAtomic()) {
        return fail(
          `Session budget ${formatUsdc(budget)} exceeds this process's remaining budget ` +
            `${formatUsdc(remainingAtomic())}. Lower it, or raise ARCADE_SESSION_BUDGET_USD.`
        )
      }
      session = await Effect.runPromise(
        openSessionImpl({
          hubUrl: HUB,
          account: buyerAccount(),
          budgetUsd: a.budgetUsd,
          ...(a.rail === undefined ? {} : { rail: a.rail })
        })
      )
      return ok(
        `Session ${session.id} open on the ${session.rail} rail, budget ${formatUsdc(session.budgetAtomic)}.\n` +
          (session.rail === "gateway"
            ? "Calls are funded from your Gateway balance and settle as one batch when Circle closes it."
            : "Calls settle individually on chain."),
        { sessionId: session.id, rail: session.rail, budgetUsdc: formatUsdc(session.budgetAtomic) }
      )
    }

    case "arcade_close_session": {
      if (session === undefined) return fail("No session is open. Use arcade_open_session first.")
      const receipt = await Effect.runPromise(session.close())
      const id = session.id
      session = undefined
      return ok(
        `Session ${id} closed.\n` +
          `  calls        ${receipt.calls.length}\n` +
          `  settled      ${receipt.settledCalls}\n` +
          `  spent        ${formatUsdc(BigInt(receipt.spentAtomic))}\n` +
          `  settlements  ${receipt.settlementRefs.length === 0 ? "none" : receipt.settlementRefs.join(", ")}`,
        { receipt: receipt as unknown as Record<string, unknown> }
      )
    }
```

In `arcade_call_skill`, pass `sessionId: session?.id` into `callSkillImpl`, and extend `arcade_budget`'s output (`:566-585`) with `session: session === undefined ? null : {id: session.id, rail: session.rail}`. Extend `__resetBudget` (`:594-596`) to clear `session` so tests start clean.

- [ ] **Step 4: Run the tests**

Run: `bunx vitest run packages/buyer/test/mcp.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run test && bunx tsc --noEmit
git add packages/buyer/src/mcp.ts packages/buyer/test/mcp.test.ts
git commit -m "feat(mcp): arcade_open_session and arcade_close_session"
```

**Acceptance:** `bunx vitest run packages/buyer/test/mcp.test.ts`

---

### Task 11: Deposit and withdraw — where the money actually is

The Gateway rail moves the seller's money into their **Gateway balance**, not their wallet (Circle: "credits the seller's Gateway balance… the seller can then withdraw"). A marketplace that shows a settled receipt while the seller's on-chain balance has not moved is telling half the truth. This task closes both ends: a buyer CLI that deposits, and a seller script that withdraws.

**Files:**
- Modify: `packages/buyer/src/cli.ts` (new `gateway-deposit` and `session` subcommands)
- Create: `scripts/gateway-withdraw.ts`
- Create: `docs/sessions.md`

**Interfaces:**
- Produces: `bun run arcade-buy gateway-deposit --amount 0.5`; `bun run arcade-buy session --budget 0.20 --calls 20 --skill <id> --seller <addr>`; `ARCADE_SELLER_KEY=0x… bun run scripts/gateway-withdraw.ts [amount]`.

- [ ] **Step 1: Write the deposit/withdraw scripts**

`scripts/gateway-withdraw.ts`:

```ts
#!/usr/bin/env bun
/**
 * Pull a seller's Gateway balance back on chain.
 *
 * On the Gateway rail a settled receipt credits the seller's GATEWAY balance — the USDC is
 * real and spendable, but it is not in their wallet until they withdraw. Same-chain
 * withdrawal is instant and needs no cross-chain wait (`GatewayClient.withdraw`).
 *
 * usage: ARCADE_SELLER_KEY=0x… bun run scripts/gateway-withdraw.ts [amountUsdc]
 */
import { GatewayClient, CHAIN_CONFIGS } from "@circle-fin/x402-batching/client"

const key = process.env["ARCADE_SELLER_KEY"]
if (key === undefined) {
  console.error("ARCADE_SELLER_KEY is not set (the address your listings pay to)")
  process.exit(2)
}
const cfg = CHAIN_CONFIGS["arcTestnet"]
const rpcUrl =
  process.env["ARCADE_RPC_URL"] ??
  cfg.chain.rpcUrls.default.http.find((u: string) => u.includes("quicknode")) ??
  cfg.rpcUrl
const client = new GatewayClient({ chain: "arcTestnet", privateKey: key as `0x${string}`, rpcUrl })

const before = await client.getBalances()
console.log(`gateway available ${before.gateway.formattedAvailable}`)
console.log(`wallet USDC       ${before.wallet.formatted}`)

const amount = process.argv[2] ?? before.gateway.formattedAvailable.replace(/[^0-9.]/g, "")
if (Number(amount) <= 0) {
  console.log("nothing to withdraw")
  process.exit(0)
}

const res = await client.withdraw(amount)
console.log(`withdraw tx: ${JSON.stringify(res)}`)
const after = await client.getBalances()
console.log(`\nafter\n  gateway available ${after.gateway.formattedAvailable}\n  wallet USDC       ${after.wallet.formatted}`)
```

`packages/buyer/src/cli.ts` gains two subcommands in the existing dispatcher style: `gateway-deposit` calls `ensureGatewayDeposit`, and `session` opens a session, makes `--calls N` calls against `--skill`, and closes, printing the receipt.

- [ ] **Step 2: OWNER — fund the buyer, then run the deposit path**

**OWNER.** A Gateway deposit moves real testnet USDC out of the buyer's wallet into Circle's
Gateway Wallet, and the seller withdraw script moves it back. Ask the owner to confirm the
buyer key is faucet-funded (`curl -X POST https://api.circle.com/v1/faucet/drips -d
'{"address":"0x…","blockchain":"ARC-TESTNET","usdc":true}'`, `"native": true` is rejected) and
to approve the `--amount`. Needed **Tue Sept 9**, before this task and Task 12's twenty-call
run. See `docs/superpowers/plans/2026-09-04-01-owner-actions.md`.

Run: `ARCADE_BUYER_KEY=0x… bun run arcade-buy gateway-deposit --amount 0.5`
Expected: prints either `already funded: <balance>` or a deposit tx hash and the new balance.

- [ ] **Step 3: Write `docs/sessions.md`**

Must state, in the repo's plain register: what a session is (a ceiling plus a rail), what it is not (no escrow, no prepay, no discount), that the buyer deposits once into the Gateway Wallet and pays zero gas thereafter, that the **seller's** proceeds land in their Gateway balance and `scripts/gateway-withdraw.ts` brings them on chain, that a session receipt's `settlementRefs` may hold a Gateway transfer id until the batch closes, and that Gateway is testnet-only on Arc so the EIP-3009 rail remains the mainnet path (`arc-circle.md:189-198`).

- [ ] **Step 4: Commit**

```bash
bun run test && bunx tsc --noEmit
git add packages/buyer/src/cli.ts scripts/gateway-withdraw.ts docs/sessions.md
git commit -m "feat(buyer): gateway deposit and session CLI; seller withdraw script; sessions doc"
```

**Acceptance:** `bun run arcade-buy gateway-deposit --amount 0.5` prints a balance, and `bun run scripts/gateway-withdraw.ts` prints both balances without throwing.

---

### Task 12: Live evidence — `scripts/e2e-gateway-session.sh`

**Files:**
- Create: `scripts/e2e-gateway-session.sh`
- Modify: `docs/evidence/m6-gateway.md`

**Interfaces:**
- Produces: a script that boots a hub, connects a runner, deposits once, opens a session, makes **twenty** calls, closes the session, and asserts `settledCalls == 20` and `settlementRefs.length == 1`. Prints the session receipt.

- [ ] **Step 1: Write the script**

```bash
#!/bin/bash
# Twenty calls, one batched settlement, one session receipt.
#
# This is the M6 claim in executable form. It fails loudly if the twenty calls produce more
# than one settlement reference, because "one settlement" is the entire point and asserting
# it beats narrating it.
#
#   ARCADE_BUYER_KEY   funded Arc testnet buyer (also the Gateway depositor)
#   SELLER             address the listing pays to
#   CALLS              default 20
#
# usage: ARCADE_BUYER_KEY=0x… SELLER=0x… bash scripts/e2e-gateway-session.sh
set -eu

PORT="${PORT:-8791}"
CALLS="${CALLS:-20}"
SKILL="${SKILL:-usdc-flow-check}"
: "${ARCADE_BUYER_KEY:?set a funded Arc testnet buyer key}"
: "${SELLER:?set SELLER to the address that receives USDC}"
HUB="http://localhost:$PORT"
DB="$(mktemp -d)/arcade.db"
HUB_LOG=$(mktemp)

cleanup() { kill ${HUB_PID:-0} ${RUNNER_PID:-0} 2>/dev/null || true; }
trap cleanup EXIT

echo "== 0. is Gateway live on Arc at all? =="
bun run scripts/g2c-nanopay.ts 0.5

echo
echo "== 1. hub with both rails =="
ARCADE_RAIL=eip3009 ARCADE_DB="$DB" PORT=$PORT bun run apps/hub/src/server.ts > "$HUB_LOG" 2>&1 &
HUB_PID=$!
sleep 2
curl -sf "$HUB/healthz" | tee /dev/stderr | grep -q '"gateway"' \
  || { echo "FAIL: hub did not build the gateway rail"; cat "$HUB_LOG"; exit 1; }

echo
echo "== 2. runner =="
ARCADE_HUB="$HUB" bun run packages/runner/src/cli.ts runner start > /tmp/arcade-runner-session.log 2>&1 &
RUNNER_PID=$!
sleep 4
curl -sf "$HUB/listings" | grep -q "$SKILL" || { echo "FAIL: $SKILL is not listed"; exit 1; }

echo
echo "== 3. deposit once, then $CALLS gasless calls =="
ARCADE_HUB="$HUB" bun run arcade-buy gateway-deposit --amount 0.5
ARCADE_HUB="$HUB" bun run arcade-buy session \
  --budget 0.50 --rail gateway --calls "$CALLS" --skill "$SKILL" --seller "$SELLER" \
  --out /tmp/session-receipt.json

echo
echo "== 4. the claim, asserted =="
bun -e '
const r = await Bun.file("/tmp/session-receipt.json").json()
const calls = r.calls.length, settled = r.settledCalls, refs = r.settlementRefs
console.log(`  calls        ${calls}`)
console.log(`  settled      ${settled}`)
console.log(`  spent        ${r.spentAtomic}`)
console.log(`  settlements  ${refs.join(", ") || "(none)"}`)
if (settled !== Number(process.env.CALLS ?? 20)) { console.error("FAIL: not every call settled"); process.exit(1) }
if (refs.length !== 1) { console.error(`FAIL: expected ONE settlement reference, got ${refs.length}`); process.exit(1) }
console.log("\nPASS: " + settled + " calls, one settlement (" + refs[0] + ")")
'
```

- [ ] **Step 2: Run it**

Run: `ARCADE_BUYER_KEY=0x… SELLER=0x… bash scripts/e2e-gateway-session.sh`
Expected: `PASS: 20 calls, one settlement (…)`.

If `settlementRefs.length > 1` because Circle closed a batch mid-run, that is a real property of the rail, not a bug: relax the assertion to `refs.length < calls` **and** record the actual count in `docs/evidence/m6-gateway.md`. Do not assert a number the rail does not guarantee.

- [ ] **Step 3: Record and commit**

Append the run's output to `docs/evidence/m6-gateway.md`.

```bash
chmod +x scripts/e2e-gateway-session.sh
bun run test && bunx tsc --noEmit
git add scripts/e2e-gateway-session.sh docs/evidence/m6-gateway.md
git commit -m "test(e2e): twenty calls, one batched settlement, one session receipt"
```

**Acceptance:** `bash scripts/e2e-gateway-session.sh` exits 0 and prints the session receipt.

---

### Task 13: FALLBACK TRACK — EIP-3009 sessions with per-call settlement

**Run this task instead of Tasks 2, 3, 11 and 12 if and only if Task 1 recorded a FAIL.** The spec's cut order names this explicitly (`specs/2026-09-04-ethonline-continuity-design.md:111`, `:149`): "If the facilitator refuses Arc in the first 4 hours of the workstream, the session surface ships over EIP-3009 with per-call settlement and the README states Gateway as code-complete, unproven."

Tasks 4–10 are **rail-agnostic and still run unchanged** — the registry, the sessions table, the endpoints, the buyer SDK and the MCP tools all work with `rail: "eip3009"`. That is the point of building them against `Rail` rather than against Gateway. What this task replaces is only the batching claim and the evidence.

**Files:**
- Modify: `apps/hub/src/server.ts` (`railsLayer()` from Task 4 — do not build the gateway rail)
- Modify: `packages/buyer/src/session.ts` (default `rail` to `eip3009`; `ensureGatewayDeposit` becomes a no-op that explains itself)
- Create: `scripts/e2e-session.sh`
- Modify: `README.md`, `docs/sessions.md`, `docs/evidence/m6-gateway.md`

**Interfaces:**
- Produces: identical session surface on the 3009 rail; `SessionReceipt.settlementRefs` holds N on-chain tx hashes rather than one batch reference; a documented, measured statement of what the session still buys.

- [ ] **Step 1: Make the gateway rail unbuildable rather than silently broken**

In `railsLayer()` (Task 4, Step 5) gate the extra rail on an explicit opt-in as well as `ChainConfig.gateway`:

```ts
  // Gateway is code-complete and UNPROVEN on Arc: scripts/g2c-nanopay.ts failed at
  // <stage> on <date> (docs/evidence/m6-gateway.md). Building the rail by default would
  // let a session open on a rail that cannot settle, and a buyer would discover that after
  // the seller had already done the work. It is behind an explicit flag until the gate
  // passes.
  if (RAIL !== "gateway" && CHAIN.gateway !== null && process.env["ARCADE_ENABLE_GATEWAY"] === "1") {
    extras.push(makeRail("gateway"))
  }
```

`POST /sessions {rail:"gateway"}` then returns the `409 session_rail_unavailable` that Task 7 already implements and Task 7's test already covers — no new refusal path, no new code.

- [ ] **Step 2: State the honest value of a 3009 session**

A session on the per-call rail still delivers three of the four things sessions were for, and the plan must not pretend otherwise. In `docs/sessions.md`:

- **Budget enforcement**: a ceiling the hub refuses past, across N calls, checked before any work — unchanged.
- **One receipt for N calls**: the session receipt lists every call and every settlement — unchanged.
- **Per-call rail choice**: the mechanism is live and Gateway drops in when Circle's facilitator accepts Arc — unchanged.
- **Batched settlement**: NOT delivered. Every call is its own on-chain settlement at ~0.00218 USDC of gas, paid by the hub's facilitator key. State the measured number and the failing stage from `docs/evidence/m6-gateway.md`.

- [ ] **Step 3: Write the fallback evidence script**

`scripts/e2e-session.sh` is `e2e-gateway-session.sh` with three changes: drop the `g2c-nanopay.ts` precondition and the deposit step, open the session with `--rail eip3009`, and invert the settlement assertion:

```bash
bun -e '
const r = await Bun.file("/tmp/session-receipt.json").json()
const n = Number(process.env.CALLS ?? 20)
if (r.settledCalls !== n) { console.error("FAIL: not every call settled"); process.exit(1) }
// Per-call rail: N settlements is CORRECT here. Asserting it makes the difference from a
// batched session a measured fact rather than a footnote.
if (r.settlementRefs.length !== n) {
  console.error(`FAIL: expected ${n} on-chain settlements on the 3009 rail, got ${r.settlementRefs.length}`)
  process.exit(1)
}
console.log(`PASS: ${n} calls, ${n} on-chain settlements, one session receipt`)
console.log(`Gas cost of NOT batching: ~${(0.00218 * n).toFixed(5)} USDC across the session.`)
'
```

- [ ] **Step 4: Correct the claims**

README and `docs/sessions.md` must say, verbatim in substance: *"Sessions ship on the EIP-3009 rail with per-call settlement. The Gateway Nanopayments rail is implemented and conformance-tested against `Rail` but unproven on Arc: `scripts/g2c-nanopay.ts` failed at `<stage>` on `<date>` — see `docs/evidence/m6-gateway.md`. Enable it with `ARCADE_ENABLE_GATEWAY=1` once Circle's facilitator accepts `eip155:5042002`."* Never "sessions batch through Gateway" while this branch is live. Remove the batching claim from the demo script's beat 6 (`specs/…:158`) and replace it with the budget-and-one-receipt beat.

- [ ] **Step 5: Run and commit**

```bash
ARCADE_BUYER_KEY=0x… SELLER=0x… bash scripts/e2e-session.sh
bun run test && bunx tsc --noEmit
git add scripts/e2e-session.sh apps/hub/src/server.ts packages/buyer/src/session.ts README.md docs/sessions.md docs/evidence/m6-gateway.md
git commit -m "feat(sessions): ship the session surface on EIP-3009; Gateway stays behind a flag, unproven"
```

**Acceptance:** `bash scripts/e2e-session.sh` exits 0, and `curl -s localhost:8787/healthz` does **not** list `gateway`.

---

### Task 14: Surface, claims and the demo beat

**Files:**
- Modify: `apps/hub/src/ui.ts` (receipt rows and the listing page)
- Modify: `README.md`, `docs/architecture.md`, `docs/buyer-guide.md`
- Test: `apps/hub/test/ui.test.ts`

**Interfaces:**
- Produces: a receipt row that links a settlement to Arcscan only when `settleRefKind !== "gateway-batch"`; a "session" marker on session receipts in the hub feed; README and buyer-guide sections for sessions.

- [ ] **Step 1: Write the failing UI test**

Append to `apps/hub/test/ui.test.ts`:

```ts
describe("session and batch rendering", () => {
  it("does not link a Gateway batch reference to the block explorer", () => {
    const html = renderReceiptRows([
      { skillId: "demo", settled: true, settleTx: "8f2c1f4e-0a11-4a3d-9f1e-2b6c7d8e9f00",
        settleRefKind: "gateway-batch", price: "$0.001", sellerShare: "$0.00095", fee: "$0.00005",
        rail: "gateway", createdAtMs: 1, latencyMs: 5, reason: "ok" } as never
    ])
    expect(html).not.toContain("testnet.arcscan.app")
    expect(html).toMatch(/batch/i)
  })

  it("still links an on-chain settlement", () => {
    const html = renderReceiptRows([
      { skillId: "demo", settled: true, settleTx: `0x${"a".repeat(64)}`, settleRefKind: "onchain",
        price: "$0.10", sellerShare: "$0.095", fee: "$0.005", rail: "eip3009",
        createdAtMs: 1, latencyMs: 5, reason: "ok" } as never
    ])
    expect(html).toContain("testnet.arcscan.app")
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run apps/hub/test/ui.test.ts`
Expected: FAIL — the row links every `settleTx`.

- [ ] **Step 3: Implement and document**

In `apps/hub/src/ui.ts`, gate the explorer link on `settleRefKind !== "gateway-batch"` and render a `batch <short-ref>` chip instead; the same conditional already exists for `settleTx === undefined` at `server.ts:703`, so make `explorerTxUrl` return `null` for a non-hash reference and use that one rule everywhere.

README gains a short section: how to open a session, the twenty-calls-one-settlement figure with the evidence link, and the constraint that Gateway is testnet-only on Arc so mainnet uses the 3009 rail. `docs/buyer-guide.md` gains the SDK and MCP snippets. `docs/architecture.md`'s rail paragraph gains the two-rail registry.

- [ ] **Step 4: Run everything and commit**

```bash
bun run test && bunx tsc --noEmit && bun run web:build
git add apps/hub/src/ui.ts apps/hub/test/ui.test.ts README.md docs/architecture.md docs/buyer-guide.md
git commit -m "feat(hub): render batch settlements honestly; document sessions"
```

**Acceptance:** `bunx vitest run apps/hub/test/ui.test.ts && bun run test && bunx tsc --noEmit`

---

## Self-review

**Spec coverage (M6).** The gate (T1) is `scripts/g2c-nanopay.ts` driven to a real verify + settle, which is what §8 asks for and what the current script does not do. Buyer deposit → `GatewayWalletBatched` signature → hub verify → job → settle after validation is T1 + T2 + T3 + T8. The product surface — `arcade_open_session({budgetUsd})`, N calls against one deposit, one batched settlement, a session receipt listing the calls — is T5–T10 and T12. The `x-arcade-session` header, the sqlite `sessions{id, buyer, budgetAtomic, spentAtomic, rail, openedAtMs, closedAtMs}` table, `POST /sessions`, `POST /sessions/:id/close`, `packages/buyer/src/session.ts`, `arcade_open_session`/`arcade_close_session`, `Receipt.sessionId` and the two-rail registry are each a named task. The fallback (T13) is fully specified rather than gestured at, and it explicitly identifies which tasks survive (4–10) and which are replaced (2, 3, 11, 12).

**Plan A consistency.** Every consumed name is Plan A's: `loadChainConfig`/`ChainConfig.gateway` (T3, T4), `chainCheck`'s "refuse when `ARCADE_RAIL=gateway` and `cfg.gateway === null`" (T3's `GatewayLive` throw is the Layer-level half of the same rule), `validateJson` (unchanged, used by the paid path before any of this runs), `Rail.settle(verified, tree?)` (T3 keeps `gateway.ts` accepting and ignoring `tree`, exactly as Plan A Task 7 specifies at `:1037`). Every `Receipt` field added here (`sessionId`, `settleRefKind`) is `Schema.optional`, so Plan A's tree fields merge without conflict. `RailTag` still resolves to the default rail, so Plan A's `pipeline.ts` edits apply unchanged.

**Spec ambiguities resolved.** (1) The spec says "hub's per-rail selection allows `ARCADE_RAIL=gateway` for session calls while EIP-3009 stays the root default" — that reads as an env flag, but an env flag is process-wide and cannot be both at once, so the resolution is: `ARCADE_RAIL` keeps naming the **default**, and the gateway rail is additionally built whenever `ChainConfig.gateway !== null`; the session row carries the rail and the header selects it per request. (2) The spec's session table has no reservation column, but twenty concurrent calls against one ceiling need one — resolved by keeping the table exactly as specified and holding reservations in process, which is also the only correct choice given the boot reaper already fails in-flight jobs. (3) "One batched settlement" is a property of Circle's batching cadence, not a guarantee we can assert — T12 asserts it and T12 Step 2 says what to do when the real rail closes a batch mid-run: relax to `refs.length < calls` and record the number, never assert a number the rail does not promise. (4) Circle's `GatewayEvmScheme` advertises `maxTimeoutSeconds` of 345600 while `BatchEvmScheme` clamps signatures to 604900; our `GATEWAY_MIN_VALIDITY_SECONDS` is already 604900, which satisfies both, so nothing changes — verified against the installed SDK rather than assumed.

**Risks.** The gate is the risk, and it is timeboxed with a written decision. Secondary: Circle's `transaction` field may be a transfer id rather than a hash (T3 labels it, T14 stops linking it to a dead Arcscan page); the seller's proceeds land in a Gateway balance rather than a wallet (T11 ships the withdraw path and says so in `docs/sessions.md`); Gateway does not exist on Arc mainnet, so the Sept 16 flip runs on the 3009 rail and `GatewayLive` refuses to build there (T3).
