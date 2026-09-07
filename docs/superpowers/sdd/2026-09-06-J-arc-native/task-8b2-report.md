# J8B2 — concrete read-only provider preflight

Continue the [Task8B boundary](task-8-brief.md) after the
[local completion data](task-8b1-report.md). createEscrowProviderReader takes
independently pinned deployment identity, locally expected provider, bounded
operation deadline/abort signal and clock. Its only public method is read.
There is no signer, gas proposal, send method, key lookup or discovery fallback.

Before RPC it captures context, checks configured escrow/hook/evaluator/token/
treasury/provider and a uint72 nonce. The existing fixed Arc transport and
full finalized identity reader then check the canonical job. Provider code must
be empty and its packed nonce unused at that same block. A final canonical
block hash/time and chain check plus freshness/state checks prevent a reorg or
stale response from becoming signing preflight evidence. Abort/deadline is
bounded even when injected IO ignores cancellation; late responses cannot
resume subsequent requests. This trusts the configured RPC, not a light client.

assertEscrowProviderJob exposes the EXISTING provider budget/submit state
predicates before signing. Relay preparation calls the same function, retaining
its prior Open/unbudgeted or Funded/unsubmitted, token/amount/context, remaining
lifetime and expiry conditions. No dummy signature is used to test state. No
existing payment or provider validity constants, caps or replay rules change.

TDD started with the missing module. Focused40Vitest/3files passed:14new
preflight cases and26existing executor/evidence cases. Four-root strict checks
passed with zero diagnostics after correcting fake-fetch typing for Bun's
preconnect declaration. Tests use encoded fake RPC facts, not owner keys/live
RPC: both stages, wrong configured context/nonce, used nonce/fee/description/
state/pending claim, coherent insufficient lifetime, non-EOA provider, reorg,
chain switch, stale clock and pre-entry/late cancellation.

Final scope audit:9paths,77local links,empty index,privacy scan no matches.
Sole full gate73692 PASS:5,025Vitest/228files/69.54s;
973Bun/72files/7,641assertions/173.20s;root/web strict and client/SSR builds
(345ms/180ms). Four code pins are unchanged from the tested freeze.
The next8B checkpoint
must supply the durable signing journal/runtime and original-socket local-job
authority;8C/8D hub admission/pipeline and9 buyer lifecycle follow. This read-only
result is not a signing claim or execution grant. No keys, actual RPC, signing,
money, deployment, activation, approval replay or push occurred. J4/J5/J6 live
pauses remain unchanged.
