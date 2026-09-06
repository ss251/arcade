# G8 web follow-up — optional indexed evidence

September 6, 2026. Base c8d6337, after the G8/G9 hub and MCP commits merged.
Root-only, max4 workers, no parallel reviews/gates; no new spend or live Graph.

Add GraphEvidence to public listing decoder output and preserve its exact
four-field projection through the skill-page serialization boundary. Reuse G9's
inert checkedGraphEvidence, never import MCP private state. Absent/malformed Graph
is omitted without discarding a valid listing. Do not fabricate indexedBlock,
freshness, settlement-backed feedback, customer counts, identity ownership or
purchase availability. Keep D's current registry counters distinct.

Render an optional Graph block on the skill detail page in existing ARCADE
skill-facts/skill-code/skill-note styles. No CSS, buying, quote, wallet, issuer
selection, private capability, protocol or current /stats changes. When omitted,
existing pages remain visually unchanged. Graph-only counts never fill D fields.

Write failing decoder/loader/actual page-render tests first, then implement.
Extend only the owned H8 public fixture with four Graph modes for an actual
browser check (normal/zero/invalid/long), retaining every old mode. Observe full
text/escaping/provenance and mobile containment. Exact owned Chrome/fixture/harness
cleanup before the sole sequential full gate. No shared browser/profile, keys,
provider requests, live purchase or production change. Private images stay out
of Git; publish sanitized commands/results/hash observations and scope limits.
