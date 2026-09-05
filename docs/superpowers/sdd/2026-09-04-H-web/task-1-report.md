> Public execution record. Original retained unchanged in private task preparation; this report is a dated offline checkpoint, not live authorization or evidence.

# H1 — public hub feeds (implementation checkpoint)

Frozen for independent review on 2026-09-05, final focused checks completed at 10:51:03Z.

## Scope and source

Base: `381093e`, branch `feat/h-web`. Read Plan H global constraints and full Task 1, the execution-index H1-before-G8 exception, `CLAUDE.md`, the TypeScript testing skill, current server/store/SQLite/receipt projection and existing HTTP fixtures. No Git mutation, dependency change, web change, paid/job/settlement branch change, live provider/RPC request or key access.

Owned source changes: `apps/hub/src/{receipts-feed,public-feeds,server,store}.ts`; tests: `apps/hub/test/{public-feeds.test,public-feeds.bun.test,receipts-feed.test}.ts`. Root explicitly authorized the existing receipt helper/test adaptations after reading their incompatible legacy expectations. SQLite needs no source edit: its `...inner` inherits the new constant `statsSource` Effect. An unrelated untracked `apps/hub/test/summary.test.ts` was observed and left untouched.

## Implemented contract

- GET `/stats`: hub ledger/listing totals, exact bigint accumulation and decimal-string atomic money; only settled receipts contribute volume/fees. Seller addresses case-fold for counting. Tree count is unique settled roots with nonempty recorded descendants. All calls include hub-owned canaries: not a customer-demand metric. `source` is literally `hub`; the new memory/SQLite `statsSource` seam is also `Effect.succeed("hub")`. G8 must change the actual data aggregation with provenance, not relabel local numbers after an unrelated successful probe.
- GET `/listings/:id/receipts?limit`: history survives listing absence; newest-first filtered copy, stable insertion order for equal timestamps; unknown history yields `[]`. Default20/max100. The plan's finite Number/truncate/clamp1..100 behavior is preserved, including zero/negative/decimal limits; nonfinite values default20. Duplicate limits receive fixed `400 ambiguous_limit` rather than an arbitrary first value.
- Both feeds use the same `scrubReceipt`, re-exported with planned public row/child interfaces from `server.ts`; old `publicReceipt` is an exact alias. Pure imports do not boot the server.
- Explicit whitelist excludes all job/session handles, buyer, ancestry, authorization nonce, receipt signature, fee-accrual correlation handle, input/future fields and arbitrary diagnostic reasons. Only fixed canonical verdict strings survive, otherwise `settled` / `not settled` is returned. Safe explicit compatibility fields remain: skill version, seller, rail/network, finite nonnegative reported seller cost, valid fee sweep hash, exact tree budgets and optional canary marker.
- Children always form an array and contain formatted price. They are a flat descendant list, not inferred directed edges. The actual pipeline can temporarily use a private child job ID as its skill ID fallback: that precise fallback is rendered `unknown-skill` without modifying the pipeline.
- Explorer links require a nonzero 32-byte hash, settled flag, `eip3009` rail, and matching ready local chain manifest. The receipt's network selects the explorer, never the process-selected network. Pending/unknown networks and all Gateway/test references have no explorer link. Valid bounded Gateway UUIDs and canonical test-rail simulation references are retained only on their respective rails, unlinked; arbitrary strings are not copied as transaction/error fields. A shaped hash/link is stored hub evidence, not a new independent RPC receipt verification.

## TDD evidence

1. New pure tests exercised the existing helper/store first: at 16:06:39 IST (10:36:39Z), **18 failed / 2 passed**. Actual failures included leaked session/ancestry/signature/future/private-error strings, missing shared export/child price/empty children, aliased child job handle, incorrect explorer links and absent source seam.
2. Actual HTTP fixture initially could not bind under the default sandbox; this was an environment failure, not product Red. The same approved owned-loopback run outside that restriction produced **4 genuine failures / 1 pass**: new routes returned404, feed projection disagreed, SQLite lacked source seam. Its mutation/no-job-access check already passed.
3. Shared projection + store implementation made **20/20 new pure tests Green**. The combined existing helper suite then produced exactly **3 expected legacy-contract failures** at16:16:06IST: malformed fixture hash/test-rail links, missing formatted child price and absent rather than empty children. Those fixtures were narrowly updated to valid eip3009-shaped hashes and exact new fields; all original negative privacy assertions remain.
4. Four new pure aggregation/limit tests first encountered the absent module at16:17:01IST, then passed after extraction/routes. Initial focused result:40Vitest,5Bun Green.
5. Existing real scheduled-canary compatibility caught the test rail's deliberately non-chain `0xtest...` reference being omitted. Added a focused regression plus canonical `NON_SETTLING`/refusal-category coverage: **2 failed / 24 passed** at16:19:00IST, then fixed the bounded rail-specific reference and reused canonical statuses. The existing canary test itself was not changed.
6. Explicit strict inclusion of new hub tests caught the Bun fetch fixture's missing `preconnect`; the fixture now disables both fetch and preconnect, with no type suppression.

## Final checks

- Focused Vitest: **104/104**, 8 files, at16:19:49IST. New pure26 + existing receipt4/store12/UI22/OpenAPI29/lineageHTTP3/canaryHTTP1/delistedHTTP7.
- Focused Bun: **12/12, 56 assertions**, two files: new public-feed HTTP/SQLite5 + existing SQLite7.
- Root TypeScript check passed; additional compiler program using exact root options explicitly includes the three changed/new hub tests (root tsconfig normally omits app tests): **0 diagnostics**.
- `git diff --check`: clean.
- Actual HTTP uses the production router with an owned child-preload memory fixture, empty selected environment, `--no-env-file`, random loopback port and external fetch/preconnect disabled. The fixture asserts no mutating store method is called, non-GET methods404, private job routes404, both projections identical, counts/limits/privacy/canary/Gateway boundaries. Parent awaits its owned close, escalates only that PID after1s if necessary, fails after3s if not reaped, and confirms the bound origin refuses connection after shutdown. SQLite test uses/removes only its fresh owned temporary directory.

No full repository suite was run by this worker. Full gates, independent review, ordered commit/rebase and the F→H1→G8 shared-file handoff remain parent-owned. H2+ are outside this task.
