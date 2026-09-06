# H10c2 ordinary buyer page — parent report

2026-09-06, after H10c1 `57fbfe0`. Root-only implementation and self-review
under the owner machine-load restriction. No delegated or parallel review.

## Implemented

The actual `/buyer` route has no server function or data loader. SSR and first
hydration are passive; an effect reads the existing H9 ordinary store. Full rows
stay in browser-private refs/controller, with only closed summaries in UI state.
Selection is issuer+realm+job scoped and performs no IO. Result and tree each
require a deliberate action; refresh, storage events, selection and unmount clear
old evidence and cancel its reader. No signing, payment, session or automatic
polling path exists. Forget controls describe local-only removal and return fixed
success/failure notices, preserving unrelated site storage.

The page distinguishes unavailable, malformed and truly empty storage, pending
and unavailable results, hub-reported settled/nonsettled outcomes and incomplete
trees. Accepted prices are never summed as spending. Historical saved-row matching
is explicitly weaker than the original signed buyer/nonce/quote provenance and
is not independent chain verification. Session recovery is unavailable, not a
zero-spend or empty-session claim. Full seller JSON is escaped and selectable in
a keyboard-focusable bounded scroll region. Gateway UUIDs have no transaction link.

The frontend/browser skills guided use of existing ARCADE tokens, native controls,
AX-derived inputs, isolated profiles, real CORS and explicit process cleanup.
No new dependency, shared store/transport/signer/controller, F contract, production
origin/configuration, owner key or chain state was changed. Generated route changes
are the additive buyer registration; CSS additions are buyer-scoped.

## Verification and corrections

- 16:50:12 IST: prewritten suite failed collection on the missing component; no
  behavioral Red is claimed from that run. First implementation passed9/10 at
  16:53:24; the missing pre-read original-provenance explanation failed and was
  added.10/10 passed at16:56:29.
- Native integration reproduced the real forget API mismatch: a full seven-field
  row was supplied where only origin+realm is accepted. The store refused without
  deletion. The caller now passes the exact two-field scope. The corrected check
  proves both an actual blocked storage write and successful one-row removal.
- At17:02:26,50 focused tests/3 files passed in1.69s:10 presentation,39 retained
  recovery and1 actual Start-route test. The route returned200/passive loading
  HTML and produced zero hub reads; its owned HTTP fixture stopped afterwards.
- Exact strict checking initially found12 accesses not narrowed by a grouped
  union's negative branches. An explicit positive terminal-state branch resolved
  them without a cast or change to the shared H10c1 contract. Final six-root web
  and two-root fixture programs each reported zero diagnostics.
- [Native evidence](task-10c2-native-check.md): final16 cases passed on the corrected
  UI sources. All30 exact PIDs across six attempts are absent,18 loopback ports
  refused connections, and no owned profile/runtime process remains. Parent read
  all four final1280-light/390-dark screenshots. This is desktop/mobile-width
  emulation and native keyboard input, not actual touch or screen-reader proof.
- The sole full Vitest sweep90086 at17:07:35 passed3,967 tests and failed1
  across167 files in50.56s: the H8 stylesheet-prefix preservation assertion.
  Buyer CSS had been inserted inside that frozen prefix. Moving only the new
  block to the stylesheet end restores the complete prior stylesheet byte prefix.
  The unchanged H8 test and buyer presentation passed49/2 at17:10:33 in857ms.
  No full Vitest rerun or weakened assertion. The final16-case native check
  passed again after the CSS move; the earlier six-root web and two-root fixture
  strict programs require no TypeScript source change for that reorder.
- The not-yet-run Bun/strict/build stages75663 exited0 at17:14:44 IST:
  834 Bun/54 files,6,093 assertions in163.46s; root/web strict0; actual client329ms
  and SSR163ms. No repeated full Vitest sweep, simultaneous gate or browser
  process. Final source audit and local atomic commit follow.

## Source fingerprints

```text
1b6c3144ccc7ea14d4e300901c168205dd03bfe4e0d478d450d57ff198f721aa  apps/web/src/components/buyer.tsx
3ef6a699008ad9dc06f140ac027ec27b533dc7fb0b3d3c37cbc76febc2af970b  apps/web/src/routes/buyer.tsx
3f55b9e87f15eab00cdab0fa24577449e78340c01610a669ae0ab9db03165e01  apps/web/src/styles.css
dd48664db1fb14105e67307880d64999a7759514d7b2b5c218ead319d57a7592  apps/web/src/routeTree.gen.ts
2354c21fd2555fa588c203c328ea50b6689e8d705bdfd17f41dab1d27f33ec5c  apps/web/test/buyer.test.tsx
c890417c9ddfb5e961daee0db45d5dce8cf8e72e3e7f9a0a7149181627556978  apps/web/test/buyer-route.test.ts
5f396a5acc91a7835cb777fec246ab2130d68bf120d23366738e20af02a8b87f  apps/web/test/fixtures/buyer-browser.tsx
883a1278bee48812017cbe8c050cb093db34a603de91335f255b12610676bbf0  apps/web/test/fixtures/buyer-browser-server.ts
```

H10c2 completes the ordinary recovery dashboard only. Durable sessions, H11–14,
H merge and live/production proof remain separate. No spending, consumed-approval
replay, key access, mainnet change or push occurred.
