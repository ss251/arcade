# H13a — keyless ENS target preparation

2026-09-06 after f689ba6. Root-only self-review under the active machine-load
restriction; no independent/parallel review. [Brief](task-13a-brief.md).
This is the server/tool half, **not completed browser hire-by-name**. H13b must
bind the name into the real private confirmation/signing lifecycle.

## Behavior and boundaries

One inert own-data capture requires exactly one bounded skillId or ENS name.
No normalization, URL guessing, inherited/accessor target or ambiguous fallback.
The actual SDK CallArgs validator and emitted JSON Schema enforce exclusivity;
the JSON Schema retains all input fields and the required maximum price.

The quote captures issuer and chain before async work, resolves the original
name, gets its listing and actual-input unsigned 402, then rechecks the resolver.
Initial and fresh records must agree with listing id, seller, exact endpoint,
chain and payee. The existing advertised-name check on id calls remains; an
explicit alias does not suppress an advertised name's verification. The 402 is
the price authority, including when ENS reports a different price or null.
Only the exact typed 404 is expiry; malformed data/outages are unavailable.
Validated payee disagreement reports both public addresses, not raw diagnostics.

arcade_resolve_name is registered in READ_ONLY_TOOLS and gives a closed H4
projection qualified as hub-reported, not independent browser chain evidence.
Preparation returns resolved skillId, verified ensName and the original name
when explicit, with the original input/call identity. It cannot sign or spend.
The hard ceiling applies to both target forms. The actual keyless quote route
accepts either target, rejects duplicates/both, and returns no-store responses.
Existing browser id calls, private permits, signer, direct submission, recovery,
UI and CSS remain unchanged here. New name calls are not yet accepted by the
browser's private binding and therefore cannot create payment authority.

## Recorded validation, including failures

- 20:06:13: genuine pre-source Red, 29 failed / 1 passed. Missing name preparation,
  missing resolver tool, both-target route acceptance and schema/ceiling defects.
- 20:08:34: first 96 focused tests passed (5 files).
- 20:10:06: 113 focused tests passed (6 files). A command named two nonexistent
  test files; those were not collected, and no coverage is attributed to them.
- Expanded 20:11:22 run: 204 passed / 4 failed. The old E13 quote-route fixture
  omitted priceAtomic. The real producer in apps/hub/src/ens.ts always emits
  decimal or null. Added only priceAtomic: null to that fixture and the existing
  native Chat fixture; no payment assertions, keys or other fixture bytes changed.
- Exact strict setup initially omitted route-tree declarations; corrected roots.
  The new test options also lacked the installed SDK's required Context, fixed
  with a real empty context object (not a cast).
- 20:12:44: 209 focused / 9 files passed; exact 10-root strict zero diagnostics.
- Sole full sequential gate 66822 started 20:14:18 and exited 0: 4,188 Vitest /
  184 files / 57.42s; 834 Bun / 54 files / 6,091 assertions / 163.38s;
  root/web strict passed; client 376ms / SSR 188ms.
- At gate launch, direct inspection of the model-facing schema revealed that
  Effect's JSON Schema annotation replaced rather than extended the field
  definitions. Source was held unchanged throughout that gate. Thus that full
  sweep is **not claimed as verification of the final schema correction**.
- After gate exit, 20:18:35 targeted regression failed (1 failed / 35 skipped):
  properties and required ceiling were absent. Preserve JSONSchema.make of the
  original fields when adding oneOf. 20:19:03 final affected 209 / 9 passed,
  2.76s; exact 10-root strict zero; final client 432ms / SSR 192ms, exit 0.
  No full Vitest/Bun sweep was repeated.
- 20:23:06: one extra final-newline target regression passed without a source fix;
  all 13 boundary checks passed. Final audit verified 21 source pins (including
  11 unchanged H12b3 pins), two exact fixture additions, 213 local links,
  new-artifact privacy, empty index and scoped tracked changes.

All network fixtures are synthetic, including the SDK model and the existing
public offline signer regression. No owner key, real model, live ENS/RPC,
payment, browser session, production setting, mainnet change or push occurred.

## Final source fingerprints

These identify the final corrected candidate. The full gate's earlier tools/test
bytes are intentionally not conflated with these final fingerprints.

| File | SHA-256 |
| --- | --- |
| apps/web/src/lib/purchase-target.ts | 0e22f9555091cc763e8cdc4f3e9f6e66b69e94b0aa3167b0463bee226b2034ee |
| apps/web/src/lib/hub.ts | ec96c0cf75bc12fc426b09f0a48eea807625bab7d1177859556e9fc8aedc5121 |
| apps/web/src/lib/purchase.ts | 4f8099e0b79c2dfd05506840cf7423bb30a9a4ab2dad54c2addef24c7d1543e3 |
| apps/web/src/lib/tools.ts | 9977039b275103a95ddeea155c7ebf2606ef38d8201130780f30b8c1431be6da |
| apps/web/src/lib/approval.ts | f9950fb5bc7aac14d9043324b217ac5f27c7f2f3c2fa316d517586e34f540ced |
| apps/web/src/routes/api.quote.ts | 6ebdac478ea59998c1af7caf75262ce189c4541f739a32da7bb1c83a17bd4c65 |
| apps/web/test/hire-by-name.test.ts | 2d817a310287f433e0c31c9e369d03f715567dc88c2b36c471188bc58c828b73 |
| apps/web/test/purchase-target.test.ts | 78a4d80a3b009b7400a0aaac598f7e2aa8616c6189da2287265cec10c6353c0d |
| apps/web/test/quote-routes.test.ts | 4a7aa98974e70d63efacf9fa1e093f2816c325a208a7116a6fc75bb8e3a4b2ab |
| apps/web/test/fixtures/chat-purchase-browser-server.ts | 5e3423728326659a8965e7690f149ff09542b4d922a11b77023cc60422e8eeb2 |

H13b follows before any claim of a completed name purchase in Chat. H14 owner
review/real-wallet capture, durable sessions, H merge, deferred G8/G9,
vendor-neutral tasks and Plan I remain separate.
