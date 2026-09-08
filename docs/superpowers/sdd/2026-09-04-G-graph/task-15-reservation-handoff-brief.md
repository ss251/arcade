# G15N — one-use fresh reservation handoff

Release only Graph harness/test and plan-owned brief/report/index/progress.
Before durable balance journals can attach to a reservation, distinguish a just-
acknowledged reservation from arbitrary snapshots, decoded/copied summaries and
reopened unresolved history. Register only the real successful reserve return
in a process-local weak map, retaining its original balance input, query, owner
claim and head. Existing ledger bytes, counts, caps and reservation behavior
remain unchanged; this is an additional local provenance boundary.

Consume the real acknowledgement once, with original query/source binding and
the same private parent/active owner claim. Refuse expired local handoffs within
the existing five-second IO budget, retries, copies, mismatched roots/queries,
changed source/state and closed or failed writers. A failed handoff must not
reclaim or reset the already-counted reservation. Return only immutable public
reference fields; no key, signing/spending authority or operational state.

This local process handoff is not a blockchain authorization and changes no
existing payment validity constant, cap or replay rule. Future balance recorder
creation must consume the retained handoff itself exactly once; durable journal
and global reconciliation remain separate work. Use owned synthetic tests,
one sequential four-worker full gate, atomic commit/mainFF and no push.
