# J8D1 gate follow-up — owned relay fixture cleanup

The [terminal checkpoint](task-8d1-report.md) is committed separately and is
not yet on main. Its one full gate reported an existing Agent SDK relay
beforeEach/afterEach timeout after the pending-upstream test body. Both relay
production code and this test were unchanged by J8D1. One isolated diagnostic
passed in108.38ms; that does not erase the full-gate failure or establish the
precise Bun-internal timing cause.

The fixture returned a promise that could never resolve, then afterEach awaited
the upstream server's shutdown. This follow-up makes that owned handler
explicitly releasable in `finally`, **after** all original fail-closed and
no-further-send assertions. It remains permanently pending throughout the
behavior under test. The100ms relay lifetime,2,000ms test bound, production
cleanup deadlines, signatures and payment authorization windows/caps are
unchanged. No production source is edited. Cleanup is also reached on failed
assertions; the existing idempotent relay close is still awaited.

Run the focused relay file once, freeze this small scope, then run one sequential
four-worker full gate for this distinct commit. Only after that gate passes,
commit the fixture follow-up and fast-forward both incremental commits into
main, preserving the unrelated untracked lockfile. No squash or push.

No owner credentials, real RPC, payments, deployments or live approval replays.
Next work remains receipt-reader/result compatibility, C2/D budget/root/boot
composition and Task9; this cleanup does not activate any escrow route.

## Verification outcome

Focused relay file:22pass/84assertions/405ms; the pending case passed105.79ms.
Four-file scope/privacy audit passed, with four local links; the fixture was
frozen before its sole gate66986. That distinct checkpoint's full gate passed:
5,069Vitest/233files/70.60s;1,072Bun/78files/8,146assertions/181.70s;
root/web strict and client/SSR builds. The earlier J8D1 gate remains recorded
as failed; neither checkpoint ran its full gate twice. Final hash comparison
precedes commit and the two-commit fast-forward; no gate replay on main.
