# H10b1 — fresh browser approval capability foundation

Follows H10a `e8ea873`. Single-threaded under the owner's machine-load restriction;
no delegated author/reviewer, overlapping gate, real wallet, network or payment.
This foundation alone does not migrate the active chat/relay or complete H10.

The actual chat currently starts a wallet request from an `awaitingSignature`
tool-output effect guarded only by an instance ref. Restored/remounted tool output
is not fresh human approval. The installed AI SDK HMAC validates approval ID,
tool call ID, tool name and input on the server; it remains in place. A separate
browser-local, one-use capability must connect the actual Confirm callback to the
later wallet controller. A transcript Boolean/string is not that capability.

## Released root-only scope

- New `apps/web/src/lib/purchase-approval.ts` and its focused test. No active Chat,
  Confirm, signer, server relay, HTTP, H9 storage, F session or dependency edits.
- `createPurchaseApprovalScope` owns opaque, nonserializable-by-reconstruction
  tokens in a private WeakMap. Only the later actual Confirm handler may call its
  approval operation in production. This is an application lifecycle boundary,
  not an XSS, hostile client or cryptographic server-approval verifier.
- Approval captures bounded own-data approval ID, tool call ID, exact
  `arcade_call_skill` name, skill, positive ceiling, canonical actual input and
  H10a public browser context. Skill matches context, amount is within ceiling;
  only explicit EIP3009/Gateway contexts can produce a spending permit. Test,
  missing, malformed or unsupported context refuses.
- Canonical input is a plain/null-prototype JSON object or its bounded JSON text;
  no coercion, getters, toJSON hooks, symbols, cycles, nonfinite numbers or exotic
  objects. Keep arrays ordered and object keys canonical. Bound encoded bytes,
  depth and nodes before returning an immutable snapshot. No mutable source
  object can change the approved request afterwards.
- A scope retains at most128 approval/call-pair tombstones, never evicts/rearms
  old authority, and expires an unused permit after five monotonic minutes.
  Closing the scope discards unused authority. It cannot revoke an authorization
  already signed downstream. Invalid/backward clocks refuse safely.
- Consumption removes a token before validating the later binding/expiry and
  before any caller could reach wallet code. The binding must match IDs, tool,
  skill, ceiling and canonical input. Failed/mismatched/expired attempts cannot
  be retried with that token; serialized/copied tokens and tokens from another
  scope refuse. Nothing is persisted, logged, sent to a model or placed in a URL.

## Acceptance and later integration

Write focused tests before implementation; missing-module setup is not a product
Red. Cover immutable snapshots, exact binding, one-use/mismatch/expiry/close,
cross-scope and JSON reconstruction refusal, capacity without eviction, malformed
data/hooks/proxies/clock behavior and zero storage/network/wallet access. Compile
the exact roots and run one full, explicitly four-worker-bounded gate for the
atomic foundation commit. Preserve historical evidence honestly.

H10b2 will wire the real Confirm callback and wait for the matching SDK tool
output before consuming the permit. It will re-check actual-input quote/ENS and
captured terms before signing/forwarding, use rail-correct typed data, send once
directly to the hub, capture a valid202 capability before polling, correlate the
terminal receipt, and retire the server relay. Fresh terms that differ from the
displayed/approved context require a fresh decision, even below its ceiling.
No retry, remount or restored transcript may recreate spending authority. Native
two-origin/actual UI composition remains a later required proof, not a claim of
this pure foundation. Buyer/session recovery remains separately scoped.
