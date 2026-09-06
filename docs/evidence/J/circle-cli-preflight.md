# J4 Circle CLI preflight — read-only, no payment yet

Observed2026-09-06 22:06–22:08UTC (Sep7 03:36–03:38IST), using the existing
Circle CLI1.0.0 testnet session. Four actual read-only invocations: wallet status,
wallet list on ARC-TESTNET, wallet balance, Gateway balance. Terms-file bytes
were unchanged. No login, acceptance, new wallet, credential disclosure, deposit,
authorization, paid request or mainnet action occurred.

| Public observation | Value |
|---|---|
| CLI agent wallet on ARC-TESTNET | 0xb70ffda6628f0ccce394e8617c4a92c201892cd2 |
| CLI-resolved backing EOA | 0x0d8323e9577298f694e1e62d5937262b45083e5f |
| On-chain USDC | 20.0005 |
| Gateway available balance | 0; CLI returned no positive balance row |

The native18-decimal and ERC-20 six-decimal wallet views show the same Arc USDC,
not two balances to add together. These are historical observations, not proof
of funding at a later payment's signing boundary.

The installed CLI bundle is2,015,286bytes, SHA-256
`40508e51b251c0c7b696a3ee30f2c21b7052b00b483ec4fc2d64811135ea6df0`.
Its actual inspect/pay/deposit help was read. Direct deposit explicitly supports
ARC-TESTNET. In this bundle, resolveSignerAndPreflight resolves a backing EOA
for Gateway; executeDirectDeposit calls depositFor to credit that EOA. This is
consistent with Circle's documented
[EOA signing requirement](https://developers.circle.com/gateway/nanopayments/quickstarts/buyer).
The SCA is the CLI funding wallet, not the expected Gateway authorization payer.

The CLI treats a successful202 as a returned response; it does not perform
ARCADE's private job polling. Its inspect metadata is sourced from a registry
lookup, so loopback listings need explicit POST/input and any local discovery
override must be labelled. No public marketplace membership is claimed.

Task4A provides only offline evidence contracts and a private journal. The owned
hub/runner live runtime, deposit, capped purchase, terminal receipt and independent
chain/Gateway verification remain NOT_RUN. This file cannot satisfy the live
Task4 gate or replace F1 evidence.

## Additional compatibility blocker, found before spending

In the pinned CLI bundle, createPaymentSignature sets its Gateway minimum to
`30 * 24 * 60 * 60` seconds and returns that altered value in the echoed
accepted requirements. There is no validity override in its help/source.
ARCADE pins604900seconds and requires the signature and echoed requirements
to match that policy. These do not interoperate as currently configured.
This is a source-verified refusal prediction, not a failed live payment.

One anonymous read of Circle's
[supported endpoint](https://gateway-api-testnet.circle.com/v1/x402/supported)
still reported604800seconds as the Arc minimum. At22:29:49UTC, the
[package registry](https://registry.npmjs.org/@circle-fin/cli/latest)
still reported1.0.0 as latest. No upgrade, CLI patch, expiry-policy relaxation,
funding or paid retry was performed. Owner direction on a bounded testnet
compatibility profile is pending.
