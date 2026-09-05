> Reviewed implementation checkpoint; original retained unchanged. Focused tests are local evidence, not a paid query, settlement or Studio proof.

# G10 — bounded listing, pinned queries and inspected x402 dependency

September 5, 2026 UTC. Base: `53b7ab1`, `feat/g-graph`. Source is frozen for independent review; no Git mutation by this agent.

## Scope and shared contract

Implemented only `skills/counterparty-graph/arcade.json`, its two `queries/*.graphql`, `test/manifest.test.ts`, root Vitest skill-test collection, and the exact root `@graphprotocol/client-x402` dependency/lock addition. Parent additionally approved the existing hub canary inventory assertion's eight-to-nine compatibility correction after a genuine failure. No core validator, payment client, synthesis, runtime, wallet-risk-note, Studio, or shared service code was changed.

The public listing remains `$0.05`, script `run.ts`, no capabilities, 90-second bound, and exactly the two `GRAPH_X402_*` private configuration names and two planned egress hosts. Its description states evidence-policy eligibility, not financial safety. A public address-only canary input preserves the existing shipped-listing contract; it contains no payer configuration or secrets. G12 must still gate all actual credential resolution and Base expenditure; this manifest does not authorize either, and `run.ts` is deliberately a later task.

G11's author agreed the output contract before implementation: unchanged Identity fields, canonical Base identity/address fields, bounded counts/arrays/strings, nullable Source block/blockHash/cost, optional nullable paymentTx, the original eight contradiction codes and twelve stable evidenceFlags. Unknown cost/hash is null, never fabricated paid evidence. The queries include coherent `_meta.block { number hash }`, exact owner/wallet joins, validation-agent identity, feedback-index/hash/envelope bindings and claimed payment from/to/chain/hash. Raw feedback prose is not requested. Fixed 25/100 caps are explicitly incomplete-evidence boundaries for G11/G12, not proof of a complete result set. No query function or paid request was invoked.

## Genuine failures and verification

1. Added the root `skills/*/test/**/*.test.ts` collection entry before introducing the tests; notified G11's owner that collection was live.
2. At **09:26:27 UTC**, all **27 collected tests failed**: missing manifest/queries and absent pinned dependency. Earlier test-only import/resolution attempts did not collect tests and are not counted as product Reds. Effect is not a declared root dependency, so the final test resolves core's own declared Effect Schema through `createRequire(core/package.json)` rather than adding an unrelated dependency or relying on hoisting.
3. At **09:28:45 UTC**, the real core decoder rejected literal-plan `maxSubSpendUsd: 0` with `Expected a positive number, actual 0`. Parent approved omitting that optional field rather than widening core. Tests assert the resulting effective zero, no hire capability, and absence of socket/subbuy/model/seller grants. The earlier direct Schema.Class constructor attempt only tested a type-side construction mismatch and is not this decode regression.
4. At **09:29:33 UTC**, the new 27 tests and 61 core manifest tests passed; the unchanged hub inventory assertion genuinely failed `expected 8 / actual 9` (144 passed, one failed). Only its exact count and descriptive test title were updated to nine; every per-listing input/cap assertion remains intact.
5. Added passing coverage for import-safe inspection of the installed factory with a forbidden-fetch spy and real parsing of both query files using its installed GraphQL peer. These are additional coverage, not claimed as new Red-before-fix regressions.
6. At **09:32:14 UTC**, focused Node/Vitest execution passed **147/147**: 29 new manifest/query/dependency tests, 61 existing core manifest tests, and 57 existing canary-input tests. Global `tsc --noEmit` exited zero.
7. A separate TypeScript compiler program applied the repository's strict options/path mappings to the new skill test, which the root TypeScript include does not collect: **zero diagnostics**. `git diff --check` passed.

The schema tests exercise the hub validator's supported type/range/pattern/array semantics and explicitly identify its unsupported closed-object/uniqueness declarations. They do not claim that the generic hub gate enforces every JSON Schema keyword. G11/G12 must enforce plain-data/closed-shape decoding, uint256 upper bounds, source correlation, trusted validation/service evidence and evidence completeness themselves.

## Exact dependency and local inspection

Only `@graphprotocol/client-x402: "1.0.0"` was added to root dependencies. The parent-approved install used `bun --no-env-file install --ignore-scripts`; the first sandbox attempt was denied temporary-directory access, then the permitted isolated-worktree install completed. The lock diff contains **13 added lines, no removed/changed existing package versions**. New transitives are locked: `@x402/evm` and `@x402/fetch` 2.25.0, their nested core 2.25.0, and GraphQL peer 16.14.2. Existing application x402 core 2.19.0 is unchanged. The subgraph's separate toolchain/lock was untouched.

The repeat `bun --no-env-file install --frozen-lockfile --ignore-scripts` passed with **no changes** (538 installs checked across 620 packages). No global CLI install or uncontrolled existing-dependency upgrade occurred. Network activity was restricted to the explicitly approved public package installation; no key, RPC, Studio, authentication or paid API call occurred.

Read the actual installed package exports, declarations, ESM entry, `createGraphQuery` and chain module. Its public factory exists and module-only import is offline-safe. Concrete G12 limitations:

- `typings/createGraphQuery.d.ts`: options are endpoint/privateKey/chain/headers only. The privateKey option makes the plan's process-environment mutation unnecessary.
- `esm/createGraphQuery.js:22–36`: chain merely validates a configuration name; the signer is registered without binding selected accepts to that chain. It captures `globalThis.fetch` with no per-factory transport/signing hook.
- `esm/createGraphQuery.js:39–51`: no signal/deadline/body bound or redirect policy is supplied; non-200 errors include raw response text, and success returns only parsed GraphQL JSON. There is no payment-result callback or settlement proof.
- `esm/index.js`: the alternative Mesh fetch export also caches the private key and wrapped fetch module-wide. It is not a safe substitute for a scoped G12 client.

These findings match the sibling's independently inspected published source. No factory was constructed with a key. Parent must approve G12's bounded transport/signing adaptation; neither the literal global-fetch mutation nor an opportunistic response header is accepted as payment proof.

## Remaining gates and authority

Independent source/schema review and parent full gates/ordered G10 commit remain pending. G11 is separately owned. G12's strict paid-query implementation and all live Base/Arc evidence are not part of this task. Missing OWNER/Studio prerequisites are not a network-rejection result, and canonical F-before-G merge order remains unchanged.
