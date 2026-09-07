# Task5C — Owned delegated-funding proof

5A–5B3 code is merged; J4 live stays paused. This proof must not replay F1 or
any other consumed approval. Current [keyless preflight](../../../evidence/J/unified-delegate-preflight.json)
observed status none, not an already granted delegation or live delivery.

## Order and authority

1. Resolve the current source-linked Wallet/Minter deployment identity and read
   current roles/balances/delay. Do not promote an observed code hash into an
   accepted compiled-source baseline. F11's known Minter mismatch is a technical
   prerequisite; existing F11 validity/identity/replay controls stay unchanged.
2. Build an import-safe, fresh-owned one-shot harness with durable intents and
   independent receipt/API readbacks. Private journals survive failure/cleanup;
   repeated paths/actions never replay a spend. No mainnet or new service config.
3. Only after offline gates and preflight pass, use the existing buyer as owner
   and dedicated Gateway buyer as delegate for the pre-approved grant,
  0.50USDC depositFor,0.25USDC delegated delivery to Arc and one paid call.
   Source is Arc_Testnet unless the pinned SDK actually refuses it; Base Sepolia
   substitution needs its own concrete recorded source/faucet facts.
4. Read keys only in consuming processes. No raw signature, transaction bytes,
   SDK event/error, auth header or personal path enters public evidence.
5. Independently verify source custody/debit/fee, destination mint and paid-job
   effects. The delegate's existing funds/Gateway balance cannot be presented as
   new delivery or provenance. Force the intended paid rail and label fungibility.

An owner grant is a persistent source-spending permission, not a one-call cap.
This approval does not infer a new automatic revocation. If a live technical
prerequisite remains unresolved, retain precise findings and continue J6 offline.
J6 deployment still stops at its explicit owner treasury checkpoint; J7-J9
offline work follows without pretending an undeployed escrow exists.

Root-only, four workers, one sequential full gate per commit, no push.
