# G15E offline request/source binding

The [binding brief](task-15-binding-brief.md) releases only inert helpers and
tests. No operational state, Keychain, actual RPC, payment, live authorization
or cache replay was exercised. J4 stays paused and existing payment policy,
validity windows, caps and replay guards are unchanged.

`encodeGraphQuery` delegates to the original client's closed request encoder.
The exact encoded body is used in a frozen binding containing policy/source
digests, fixed endpoint/payer/token/merchant/amount and query kind. Identities
must use the fixed plan-default subject. Attestations require an original
same-source identities binding and matching declared nonzero block hash.
A declared parent/block is not verified paid-result evidence, does not verify
the agent IDs against that result, and cannot clear unresolved reservations.

The source manifest hashes exactly nine allowlisted first-party source/query/
manifest/lock files, with a double capture and fresh reads around encoding.
Files are bounded, UTF-8 byte-preserving, same-user, single-link and non-aliased;
the relaxed source reader permits normal source-file modes but does not relax
the private reservation reader. Manifests and nested rows are frozen. A private
WeakMap binds original manifest objects to local roots; copied manifests refuse.
No source bytes or private paths are serialized. Source digest changes invalidate
bindings, not silently update reusable cache evidence.

These are disk-provenance checks, not an attestation of executed code, dependency
installation integrity or protection against a malicious same-user filesystem
writer. The root argument is an offline fixture seam, not a live authority-root
override. Query and source digests alone never authorize signing or paid retry.

## Executed checks

Observed failure-first missing-export Red preceded implementation. Focused
checks passed **44 Bun tests/263 assertions in1.083s** and **68 client Vitest
tests in425ms**. They cover frozen nested rows, stable exact body/source hashes,
foreign subjects, copied manifests/parents, source/query-byte changes, different
source parent, missing/oversized/non-UTF8/hardlinked/symlinked files and parent
aliases. Default-root read hashes only the current allowlist; altered fixtures
are owned temporary copies. A synthetic paid-client test confirms the encoder's
bytes equal both original query transport bodies. Inert encoding invokes no
fetch or Keychain subprocess.

Exact four-root strict passed after correcting two annotations (literal kind
widening and a mutable matcher expectation). The protected client suffix from
proveReceipt through query/signing/paidQuery remains byte-identical to9ed7c90,
SHA256 `43f6188ad24298352f582e04af43658760490550a8e4f02ccc136e461419f924`.
The sole sequential four-worker gate39235 passed:5337Vitest/242files68.66s;
1466Bun/98files with12237assertions198.75s;root/webstrict and client/SSR
builds332/181ms. Final eight-path/three-link/privacy audit and five source/brief
pins are checked after three result annotations; no full suite repeat.

## Next three steps

1. Persist bounded private response snapshots and verified per-query results,
   preserving uncertainty on incomplete observations or interrupted writes.
2. Bind one owner-state root and before-sign/forward intent/balance checks;
   test cross-run accounting without initializing operational state.
3. Add narrowly validated no-key historical replay and receipt reconciliation;
   resolve live authority separately before any real Base or new Arc purchase.
