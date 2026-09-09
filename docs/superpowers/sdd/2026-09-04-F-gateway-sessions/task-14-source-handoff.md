> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F14 source handoff — receipt references, session marker and claims

September 6, 2026. Parent preparation while F10 is being implemented and reviewed.
F14 source is held until the preceding F11/F12 checkpoints. No test, source edit,
network, credential, signing, Git or live evidence is performed by this note.

Read the complete original Task14, current F12 parent/handoff requirements,
FROOT receipt renderer/public projection/tests, private job-result projection,
core chain config and the held H1/H4 public whitelist/client formatters. The
literal plan's negative-only gateway-batch link rule and twenty-calls-one-
settlement claim are superseded by the verified F3/F8/F9 evidence contract.

## Exact starting source and test scope

- apps/hub/src/receipt-reference.ts (new): import-safe pure reference-to-link
  predicate shared by the receipt UI, public feed and private receipt projection.
- apps/hub/src/ui.ts: root/child receipt links and a plain session marker.
- apps/hub/src/receipts-feed.ts: the same link rule and derived public marker,
  never the private session ID.
- apps/hub/src/server.ts: only the two existing private job-result receipt
  explorer fields and the new pure helper import; no route/payment rewrite.
- apps/hub/test/receipt-reference.test.ts (new), existing ui.test.ts and
  receipts-feed.test.ts: reference truth table, marker/privacy and escaping.
- README.md, docs/architecture.md, docs/buyer-guide.md: concise current API,
  rail/session limits and honest evidence links. F11 owns docs/sessions.md.

An existing actual job-result HTTP test may be extended if needed to prove the
private projection uses the shared helper; identify and release that exact path
before editing. No global explorerTxUrl signature change, core schema or new
dependency is needed. Do not bring forward or overwrite H's unmerged source.

## Receipt link and marker contract

Use explicit configured networks, not the ambient process-selected explorer.
Link only settled EIP-3009 receipts with a nonzero canonical32-byte transaction
hash, a ready manifest with agreeing chainId/CAIP-2, and an absent legacy kind or
explicit onchain kind. Unknown/mismatching kinds, pending/unknown networks,
unsettled receipts, zero/malformed hashes, Gateway and TestRail never link.
Even a hash-shaped Gateway reference is not per-call mining proof. Child rows
inherit the trusted root's rail/network/kind context because ReceiptChild has
no independently recorded rail/network; they must also be settled with a valid
hash. Do not manufacture a child's network or use process config as provenance.

Keep Gateway UUIDs visible as escaped Gateway transfer references, not transaction
links or a promise that a batch mined. TestRail is simulated evidence. A link is
a reference for independent inspection, not fresh receipt/status verification.
Preserve money formatting, canary markers, existing settlement colors, child
indentation and all escaping. No unrelated redesign or canary/pay-test rewrite.

Public session provenance is a boolean `session`, derived from the trusted
receipt's canonical ses_32-lowercase-hex sessionId. Set the computed value after
the current rest projection so an unknown extra field cannot forge it. The
private ID, buyer, nonce and root/child job IDs remain excluded at every depth.
The SSR UI emits only the word session, never the ID in text or attributes.
Test malformed/absent IDs and an extra pre-existing boolean as negative cases.

The current public-feed tests incorrectly expect explorer links for simulated
TestRail and malformed transaction strings. Capture those actual Reds, then
update their explicit expected semantics; preserve amount/tree/privacy coverage.
Use valid EIP-3009 fixtures where a positive link is the assertion under test.
Add Gateway UUID and hash-shaped Gateway negatives, conflicting kinds, wrong
network, zero hash, released receipt, child inheritance and HTML injection cases.

## Held H integration

H1 already replaces the old rest projection with the stricter scrubReceipt
whitelist. Preserve that whitelist during the later H rebase; add only the
derived boolean and stricter kind-aware helper use. H4's bounded receipt decoder
must retain a validated optional boolean for display, never add session IDs or
loosen public field projection. Its formatter already refuses Gateway/Test
links, but the merged rule must also retain the reference-kind qualification.
These are later H integration checks, not authorization to edit H ahead of F/G.

## Documentation and verification

Use actual frozen F9/F10/F11 names and strict CLI flags, literal loopback origins
or HTTPS, and no embedded operational keys. A session is a ceiling plus a rail,
not escrow, prepay, revocation or a discount. Each intentional call signs once;
issued and uncertain exposure persists through release/close. Wallet USDC,
Gateway available, pending credit and hub held/remaining are distinct. Deposit
and withdrawal are explicit separately journaled commands with current identity,
fee/gas/height checks; no automatic funding, instant withdrawal or retry claim.

F1's single consumed live proof remains historical. F12's twenty-call offline
run must be identified as controlled local evidence, with twenty distinct
accepted references rather than one mined batch. Live F12 remains NOT RUN under
no-new-spend; F13 fallback was not triggered. Arc Gateway is testnet-only in the
pinned config; mainnet remains pending and any later mainnet path is owner-only.

Root owns independent source/public review, complete test/root-web type and web
build gates before the F14 commit, then all four full-F merge gates including
Forge. Check desktop/mobile receipt rendering through owned local fixtures and
clean up the preview; no production repoint, new live payment or push.
