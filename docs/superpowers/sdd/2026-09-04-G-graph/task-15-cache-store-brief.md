# G15L — durable per-query result storage

Release only the Graph harness/test and plan-owned brief/report/index/progress.
Persist each original correlated query result in a separate exclusive private
cache directory; do not change capture inventory, existing client/consumer or
budget/policy behavior. Require fresh retained-evidence correlation before and
after writing. Store bounded canonical result plus commit marker with file and
directory fsync/readback. Retain partial files/claims on interrupted work.

Reads must revalidate original captures/source/parent binding and exact committed
cache bytes, modes, ownership, inventory and aliases. Missing/corrupt/incomplete
cache refuses; no refresh, overwrite, cleanup/takeover or paid retry exists.
Claim absence alone is not acknowledged clean close or payment proof. A durable
canonical marker and fresh evidence read can support a later read even if the
original acknowledgement was lost; global reservations remain untouched.

Returned cache handles retain original transaction/cost and qualified historical
consistency, never a fabricated fresh payment or live acquisition. No-key full
artifact replay and actual consumer/global-budget integration remain later work.
Use owned synthetic fixtures including actual child death between durable writes,
corruption/alias/source/parent/clock failures, no-key readback and preservation of
first-query data after a later incomplete query. One sequential four-worker gate
and atomic commit/mainFF; no key, actual endpoint/RPC/spend or push.
