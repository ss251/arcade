# G1 brief — local Arc ledger smoke build and explicit owner gate

Prepare the smallest real subgraph from Plan G Task 1 in an isolated `subgraph/`
package. Pin Graph CLI 0.98.1, graph-ts 0.38.2 and matchstick-as 0.6.0 without adding
the package to root workspaces or changing root dependency resolution. Match the
minimal v1 `Settled` ABI against the checked-in FeeSplitter contract and the pilot
address against the runbook. The smoke mapping stores atomic amounts and uses
transaction hash plus log index as its immutable event identity.

Write failing source-contract tests before the scaffold, then run those tests,
real local codegen and WASM build. Keep generated output/dependencies out of Git and
the entire toolchain out of Docker; Docker ignore rules must remain a superset of
Git's. Runtime mapping tests and live indexing are distinct from source assertions
and compilation. Do not introduce a manifest script before its implementation.

No Studio account/login/authentication/deployment, key access, faucet or payment is
authorized by local preparation. The owner must create/confirm the subgraph and
supply a secure credential workflow. Do not print a deploy key in arguments or
persist credentials without approval. Record the actual query URL, authorization
behavior, indexing metadata and a matched settlement only after the live gate.
Missing credentials are not proof that Studio rejects `arc-testnet`.

G2–6 remain gated on the real Studio proof. Other independent code may proceed;
Base-mainnet Graph payments remain separately owner-gated. Keep the canonical
F-before-G merge order and never push. Commit the local milestone with a truthful
subject instead of the literal plan's premature claim that deployment/query passed.
