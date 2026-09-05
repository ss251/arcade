> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F11 pure policy/codecs author report — September 6, 2026

Status: **FROZEN for independent review** at04:28:42IST focused checkpoint.
Five released paths only: two browser-safe source modules, two focused Vitest
files and the separately parent-approved inert deployment fixture. This ignored
report is the only additional write. No production runtime, journal, CLI, source
outside ownership, dependency, Git, full suite, network, operational key,
signature, wallet/account query or live funding was performed by this author.
F1 remains consumed; deposit/withdrawal/live F12 remain NOT RUN.

## Inputs and contract coordination

Read complete latest task11-parent-decisions, source-handoff, implementation-split,
withdrawal-protocol-evidence and independent-protocol-review before implementation.
Rechecked actual pinned TransferSpec/Attestations/BurnIntents definitions and local
installed Circle3.2.0's BurnIntent typed-data schema. Existing source/vector audit
limits remain contracts1.3.0 commitfd51093c7a1ba8e50ea2c6029ebf1bdc2bb2b8e8 and
OpenAPI1.0.0 generatione87dab6cd6f6e3e9142aef92fd3c34bd3f513080.
No SDK deposit/withdraw convenience, F2 signing domain or retry loop was imported.

Used the fully read ts-testing skill: existing Vitest stack, test-first capability
checkpoints, exact owned-root strict checks and bounded behavioral regressions.
Repo-routed Arc/Gateway/EVM skills and Context7 were unavailable in the active
catalog/local skill search, so retained primary sources and installed APIs were
the explicit offline fallback. No skill installation or network fallback.

G14/B9 agreed exact exported contracts before importing. FundingAuthority captures
canonical nonzero account plus pinned Arc chain/network/domain/token/Wallet/Minter
and RPC/API origins; validateFundingAuthority rejects any changed coordinate.
FundingRequest is a closed exact-deposit/target-deposit/withdrawal union, all atomic
bigint values and explicit aggregate gas cap. parseFundingAmount parses canonical
six-decimal text; parseFundingUint parses canonical uint256 text. decodeFundingRequest
also accepts canonical atomic integer strings for facts-journal decoding, never
decimal coercion. encodeFundingRequest provides deterministic closed JSON.

FundingSnapshot explicitly requires authority, walletTokenBalance,
walletNativeBalance, allowance, available, gatewayTotalBalance, sourceBlock/hash,
observedAtMs, destinationBlock/hash, withdrawalDelay and pending/withdrawing/
withdrawable. The last three and the destination/delay fields allow explicit null
unavailability; omission is not zero. Snapshot acquisition/correlation/freshness is
the runtime's job, not a success assertion by this pure data decoder.

planDeposit freezes exact amount or actual available shortfall, requires the
operator maximum, skips adequate allowance and otherwise freezes exact approval.
Positive deposits require wallet token funds and amount*10^12 plus all authorized
gas within Arc's shared native pool. A validated zero shortfall is signer-free.
planWithdrawal requires value+maxFee coverage, explicit finite block delta/delay
and gas coverage; freezes sourceBlock+delta, never maxUint256 or automatic extension.
operationDigest binds authority/request/op_[a-f0-9]{32}; planDigest additionally
reconstructs and validates the exact computed plan/snapshot before hashing.

Public event/facts keys and failure codes are closed and coordinated with G14.
The explicit bigint-safe encoder cannot serialize arbitrary provider objects,
UUIDs, attestation/signature, signed transaction, raw calldata or private locators.
Events use {event,facts}; outcomes {status,code?,facts}. Agreed outcomes are observed,
noop, confirmed, credit_pending, mint_ready, delivery_confirmed,
source_debit_pending, uncertain and refused. observed is read-only; mint_ready is
bound in-memory capability readiness, not movement success. Runtime/journal must
still enforce legal transitions and required per-event evidence. Their behavior
was not reviewed as part of this source author checkpoint.

