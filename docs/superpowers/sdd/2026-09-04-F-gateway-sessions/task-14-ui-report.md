> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F14 UI and documentation author report — September 6, 2026

Parent released this six-path slice after F12 commit fb26382. The complete F14
source handoff, independent readiness review, parent decisions and actual Plan F
global/Task14 text were read before implementation. Parent decisions supersede
the literal plan's negative-only batch link rule and twenty-calls-one-settlement
claim. The ts-testing skill guided behavioral Reds, explicit positive controls,
focused tests and exact TypeScript checks.

## Ownership

This author changed only apps/hub/src/ui.ts, apps/hub/test/ui.test.ts,
apps/hub/src/server.ts, README.md, docs/architecture.md and docs/buyer-guide.md.
B9 separately owns receipt-reference.ts, its tests, receipts-feed.ts and its tests.
The shared helper signatures are receiptExplorer(unknown):string|null,
receiptChildExplorer(unknown,unknown):string|null and hasSessionMarker(unknown):boolean.
UI and server consume the original receipt/root objects, preserving own-field
presence rather than manufacturing an undefined reference-kind property.

No H source, F8 result helper, core/payment/runner/buyer implementation, dependency,
live endpoint, operational credential, signing, funding, Git operation or full
repository suite was used or changed by this author. Parent owns actual rendered
desktop/mobile QA, full gates, publication and commit. G3 owns independent review
and the final combined three-file focused/seven-root strict integration check.

## Genuine baseline failures and Green checkpoint

At06:30:25 IST the existing UI source with the new behavioral expectations ran
45 Vitest cases:21FAIL/24PASS. Failures demonstrated unconditional explorer links
for Gateway UUID/hash, TestRail, conflicting kind, unknown/pending network,
zero/malformed hash and non-settled receipts; root-independent child linking;
the public child skill alias leaking its private job handle; missing session
marker; misleading current-default/page-wide provenance and blanket no-charge
copy; and the requested reference wording. No missing-module failure is reported
as a behavioral Red. Positive legacy/onchain EIP link tests and malformed session
marker negatives already passed and remain positive/negative controls.

Parent additionally approved neutral false-receipt price wording. At06:30:48 IST
the exact added SettleError regression failed1case/48skipped: stored settled:false
rendered "$0 charged". The row now renders an em dash with the accessible title
"No settlement recorded; not a balance proof." Amount formatting, settled values,
columns, status/reason, canary labels and semantic colors remain intact. No new
accounting classifier or inferred cancellation state was introduced.

After the agreed helper became available, all49 UI Vitest cases passed at
06:34:30 IST. Tests also cover full escaped Gateway reference text, simulated
labels, released root/independently settled child, no child session propagation,
forged boolean/malformed IDs, same detail-page heading, present undefined/null/
unknown kind refusal and preserved pay-test/splitter behavior. The three later
invalid-kind cases are supplemental Greens, not independently captured Reds.

Exact nested TypeScript used the repository's parsed root configuration with
only ui.ts, ui.test.ts and server.ts as roots:0 diagnostics. Transitive dependencies
are included; this is not the full root/web program or a build/render claim.

## Source behavior and exact wiring

Receipt root/child links now delegate to the explicit-network, kind-qualified
shared helper. The child uses root provenance and its own settled/reference
fields even if the root is not settled. UUID and TestRail references stay escaped
text, never transaction URLs. Existing pay-test and identity links are untouched.
The known child skillId===jobId alias becomes unknown-skill in public SSR only.
The session label is derived by the helper and emits only the literal word;
canary and session are independent, including released receipts.

Index copy no longer labels all persisted rows from the current default rail.
It retains TestRail simulation disclosure, neutral inspection-reference wording,
Gateway non-mining limits and the independent treasury-is-seller disclosure.
Header and footer distinguish pre-settlement validation failure from unknown
issued-payment outcomes; they explicitly refuse automatic payment retry advice.
The reference cell wraps long text without changing the existing table layout.

Server changes are exactly the new helper import, removal of the now-unused core
explorer import, and the two ordinary authenticated root/child explorer expressions.
An in-memory reversal reconstructs the original complete server SHA-256
b0a9a2d8ffee922cf2e0a695e4ce27ab4ad40159cf275bd34bba6bbed5446e22.
No private-result HTTP integration run is claimed; this is exact wiring plus
pure/UI test evidence. The separate already-strict F8 result helper is unchanged.

## Documentation verification

