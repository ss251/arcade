> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# F5 reference-category correction — frozen September 5, 2026

This additive correction supersedes the earlier TestRail normalization claim in
the historical task5-report. The original report remains byte-for-byte unchanged
at SHA-256 b9148c884ff13f295a559bf58811a87db11c4f52f043ac7296b8d71d7c5c7979.
The parent-approved foundation scope, durable authority, corruption envelope and
F6–8 restrictions are unchanged. Parent and independent correction review remain
pending at this author freeze; no full gate or commit is claimed here.

## Accepted correction and reference semantics

The actual existing offline makeTestRail result is not a transaction hash. Its
settle implementation returns `0xtest`, ten nonce hex characters and a simulated
settlement-counter suffix padded to at least four hex characters. It omits the
optional payment-result settlementKind. The prior synthetic test fixtures hid
this distinction by inventing hash-shaped test references.

Core SessionRefKind, Receipt.settleRefKind and the session ledger now include
`test`. Only a bound test rail normalizes an omitted payment kind to `test` and
accepts lowercase `^0xtest[0-9a-f]{14,122}$`, within the existing 128-character
reference bound. Only EIP-3009 normalizes an omitted kind to `onchain`, with an
exact nonzero 32-byte lowercase hash-shaped reference. Gateway still requires an
explicit `gateway-transfer` category and a canonical UUID with version 1–8 and
variant 8/9/a/b. No current terminal or closed Gateway path accepts the reserved
future gateway-batch category. The public closed SessionReceipt now correlates
every settled call's category with its declared rail. Individual non-session
Receipt behavior is not otherwise redesigned.

These are reference categories, not independent proofs of recipient credit,
remote acceptance or mining. The test category is purely simulated local
evidence. No payment result type or actual TestRail implementation was edited.
F8 must still bind the real verified authorization/result to the admitted call.

Only six of the twelve original owned files changed: core session and receipt
schemas, the shared ledger, core schema tests, pure/memory ledger tests, and the
collected Bun session-store tests. The SQLite adapter, Store adapter, child
fixture and other original foundation files retain their previous hashes.

## Genuine Red chronology and intentional fixture correction

1. Independent B9 review first reproduced two actual failures at 15:20:41 UTC:
   the real TestRail result reached finishSessionJob and returned Left instead of
   Right; a Gateway closed receipt carrying onchain/hash evidence did not throw.
   Its private command had 0 pass / 2 fail / 4 assertions. The original private
   test used the then-supported onchain receipt kind, and its SHA-256 was
   129a5a22360d5f4c8e23ac37bd2a8e727f848170d8ce4aeea7ae26e4554aa62c.
2. After the parent approved the honest test category, B9 changed only that
   receipt category and an explanatory comment. At 15:26:05 UTC its same command
   had 0 pass / 2 fail / 3 assertions. The real-rail case now failed earlier at
   Receipt construction because test was absent from the schema; the closed
   Gateway contradiction still did not throw. This is explicitly a corrected
   contract, not the claim that the original test already named the new category.
3. Before production edits, the collected memory/disk actual TestRail cases ran
   at 20:59:46 IST and both failed at the unsupported test Receipt constructor
   after their actual offline settle calls: 0 pass / 2 fail / 6 assertions.
   Neither new-contract case reached finish on that Red run.
4. Before production edits, eight new core cases produced 12 pass / 8 fail.
   Three rail/category matrix cases hit an expected-throw failure; the reserved
   batch and three malformed UUID cases likewise did not throw. The bounded
   test-reference case instead failed at unsupported test construction. Later
   assertions within a failing case were not all reached on the Red run.
5. After the source correction, the two extra atomic test/EIP cross-rail ledger
   cases passed immediately. They are additional coverage, not claimed new Reds.

The existing synthetic pure test-rail terminal helper was intentionally corrected
to the actual 0xtest shape/category while continuing to omit its payment-result
kind. EIP fixtures retain hash-shaped references and the onchain category.
The existing normalization expectation now distinguishes test from EIP. No old
corruption, rollback, process-death, idempotency, limit or legacy-guard regression
was discarded or weakened. The ts-testing skill guided genuine behavioral Reds,
actual in-repo rail integration, existing test runners and exact strict options.

## Collected integration and rejection coverage

The new memory and physical SQLite cases use actual makeTestRail challenge,
verify and settle methods, not a replacement mock. Dummy fixed addresses, nonce
and a syntactically accepted test signature are local fixture values, not keys.
They verify the returned reference and omitted kind, one-shot admission, simulated
balance changes, persisted test receipt/category, held zero and spent 30, fresh
statistics and SQLite reopen. Repeated finish leaves spend unchanged and a second
barrier claim is false. They perform no HTTP request or remote payment.

