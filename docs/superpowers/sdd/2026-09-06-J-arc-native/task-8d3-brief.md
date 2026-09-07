# J8D3 — durable escrow tree closure

Before the root pipeline can commit its actual receipt tree, close admission to
new child reservations atomically. A runner result does not itself revoke an
already issued hire capability. Leave existing capability validity and legacy
root behavior unchanged; enforce the escrow root's durable lifecycle instead.

Prepare a bounded immutable ceiling before dispatch. Escrow reservations and
their monotone terminal transitions must use current SQLite, not stale per-
process caches. Closing prevents new children but preserves existing reserved
holds until they resolve. Only a closed tree without pending holds is stable.
Keep closure/ceiling across restart, refuse corruption/conflicting retries and
roll back ignored writes. Confirmed root terminal storage must agree with that
closed tree. Uncertainty must not manufacture child completion or release.

Use actual two-handle/restart SQLite tests and unchanged legacy-tree tests.
No network/key/payment/deployment, authorization-window/cap/replay change or
push. This checkpoint does not activate routes or complete Task8: concrete
pipeline, budget/root HTTP, durable boot and attestation follow, then Task9.