Withdrawal exports TransferSpec/BurnIntent, captureTransferSpec/captureBurnIntent,
encode/hashTransferSpec, encode/hashBurnIntent, validateBurnHeight,
encodeWithdrawalAttestation/Set, decodeAndBindWithdrawalAttestation, and
burnIntentTypedData with BurnIntentTypedData type. Captured spec addresses use
20-byte canonical values; packed and typed-data codecs zero-pad the exact EVM
words. Domain is ONLY GatewayWallet/version1, not GatewayWalletBatched and not a
chainId/verifyingContract domain. All nested typed-data fields/arrays are frozen.
Bound attestation output is {wrapper,spec,maxBlockHeight,specHash,payloadHash,
attesterMessageHash}; it returns no raw attestation/signature or live authority.
Runtime must recover the canonical ECDSA signer over the raw32-byte payload hash
with the personal-message prefix and verify current pinned-Minter membership.

## Genuine test chronology and final commands

- 04:12:24 initial missing-module Red:2 failed suites, **no collected tests**.
  This proves absent capability only, not a failing preexisting business rule.
- 04:18:15 first implementation:24 Vitest/2 passed.
- Initial exact4 strict found one test-only union narrowing diagnostic; corrected.
- 04:20:24 trailing CR/U+2028/U+2029 candidates:3 passed/19 skipped already.
  These are additional regressions, **not claimed as genuine Reds**.
- 04:20:53 separate typed-data helper Red:1 failed/6 skipped, helper absent.
  After implementation,04:21:25:29 Vitest/2 passed.
- 04:23:49 fixture/policy/adversarial additions:39 Vitest/2 passed.
  Exact5 strict then found one test-only constructed-Hex assignment diagnostic;
  corrected with the actual typed synthetic hex expression, no any suppression.
- 04:25:28 parent-approved observed-tag Red:1 failed/32 skipped.
  Added the tag to the closed decoder/type;04:25:29:40 Vitest/2 passed.
- Final04:28:42 command below: **40 passed /2 files**, exit0
  (33 funding,7 withdrawal). One withdrawal case independently mutates every one
  of340 captured spec bytes; these are assertions within one test, not340 tests.

```text
bun --no-env-file x --no-install vitest run packages/buyer/test/gateway-funding.test.ts packages/buyer/test/gateway-withdrawal.test.ts
```

Final exact strict used installed TypeScript readConfigFile/parseJsonConfigFileContent
on tsconfig.json and createProgram with only the five owned roots, retaining all
repo strict options and noEmit:true/incremental:false/composite:false:
EXACT_ROOTS=5 BROWSER_TYPES_EMPTY=false DIAGNOSTICS=0, exit0.
A separate program used the two source roots with types:[] and ES2022/DOM:
EXACT_ROOTS=2 BROWSER_TYPES_EMPTY=true DIAGNOSTICS=0, exit0.
This is browser-compatible typing, not an executed browser/network funding test.
AST import inventory: funding imports only viem; withdrawal imports only viem and
./gateway-funding. No Bun/Node/env/fetch/signer/core-barrel import enters these two
modules. Shells used login:false and every Bun command --no-env-file.

## Source-linked inert deployment fixture

Parent retrieved the same three pinned public artifact blobs, then retained exact
runtime strings and provenance at [retained local pinned-runtime projection]
(SHA6919dd30616c274b01603e239934986f13f7510e40c6f59ddab5c6965acdc4ab).
This author performed no retrieval. Fixture creation used apply_patch and no
compiler or chain read. All three imported runtime byte lengths/Keccaks independently
match the pinned expectations:

- ERC1967Proxy163:0x874a21508289bf01ee9802032607ae53ba0a4f47f28143a8493921b8db102187.
- Wallet22818:0xbe79daa02f5d5359b4f6118d70b72e10ddd1c87b63e9e4ee39fdafa9bb2c2cbf.
- Expected Minter11528:0x3b600440271648adb765c4dea90282c6d4e8fd317ee693c4804f31cc0ecb5f61.

Proxy whole code is compared; only declared32-byte immutable words3708/4382 or
1683/1982 normalize after exact equality to the resolved nonzero canonical slot
address. Metadata remains hashed. Positive tests use these exact artifact bytes
bound to a synthetic0xab account, not an identity override. Tests reject zero/self/
high-padding/mismatched slots, unbound words, nonempty wrong code, metadata/length
changes, wrong normalization location and a synthetic12101-byte Minter mismatch.
The previously observed Minter mismatch is NOT promoted to the trusted baseline.
Deposit runtime needs only Wallet identity; withdrawal runtime needs both.

