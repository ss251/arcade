# G7 brief — bounded read-only Graph service

Implement the planned GraphStats, AgentEvidence, TreeView and Effect Graph
service interfaces without wiring routes or assuming a Studio URL. Only three
fixed GraphQL documents and validated identity variables may reach the explicitly
configured provider. Every result requires coherent indexing metadata, entity
relationships and exact bounded numeric encodings; unavailable or malformed data
is null, never fabricated zero. Runtime interruption must remain interruption.

Bound endpoint configuration, credentials, redirects, headers, body bytes, total
request time, concurrent work and cache entries. Include late response/stream
cleanup and interruption-safe singleflight. HTTP is allowed only for explicit
loopback fixtures; deployment/query credentials remain owner-controlled.

Use genuine failure-first tests, including actual owned local HTTP redirect and
unfinished-body fixtures. Check compatibility with the planned schema; do not
constrain child-hop spend by the root payment, because those are different payer
legs. Preserve original failures and invalid test assumptions honestly. Independent
read-only source review and a separate whole-repository test/type gate precede
the atomic commit. No route, payment, key, account, deployment, dependency, live
Graph query or Git push is in this task. G2–6 and live G1 remain owner-gated;
the canonical F-before-G shared-file merge order is unchanged.
