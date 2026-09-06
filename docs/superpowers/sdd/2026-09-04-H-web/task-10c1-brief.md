# H10c1 — passive saved-job recovery foundation

After H10b6 `6937ce9`, single-threaded under the owner machine-load restriction.
First of two buyer-page slices: a closed historical result projection and private
selection/read controller, then the route and native acceptance in H10c2.

Own only `apps/web/src/lib/buyer-recovery.ts`, its focused test and these SDD
records. Retain H9's seven-field ordinary store, H10b3 direct bounded readers and
H10b4 live purchase provenance unchanged. No automatic read on construction or
selection; one explicit result or tree read at a time, no polling/payment loop.
Capture the selected row privately, abort and clear evidence on replacement or
cleanup, and ignore obsolete completions. Never expose its token in a projection,
server function, URL, model/history, error or DOM. No signing or mutation surface.

Historical receipts must match the saved job, skill and accepted amount. Validate
terminal status, operational rail, reference kind and accounting before releasing
bounded escaped JSON output. Do not synthesize original buyer/nonce provenance:
this is the issuing hub's report matched to local metadata, not fresh wallet or
independent chain verification. Pending, unavailable and not-settled are distinct;
no sum of admitted prices is spending. Refuse known-token echoes. Trees use the
existing bounded decoder and must also match the selected root skill/price.

Prewrite deny-first tests, exercise the actual default transport with offline
responses, exact strict checking and a single max-four-worker sequential full gate
after freeze. No native-page proof in this slice, new spend, key access, subagents,
production change or push. Session recovery remains explicitly unavailable; it
requires a separate deliberate capability contract and real browser producer.
