# Task5B2 — Funding signing guards and command policy

Offline checkpoint, not an executable/live funding claim. The guarded SDK
transport, adapters, actual entrypoint routing and owned live proof still
follow. No existing payment validity constant, fee cap or replay guard changes.
The only F11 source edit exports its existing frozen EIP-712 type schema.

The new guard captures the final single BurnIntent without rewriting its
digest: owner custody, distinct delegate signer/recipient, explicit Arc or
Base Sepolia source, Arc destination, pinned contracts/USDC, exact amount,
zero caller/empty hook/nonzero salt, finite source height and fee ceiling.
The caller supplies current block, withdrawal delay and a finite maximum
block delta. An out-of-bounds estimate is refused, not extended or edited.
Destination mint validation accepts only a canonical single/singleton-set
attestation committing that in-memory validated spec, exact Minter/calldata,
zero native transfer and nonzero finite unexpired attestation height.
These are funding guards, not the separate batched-payment time policy.
Deployed contract/attester identity, gas and independent receipt verification
remain runtime responsibilities; this codec does not prove them.

The strict CLI policy captures bounded own-data argv before awaits, rejects
mainnet/ambiguous amounts/duplicates/unknown flags/key arguments, emits offline
dry-run without SDK/key access and gives a precise source-specific interactive
owner addDelegate command. Pending means wait for the existing grant, never
repeat it. The grant is not a per-call cap. Ready execution requires a fresh
private journal and explicit finite max-burn-block-delta. New funding defaults
are a0.05USDC fee ceiling and0.10native-USDC destination gas ceiling; both are
printed in help/dry-run and caller-overridable. They do not alter existing
payment/funding APIs. SDK return remains independentlyConfirmed:false.

31 final signing/mint tests and33 command-policy tests pass. Initial absent
guard module was setup failure. The first CLI malformed-array table incorrectly
spread arguments; strict checking exposed it, the table was corrected to object
rows and all cases rerun. Final64focused tests/2files/603ms and4-root strict0.
No private key, SDK live request, owner grant, deposit, spend, payment, deployment,
agent or push. Sole frozen84370 full gate PASS:4,792Vitest/212files/66.58s;
887Bun/58files/6,411assertions/167.89s; root/web strict; client412ms/SSR202ms.
Five code/test pins unchanged;9-path/21-link privacy/scope audit before staging.
No full-gate replay. Runtime/entrypoint wiring remains the next checkpoint.
