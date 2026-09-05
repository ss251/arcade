---
name: counterparty-graph
description: Apply a bounded evidence policy to an address's indexed ERC-8004 identity, validation and feedback on Base. Return manual-review or refuse with contradictions and source coordinates, not a financial safety guarantee or verified customer-settlement claim.
---

# counterparty-graph

An ARCADE script listing priced at **$0.05 per call on Arc testnet**, with data
query costs paid separately by its seller on **Base mainnet**. It depends on The
Graph for the indexed facts; it does not proxy arbitrary GraphQL or return raw rows.

**Current evidence boundary:** there is no counterparty service-settlement verifier
or configured trusted-validator policy in the production runner. It never returns `allow`;
`attesterSettledCount` stays `0`. The schema retains `allow` for the pure policy's
separately verified fixture/future-verifier branch. No paid Graph query is claimed
by the current local implementation checkpoint. Base-mainnet spending remains OWNER-gated.

## Input and bounded work

Supply exactly one public EVM address; no caller-selected query, endpoint, key,
chain, validator policy or payment amount is accepted:

```json
{"address":"0x1111111111111111111111111111111111111111"}
```

The script makes at most two sequential fact queries from the fixed files in
[`queries/`](queries/identities.graphql). The first reads up to 25 owner matches
and 25 wallet matches, with up to 25 validations per identity. Only canonical
Base IDs and coherent metadata allow the second query, which reads up to 100
feedback records at the **first block hash**. Revoked records are intentionally
included so they can be reported as contradictions. These bounded pages are not
a claim to enumerate every historical identity or customer.

A fully validated empty first result skips query two and yields
`refuse` / `no-erc8004-identity`. Malformed identities, full pages or incomplete
metadata do not become empty evidence: the runner stops further purchases and
returns an incomplete `manual-review` assessment, or a protocol refusal when the
transport/payment contract fails. If the backend refuses the historical block
argument, the script does not retry an unpinned query.

## Two separate payment legs

| Leg | Network | Token | Who pays |
| --- | --- | --- | --- |
| Buyer → ARCADE skill | Arc testnet, `eip155:5042002` | USDC `0x3600000000000000000000000000000000000000` | Buyer, under ARCADE's settle-on-success policy |
| Skill → Graph gateway | Base mainnet, `eip155:8453` | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Seller's dedicated Graph payer |

The unsigned 402 observed at **2026-09-05T09:54:03.618Z** advertised exact EIP-3009
payments of **10000 atomic USDC ($0.01)** per query. The client is pinned to that
price and permits at most two authorizations: **up to $0.02**, not a guaranteed
cost or observed paid bill. An empty/incomplete first result buys at most one.
The Arc listing price is not the seller's profit; any other operating costs and
the possibility of an unrewarded query remain separate.

