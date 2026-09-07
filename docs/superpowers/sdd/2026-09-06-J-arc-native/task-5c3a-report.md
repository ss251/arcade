# J5C3A — Owned proof safety and evidence contracts

Implements the evidence/safety foundation for the live harness; no live entry
point, signer acquisition, grant, deposit, funding or purchase exists here yet.

- Fixed approved owner/delegate,500000atomic depositFor,250000delivery and10000
  paid-call terms. Fresh proof requires no existing delegation/allowance/custody;
  reserves three owner gas caps and destination mint gas before permission.
- Exact grant/approve/depositFor calldata. Generic transaction check recovers
  sender and binds testnet chain, calldata, nonce, value, gas and fee fields;
  no access list, priority fee or over-cap signature can pass.
- Proof-only compiled identity check reuses F11's Wallet validation and accepts
  only the fully reproduced J5C1 Minter build with its exact implementation and
  three declared self words. **F11 acceptance remains unchanged.**
- Mint evidence requires one exact USDC zero-address transfer to the delegate and
  one correlated AttestationUsed with owner as depositor and delegate as signer.
  Canonical receipt/transaction checks remain a runtime responsibility.
- Fresh O_EXCL/no-follow file in an owner-only0700canonical parent;0600single-link
  file, fsynced header/events/hash chain and directory. Exact stage progression,
  closed public-only facts, no reopening/overwrite/resume. Failed appends poison
  further writes; evidence survives close/uncertainty. This is a cooperative
  owned proof journal, not an account-global lock against another same-user
  process creating a different path. The executor must not replay an approval.

A fresh [keyless finalized check](../../../evidence/J/unified-proof-identity.json)
at03:00:27.403UTC, block60847327, passed both actual proof-only identity functions.
Nine RPC reads, zero keys/sends. This is prerequisite evidence, not funding.

The earlier unsigned0.25USDC estimate at02:50:11.260UTC returned maxFee3850atomic
and maxBlockHeight62228535, with a subsequent source block60846137. Its finite
height delta was1382398blocks. No signature or transfer was produced, and this
does not select/change a signing cap. The live harness must supply an explicit
finite cap to the already guarded CLI; it must not rewrite the API's signed
terms or alter J4 payment/session validity.

Focused10Bun/78assertions/229ms and three-rootstrict0PASS. Actual identity read
also passed. Initial five strict diagnostics (test variable/topic types and a
redundant already-narrowed comparison) were corrected. Sole frozen71856 full
gate PASS:4,825Vitest/214files/65.76s;927Bun/62files/6,656assertions/171.85s;
root/web strict;client356ms/SSR167ms. Three code/test pins unchanged and
seven-path/28local-link scope/privacy audit passed. Final audit, atomic commit
and exact one-commit fast-forward follow.

Next: owned runtime orchestration for snapshot/grant/approval/deposit/readiness,
guarded Kit spend and independent receipt/API/source reconciliation, then the
isolated one-call real-eip3009 purchase proof and cleanup. Gate the complete
harness before any actual Keychain read or owner-approved money-moving action.
J4 live PAUSED; J6 follows Task5 and stops at its explicit treasury checkpoint.
