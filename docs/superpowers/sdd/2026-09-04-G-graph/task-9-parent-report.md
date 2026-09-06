# G9 parent report — qualified MCP index evidence

September 6, 2026. Base c5a5389 (G8 already merged). Root self-review only;
no independent agent or parallel reviewer under the owner's machine limit.

## Change

The inert graph-evidence module validates only own canonical Arc-testnet
agentId and three nonnegative safe integer counts. Unknown fields are not copied;
invalid/inherited/accessor data returns no evidence with fixed empty text.
MCP re-exports the requested graphEvidenceLine/GraphEvidence interfaces and
adds the same four-field projection to describe text and structuredContent.
The original raw graph field is removed even when decoding fails. Seller
fencing, D identity facts and all other existing describe sections remain.

The line explicitly says hub-reported, cached, not independently verified and
not proven payment-backed. Zero indexed settlements is not absent evidence,
nor does it erase other nonzero indexed counts. No chain/payer/key IO is added.
The formatter is separate from MCP private state for the later web consumer.

## Evidence and limits

Before implementation, actual MCP SDK/describe tests had four failures/one pass:
missing qualified line and three raw-invalid-graph structured-content leaks.
These are genuine exercised output failures, not import/collection failures.
After implementation,88 focused tests across four files passed in1.29s,
including18 pure graph cases, five new actual describe cases, existing D evidence
and existing MCP safety/fencing coverage. Exact four-root strict checking passed
with0 diagnostics. In-memory SDK is a real client/server transport with
stubbed discovery GETs, not live HTTP/Graph or a browser. Invalid unused key
sentinel remained unused; no wallet/payment request was possible in the stub.

MCP source diff is limited to imports/type and describe projection/wording.
All quote/purchase/session dispatch remains outside this edit. Separate G8
source hashes and hub/web bodies must remain unchanged. The one full max4 gate,
publication/privacy audit and atomic commit follow. No new keys, spending,
provider request, deployment, owner approval replay or push.

## Final gate and narrowly scoped correlation correction — 22:15 IST

Sole full gate69025 exited0:4272 Vitest/190files in57.29s;872 Bun/58files/
6385 assertions in162.73s;root/webstrict0;client340ms/SSR192ms. During the
final read-through, a detail-ID correlation concern was identified; source stayed
unchanged until this gate completed. The added mismatched-detail test then
failed genuinely (unexpected success), and a one-line fixed refusal was added
before describe projects any detail evidence. This is a describe-only correction,
not a paid-path change.

Final targeted89 tests/four files passed in1.10s and exact4rootsstrict passed0.
The full gate predates this final one-line guard/test; no full sweep was repeated
under the owner's rule and no final-source full-gate claim is made. Final eight
pins (G8+G9),189 links, privacy, scoped eight paths and unchanged quote/purchase
suffix/Store/H/session/web checks passed. Atomic local commit follows.
