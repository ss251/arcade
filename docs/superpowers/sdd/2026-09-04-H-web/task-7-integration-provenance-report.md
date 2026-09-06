> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F/H receipt provenance integration — author report

Date: 2026-09-06. Scope: the six released tree/web source and test paths below.
No server/store/feed, H7 component/layout/style, payment, dependency, public-document,
Git, network, credential, browser, build or full-suite action was performed here.

## Accepted behavior

- H3 snapshots preserve true absence of `settleRefKind`. An invalid present value,
  inherited field, accessor or non-enumerable field becomes an inert own-undefined
  sentinel accepted by `Receipt.make` but refused by the existing F14 link guard.
  Snapshot duplicate fingerprints also retain presence, so absent and invalid-present
  child evidence cannot silently deduplicate. Recognized core kinds are retained;
  `gateway-batch` remains ineligible for public explorer links.
- Full tree nodes use their own actual receipt provenance; they do not inherit the
  root's kind. Compact public children have no independent receipt provenance and
  therefore use the original root's kind, rail and network plus their own recorded
  settlement/ref. A released root does not erase an eligible settled child link.
- The browser-local `SettlementReferenceKind` is `onchain | gateway-transfer | test |
  unrecognized`. `settlementReferenceKind(unknown)` returns undefined only for true
  absence; malformed presence becomes `unrecognized`, without invoking getters.
  `txLink` accepts absent or own `onchain` only, retaining its existing settled,
  EIP-3009, configured-network and canonical nonzero-hash requirements.
- `PublicReceiptRow` now permits optional `session: boolean` and the safe kind.
  Old missing session fields remain absent, false and true are preserved, and every
  present non-boolean/accessor/inherited/non-enumerable session field is rejected.
  No session ID or authorization nonce is projected; canary remains independent.
  The fixed `session_released` reason is retained without asserting zero charge.
- Root and compact-child explorer decoding is kind-qualified. Child-supplied kind,
  rail, network or session properties cannot override the root context. Tree wire
  nodes continue consuming H3's qualified explorer projection; no invented rail or
  kind field was added to the frozen H7 shape.

## TDD chronology and final acceptance

The ts-testing skill guided behavioral regressions in the existing Vitest suites,
including actual producer/decoder/SSR composition instead of a mirror implementation.

1. Existing-module behavioral Red at **11:30:14 IST** on unchanged production roots:
   **43 failed / 94 passed, 137 tests / 3 files**, exit 1. Breakdown: tree 8 failed,
   format 11 failed, web 24 failed. No missing-module or collection setup Red.
   This initial command directly hosted Vitest in Bun, not the canonical Node CLI.
   Actual H3 → H4 → H7 SSR incorrectly produced four anchors for invalid Gateway,
   own-undefined, accessor and inherited kind cases where zero were required.
2. Narrow implementation: the same direct-Bun-hosted suites passed **137 / 3** at
   **11:31:52 IST**, exit 0. This is retained as an author checkpoint, not the final
   canonical acceptance. Subsequent test-only additions cover full-node independent
   provenance, compact-child override refusal and a hidden session field; these are
   supplementary controls, not newly claimed Reds.
3. Final installed **Node-shebang Vitest** at **11:36:58 IST** passed **205 / 5**, exit 0,
   3.19 seconds: owned tree 30, web client 83, format 28, unchanged H7 component 24
   and layout 40. Command from HROOT:

   `env -i PATH=<owner-home>/.nvm/versions/node/v24.15.0/bin:/usr/bin:/bin <owner-home>/.bun/bin/bun --no-env-file x --no-install vitest run apps/hub/test/tree-view.test.ts apps/web/test/hub-client.test.ts apps/web/test/format.test.ts apps/web/test/tree-graph.test.tsx apps/web/test/tree-layout.test.ts`

4. Installed TypeScript API checks against the actual root config with exactly the
   two hub roots, and the actual web config/cwd with exactly the four web roots:
   `strict: true`, **zero diagnostics in both**. Transitive imports were checked;
   no replacement config, build or dependency installation was used.

Seven collected actual producer → decoder → SSR cases cover absent, onchain,
gateway-transfer, gateway-batch, own undefined, accessor and inherited kinds.
Absent/onchain retain four legitimate anchors across two real receipt nodes; the
other cases render zero. Core receipt children/tree hashes and the real H3 builder,
H4 decoder and frozen H7 component are used. No private job IDs appear in SSR and
accessor invocation counters stay zero. Actual `scrubReceipt` → public decoder is
also exercised (inherited raw receipt is separately covered by G3's feed tests).
These are offline source-composition proofs, not browser layout, HTTP route,
cryptographic settlement, balance or on-chain evidence.

## Exact frozen inventory

| Owned path | SHA-256 |
| --- | --- |
| apps/hub/src/tree-view.ts | `707d24e21ccb73fabea98ed684f0ae7277c0bde9e3ab1a50440f2327b9d97e1e` |
| apps/hub/test/tree-view.test.ts | `29a50bcf738e4f6282649ddc4c27e92711b019c8db122c34d554327c553d61f5` |
| apps/web/src/lib/hub-decode.ts | `2b2d10c48a363d7f5dc7379ebfdf7963de0e5c11b61e58791d691b575dc2f6af` |
| apps/web/src/lib/format.ts | `279097cb9490e51559336d74dead3210dccfe926ec5b66a76c1c2949cc3e5855` |
| apps/web/test/hub-client.test.ts | `69dd3fd7cf96c691f11cd185c5cf5c12f1dd75e06a4eb1dac0710585969f5401` |
| apps/web/test/format.test.ts | `89f92d78c425218e044612f7757c4088b8b96a513789852bbd1097fa68bc96c0` |

Original production pins were tree `c6ac65dd4e92cbb81bee2c1aebf92248887342fabaaddf423b8f8d5afe14f19f`,
decoder `7c90180e386f7599521bea71e29ff6a979f015638c500b7e44dd09b18a20e0d9`,
format `dc42a2645802908226f3b3a464c9b693322fbec99f1261dbd6b69b7f6585a8eb`.

G3 owns and confirmed the final frozen feed dependency
`439b5631a565633fef2f6683b78d51376e9e81f23c0944d2f2db3495fc60c4ff`.
The first Red consumed feed `e40fa991583b9740ad51f68dd36cc41acdee2fddad2cc45af39df15aba74664c`;
that collaborator delta is not claimed as this slice's authorship. Unchanged F14
receipt-reference helper: `c70e3380fdfd37c50358b01a8cf27682ff946a7f3ac5e963f83d81a110f5212b`.

All six H7 protected pins matched their accepted originals after focused acceptance:
component `f71e9702a2efdc1ca93a1e319ecde86717ae91e3aceb8c0f4b853d2ab51b39cc`,
layout `4edac462f5b75b30213a14922972a2500c188687af6c63245734be6f9c0c71e5`,
styles `503918fda8fa025914270aac9defcc1e8e57d838018c22eda92dd8d07770b1ad`,
component test `3505068621267764678f7293ff2e843e7eacc3305a9fcea0ab628f90ae4a844c`,
layout test `a737ea079cf44d5f83b5f3322df3c87488149861a98288cae5f54653d921f18a`,
fixture `1aa87050123bfae9d62fb5f7f52e3c780552b1d449891bd66d03c2504050076f`.

The parent retains combined review/gates and separate server/store integration.
