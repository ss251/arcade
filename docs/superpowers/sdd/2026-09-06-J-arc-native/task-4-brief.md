# Task 4 — Circle CLI proof

Start from merged459f5fb. Root-only; four-worker sequential gates, one full gate
per commit, no push. Split into4A bounded evidence/sequence contracts and4B owned
live runtime plus proof.4A must make no live wallet/funding/payment request.

Approved live bounds: one direct0.5USDC Gateway deposit plus necessary testnet
gas and one0.01USDC ordinary listing purchase, all on Arc testnet. No paid retry,
second deposit, mainnet, deployment or reuse of the consumed F1 approval.
Existing Circle testnet login is reused, with unchanged terms. Seller/facilitator
keys are read only in the consuming command, passed through minimal process
environments and never printed or written.

Read-only preflight observed the existing Arc agent wallet with20.0005USDC and
zero Gateway balance; it resolved a distinct backing EOA. No new wallet was
created. Circle CLI1.0.0 and installed Circle skills1.1.0 were inspected.

## Evidence corrections to the original plan

Installed CLI resolveSignerAndPreflight resolves the backing EOA for Gateway.
Its direct deposit calls depositFor to credit that EOA; assert the observed
identity mapping, not an SCA signature. Circle's current
[buyer quickstart](https://developers.circle.com/gateway/nanopayments/quickstarts/buyer)
also explains that Gateway requires EOA signatures rather than SCA signatures.

ARCADE queues a successful paid request with202 and a private poll URL. The
CLI returns that response without polling. Verify it separately through the
owned same-origin job endpoint and persisted receipt, never invent an immediate
200 or leak the poll token. A transfer accepted for later batching is not a
mined transfer or proof of seller on-chain credit.

The CLI's inspect metadata comes from its registry lookup. A loopback testnet
listing is not a public registry member. Use explicit POST/input for baseline
inspection; report any absent metadata honestly. An additional inspect with
the existing CIRCLE_DISCOVERY_URL override pointing at the owned hub's registry
view may prove metadata consumption, but is labeled local discovery, not
public marketplace listing.

## Safety and verification

Use a fresh0700 owned directory and exclusive0600 journal; persist intent
before each one-shot action, poison on write failure, and retain failed runs
for reconciliation. No automatic resume. Capture only bounded public facts
and hashes, not credentials, raw payment authorization or private poll token.
Default/help/refusal paths never read credentials or write a journal.

Before any spend: verify chain5042002, pinned USDC/Gateway contracts, approved
price/recipient, canonical first-party no-provider script, signed runner
readiness, both real accepts, actual CLI inspection and estimate, fresh wallet
and Gateway observations. Every CLI invocation uses argv arrays, explicit
chain/method/cap and no inherited acceptance or telemetry override.

An owned loopback runtime may add a one-paid-request safety guard and parent/
deadline cleanup without replacing hub verification, settlement, runner
execution or provider transport. Verify deposit receipts and Gateway balances,
one durable job/receipt, actual backing-EOA payer, successful script output and
Gateway transfer reference independently. Publish only a scrubbed summary after
owned children and listeners have stopped. Unexpected outcomes remain partial.