All three documents now describe the captured session API, eight actual MCP tools,
stacked process/hub/local-issued ceilings, distinct wallet/Gateway/hub quantities,
one-shot calls and uncertainty. Ordinary validation refusal is not described as
revocation or a guarantee of unchanged balance after a lost acknowledgement.
Examples use explicit literal-loopback or owned HTTPS origins and supplied signing
integrations; no private key is embedded in configuration, command or example.
The Promise examples use actual exported names/types and explicit limits, with
close only after successful calls, never in finally. Two complete actual TypeScript
blocks were extracted from buyer-guide.md and checked against the real SDK/core/
viem exports in memory:2snippets/0diagnostics/0filewrites/0signing.

Funding examples are linked to the existing F11 sessions guide rather than
inventing new deposit/withdraw defaults. Current credit-attribution and Minter
identity limitations remain explicit. The pinned Arc testnet and pending owner-
only mainnet state are distinct. F1's consumed historical live proof remains
separate from F12 offline PASS:20calls/20UUIDs, fundsMoved:false, liveEvidence:NOT_RUN,
live entry unimplemented, no F13 fallback activation or replay authority.

The three documents contain20 local Markdown links, all resolving. Pattern checks
and a manual changed-prose review found no personal paths, private journal locators,
owner handoff links, credential material or session/job capabilities. The existing
historical transaction evidence remains attributed rather than treated as a new run.

## Six-path freeze

| Path | SHA-256 |
| --- | --- |
| apps/hub/src/ui.ts | 9c68f03d358946944b7b9209f99e93ef3d29d8b3b42c3b23d3628392a0060c7f |
| apps/hub/test/ui.test.ts | 246ff18c564b170a1711da9e8726892f3e43a8cc2e8f16e3e1b3a6029d2b2c0b |
| apps/hub/src/server.ts | 533f80fe8a6af49214bad0c778b2cd93188dae1f24d208ed2abfffba9aedc6f2 |
| README.md | f381f198260d16d1a47f0e50407ac67c7121519b734da878dc1bb981f5093bac |
| docs/architecture.md | b1dcbecc3e2add91540e6b29929c8f29a6617ae99d36c9ad57abf6c0c9cb1cb5 |
| docs/buyer-guide.md | 24da04e953c902f1c854d34e71186588530c9619a079eba45bd4a65e9582f990 |

All six are held. Parent rendered QA, independent final combined checks, full
gates and commit are pending/separately owned at this author freeze; no future
completion is inferred. This report is a private execution artifact for the
parent's later scrubbed public copy, not an additional product source path.

## Additive parent-rendered mobile and mixed-fee corrections

The preceding119-line original report remains byte-exact at SHA-256
0f5133b372b16413426649c2d4f84e3ebf06c392ed0bec96bca8c1b3e48b2405.
G3's initial independent combined122 Vitest/exact7 strict0 belongs to that earlier
source checkpoint and is retained as historical evidence, not relabelled below.

Parent's actual desktop1280 preview passed the two eligible links, canary/session
labels and private-ID exclusions. Its actual mobile390 preview reproduced a
layout defect: document inner/scroll width423 and table right423.359 exceeded the
receipt region's right366; the screenshot showed clipped references. This is
parent-owned browser geometry evidence, not a string-test layout inference.

Parent released only ui.ts/ui.test.ts for contained horizontal scrolling. Two
collected structure tests failed at06:42:10 IST (2FAIL/49skipped), checking both
index and detail. The narrow source adds overflow-x:auto on the receipt tape,
640px minimum table width to preserve readable columns, and a named focusable
region with a visible keyboard-focus outline on both surfaces. Columns, receipt
arithmetic, row colors and reference decisions are unchanged. The initial scroll
correction passed51 UI tests and exact3 strict0 before the next related finding.

Parent's desktop/source check also found the blanket fee(5%) table heading
contradicting recorded zero-fee Gateway rows. Within the same approved thaw,
three collected tests reproduced that heading/default-label defect at06:44:02 IST
(3FAIL/51skipped). An incidental new assertion expected "$0"; it was corrected to
the existing formatPrice output "$0.00" before implementation, without changing
product money formatting. Both table headings now say fee; initial and refreshed
top metadata say default fee. The now-unused detail-local percentage is removed.

Final author UI54PASS at06:44:36 IST and exact same three-root TypeScript0diagnostics.
Tests pin CSS and accessible structure, not rendered scroll geometry. Parent owns
the actual repeated browser check; G3 owns the narrow independent correction review.
Only these two source fingerprints supersede the earlier freeze:

- apps/hub/src/ui.ts: b5387b04dd94c7c52c3a8b6c5889c223712e6a25ca703d5fc1ab1d83613045b5
- apps/hub/test/ui.test.ts: c6decb4f5f225d6104988ffef960f1a4f6fc3c7e5239768252c1778ffbcda66b

An exact in-memory removal of the two new test groups and renderMeta import
reconstructs original test246ff18c; the other four owned files remain unchanged.
No source changes are planned beyond this freeze absent a concrete review finding.
