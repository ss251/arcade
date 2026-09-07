# J8D2 — explicit escrow receipt readers and result release

Implements the [reader/result brief](task-8d2-brief.md), after the merged
[atomic terminal Store](task-8d1-report.md). No budget/payment route or escrow
boot configuration is activated. C2/D pipeline composition and Task9 remain.

## Recorded evidence, not fresh chain verification

One getter-free view distinguishes legacy receipts, invalid new evidence and
coherent escrow metadata. It checks the closed metadata schema against outer
Arc network/root/amount/quoted floor500bps allocation/settled/reference fields.
Session/nonce/accrual metadata cannot masquerade as escrow. It imports data
schemas directly, not the core barrel's ambient network selector. A confirmed
completion can link its recorded transaction; a confirmed refund has a separate
refund link; uncertainty has neither. These are inspection links and coherent
recorded facts, not a new RPC proof or authority to send money.

The public whitelist adds only state, `escrowJobId` (on-chain, not the private
hub ID), contract, principal and applicable actual payout/refund fields. It
never spreads escrow metadata or exposes buyer, request hash, job capability,
input/output or private diagnostics. Invalid escrow cannot appear settled or
gain a reference link. Fixed refunded/uncertain reasons replace generic labels.
Quoted price and allocation remain separate from actual money movement.

## Mixed-rail lineage and accounting

Full child receipts establish each legacy child's actual rail, network, price,
skill, settlement reference and root lineage. An escrow root can therefore
contain exact, Gateway or test-rail descendants. Missing/foreign/conflicting
child evidence stays incomplete; child escrow is refused. Legacy-root same-rail
rules remain unchanged. Compact manifests lack trustworthy provenance, so their
escrow-root entries expose no transaction locator/link; forged compact rail/
network/kind properties cannot override the full child evidence. Actual tree
nodes use each child's own qualified receipt reference. Gateway/test locators
do not acquire mined-transaction links.

Canonical existing tree hashing is unchanged. Only an escrow leaf uses its
required zero tree hash. Missing commitments still stay incomplete. Summary
revenue includes confirmed settled receipts only; inference and child-spend
figures retain their existing completeness meanings. A separate internal
settlement-complete flag withholds final margin when an escrow outcome is
uncertain, without falsely labeling known costs incomplete or claiming a refund.

## Actual result path

The token-gated ordinary result route calls an escrow-only delivery guard.
Legacy behavior is unchanged. Invalid evidence is unavailable, never a fallback
to the legacy branch. A coherent settled receipt requires the matching stored
root job and a non-refused, nonempty bounded output. The guard snapshots ordered
JSON/scoped bigint data and returns an isolated output. Existing terminal Store
validation supplies proof/context integrity; the delivery guard cannot establish
listing-schema validity or chain provenance independently.

Confirmed refund and uncertainty withhold output and use fixed explicit wording,
not private runner errors or "you were not charged". Authentication, no-store,
request cancellation and fixed storage-failure handling stay in the route.

## Verification

Four genuine initial Reds reproduced missing completion links, omitted refund
metadata, refused summaries and missing mixed-rail trees. Existing reference
tests then caught seven ambient-network import regressions; direct data imports
fixed them. Focused184tests/5files passed in2.30s. Final expanded reader/result
file passed28tests in1.07s, including all three legacy child rails, missing/
foreign child evidence, malformed financial/identity metadata, uncertainty,
getter/duplicate defenses and result refusal/output isolation. Eleven-root
strict checking reported zero diagnostics after the final changes.

Three actual owned-loopback hub cases passed (63assertions,1.447s). Each starts
with a closed/reopened real SQLite terminal Store populated by ephemeral signed
transaction/log/historical proof fixtures. The real router requires the token,
releases only settled output, preserves refund/uncertainty, hides private errors
and input, and exposes no private job ID/output in the public feed. Injected
current-disk proof corruption produces an authenticated503 while wrong tokens
remain404. Child-process fetch/preconnect counters stay zero; every listener
is verified stopped after bounded cleanup. These are offline fixtures, not live
settlement or a complete budget/root pipeline evidence run.

The sole sequential full gate passed: 5,097 Vitest tests across234files in75.89s;
1,075 Bun tests across79files,8,209assertions in182.66s; root/web strict checks
and client/SSR builds. The frozen scope is17paths/107local links, with no
privacy-scan findings; all11code/test pins are checked again before commit.
No owner key, real RPC, payment/deployment, approval replay, existing
authorization-window/cap/replay change, production mutation or push.

## Next

Compose C2 budget HTTP with D root pipeline, explicit durable boot, actual
submit/complete/reject outcomes and post-durable attestation. Forward only
hub-derived root hire capability, never child escrow. Then Task9 buyer path.
J4/J5 live and J6 owner/size pauses remain unchanged.
