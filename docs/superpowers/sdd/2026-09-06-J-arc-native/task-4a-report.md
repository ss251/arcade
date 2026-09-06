# Task 4A — bounded Circle proof contracts

Base459f5fb. Added immutable distinct-role/loopback capture, ordered two-rail
challenge checks, CLI inspect/estimate/queued202 validation and private poll
binding. Baseline inspection may omit registry metadata; local-discovery proof
requires method and input. No command exit code proves payment or settlement.

The journal uses a fresh owned0700 directory and exclusive0600 file. Every
record is a bounded exact-field public projection with a hash chain, timestamp
and sequence. Intent is synced before a one-shot callback; competing/repeated
deposit or payment claims cannot start a second callback. Write/validation
failure poisons the writer; ambiguous work gets a fixed uncertain-stage record,
never a raw provider diagnostic. Closed-file verification checks permissions,
ownership, bounds, sequence, hashes and duplicate intents. This is journal
integrity, not chain settlement proof. The later live runtime must enforce the
full prerequisite sequence and independently verify observations.

The new suite initially failed module resolution with0 executed tests; this is
not a behavioral Red. First implementation16PASS/50assertions/265ms. Review
removed string coercion of untrusted chain data and fixed error-boundary handling
for close failures. Added concurrent claims, closed-journal replay, corruption,
symlink and non-coercion cases. Final44266:19BunPASS/60assertions/298ms and
two-root strict0. Tests use generated owned temporary fixtures and remove only
those fixtures after closing their writers; no live wallet/API/payment is used.

The separate [read-only CLI preflight](../../../evidence/J/circle-cli-preflight.md)
records four actual wallet/status/balance calls and the installed CLI source/help
corrections. These reads are not a payment proof or consumption of a live approval.

Sole full gate56380 PASS:4,681Vitest/208files/65.43s,874Bun/57files/
6,374assertions/167.35s, root/web strict and client399ms/SSR174ms builds.
Both source/test hashes remained frozen. Eight-path/24-link/empty-index/privacy
audit passed before the gate; final audit and atomic commit/merge follow.
Task4A COMPLETE, but Task4B live runtime remains unimplemented.

Further read-only preflight found a policy incompatibility before spending:
the installed CLI forcibly raises Gateway maxTimeoutSeconds to30days, whereas
ARCADE pins604900seconds and binds the echoed terms and signature lifetime.
The public supported endpoint still reports a604800-second minimum for Arc.
No installed flag changes the CLI clamp, and the public package registry still
reports1.0.0 as latest. Owner direction was requested for an explicit bounded
testnet compatibility profile; no signing policy was relaxed. The CLI also
defaults its optional resource description when the challenge lacks a top-level
resource descriptor; Task4B must check this against the existing binding before
attempting payment, not weaken its checks.

No approved deposit, payment or deployment has been attempted. The
executing-plans and ts-testing skills guide the bounded
checkpoints; installed Circle skills guide the explicit chain/terms/no-retry
rules, with owner restrictions taking precedence.
