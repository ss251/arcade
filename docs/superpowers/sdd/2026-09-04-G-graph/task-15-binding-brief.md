# G15E — canonical query and source binding

Reuse the actual Graph client's closed request validator through a narrow inert
encoder export; do not duplicate or change its policy. Add offline harness
source-manifest and query-binding helpers, tests, report/index/progress.
No owner-root creation, key lookup, RPC, signing or cache replay is released.

Read only a fixed allowlist of first-party code/query/manifest and lock files,
with byte/path/alias limits. Source manifests are frozen and tied to their
captured local root; copied/forged manifests or changed source bytes refuse.
The root parameter is an offline fixture seam, not a live authority override.
No private paths or source contents appear in the serialized manifest.

Bindings include policy/source digests, endpoint/payer/token/merchant/amount,
the exact encoded body and digest, query kind and optional parent/block
relationship. The identities subject must equal the fixed plan-default subject.
Attestations require an existing same-source identities binding and declared
matching block hash. A declared relationship is NOT a verified paid result;
it cannot clear writer uncertainty or prove receipt/cache validity.

This is disk/source provenance and a stable cache-key ingredient, not proof of
executed runtime code, installed dependency integrity or permission to spend.
Changes invalidate existing bindings rather than silently refreshing cache.
Tests use owned source-copy fixtures; never modify actual worktree sources from
tests. Keep signer/query/receipt suffix byte-identical, exact strict, one
sequential full four-worker gate, one local commit/main FF, no push/live calls.
