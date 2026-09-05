# H2 brief — public seller economics with honest uncertainty

Implement the planned pure seller summary and GET /sellers/:address/summary route.
Use complete raw store listings, receipts and runners locally, with a current clock;
never reconstruct private lineage from the redacted public feed. Return only derived
public fields. Validate exact nonzero seller addresses, canonicalize case, leave
unknown sellers as an honest empty ledger and refuse malformed/non-GET requests
without store reads. Map accounting failures and storage defects to one fixed 503.

Use exact atomic accounting, deduplicate coherent receipts and refuse contradictory
economic records. Include reported failed-call inference costs. Missing costs remain
unknown, with nullable totals/margins and separately named known subtotals. A child's
buyer differing from its parent seller may be a dedicated subbuy wallet, not an
external sponsor; absent funding-ownership metadata cannot establish exact zero spend.

Derive direct edges only from complete, coherent raw lineage. The root manifest is a
flat list of all non-released descendants, not direct children or only settled calls.
Unsettled manifest members are unresolved reservations; a released failed child may
be absent. Bind full descendants to the root's rail/network and canonical commitment
when supplied. Local accounting completeness is not mined-chain verification.

Project only actual listing ownership, bounded runner liveness and existing safe
metadata. Never invent ENS expiry, validation counts or live customer demand. No
buyer, private job/runner/session identifier, signature, nonce, diagnostics or unknown
future fields may enter the output. Bound all snapshots, values and traversal; avoid
getters, coercion hooks and input mutation.

Require genuine failure-first unit and actual owned-loopback router tests, independent
review and full test/type gates before a separate local commit. Preserve original
reports with dated corrective follow-ups. No key lookup, external provider, paid call,
production deployment, GitHub push or bypass of the funded F merge dependency.
