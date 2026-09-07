# J8D2 — receipt readers and result release

Continue the [terminal brief](task-8d-terminal-brief.md) after the merged
[J8D1 Store](task-8d1-report.md) and its separate fixture cleanup. Implement
explicit escrow evidence validation in pure receipt/reference/public/summary/
tree readers and the token-gated ordinary result branch. No payment route or
boot activation yet. Then C2/D actual budget/root composition and Task9.

Use one getter-free, closed escrow receipt view to check nested metadata against
outer rail/network/root/amount/allocation/settled/reference fields. Legacy
receipt behavior remains unchanged. Invalid escrow evidence never becomes a
settled result or a link. Confirmed complete has a settlement reference;
confirmed reject has a separate refund reference; uncertainty has neither.
The result route retains authentication, private/no-store, cancellation and
fixed errors; it must not use private runner errors or the legacy uncharged
fallback for escrow. Output requires valid confirmed settlement and matching
stored job. Metadata shape validation is not fresh chain verification.

Public metadata is explicitly whitelisted, naming the on-chain identity
`escrowJobId` rather than the private hub job ID. Do not spread private receipt
metadata, buyer, capability, input/output or diagnostics. Compact root children
do not carry rail provenance: do not infer their rail or explorer link from an
escrow root, and do not trust forged child provenance properties. Full child
receipts in summary/tree establish same-network legacy-rail lineage and exact
commitment/reference/price/skill matches. Child escrow remains unsupported;
legacy-root same-rail rules and canonical tree hashing remain unchanged.

Escrow leaf commitments use zero tree hash; missing commitment/cost evidence
must still remain incomplete. Uncertain root settlement never yields a final
margin claim, even when the known inference and child-spend figures exist.
Add focused regression tests and actual owned-loopback result/refusal tests,
then one sequential four-worker gate for the atomic checkpoint. No owner keys,
RPC, spends, deployments, authorization-window/cap/replay changes or push.
