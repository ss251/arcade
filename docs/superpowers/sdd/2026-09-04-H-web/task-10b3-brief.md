# H10b3 — one-shot browser submission and recovery coordinates

After H10b2 `ddb7eca`, single-threaded under the owner load restriction.
The active Chat/relay migration remains separate until all boundaries compose.

Extract H10a's existing complete-response reader into a narrow internal transport
shared by its result/tree wrappers and a new ordinary payment POST wrapper.
Retain the existing read errors, caps, header-only tokens, tree decoder, fixed
paths, whole-body deadlines, removable waiters and bounded cleanup. The internal
prepare/project callbacks are trusted code, not an arbitrary-URL public API.

The new wrapper captures closed original context, signed authorization and actual
JSON object input before any await. Refuse Test/unsupported context, signature
shape or payee/amount mismatch, invalid bounds and any secret/query URL before
dispatch. Authorization recovery/fresh human approval belongs to H10b1/H10b2 and
the later controller, not this transport. No new signer, connect, retry or storage.

Submit exactly one POST to captured hubOrigin plus the original ordinary resource.
Echo original requirements in the x402v2 envelope with UTF8-aware base64 and one
payment-signature header. Credentials omit, redirect error, cache no-store and
referrer no-referrer. Signed data never travels through the web server/SSR.
The entire response including decoding is bounded to ten seconds and131072bytes.
Abort/timeout cannot revoke an authorization or prove no charge.

Only the actual queued202 admission shape produces a captured H9 StoredJob.
Validate job ID, token, queued state and price against captured original terms.
Ignore poll_url; never follow, retain or forward it. Capture createdAtMs exactly
once after a valid response and before later storage/polling. Return no raw body,
signature or echoed provider diagnostic. All other statuses/malformed responses
give a fixed refusal that distinguishes no dispatch from possible submission.
The later controller persists before polling and surfaces H9 storage outcomes.

Focused tests precede implementation: exact EIP3009/Gateway wire including Unicode,
source mutation, unsupported/invalid data before IO, accepted price/token binding,
malformed/redirect/oversize/stalled response, late cancellation, fixed errors,
single dispatch, no storage and unchanged ordinary read/tree behavior. Parent
self-review and exact strict checks precede one sequential four-worker-bounded
full gate. Publish scrubbed preparation/report and atomic local commit. No real
keys, live payments, delegates, independent review claim, push or new spending.
