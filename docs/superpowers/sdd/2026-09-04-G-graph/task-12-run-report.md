> Public execution record. Original retained unchanged in private task preparation; this report is a dated offline checkpoint, not live authorization or evidence.

# G12 runner half — implementation checkpoint

2026-09-05, isolated G worktree. Root owns integration/commits and any owner-approved live run. This report covers only the runner half; graph-client transport/signing/receipt verification is independently owned and reviewed separately.

## Owned files

- `skills/counterparty-graph/run.ts`
- `skills/counterparty-graph/validate-output.ts`
- `skills/counterparty-graph/test/run.test.ts`
- `skills/counterparty-graph/test/run.bun.test.ts`
- This ignored report.

No package, lock, manifest, query, synthesis, existing test or Git changes were made by this agent for G12. Root owns the block-pinned query adaptation/dependencies. No real Keychain lookup, Graph request, RPC, funded key, payment or service was used.

## Actual behavior

`assess(input,{payerKey,query})` preserves the requested interface. Input is a closed plain own-data object containing one exact-width EVM address, normalized to lower case. Invalid input is refused before secret/query access. The supplied key is validated as a nonzero in-range secp256k1 scalar but never logged or serialized.

One identities query is followed by at most one sequential attestations query. The latter carries `{agentIds,block:{hash}}`, taking the exact coherent first metadata hash. Fixed documents are loaded only when assessing, not on module import. IDs must be canonical Base uint256 identities with correct owner/wallet relation; a full page, missing/invalid metadata or malformed aliases/IDs stops further purchases and produces an honest incomplete/manual-review result, never fabricated empty identity evidence. A fully valid empty result buys only one query and yields `refuse`/`no-erc8004-identity`.

Every result is snapshotted from bounded plain JSON-like data without calling getters/toJSON. Source cost and payment hash come exclusively from local `PaidResult`: null/null remains unknown; exact `10000` plus a valid nonzero payment hash represents the client's independently verified query payment. Data-level lookalike fields are ignored. Malformed/contradictory local payment metadata refuses rather than inventing cost. Query errors are reduced to a fixed diagnostic, including an uncertainty/reconciliation notice.

Production passes neither `verifiedProofs` nor `trustedValidators` to synthesis. The run boundary additionally rejects `allow` or nonzero attester settlement counts because no counterparty service-settlement verifier is implemented. A verified payment for buying Graph data is not proof that the assessed counterparty settled a service.

Self-validation is pure/import-safe and enforces the current manifest's complete closed shapes, enums, bounds, canonical identifiers/atomic amounts, unique fields and uint256 ceiling. It additionally rejects accessors, nonstandard prototypes/array subclasses, sparse/custom arrays, cycles, unsafe numbers, control characters and excessive data/output. Output is bounded to 262144 UTF-8 bytes. The generic hub validator does not cover all these properties, so the literal plan's JSON roundtrip + generic validator was insufficient.

`runGraphJob` provides scoped read-key/query/signal seams. Actual production script accepts the runner's `{jobId,input,skillDir,adapter,bounds,outputSchema,engineConfig}` envelope but does not treat caller-supplied schema/config/bounds as authority. Every refusal has `stopReason:"refusal"` and no output. Main reads at most 65536 stdin bytes with a 10-second input wait inside an 80-second work budget; only the owning CLI has an 88-second hard fuse, below the unchanged 90-second listing bound. Stdout completion and reader cancellation are awaited under one-second bounds, with the hard fuse retained until cleanup. No global timer, document read, stdin read, credential resolution or request occurs on import.

## Genuine TDD and checks

- 10:01:47 UTC: 19 collected Vitest tests genuinely failed because run/self-validation modules did not exist.
- 10:06:21 UTC: those 19 tests passed after implementation and graph-client contract became available.
- 10:07:45 UTC: 21 Vitest passed, including delayed-key and delayed-first-query cancellation. First Bun launch failed before test collection because Effect is a package-workspace dependency, not a root skill dependency; not counted as a product Red. The test now resolves the already-declared core package runtime using `createRequire`, with a narrow typed test seam, without adding dependencies.
- Four actual Bun process tests then passed: import-only; malformed/oversized stdin; empty explicit payer configuration; real `execSkill` converting an exit-zero refusal into `status:"refused"` rather than success. The last test strips the manifest's secret grants in its isolated fixture, so it never consults actual credential values. It does not mutate the production manifest or parent HOME.
- 10:10:52 UTC: additional genuine Red demonstrated array-subclass prototype laundering through self-validation (`true` instead of `false`). Fixed by explicitly checking native array prototype and own length metadata before copying.
- 10:11:22 UTC: 22/22 Vitest plus 4/4 Bun (17 assertions), root TypeScript and diff checks all passed.
- 10:13:15 UTC: targeted strict compiler program explicitly included both skill test files (root tsconfig does not normally include this nested test folder): zero diagnostics. Diff check remained clean.

The suite uses the actual viem-independent synthesis and actual script adapter, mocking only query/key seams where a real operation would cross an owner gate. Query cases cover coherent snapshot variables, empty vs malformed/partial evidence, duplicate IDs, nonpromotion of raw provider proof/trust fields, locally sourced cost, malformed payment metadata, metadata drift, strict input/output mutations and cancellation with no late second query. Subprocesses use empty credential environments, `--no-env-file`, finite owned timeouts and captured streams; no shell, provider or Keychain operation is invoked.

## Deviations and remaining gates

The literal plan's ambient `X402_PRIVATE_KEY`/global fetch mutation, default Keychain fallback, hardcoded cost, unchecked payment-response header, unpinned second query, raw error reflection and `allow` from unverified claims are intentionally not implemented. Client transport differences are documented by the client-half owner. The `ts-testing` skill guided real protocol coverage, typed seams and genuine failure-first regressions.

This is offline implementation evidence, not a successful paid Graph query or an Arc buyer settlement. Base-mainnet spending remains OWNER-gated. No generic counterparty proof verifier or trusted-validator policy is claimed. Final independent review, shared gates and commit are root-owned; this runner source is frozen for review at the checkpoint above.
