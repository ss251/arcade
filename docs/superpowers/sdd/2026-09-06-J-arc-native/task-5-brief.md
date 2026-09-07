# Task5 — Unified Balance delegated funding

Execute after the [Task4 source-only refusal clarification](../../../evidence/J/circle-cli-preflight.md).
J4 live remains paused; its validity policies, caps and replay guards are not part
of this task. No J4 approval has been consumed.

## Checkpoints

1. 5A: pin Unified Balance Kit1.6.0 and Viem adapter1.17.1; implement/test
   immutable funding terms, owner readiness, typed SDK allocation binding,
   intent-before-spend and one-attempt outcome contracts.
2. 5B: guarded read-only owner and lazy delegate adapters, durable evidence
   reusing Gateway funding journal IO, strict `arcade fund`/buyer CLI, owner
   addDelegate instruction, dry-run, command-local lifetime/fee/gas guards.
3. 5C: separate owned live harness, gates, approved testnet proof and independent
   readbacks. No replay of consumed proof actions, raw logs or keys in the repo.

Only the first checkpoint is implemented so far. No runnable funding CLI,
durable journal, owner grant, deposit, delegate spend or payment is claimed.

## Source-backed corrections to the shorthand plan

Read Circle's installed unify-balance skill and both complete Viem/delegate
references. The plan already selects standalone Unified Balance Kit, EVM
self-custody and testnets; no new product/account choice is needed.
The current [delegate quickstart](https://docs.arc.io/app-kit/quickstarts/unified-balance-delegate-deposit-and-spend)
and pinned package declarations require `sourceAccount` within `from`, an
explicit allocation summing to the amount, and either a destination adapter or
an explicit forwarder. Use the same guarded delegate adapter for Arc delivery;
do not enable forwarder, auto-allocation, custom fees or retry.

Readiness is owner-account/source-specific, not the delegate's own balance.
SDK bindings check the owner reader identity and both source/destination delegate
identities. Unknown status fails closed. `none`/`pending` cannot spend.

USDC input stays a positive six-decimal string, never floating point. Supported
sources are exactly Arc_Testnet and Base_Sepolia; destination is Arc_Testnet and
recipient is the distinct delegate. The owner retains source-account custody.
A ready delegation permits future source spending: it is not a per-call cap.

## Runtime work still required

- Default Viem adapter1.17.1 invokes `waitForTransactionReceipt` internally.
  Supply a guarded receipt implementation using the project's bounded
  one-receipt-per-tick reads; never use default polling against Arc public RPC.
- Kit1.6.0 fetches route fees dynamically. An estimate alone is not a final
  signing cap. Validate actual typed signing terms and destination transaction
  fees before allowing the lazy signer; preserve no-mainnet/no-retry rules.
- Disable both SDK analytics and error reporting, and never print SDK events or
  raw errors. Persist public intent before SDK execution. After any possible
  signature/dispatch, failure is uncertain and requires reconciliation.
- The 5A WeakSet prevents repeat/concurrent attempts on one in-memory journal
  capability only. Durable ownership/replay refusal belongs to5B, not5A.
- The SDK-returned transaction hash must match source allocation, owner and Arc
  recipient, but remains `sdk_returned`, not independently confirmed evidence.

5C approved scope stays the plan's owner/delegate testnet grant,0.50 deposit,
0.25 delegated delivery and one paid call. Re-check roles, chain, available
funds, fee/gas bounds and unused action intents before reading any key. The
funding proof must not silently consume pre-existing buyer funds as its proof.

## Verification

Root-only, four workers, no parallel gate. Focused policy/binding tests and strict
types first; freeze code, run one full sequential gate, record any split failure
honestly, audit privacy/scope and commit. Merge incrementally without squash/push.
J6 deployment stops at the explicit owner treasury checkpoint; J7-J9 offline
work can continue while that decision is pending.