The fixture preserves exact artifact SHA/git blob, offsets, unmodified bytecode
and expected-not-current-Minter qualification. Complete supplied Circle Apache
and shared OpenZeppelin MIT license texts are embedded verbatim in inert comments,
including Copyright2025Circle Internet Group and2016-2024Zeppelin Group notices.
Memview's exact pinned SPDX line/URL is retained and its Apache-2.0 option selected.
The parent-supplied notices JSON SHA is
e39383d42c5fd8e54de1ba5d1c2a3f30a1e3d239f926ff8225b938faff0705bc.
Exact four notice-text/line/URL containment checks passed; runtime rehashes remained
unchanged after notices. No full independent Solidity rebuild is claimed.

## Final frozen SHA-256 inventory

```text
429cf0008abc33e39e5d842a6b03401d4a39b503f369186c497f5b22e7cf8c29  packages/buyer/src/gateway-funding.ts
f43c4f3a6068fa2ca985a0ead85cf9346b1765d4faf1d4e7b4ea6debcb65c223  packages/buyer/src/gateway-withdrawal.ts
94109db06e098937c1f96953d2017ced63b6395b0fe1f124dbe1f210b13d7506  packages/buyer/test/gateway-funding.test.ts
a809a16d4c4070ca8fe522372e61091a8fea6ffa0cad1911a477e354be6c8c27  packages/buyer/test/gateway-withdrawal.test.ts
ef87870a53e28f6248fa4949f523153e144f29d23eada4011ff787b79b925211  packages/buyer/test/fixtures/gateway-deployment.ts
```

## Evidence limits / handoff

Pure offline implementation is ready for independent review; this is not parent
acceptance of the whole F11 slice. No actual signer recovery, live membership,
current deployment/delay/fee/balance/API response, mutation, delivery/source debit
or credit was observed here. Hash construction and signature-shape-free fixtures
do not grant fund authority. Normal UUID loss recovery, write-ahead one-shot
stages, no-late-sign/send, claim poisoning and actual cleanup belong to the
separate runtime/journal/CLI review. No hidden deposit or automatic retry exists
in the owned modules. Parent alone owns integration/full gates/commit.

## Coverage strengthening / final re-freeze — 04:34:39 IST

Parent's independent pure review supplied an unsigned EIP-712 reference assembled
from the pinned Solidity literal typehashes,480-byte spec-word order and128-byte
burn-word order, with the installed Circle3.2.0 name/version-only domain. Read the
complete [private standalone pure-vector regression fixture] construction context (SHA-256
d2e93a5c36135ae9b1a1bb86489243dfcb0e524200f2bed6613c1fedfd0366f3).
Parent separately reports5 private Bun tests/25 assertions; not executed or added
to this author's40-test count. No source defect or additional Red is claimed.

Replaced only the weak hashTypedData hex-pattern assertion in the existing
withdrawal test with exact unsigned signing digest
0xcdee87b0f59d3a094bb511d5e3feb29b2f7f73d90e7cfb6486abc8aed4a460fd.
Reference intermediates: domainSeparator
0x23a37920eca61226c76d13c4462857a362147e4b18da665dba894fa297ae4f34;
specStructHash0xe95a0b9319de0083aa3a706135bdfccc90b12efa4cb6ca2c2bcb93147da5197c;
burnStructHash0x248ae2b08785b3ef2a6db7dee593184a295cbc29e14ff4dc46847dee395ae26e.
This strengthens protocol coverage under ts-testing; it is not a signature,
credential, live authority, newly observed failure or production correction.

Repeated the same focused command at04:34:39:40 Vitest/2 files passed, exit0.
Repeated exact5 strict and browser-only exact2/types:[] strict:both0 diagnostics.
Only the withdrawal-test SHA changes to
38f77415dd3b293de1c979169c94cf89b8f7e8ab905b4afa5089f7004a2cebd3.
The other four frozen hashes above independently remain unchanged. The complete
prior report prefix is preserved byte-for-byte with SHA-256
ce2c15cf074ada8fd8327e80959e9314d8e8fe8605b88617b246130a8aed868c.
Five-path slice re-frozen; no other files, network, Git or full suite action.