Core tests cover each of three rail/category pairs, rejection of other categories,
current Gateway batch rejection, canonical UUID version/variant, and exact test
reference minimum/maximum length, lowercase and hex shape. The two additional
memory ledger cases submit the opposite rail's reference, both with the original
and opposite receipt category; all attempts fail before terminal persistence,
retaining held 30, spent zero, queued Job and no Receipt. Existing Gateway omitted
kind/hash rejection and test/EIP transfer-category/zero-reference cases remain.

## Final bounded verification

All commands below exited zero on September 5, 2026; the five-file groups began
at approximately 21:06:25 IST, with final private rerun/hash inventory at 21:07 IST.

```sh
bun --no-env-file x --no-install vitest run packages/core/test/session.test.ts apps/hub/test/session-ledger.test.ts apps/hub/test/store.test.ts apps/hub/test/paytest-store.test.ts apps/hub/test/erc8004-docs.test.ts
```

77/77 Vitest across five files: 20 core, 27 kernel/memory and 30 existing tests;
6.17 seconds. This supersedes the historical author's 67-test focused count.

```sh
bun --no-env-file test apps/hub/test/sessions-store.bun.test.ts apps/hub/test/store-sqlite.bun.test.ts apps/hub/test/tree-ledger-sqlite.bun.test.ts apps/hub/test/paytest-store-sqlite.bun.test.ts apps/hub/test/store-erc8004-docs.bun.test.ts
```

65/65 Bun, 284 assertions across five files: 41 session cases and 24 existing
SQLite/tree/pay-test/document cases; 8.69 seconds. This supersedes the historical
author's 63-test/264-assertion focused count.

```sh
bun --no-env-file test [private independent regression fixture]
```

2/2 private reviewer regressions, 5 assertions; 217 ms. The corrected private file
was not edited by this author and remains at SHA-256
1256cb07ac25619893b39e1fe1bf3498e61bb711291fb4bfa30b07c012109048.

The exact TypeScript createProgram command from the original report was repeated
using all twelve owned files PLUS that private reviewer file. It used the real
root tsconfig, noEmit:true, incremental:false and full actual dependency
traversal: EXACT_F5_ROOT_OPTIONS_DIAGNOSTICS=0. Nested hub tests were included;
no compiler option was weakened. This is not a repository-wide gate.

## Current frozen SHA-256 inventory

```text
dacf26d4279a6bfde6c0f606c8c827a59baf07a8170669fd4882dbbf40c8cc4e  packages/core/src/session.ts
3676c2b95e12ed6aa7091f9718d0079b5d804a6c65a7f3f72f6580df46148700  packages/core/src/errors.ts
ecd1fd43329225b40af28db86dda710b8a0978bc7a617600c24c390d54c05c52  packages/core/src/index.ts
91fdc4768350f24ae1ae70f3de2eae8cb65d09fe4d2781bd96e2b154fd3a07cd  packages/core/src/receipt.ts
aafc25cea5d66dcdd4b1cef08472d3952c9607a41237e7fe9800c7ea6837bfa9  packages/core/test/session.test.ts
657606a150d6de31e530289cd152cdabec2dce3925ef6e30d4f4e818a917c7ee  apps/hub/src/session-ledger.ts
233311c6b7880e3a3426e25810a35d1b0ce05843311a4a9fad8611de6c0175e4  apps/hub/src/store.ts
97d866953795b0e9e6e9c72052a799ebc1b10fe5356d853cd722c8264567b69a  apps/hub/src/store-sqlite.ts
f6a60a1be3df4cc1c2cb584f63d3d41e0b3552dc2853795f7e3a73753ad1850a  apps/hub/test/session-ledger.test.ts
06940444f194f8ff12c4dd1b28bfcffc480e5a52f180d89cfd34e539015a7ad2  apps/hub/test/sessions-store.bun.test.ts
dd8bb43c58923e0934983b9a42522dd484caf785b3e90cd4d822e675a80739c1  apps/hub/test/fixtures/session-store-child.ts
2b99d3422b7bf6b93534c5a08873acbff424e37b48b7f1bd251c5e18ff039030  apps/hub/test/store.test.ts
```

Read-only inventory of the unedited existing rail/result definitions:

```text
112e408bd2737885cc339e82a40069e1c4a7d2466c53bc256de3e7ea40c453d1  packages/payments/src/test-rail.ts
c4f6ef0ab92af7d98f0f616fa311b2a7b12028f6316e483c35e5a2cd15548d04  packages/payments/src/types.ts
```

No real network, Keychain, live approval reuse, dependency changes, Git operation,
public-document change or F6–8 implementation was performed. Focused child
fixtures were terminated/cleaned by their existing owned cleanup. No test process
remains running at freeze. Parent owns independent review, full gate, publication
and atomic commit.
