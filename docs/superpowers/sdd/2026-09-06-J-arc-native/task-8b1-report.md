# J8B1 — runner-local completion binding

First part of the [Task8B signing policy](task-8-brief.md), not the completed
signing runtime. captureLocalEscrowCompletion captures the actual local hub job,
public action context, input, outcome and current PublicListing. Seller and
provider agent ID must match local expected values; ID/version/price/timeout
and explicit escrow opt-in must match the bound call. Actual input must hash to
the committed input and satisfy the local listing schema. The outcome must
pass the existing shouldSettle and output-schema checks, including refusal
stop reasons, output presence/size and consistent local execution timestamps.

The existing86-line hub JSON validator moved verbatim into core; the original
hub module reexports it. Tests assert the runner and hub import the SAME function,
not two similar implementations. Its limited supported JSON Schema semantics
are unchanged; this is not a new full-schema validator or regex hardening claim.
Existing output limits remain unchanged too.

Known PublicListing/Bounds/JobOutcome data classes are copied by descriptor,
then use the existing bounded getter-free canonical JSON codec. Unknown fields,
unsupported objects, invalid values or private manifests refuse with one fixed
diagnostic. The frozen result contains hub job ID, captured public action context
and actual output hash, not raw input/output or a capability. It is only data:
the later runner runtime must retain it under the ORIGINAL socket/job ownership
and require a durable signing claim plus fresh canonical chain/local-policy
checks before signing. A caller-created or serialized data object is not authority.

TDD began with the missing helper. The repository's Vitest alias required the
existing payments root export; the initial fixture used a plain Bounds value
where its class was required. Explicit known nested-class capture fixed real
PublicListing compatibility without accepting arbitrary prototypes.
Focused49Vitest/2files passed:13new local-binding cases and all36existing hub
validation cases. Five-root strict checks passed with zero diagnostics. Mutation,
schema/identity/input/price/version/agent mismatches, unsuccessful/refusal/empty/
oversized results, malformed timestamps and getter refusal are covered.

Sole full gate49429 passed:5,011Vitest/227files/68.99s,
973Bun/72files/7,643assertions/174.96s,root/web strict and client/SSR builds.
Five code/test pins stayed frozen;10-path scope/privacy audit and73local links
passed, including byte-for-byte identity of the moved validator. No gate replay.
Atomic commit/exact fast-forward follows. No signer,
key read, RPC, socket handler, hub admission, payment, deployment or activation
is implemented or performed here. Subsequent8B runtime,8C admission,8D pipeline
and9 buyer lifecycle remain; J4/J5/J6 live checkpoints unchanged. No push.
