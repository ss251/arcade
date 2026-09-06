# H12b1 — bounded preview and local-request validation

After canonical CLI28ce88a. Root-only, no fan-out/parallel reviews; max4 tests.
Own pure web lib/publish-preview.ts and lib/publish-policy.ts, focused tests and
SDD records. No subprocess, filesystem traversal, listener, route/UI, deployment
configuration, model, credential or payment action in this chunk.

Fresh-process testing reproduced eager chain selection through the H12a helper's
core barrel import. Permit only its import-only correction to pure manifest/engine
submodules, with the same correction in the parser and an actual isolated import
regression. This changes no CLI projection/policy; preserve the historical H12a
fingerprint against28ce88a and pin the corrected helper in the current report.

Parse the actual canonical CLI directory/generated JSON, never legacy prose,
unchecked casts or reconstructed missing fields. Bound UTF-8 input to1MiB, JSON
depth24, nodes20,000 and generated entries64. Fixed errors on malformed, empty,
oversized or inconsistent data. Preserve directory vs generated/unwritten state,
all supported entries and skipped MCP metadata. Revalidate against the core
manifest/publishability/public projection using the same canonical CLI helper;
verify skill ID, adapter/credential/grants/advisory and private/public correlation.
Unknown top-level/entry/private fields must not silently reach Start serialization.
Public JSON Schema can legitimately contain properties named engine or secrets.
Private prompts/paths/args remain private configuration, never assumed safe to log.

Pure target policy accepts one closed own-data target field, a bounded relative
non-private path, or a credential/query/fragment-free MCP HTTPS discovery target.
No absolute path, traversal, hidden segments, arbitrary scheme, shell syntax,
bare stdio mcp:// or caller argv/options. Later IO must additionally prove realpath
containment/no symlink traversal and actual source kind; syntax alone is not that.

Pure local request policy requires explicit ARCADE_PUBLISH_LOCAL=1, no known
hosting platform marker, POST, a literal loopback HTTP URL, exact Host and Origin,
no forwarded proxy authority and compatible fetch-site metadata. Capture request
metadata without consulting forwarding helpers that default missing host to local.
This is NOT sufficient alone: actual Vite/Bun loopback binding, server-only route,
contained trusted repo/child arguments and bounded cleanup remain H12b2.

Prewrite tests using actual canonical CLI projections and real Request headers,
including no accessor/coercion side effects. Test private-field leakage, cross-
entry mismatch, generated written=true, duplicates/oversize, subscription refusal,
flag/host/origin/proxy mistakes and legitimate schema property names. No heavy
mocking, new framework, live network or source execution. Run exact strict and one
full sequential gate after freeze, then commit locally. H12 UI/native acceptance
and H13/H14/session/deferred plans remain separate.
