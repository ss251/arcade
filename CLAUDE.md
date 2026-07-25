# ARCADE — agent instructions

Marketplace where anyone publishes a **skill or an agent as a paid endpoint on Circle's Arc**, and buyer agents pay per call in USDC. Agents hiring agents, settled onchain.

## Hard rules

1. **Never commit `internal/`.** It holds research, competitive analysis, and build decisions. It is gitignored — keep it that way.
2. **Secrets live in Keychain, never in `.env` or source.** Circle API key: `security find-generic-password -s circle-api-key -w`. Read it *inside* a script; never echo it, never paste it into a prompt or a commit.
3. **Never accept Circle's Terms of Use on the user's behalf.** `circle terms accept` and the `CIRCLE_ACCEPT_TERMS=1` env shortcut both require explicit human consent first.
4. **Seller code never leaves the seller's machine.** Anything that would send `engine.*`, `secrets`, `systemPrompt`, `entry`, or `egress` to the hub is a bug in the product's core thesis. `packages/core`'s schema transformation enforces this — do not route around it.
5. **Settle only on success.** Schema-valid + non-empty + no engine refusal (check `stop_reason`, never exit code). A failed job must leave the buyer's balance untouched.
6. **Never use `waitForTransactionReceipt`** against Arc's public RPC — it triggers `-32011 request limit reached`. Use one-receipt-per-tick backoff (`Effect.retry` + `Schedule.exponential`).

## Stack

Bun + Vite. **Effect** throughout (Effect Schema replaces zod — never both). `@effect/platform` HttpApi + Socket for the hub. TanStack Start for `apps/web`. `bun:sqlite` via `@effect/sql`.

Idiom: `Effect.gen`, `Effect.tryPromise`, `Effect.retry`/`Schedule`, `Scope`, `Layer`/`Context.Tag`, `Data.TaggedError`, `Queue`/`Stream`.

## Chain facts (Arc testnet)

- Chain id **5042002**, CAIP-2 `eip155:5042002`, RPC `https://rpc.testnet.arc.network`, explorer `https://testnet.arcscan.app`
- **USDC `0x3600000000000000000000000000000000000000`** — the same address is the *native gas token* (18 dec) **and** the ERC-20 interface (**6 dec**). This dual nature is the #1 source of bugs here.
- Gateway Wallet `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`, Gateway domain **26**, facilitator `https://gateway-api-testnet.circle.com`
- Nanopayments `validBefore` must be **≥7 days** out (SDK sets `maxTimeoutSeconds: 604900`).
- Faucet: `POST https://api.circle.com/v1/faucet/drips` `{"address","blockchain":"ARC-TESTNET","usdc":true}` — **`"native": true` is rejected** (USDC *is* native).

## Skill routing

| Working on | Load first |
|---|---|
| Arc chain, USDC, gas, finality | `use-arc` + the `arc-docs` MCP |
| Agent wallet / accepting or making payments | `use-agent-wallet`, `accept-agent-payments`, `pay-via-agent-wallet`, `use-gateway` + the `circle` MCP |
| Anything Effect / TanStack / viem | pin docs via `context7` **before** writing code |
| EVM correctness, token decimals, addresses | `ethskills` (see `references/gas.md`, `contract-addresses.md`, `standards.md`) |
| Any UI in `apps/web` | `design-sauce` first, then `emil-design-eng`, `pick-ui-library`, `apple-design` |
| Any chart | `dataviz` **before** the first line of chart code |
| Claude Agent SDK (engine lane A) | `claude-api` |
| Email-OTP flows (Circle wallet login) | `automated-e2e` |
| Solidity (only if `FeeSplitter.sol` ships) | `ethskills` → `solidity-auditor` → `fizz` |
| Payment or credential code, before push | `security-review` |
| Two-machine (devcube ↔ MacBook) setup | `device-sync` |
| Shipping a PR | `no-mistakes` |

## Layout

`packages/core` (schema + secrecy boundary) · `packages/payments` (Rail service, EIP3009Live / GatewayLive / RailTest) · `packages/runner` (`arcade` CLI + seller daemon + sandbox) · `packages/buyer` (SDK + MCP) · `apps/hub` · `apps/web` · `skills/` (first-party listings) · `docs/` · `scripts/` (G-gate evidence) · `internal/` (**never commit**)
