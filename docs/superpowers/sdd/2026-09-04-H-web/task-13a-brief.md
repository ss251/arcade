# H13a — explicit ENS target and keyless preparation

2026-09-06 after f689ba6. Root-only; no fan-out, concurrent reviews or gates.
Use ts-testing with existing Vitest/AI SDK fixtures. No live model, key, wallet,
ENS writes, spending, production changes or push.

H13 is split into two atomic source steps: H13a target validation/server tools,
then H13b the browser's private approval and fresh quote lifecycle. H13a alone
must not claim an enabled name purchase in the browser.

The literal plan predates H10's private approval. Do not revive transcript-owned
payment coordinates, omit actual input, or show raw hub diagnostics. Consume H4's
strict resolver decoder and typed expiry. Introduce one inert exactly-one target
capture, shared by route/tool and later browser binding. No name normalization,
URL guessing or id fallback. Capture issuer and chain before async reads; resolve
name to id, then recheck the name after the actual-input unsigned 402 against
seller/id/endpoint/chain/payee. The challenge price remains authoritative.
An advertised name on the id path retains its existing checks. No redirects,
payment headers or signatures. Return typed validated payee mismatch with both
public addresses, distinguish exact expiry from generic outage, fixed errors.

Expose arcade_resolve_name as read-only, accepting only a bounded ENS name and
returning a closed public projection qualified as hub-reported. CallArgs accepts
exactly one id/name; the SDK JSON schema and runtime validator both enforce it.
Preserve the hard ceiling for both targets. Preparation returns resolved skillId,
verified ensName and original requested name, never payment authority. /api/quote
accepts the same explicit target, actual input, no-store fixed responses.

Red tests before source: name resolution and quote correlation, initial/fresh
expiry, valid mismatch versus malformed diagnostics, remapping, foreign issuer,
actual input, exactly-one invalid cases with zero IO, ID compatibility, unchanged
hard ceiling, actual SDK tool decoding and no-spend headers. Run focused checks,
exact strict, source review, then one sequential max4 full gate and atomic commit.
H13b follows to bind requested name to the real card and private signing flow.
