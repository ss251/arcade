> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# D6 — seller identity CLI

Frozen for root integration/review. No child commit or staging; this report remains
untracked under the required .superpowers directory. Root stages explicit source files.

## Owned files

- packages/runner/src/identity.ts: only new pure metadata/refusal helpers and formatUnits import.
- packages/runner/src/identity-cli.ts: new import-safe orchestration and bounded public-document fetch.
- packages/runner/src/cli.ts: one import, additive usage, identity sibling dispatch.
- packages/runner/test/identity-cli.test.ts: 67 unit/orchestration cases.
- packages/runner/test/identity-cli-integration.test.ts: 17 real isolated CLI cases.
- packages/runner/test/fixtures/identity-cli-offline.ts: offline public-hub response preload.

No D3 implementation/test changes, config changes, package scripts, hub/server/store,
runbook, owner credentials, provider engines, or existing publish behavior edits.

## TDD and validation

- 05:13:19 genuine Red: identity-cli.ts missing. The new test was briefly moved out of
  collection at root's request so D5's integration gate could complete, then restored on GO.
- 05:17:30: 110 passed, one fixture bug: it.each spread an empty argv row and selected
  the fixture's default valid command. Changed table rows to explicit {args} objects.
- 05:19:42 genuine actual-CLI Red: all 17 cases failed before sibling command wiring.
- First tsc found Bun's extra fetch.preconnect static property was over-constraining an
  injected HTTP function. Added a narrow IdentityFetch call signature; no type bypass.
- 05:20:31: 196/197 focused tests passed. Actual malformed-key CLI case exposed an Effect
  defect (not typed failure) from existing wallet.resolveSellerKey, requiring sanitization.
- 05:22:14 genuine two-test regression Red: private Effect defect leaked; confirmed revert
  was described too ambiguously. Both fixed without propagating underlying diagnostics.
- 05:22:43: 199/199 focused tests passed; tsc passed.
- 05:24:11 genuine six-test regression Red: contradictory numeric chain id, non-root hub
  pathname, and four dependency functions throwing before returning an Effect.
- 05:24:49 final frozen Green: **205/205** across five files, then **tsc exit 0** and
  **git diff --check exit 0**. Breakdown: D6 unit 67, D6 actual CLI 17, D3 52, existing B
  publish unit 56, existing B publish CLI 13.

Focused command:

    bunx vitest run packages/runner/test/identity-cli.test.ts packages/runner/test/identity-cli-integration.test.ts packages/runner/test/identity.test.ts packages/runner/test/publish-cli.test.ts packages/runner/test/publish-cli-integration.test.ts

Typecheck command: bunx tsc --noEmit. No full gate run by this child while other tasks evolved.

## Safety/compatibility decisions

- All requested HubErc8004, hubErc8004Refusal, skillRefusal, unfundedMessage exports retained.
  Metadata accepts only own data fields, armed true, three valid nonzero/distinct roles,
  exact pinned registries and CAIP-2; an optional numeric chainId must also match. Mainnet
  and pending selected networks refuse. Seller cannot be any of the three hub writers.
- Explicit **--approve-operator ADDRESS** is required. Missing/malformed consent and
  invalid usage fail offline. The address must match the validated published operator
  before resolving a key, reserving an intent, minting, or approving. This is an intentional
  safety deviation from the literal plan; D13's owner-run harness must pass this flag.
- Warning states ERC-721 setApprovalForAll grants transfer authority over **ALL current
  and future identity NFTs** in the registry, not just validation requests, and provides
  the exact setApprovalForAll(operator,false) revocation call.
- Public metadata fetch permits root HTTPS origins or root loopback HTTP only; rejects
  credentials, non-root path, query, fragment, redirects (including followed-response
  markers), non-OK HTTP, malformed/oversized bodies. One 10-second deadline spans headers
  and body; 64 KiB limit is enforced by both declared and measured bytes. Abort/cancel
  cleanup is bounded. No body, private error, or secret-bearing URL is echoed.
- Status and invalid usage never fetch or resolve keys. Status shows config/seller,
  confirmed public records, recorded-only approval, and known/unknown pending attempts.
  It does not falsely label stored approval as currently checked on-chain.
- The actual resolved key is derived locally and must match configured seller before
  client creation; the resulting client's address is checked again. No key is persisted
  or logged. Typed failures, Effect defects, and dependency throws before Effect creation
  are converted to fixed diagnostics; checked functions are suspended before evaluation.
- New registration first checks native gas, then durably reserves intent with D4, then
  calls real D3 registerAgent. onBroadcast saves the known hash before polling. Known
  pending hashes resume without gas check/mint/callback. Unknown-hash pending checkpoints
  refuse offline and require explicit reconciliation; they are never erased automatically.
- D3 confirms receipt/mint/owner/URI. D6 saves that confirmed identity BEFORE attempting
  operator approval. Approval failure therefore leaves the same agent reusable on rerun.
  Existing records require unchanged complete provenance and freshly checked ownerOf /
  tokenURI before approval. Legacy records missing provenance are not silently adopted.
- An already-approved operator does not trigger an approval transaction; the old public
  approvalTx is preserved only if it belongs to that same operator. Pending/confirmed
  transaction recovery evidence remains public hashes, with truthful reverted/confirmed/
  unknown classification. A save failure never authorizes another mint.
- The 0.05-USDC native gas value is explicitly a threshold, not a guarantee of total cost.
  No claim that one paid job necessarily provides sufficient gas remains in these helpers.
- Existing B flags, generated publishing, -- separator semantics, and import.meta.main
  guard remain unchanged; 69 existing B command tests passed.

## Isolation and live evidence

All D6 HTTP is stubbed in tests; actual CLI subprocesses use the real command/config path
with ARCADE_CONFIG_PATH pointing inside owned mkdtemp directories. New tests do not alter
HOME. An explicit deliberately invalid test key prevents any accidental Keychain fallback;
the real CLI verifies no key/body sentinel leaks. Unit fixtures use public unfunded key
material entirely in memory. No real key creation, lookup, funding, replacement, network
request, or transaction occurred. All owned subprocesses exit and temp configs are cleaned.

Live registration/approval evidence remains OWNER-gated. D13 must use the dedicated owner-
authorized wallets and pass --approve-operator with the published validated operator.

Skill: ts-testing shaped behavior-first tests, real CLI negative coverage, fake-clock
deadlines, private-diagnostic regressions, and B compatibility checks.
