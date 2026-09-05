> Public execution record. Copied from the retained private task report; no live authorization or production state is implied.

# H2 route supplemental store-defect coverage — September 5, 2026

Only seller-summary.bun.test.ts was extended; production source, pure helper/tests,
all previous reports and public report copies remain unchanged. This is supplemental
coverage of an already-correct route, not a claimed new production Red.

The child-only preload can arm exactly one allReceipts read to Effect.die with a
private diagnostic. The actual production GET returns the exact fixed503 JSON body
without that diagnostic or job identifier. Read counts prove it stopped after the
listings/receipts reads; the next GET recovers200, performs all three healthy reads,
and preserves null margin. Both observations show zero mutations/external attempts.
The existing owned-process startup/request/close bounds and socket-refusal teardown
remain active. There is no production debug endpoint or fault-injection seam.

At11:37:16UTC the first supplemental run failed only because the new test expected
compact JSON whereas the unchanged server helper deliberately formats with two-space
indentation. That fixture expectation was aligned with actual server.ts:284–287;
no production code or semantic assertion changed, and this is not a product Red.

At11:37:43UTC all5 Bun tests/43 assertions passed against the owned loopback child.
Exact-root-options TypeScript explicitly covering server.ts and the Bun test plus
diff check exited zero. No full suite, key lookup, external network or Git mutation.
Source/test and this follow-up are FROZEN for parent review/publication/full gates.
