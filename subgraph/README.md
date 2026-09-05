# ARCADE ledger — G1 local smoke scaffold

This temporary smoke subgraph maps the **v1 pilot FeeSplitter's `Settled` event**
to immutable `Settlement` entities. It does not yet index FeeSplitterV2 trees or
ERC-8004 registries. Amounts are 6-decimal ERC-20 USDC atomic integers; the ID is
the transaction hash plus log index. No seller code, inputs, outputs or keys are indexed.

The minimal ABI matches [the local contract](../contracts/FeeSplitter.sol); the
pilot address is recorded in [the runbook](../docs/runbook.md#the-fee-splitter-goes-on-the-runner).
`startBlock: 0` is the plan's temporary smoke setting, **not** a verified creation block.

## Historical local-only checkpoint

The following bullets preserve the original local-build checkpoint. Its pending
statements are superseded by the dated partial live checkpoint below; they are
not the current deployment or query status.

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
used for the later read-only verification is
[The Graph networks registry](https://networks-registry.thegraph.com/TheGraphNetworksRegistry.json).

## September 5, 2026 — partial live checkpoint

One owner-approved, one-shot deployment of the already-uploaded CID was
acknowledged at `2026-09-05T13:24:16.472Z`, after durable intent at
`2026-09-05T13:24:11.804Z`. The exact slug/version is
`arcade-ledger-arc-testnet` / `v0.0.1-smoke`; CID:
`QmePuPnHraVaV9TmxaAwCCMKwTD8iFW96eoEUfSA1BoCW8`.
The returned [Studio query endpoint](https://api.studio.thegraph.com/query/1721684/arcade-ledger-arc-testnet/v0.0.1-smoke)
is recorded from the actual response, not constructed as proof. The private
consuming helper sent the fixed deployment request once; it did not re-upload,
save a CLI credential or automatically retry. Do not rerun the deployment.

- Initial unauthenticated and authenticated queries at 13:26:34/35 UTC returned
  HTTP 200 with GraphQL startup errors, not data. The 13:27:36 UTC keyless
  diagnostic said this CID had not started syncing.
- Independent **unauthenticated** query at `2026-09-05T13:36:11.268Z`: HTTP 200
  with data, exact CID, block **5,481,110**, hash
  `0x2acb733775f2e79a5db2309fbd1fe9664b66cb3b736bbbff801b1ced4c7134bb`,
  `hasIndexingErrors: false`.
- Parent **authenticated** query at `2026-09-05T13:45:02.316Z`: HTTP 200 /
  `query_ok`, exact CID, block **16,195,110**, hash
  `0xf751e029859ce898431609f689e695d91a93e38c7e322a4b1eecbf402dae8ac0`,
  `hasIndexingErrors: false`.

In both successful data responses, latest settlements and the exact known-transaction filter were empty.
The filtered runbook hash is
`0x9a706d5760f11ba0c5aa1fe30afc6f4fa87e908bafa4a78cdafe3af1415eefd2`.
Both authorization modes served data at different times; unauthenticated access
worked then. This does not establish a permanent authentication or rate-limit
policy. Increasing indexed heights show progress, not current-head synchronization.
This is **not a fully-synced or complete G1 live PASS**: no indexed settlement or
known-runbook match has been demonstrated. **Tasks 2–6 remain gated**. No G2–6
release, repeated deployment or new settlement is authorized by this checkpoint.

At `2026-09-05T12:40:45.759Z`, the parent read the primary
[networks registry](https://networks-registry.thegraph.com/TheGraphNetworksRegistry.json):
version **0.7.119**, updated `2026-09-04T20:20:59.504Z`, listed `arc-testnet`
(`eip155:5042002`), the Studio deploy endpoint and `issuanceRewards: false`.
These fields and this accepted deployment do **not** establish decentralized
publication, issuance-reward eligibility or Graph x402 availability for this
subgraph. The independent Base cost-of-goods skill is a different service.

The parent also found the two historical runbook receipts unreadable from its
current public RPC checks while the pilot still had code and a newer C10 receipt
was readable. That does not erase the retained historical evidence or make the
newer V2 receipt proof for this pilot-only mapping. See the dated
[live brief and evidence records](../docs/superpowers/sdd/2026-09-04-G-graph/task-1-live-brief.md)
for chronology, exact scope and observation limits. No unsupported-network
rejection or fallback activation is inferred from startup errors or empty data.

A later parent keyless read at `2026-09-05T14:10:24.097Z` returned the same CID,
block **42,441,110**, hash
`0x3600a989a2412632a0277a7b08bcb9a04dbdb09d38d489420696aa07cc3e0717`,
and no indexing errors. Both lists were still empty; the gate remains unproved.
The [parent review](../docs/superpowers/sdd/2026-09-04-G-graph/task-1-live-parent-review.md)
records the separate successful full local tests/types and unchanged WASM build.

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

## Historical owner procedure — not the command used

Before owner approval, the local scaffold recorded the planned command below.
The later approved operation instead used a reviewed, private, one-shot helper
against the already-uploaded CID. This historical command is not an instruction
to repeat the accepted deployment or persist a credential:

```bash
bun --no-env-file run deploy --version-label v0.0.1-smoke
```

Do not place a deploy key in this file, source, command arguments, logs or `.env`. Studio
authentication and any credential persistence require a separately approved owner workflow.
The dated checkpoint above records the actual returned URL and query observations;
the matched-runbook-settlement requirement is still outstanding.

Tasks 2–6 remain gated on the complete deployment, indexed data and known-settlement proof. Missing owner prerequisites are not an unsupported-network result.
Only an actual supported-network rejection can trigger the plan's fallback: retain hub-computed
statistics, record the sanitized rejection, and separately scope the independent Graph
cost-of-goods half. No fallback or complete G1 live result is claimed here. Canonical F-before-G
merge order remains in force.
