> Reviewed local implementation checkpoint; original retained unchanged. Trusted-proof test fixtures simulate verification; no production verifier or paid eligibility proof is claimed.

# G11 — bounded evidence-policy synthesis

Date: 2026-09-05 UTC. Worktree: g-graph, base G1 local milestone 53b7ab1.

## Scope and freeze

Owned only skills/counterparty-graph/synthesize.ts and test/synthesize.test.ts, plus this ignored
report. C1 owns G10 manifest, documents, root dependency/test collection and their tests.
No dependency install, Git mutation, network, credentials, paid query, RPC or live proof occurred
during G11 implementation. G1 Studio remains pending; G11 is the independently authorized
offline cost-of-goods-half preparation. Root owns ordered G10-before-G11 commits and full gates.

Read the complete G11 plan and G10–12 safety preparation, CLAUDE and execution constraints.
Applied the fully read ts-testing skill: genuine collected Red first, focused behavior and
hostile-input regressions, no tests disabled or replaced with mocks of the implementation.

Source/test FROZEN after the final 48-test Green and targeted strict TypeScript check below.
Independent read-only review requested separately; no verifier or live eligibility result claimed.

## Public contract and adaptations

Preserved synthesize, Identity, Source, Assessment and CONTRADICTION_CODES names and all eight
original contradiction codes. Additive EVIDENCE_FLAGS exports a fixed 12-code vocabulary;
Assessment includes the same bounded evidenceFlags list used by C1's output schema.

- Source.block, blockHash and costAtomic admit null. paymentTx remains optional/nullable.
  Sources are shaped local G12 records, not raw provider headers or quoted-price constants.
  This pure module validates shape/provenance consistency but cannot independently authenticate
  the caller's source record. Unknown costs stay null; it never substitutes 10000 or zero.
- Optional verifiedProofs must come ONLY from a separately reviewed local G12 verifier, never
  an input field, Graph JSON, a response header, or a `verified: true` assertion. The exported
  structural TypeScript type is not itself an authenticity/security boundary. Tests supplying
  it explicitly simulate successful independent verification; G12 verification is not implemented.
- Optional trustedValidators is a bounded explicit local policy (default empty), not a seller's
  registration supportedTrusts. Untrusted indexed validation cannot make allow or trusted refusal.
- A qualifying proof binds feedback ID, canonical Base agent, Base chain, transaction/log, external
  payer, payee, canonical Base USDC, positive uint256 amount, block/hash and agent-service binding
  to the exact feedback hash/registry and envelope from/to/chain/transaction fields. A receipt's
  success bit or ERC-20 transfer alone is not that binding; transfer-only kinds are rejected.
- attesterSettledCount counts unique external clients, not repeated rows/proofs. Conflicting
  rows/proofs and cross-service reuse of the same transaction/log do not establish eligibility.
  Missing/inconsistent/incomplete query provenance also zeros the emitted settled count.
- Strict Base IDs/uint256 limits, address aliases and feedback/validation relations precede joins.
  Identical aliases/validation requests deduplicate; conflicting identities are dropped.
- Own data descriptors only; no calls to getters/toJSON, recursive traversal or unbounded array
  allocation. Page cap hits (25 identities per alias/validations, 100 feedback) are explicitly
  incomplete. All public strings/arrays/counts fit G10's bounds; trust labels are unique.
- Query `_meta` must have number/hash and hasIndexingErrors:false, agree between both documents
  and local Source coordinates. Same-height settlement proof hashes must match that snapshot.
  G12 must obtain/pin those actual snapshots; this module does not claim it fetched them.
- Known complete empty identity queries yield the existing no-erc8004-identity policy refusal.
  Malformed, absent, possibly truncated or inconsistent evidence yields manual-review, never
  the fabricated conclusion that no identity exists.
- Completed response 0 from a trusted external validator is failure, not pending. Null/missing,
  untrusted, incomplete or missing registration/validation evidence cannot support allow.
- `allow` denotes satisfaction of this documented policy under its trusted inputs, not financial
  safety, honesty, universal reputation, or a guarantee of future conduct. No raw feedback text,
  provider diagnostics, proof documents or credentials are returned.
- Invalid top-level counterparty address throws only the fixed message `counterparty address is
  invalid`; the production input gate must reject that before any paid query.

## TDD / focused verification

1. 09:27:30 UTC (14:57:30 IST): genuine collected missing-module Red. C1 had added the actual
   skills Vitest include; failure was module absence, not a no-tests-found false Red.
2. 09:33:08 UTC (15:03:08 IST): initial implementation 43/43 focused tests PASS.
3. 09:35:05 UTC (15:05:05 IST): four genuine self-review regression Reds:
   duplicate trust labels violated the manifest uniqueItems contract; a proof at the query
   height could use another block hash; partial GraphQL errors allowed eligibility; a revoked
   array proxy threw rather than returning bounded manual-review. Existing 43 still passed.
4. 09:35:39 UTC (15:05:39 IST): an additional genuine targeted Red showed missing/inconsistent
   first-query metadata still emitted a settled count of one, despite manual-review.
5. 09:36:11 UTC (15:06:11 IST): all 48 focused tests PASS after narrow fixes. No assertion weakened.
6. Targeted strict TypeScript for owned source/test plus imported validator PASS with the repo's
   .ts import convention enabled; owned diff-check PASS. An earlier ad-hoc command omitted
   allowImportingTsExtensions and failed TS5097 only; corrected command passed without a code cast.

Commands (root full gate intentionally not run by this executor):

```bash
bun --no-env-file run test:vitest skills/counterparty-graph/test/synthesize.test.ts
node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --allowImportingTsExtensions --types bun --skipLibCheck skills/counterparty-graph/synthesize.ts skills/counterparty-graph/test/synthesize.test.ts
git diff --check -- skills/counterparty-graph/synthesize.ts skills/counterparty-graph/test/synthesize.test.ts
```

Coverage includes a complete simulated trusted-policy fixture; default raw-hash noneligibility;
malformed/empty/meta/source distinctions; conflicting aliases; page caps; hostile own-property
and million-length sparse-array refusal; missing/trusted/untrusted/pending/zero validation;
self/revoked/unrelated/duplicate feedback; 16 individual proof-binding mutations; event reuse;
actual G10 output schema plus explicit uniqueness validation beyond the limited hub validator.

## Primary-source preparation (read-only, before implementation)

- Agent0 schema and feedback parser pinned to 909a9d4518432c641e06fdb731b480fb0e9340dd:
  https://github.com/agent0lab/subgraph/blob/909a9d4518432c641e06fdb731b480fb0e9340dd/schema.graphql
  https://github.com/agent0lab/subgraph/blob/909a9d4518432c641e06fdb731b480fb0e9340dd/src/feedback-file.ts
  The proofOfPayment fields copy optional off-chain JSON strings; no transaction verification
  occurs there. fromAddress is available and is now selected by C1's pinned query.
- Published client-x402 1.0.0 tarball and gitHead c48c3ddcb11b1535e97f60e91231cb8357c3432a:
  https://github.com/graphprotocol/graph-client/blob/c48c3ddcb11b1535e97f60e91231cb8357c3432a/packages/x402/src/createGraphQuery.ts
  Explicit privateKey avoids env mutation, but its public factory lacks scoped fetch, signal,
  beforeSign and payment-result hooks. Chain name validation is not payment-policy enforcement.
  G12 transport/direct-dependency adaptation requires separate root design/review; no global
  fetch/env mutation, actual G12 implementation or verified paid result is claimed by G11.
