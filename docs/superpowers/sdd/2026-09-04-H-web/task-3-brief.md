# H3 brief — authenticated, anonymized receipt trees

Implement the pure TreeNode/TreeView builder and GET /trees/:rootJobId with the
existing root-job HMAC capability. Validate a bounded canonical root ID and token
before any receipt read. A missing, wrong, malformed or foreign token is the same
fixed 404; even a valid child's own token cannot turn that child into a root.
Use no-store responses and never put capabilities in generated URLs or logs.

Derive hierarchy from full same-root parent/hop/rail/network receipt evidence,
not the root's flat non-released descendant manifest. Preserve canonical digest
and committed-budget checks, bounded deterministic positional nodes, explicit
completeness and fixed evidence flags. Unsettled manifest members remain unresolved;
released failed children may legitimately be absent from that manifest. Missing or
contradictory evidence is incomplete/unavailable, never a fabricated empty tree.

The top-level authenticated root ID is the only job handle exposed. Reuse H1's
explicit public scrub for safe reasons, amounts, references and explorers, then
select only the planned node fields. No descendant job ID, buyer, session, nonce,
signature, private diagnostics or future properties may appear. A matching treeHash
is a recorded canonical digest, not independently mined-chain proof.

Require genuine failure-first tests for the missing route and authorization boundary,
plus actual owned-loopback tests for complete/incomplete trees, private field absence,
no mutations/external requests, fixed storage failure and finite cleanup. Preserve
the existing pure tests and earlier reports. Independent review, strict compilation
and a separate full gate precede the scoped local commit. No real key, chain purchase,
production change, push or bypass of the funded F/H1/G8 merge dependencies.
