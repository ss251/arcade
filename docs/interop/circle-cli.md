# Circle CLI interop — prerequisites recorded, live proof paused

Status at the Plan I handover on2026-09-08: **no live Circle CLI purchase or
captured1.0.0 payment header**. This record reuses the public
[J4 preflight](../evidence/J/circle-cli-preflight.md); it does not repeat login,
terms acceptance, wallet creation, faucet funding, signing or spending.

## Inherited observations

Observed2026-09-06 22:06–22:08UTC, not a current readiness assertion:

| Field | Recorded value |
|---|---|
| Installed client | `@circle-fin/cli`1.0.0 |
| Installed bundle SHA256 | `40508e51b251c0c7b696a3ee30f2c21b7052b00b483ec4fc2d64811135ea6df0` |
| Chain token used by actual wallet-list call | `ARC-TESTNET` |
| `CIRCLE_WALLET_ADDRESS` — agent wallet | `0xb70ffda6628f0ccce394e8617c4a92c201892cd2` |
| CLI-resolved backing EOA | `0x0d8323e9577298f694e1e62d5937262b45083e5f` |
| On-chain USDC at that observation | 20.0005 |
| Gateway available balance at that observation | 0 |

Arc's native18-decimal and ERC-20 six-decimal views are the same USDC balance,
not separate funds. The agent wallet and Gateway authorization payer are not
interchangeable: the pinned CLI resolves a backing EOA for Gateway.

The existing owner-provisioned testnet session was usable for the four
read-only preflight calls; terms-file bytes stayed unchanged. This checkpoint
does not infer who accepted terms, mint a new acceptance record, or claim a
specific faucet transaction. No raw wallet response, login identifier, token,
signature or private journal is copied here. Public values above are explicitly
transcribed from the committed preflight, not fabricated JSON evidence.

## What the refusal diagnosis actually says

**No exact sent `validBefore` exists**, because no J4 `services pay` invocation
or payment signature was made. The source trace predicts a root **Gateway**
refusal, not a session refusal. At source baseline9305ff2:

| First applicable check | Source and predicted result |
|---|---|
| Root echoed requirements | `apps/hub/src/server.ts:1232` calls `challenge.ts:54–58`; HTTP402 `{"error":"payment_invalid","detail":"requirements_mismatch"}` because CLI timeout2592000 does not equal advertised604900 |
| Gateway lifetime, if verification is reached | `packages/payments/src/gateway.ts:100,112` checks echo and `validBefore<=verifierNow+604900`, span<=605500; maps to `InvalidSignature`, reason `Gateway authorization refused` |
| Vanilla root EIP-3009 | `packages/payments/src/eip3009.ts:295–300` checks now inside the interval, with no maximum lifetime; **no validity-policy change is needed for this issue on that path** |

The CLI source constructs `validAfter=signerNow-600`,
`validBefore=signerNow+2592000` for Gateway. These formulas are not observed
absolute timestamps. See the [full source trace](../evidence/J/circle-cli-preflight.md#root-refusal-trace-source-only-clarification-sep7)
for pinned CLI line references and the second root error mapping.

Root-only does not mean vanilla-only: the dual-rail CLI chooses Gateway.
The latest owner/conductor decision keeps **J4 live and Plan I live capture/pay
paused**. A root vanilla experiment is not silently substituted for that
decision. No validity constant, cap or replay protection has changed.

## Evidence still needed

- I1: fresh read-only readiness at a subsequently cleared live boundary, without
  reinstalling/recreating/refunding already provisioned resources.
- I2: bounded capture with bearer material removed before any disk/log write;
  an actual captured fixture must identify its exact client version and provenance.
  Synthetic decoder tests or a0.0.6 comment are not1.0.0 capture evidence.
- I3/J4: the explicitly cleared, capped CLI purchase; ARCADE terminal receipt
  polling; independent settlement/balance checks. A202, estimate, accepted
  Gateway UUID or header replay is not a mined settlement.

`CIRCLE_CLI_SETTLE_TX`: **NOT_RUN**. There is no transaction link to provide.
The [Circle source plugin preview](../evidence/J/circle-full-source-preview.md)
is a separate proven offline ingestion result, not this payment proof.
