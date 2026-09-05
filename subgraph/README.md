# ARCADE ledger — G1 local smoke scaffold

This temporary smoke subgraph maps the **v1 pilot FeeSplitter's `Settled` event**
to immutable `Settlement` entities. It does not yet index FeeSplitterV2 trees or
ERC-8004 registries. Amounts are 6-decimal ERC-20 USDC atomic integers; the ID is
the transaction hash plus log index. No seller code, inputs, outputs or keys are indexed.

The minimal ABI matches [the local contract](../contracts/FeeSplitter.sol); the
pilot address is recorded in [the runbook](../docs/runbook.md#the-fee-splitter-goes-on-the-runner).
`startBlock: 0` is the plan's temporary smoke setting, **not** a verified creation block.

## Verification status

- Local preparation: PASS on 2026-09-05 — 6 scaffold checks (31 assertions), local
  codegen and WASM build, frozen-lock reinstall, and 7 repository-hygiene checks.
- Studio deployment: PENDING — not attempted; no owner account or credential used.
- Query URL: PENDING — no endpoint has been invented.
- Authorization requirement: UNVERIFIED — authenticated/unauthenticated queries not attempted.
- Registry support: UNVERIFIED — no fresh registry or network query performed for this scaffold.
- Indexed settlement evidence: PENDING — local compilation does not prove indexing.

The requested manifest network is `arc-testnet` (`eip155:5042002`).
[Plan G Task 1](../docs/superpowers/plans/2026-09-04-G-graph.md#task-1-the-4-hour-studio-smoke-test-on-arc-testnet)
describes a historical registry entry; this scaffold does not turn that claim into current
Studio, decentralized-network, or Graph x402 support evidence. The public registry reference
for a future read-only verification is
[The Graph networks registry](https://networks-registry.thegraph.com/TheGraphNetworksRegistry.json).

## Isolated local toolchain

Run from `subgraph/`, not the repository root:

```bash
bun --no-env-file install --frozen-lockfile --ignore-scripts
bun --no-env-file run test:scaffold
bun --no-env-file run codegen
bun --no-env-file run build
```

`@graphprotocol/graph-cli` **0.98.1**, `@graphprotocol/graph-ts` **0.38.2** and
`matchstick-as` **0.6.0** are pinned in this package, outside the root workspaces.
Package scripts use the locally installed Graph CLI rather than a global binary or an
unpinned `bunx` download. Generated TypeScript, WASM builds and dependencies are ignored;
the entire subgraph is excluded from Docker. Root TypeScript/browser tooling is unchanged.
The verified host was Bun 1.3.14 / Node 24.15.0 on macOS arm64. Both local Graph commands
passed directly; the plan's npm fallback was not needed. Local compilation accepted
`network: arc-testnet`; that is **not** a Studio acceptance or indexer compatibility test.

The scaffold checks compare ABI/manifest/schema/source contracts. They are not execution
of the AssemblyScript mapping or live-chain evidence. `test` reserves the planned Matchstick
runner for mapping tests; G1 does not claim a Matchstick run. The manifest-generation script
will be introduced with its implementation in Task 3 rather than pointing to a missing file.

## Owner live gate — not executed

The requested Studio slug is `arcade-ledger-arc-testnet`, not a confirmed owner-created slug.
After the owner creates the Studio subgraph and supplies credentials through a private
consuming process, the planned deployment command is:

```bash
bun --no-env-file run deploy --version-label v0.0.1-smoke
```

Do not place a deploy key in this file, source, command arguments, logs or `.env`. Studio
authentication and any credential persistence require a separately approved owner workflow.
Following a real deployment, record the returned query URL, `_meta`/indexing status, matched
runbook settlement and which authorization policy the endpoint actually accepts.

Tasks 2–6 remain gated on that real Studio deployment and query proof. Missing owner prerequisites are not an unsupported-network result.
Only an actual supported-network rejection can trigger the plan's fallback: retain hub-computed
statistics, record the sanitized rejection, and separately scope the independent Graph
cost-of-goods half. No fallback or complete G1 live result is claimed here. Canonical F-before-G
merge order remains in force.
