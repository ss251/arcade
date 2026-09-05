> Public execution record. Copied from the retained private task report; no live authorization or production state is implied.

# H4 — narrow existing fixture compatibility follow-up

2026-09-05. Parent explicitly approved only these six existing fixture files after the actual 17:58:08 IST Red (56 failed, 26 passed):

1. `apps/web/test/quote-ens.test.ts`
2. `apps/web/test/quote-routes.test.ts`
3. `apps/web/test/purchase.test.ts`
4. `apps/web/test/figures.test.ts`
5. `apps/web/test/tools.test.ts`
6. `apps/web/test/tool-calls.test.ts`

Old mocked listings omitted required public version/serviceName/description/schema fields; one catalogue used a short fake seller. Old mocked receipts predated H1's shared public whitelist and omitted rail/network/seller/version, display pairs, hop/children and explorer, with short fake hashes. These are now actual contract-shaped dummy objects. Prices, fees, approval limits, signing/payee/resource behavior, prose fencing, paid relay refusal, uncertainty and every prior behavior assertion are unchanged. One one-character receipt skill fixture became a valid sample-skill identifier. No live identities, credentials or transactions were introduced.

The old `quote-ens` streamed-body case stalled the initial listing response, so its ten-second assertion no longer matched the explicitly approved detail-only 25s bound. Its fetch fixture now returns a valid listing and stalls only the unsigned 402 response. The original ten-second cancellation assertion is unchanged; a separate new fake-clock test proves successful 15s detail and hard 25s refusal.

The first integrated eight-file Green was 153 tests at18:02:54 IST. An explicit TypeScript program including all eight changed/new nested Vitest test files subsequently found one independent pre-existing V4 mock-contract error at tool-calls.test.ts:50. Normal web tsconfig does not include test files, so the error was not covered by its prior green result. The installed `@ai-sdk/provider@4.0.5` declarations at dist/index.d.ts:2454–2541 require structured `finishReason {unified,raw}` and nested inputTokens/outputTokens accounting. The old fixture returned a V3-shaped string and flat counts. Parent approved a separate narrow correction: the same two tool/text phases now return the actual V4 shape with the same 1-input/1-output dummy usage. No unsafe cast, assertion weakening, model/provider call or dependency change was used.

After correction, 18:08:53 IST combined run passed153/153. Exact web-project strict checking, including generated/module-augmentation source plus all eight explicit nested test targets, returned zero diagnostics. The mock-shape correction is typed offline compatibility, not a real model performance or payment proof. Root owns final full gates and commit.