The selected source is Agent0's Base ERC-8004 subgraph:
`43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb`, reached only at
`https://gateway.thegraph.com/api/x402/subgraphs/id/43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb`.
The client pins the observed merchant, USDC domain, price and resource metadata;
the gateway's internal HTTP resource description is comparison data only, never
a request destination. A changed challenge fails closed pending source review.
Changing networks requires a reviewed multi-field policy change, not just a URL.
Background: [Agent0 documentation](https://thegraph.com/docs/en/subgraphs/existing-subgraphs/agent0/)
and [Graph historical-query API](https://thegraph.com/docs/en/subgraphs/querying/graphql-api/).

## Output and what is not proven

Output contains bounded identities, stable contradictions, completeness flags
and source coordinates. It never contains raw feedback prose, GraphQL responses
or secret configuration. Illustrative contract example, not a live result:

```json
{
  "address": "0x1111111111111111111111111111111111111111",
  "verdict": "manual-review",
  "identities": [],
  "attesterSettledCount": 0,
  "contradictions": [],
  "evidenceFlags": ["metadata-missing", "evidence-incomplete"],
  "sources": [{
    "name": "agent0-identities",
    "endpoint": "https://gateway.thegraph.com/api/x402/subgraphs/id/43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb",
    "subgraphId": "43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb",
    "block": null,
    "blockHash": null,
    "chain": "eip155:8453",
    "costAtomic": null,
    "paymentTx": null
  }]
}
```

In source records, null means unknown, not zero or a quoted price. The example is
for contract illustration; successful production paid-query records require an
independently checked Base receipt. The client treats the payment-response header
only as a transaction locator, then checks exact USDC transfer and authorization
nonce events, matching successful receipt/block and the expected chain.
**Query payment is not counterparty service-payment proof.**

A feedback envelope's payment hash is only a claim. It does not establish a
customer purchase or increase `attesterSettledCount`. The pure policy can count
unique non-self customers only when a separate trusted local verifier supplies
fully bound service proofs; indexed `verified` fields cannot provide that
authority. Validator success likewise is not trusted merely because it is indexed.
Neither `allow` in the schema nor any other verdict guarantees future conduct.

Stable contradiction codes:
`no-erc8004-identity`, `validation-failed`, `registration-inactive`,
`x402-unsupported`, `wallet-differs-from-owner`, `feedback-revoked`,
`self-attested`, `unattested-no-proof-of-payment`.

Stable completeness/evidence flags:
`malformed-evidence`, `source-invalid`, `metadata-missing`, `metadata-inconsistent`,
`evidence-incomplete`, `identity-conflict`, `relationship-mismatch`,
`registration-missing`, `validation-unknown`, `validation-untrusted`,
`payment-proof-unverified`, `payment-proof-invalid`.

## Owner-controlled setup

Install from the repository root using the committed lock, with lifecycle scripts
disabled:

```sh
bun --no-env-file install --frozen-lockfile --ignore-scripts
```

The implementation retains `@graphprotocol/client-x402@1.0.0` and directly pins
`@x402/fetch@2.25.0` / `@x402/evm@2.25.0`. It uses the low-level v2 client with a
minimal guarded signer; automatic wrapper recovery and v1 registration are not
enabled. It does not change global fetch or an ambient payment-key variable.

An owner must approve and provision a dedicated, tightly funded Base payer before
serving paid requests. Select **exactly one** private configuration route:

- `GRAPH_X402_PAYER_KEY`, supplied securely to the consuming runner process; or
- `GRAPH_X402_KEYCHAIN_SERVICE`, the explicit item name for a bounded local lookup
  on macOS. There is no default Keychain item and no fallback after a failed choice.

Do not print, paste, echo or save a private value to a source file or `.env`.
Provisioning/import is an owner action; this guide does not run it or expose a
key-retrieval command. The manifest forwards only these declared private settings;
it grants no ARCADE hiring capability. Missing/ambiguous credentials refuse before
a query. For a refusal test, use an isolated process without either setting;
never delete an active payer's Keychain item or change a live runner's environment.

`arcade publish <skillDir>` previews the public listing; it does not by itself
start serving it. An owner-configured `arcade start` serves its configured skill
directory. Do not reinitialize or repoint an existing runner for this demo.

## Failure, bounded cost and reconciliation

Missing keys, invalid input/challenges, timeouts, payment uncertainty, RPC proof
failure, Graph errors or invalid final output yield `stopReason: "refusal"` with
no `output`. Exit zero alone is not success; the actual script adapter observes
the refusal marker. The seller may pay for Graph data and earn nothing on Arc
when later processing refuses. ARCADE's buyer-side settlement policy remains
separate from the seller's already-signed Graph authorizations.

No automatic paid retry occurs. Each factory is single-flight and permits at most
two query attempts and two exact authorizations. An uncertain signed request
blocks further requests in that run. The 90-second listing includes bounded
stdin, key process, headers, response bodies, RPC checks and owning-process cleanup.
It does not revoke a previously signed authorization. After uncertainty, reconcile before any new run;
restarting is not permission to repeat a payment. No durable cross-run payer
budget, independent revocation or blanket funding authority is claimed.

## Local verification

```sh
bun --no-env-file run test:vitest skills/counterparty-graph
bun --no-env-file test skills/counterparty-graph/test/run.bun.test.ts
```

Tests use pure synthesis, public dummy keys, injected queries and owned finite
HTTP/process fixtures. Actual Graph data purchase, indexed historical-query
acceptance, production serving and an Arc buyer settlement remain separate live
evidence gates. No Studio MCP discovery or current testnet-host availability is
claimed by these local tests. See the [execution records](../../docs/superpowers/sdd/2026-09-04-G-graph/README.md).
