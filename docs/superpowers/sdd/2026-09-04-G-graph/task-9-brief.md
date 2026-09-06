# G9 — qualified Graph evidence in MCP describe

September 6, 2026. Base c5a5389; G8 is merged. Root-only, max4 workers,
one sequential full gate per commit, no browser/gate overlap or paid work.

Expose graphEvidenceLine and GraphEvidence via mcp.ts, with the small inert
decoder/formatter in a separate graph-evidence.ts for later browser reuse.
Describe accepts only own canonical Arc-testnet agent ID and three nonnegative
safe integer counts. Project exactly four fields in both text/structured output,
drop malformed graph and unknown nested provider fields. Preserve seller fencing,
D's distinct registry evidence, schemas, tools and all spending/session paths.
Missing graph adds no text and never means zero. Zero indexed settlements still
displays other supplied counts honestly.

Deviation: say hub-reported/cached Graph index, not independent chain proof.
G7's feedbackCount does not establish settlement-backed feedback. Do not use the
literal plan's absolute claim that the hub cannot fabricate indexed facts.
Actual in-memory MCP SDK tests must cover both output channels, invalid evidence,
two discovery GETs, no key use or payment/signature request. Unit tests cover
malformed/hostile descriptors and both nonzero and zero observations. G8's web
display follow-up remains separate; no live Graph query or deployment.
