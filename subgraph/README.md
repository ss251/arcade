# ARCADE ledger — G1 smoke checkpoint

This temporary smoke subgraph maps the **v1 pilot FeeSplitter's `Settled` event**
to immutable `Settlement` entities. It does not yet index FeeSplitterV2 trees or
ERC-8004 registries. Amounts are 6-decimal ERC-20 USDC atomic integers; the ID is
the transaction hash plus log index. No seller code, inputs, outputs or keys are indexed.

The minimal ABI matches [the local contract](../contracts/FeeSplitter.sol); the
pilot address is recorded in [the runbook](../docs/runbook.md#the-fee-splitter-goes-on-the-runner).
`startBlock: 0` is the plan's temporary smoke setting, **not** a verified creation block.

## September 5, 2026 — indexed runbook match

**G1 deployment and indexed-runbook query requirement: MET.** The separately
approved keyless observation at `2026-09-05T14:41:46.576Z` returned actual data from
the [acknowledged Studio endpoint](https://api.studio.thegraph.com/query/1721684/arcade-ledger-arc-testnet/v0.0.1-smoke),
with exact CID `QmePuPnHraVaV9TmxaAwCCMKwTD8iFW96eoEUfSA1BoCW8` and
`hasIndexingErrors: false`. Its latest list contained both historical runbook
transactions, and the exact known-transaction filter returned:

- Transaction `0x9a706d5760f11ba0c5aa1fe30afc6f4fa87e908bafa4a78cdafe3af1415eefd2`.
- **10,000 atomic units ($0.01)**; buyer
  `0xdaaca688ce93d6ea0bdf4cda9925c5526f3ca5e1`, matching the runbook address.
- Recorded settlement block **53,891,400**.

The other latest-list transaction was
`0x6366215e96a33e97e4a177453c858e9b1b8639fcff4bb72e1e7dcf5459fc8143`,
also 10,000 atomic units from the same buyer. No new payment created this evidence.
The indexer reported block **60,593,637**, hash
`0xba9c8a058c6154849101164f04390fa08e511d53235c7f5b3fc4baf5bc639f1d`.
The sole concurrent `eth_blockNumber` request to the first pinned Arc-testnet RPC
returned **60,593,643** at `2026-09-05T14:41:46.442Z`: a **six-block observed gap**.
These reads were 134 ms apart, **not a fully-synced or dashboard-status proof**.

This is indexed historical data, not another direct RPC receipt/log check or
independent confirmation of the seller/fee split. Earlier empty lists and RPC
receipt absence remain historical observations below; they are not rewritten.
Keyless access worked at this instant, not necessarily under a permanent policy.
No V2 tree/registry, decentralized-publication or Graph x402 coverage is inferred.

The [final indexed-match brief](../docs/superpowers/sdd/2026-09-04-G-graph/task-1-indexed-match-brief.md)
and [exact observation](../docs/superpowers/sdd/2026-09-04-G-graph/task-1-later-indexing-review.md)
record the evidence and bounds. G2–6 local implementation may proceed only after
parent review, full gate, commit and explicit release. No new deployment, upload,
settlement, spending authority or G merge is authorized by this checkpoint.

## Historical local-only checkpoint

The following bullets preserve the original local-build checkpoint. Its pending
statements are superseded first by the partial checkpoint and now by the indexed
match above; they are
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

## G2 local schema transition

September 5, 2026: G2 local-only implementation was released separately. The local
schema now contains the eight planned ledger/registry entities plus
immutable `TreeOccurrence` and `ListingClaim` records. This does not change the acknowledged G1 CID
or its retained deployment/indexed-match proof above. No new deployment or live
query was performed for this local transition.

The unchanged pilot-only manifest still runs a temporary `smoke.ts` adapter. It
now attaches each settlement to its actual emitter, increments that emitter's
event-derived counters once per immutable transaction/log occurrence, and leaves
listing attribution unknown. It creates **no Marketplace row** or invented
registry counts; absence is unavailable, not a measured zero. The sole manifest
change adds `Splitter` to its declared entities. Address, network, start block,
ABI and handler remain unchanged.

The schema separates an emitted tree hash from immutable event occurrences.
The hash summary has a nullable root/count, an occurrence count and an ambiguity
flag; later mappings must clear the root on collisions and preserve full uint32
counts as BigInt rather than wrap them into signed Int. Registry metadata may
record only a typed agent-scoped claim until independently trusted assignment
exists. Neither metadata strings nor look-alike getters prove hub ownership or
payment provenance. G3–5 must implement those rules and their runtime tests.

Offline AST tests validate entity fields, nullability, immutability and all three
actual G7 query selections. Negative mutations exercise missing/changed contracts.
The original G1 schema is preserved in a SHA256-pinned test fixture. Codegen and
WASM compilation remain required local gates, **not graph-node runtime save/load evidence**.
No Matchstick execution, collision/revocation mapping runtime test or registry
coverage is claimed by G2. The prior indexed CID remains the historical v1 smoke.

From `subgraph/`, the focused G2 checks are:

```bash
bun --no-env-file test ./checks/scaffold.bun.test.ts ./checks/schema.bun.test.ts
bun --no-env-file run codegen
bun --no-env-file run build
```

The 37 focused checks / 109 assertions, exact nested strict TypeScript check,
actual pinned code generation and WASM build passed on September 5. The separate
parent full gate and commit are not inferred from these local results. G3–6,
dynamic emitters, registry handlers and new deployment remain unreleased here.

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
The partial checkpoint above records when the returned URL worked but the
matched-runbook-settlement requirement was still outstanding. The later indexed
match now satisfies that evidence requirement; source release remains parent-owned.

Tasks 2–6 remain gated on parent review, full gate, commit and explicit source release. Missing owner prerequisites are not an unsupported-network result.
Only an actual supported-network rejection can trigger the plan's fallback: retain hub-computed
statistics, record the sanitized rejection, and separately scope the independent Graph
cost-of-goods half. No fallback or fully-synced result is inferred here. Canonical F-before-G
merge order remains in force.

## September 6, 2026 — G3 local staging

G2 committed as `9c691d1`, rebased unchanged to `0d79dbd` after full F merged
and passed all four main gates at `68bb915`. Earlier checkpoints above remain
historical; this section releases local G3 work, not a new Studio deployment.

The active generated manifest contains **1 pilot source; 0 registry sources;
0 dynamic templates**. Its existing `FeeSplitterSmoke` handler and v1 ABI remain
unchanged. Four new event-only ABIs are staged for later real G4/G5 mappings,
including Identity `Transfer`; active pilot codegen does not validate their use.
No Marketplace row, canonical listing binding or metadata-authorized template
is created. Arbitrary metadata is not proof of seller or hub listing ownership.

`subgraph.yaml` is generated from the committed template/list and explicitly
pinned Arc testnet configuration. `prune: never` preserves indexed history but
does not invent missing coverage. The pilot's zero start remains the historical
smoke exception, not its verified creation height. Only that pilot is supported
at this stage; malformed/duplicate/extra inputs or different emitters fail closed.
The renderer validates the complete YAML before atomically replacing its output.
It has no ambient network selector, automatic dotenv read, credential or network
operation. This is a cooperative local-filesystem tool, not hostile-storage isolation.

From `subgraph/`, using the already installed pinned toolchain:

```sh
bun --no-env-file run manifest
bun --no-env-file test ./checks/manifest.bun.test.ts ./checks/abis.bun.test.ts ./checks/scaffold.bun.test.ts ./checks/schema.bun.test.ts
bun --no-env-file run build
```

Build first regenerates the manifest and event/schema types, then compiles the
active WASM. Tests render in memory and use owned temporary layouts; a fresh
checkout needs no pre-existing ignored YAML. Importing the renderer does not write.
Invalid inputs preserve a prior output and the actual CLI reports fixed diagnostics.
No deployment command is needed for these gates; do not replay the consumed G1 run.

Parent's separate keyless September 6 explorer/RPC checkpoint found the planned
registry event subsets match the explorer ABIs for the implementations selected
by ERC1967 slots at Arc block `60670577`. The explorer's last reported upgrade
for each proxy agrees with that current slot. This is current implementation-ABI
corroboration, not an independent archival receipt or pre-upgrade compatibility
proof. The public RPC returned null for all three registry creation receipts and
the pilot's creation receipt. The existing V2 splitter creation receipt is available
and matches block `60460646`, its runbook hash and address. Explorer-reported creation
and upgrade boundaries will be kept distinct before later source activation.

No paid query, new payment, registry write, deployment or mainnet action occurred.
G4/G5 mapping execution, source activation and G6 evidence remain separate work.

## September 6, 2026 — G4 local mapping execution

After G3 committed, G4 replaces only the local pilot's active mapping target with
the real settlement handler. The historical `smoke.ts`, original G1 schema fixture,
acknowledged CID and earlier evidence above remain unchanged. The static source
still has the exact pilot address, v1 Settled ABI and historical zero start block.
One **inactive** FeeSplitterV2 template compiles the real Settled/SettledTree
handlers; no code instantiates it. There are no registry data sources, new
emitters or metadata-authorized mappings.

Each transaction/log occurrence owns deduplication before entity or counter
changes. Existing concatI32 IDs are retained for indices0..2147483647; negative
or larger synthetic indices abort without truncating into another identity.
Amounts, nonce, emitter, transaction, block and event timestamp are preserved
without native-gas scaling or recomputed fee policy. Splitter counters advance
once per occurrence, preserving first discovery and any existing nullable listing
reference without creating a listing or asserting its provenance.

Every distinct tree event creates an immutable TreeOccurrence. A hash summary
preserves its first scalar facts; a second distinct occurrence clears its root
permanently and marks ambiguity. Replays do not increment it. Full uint32 child
counts stay exact BigInts on occurrences, while summary counts above2147483647
remain null. An emitted hash/count is not verification of an off-chain tree.
Child spend is preserved even when greater than root price.

No Marketplace, Agent or Listing row is created. Unknown aggregate coverage is
absence, not measured zeros. This preserves G7's existing unavailable behavior
without changing the hub or claiming complete registry indexing.

The local tests run the actual mapping and generated classes in Matchstick's
AssemblyScript/WASM host, not a TypeScript ledger mirror. They cover exact facts,
duplicate/source-context overlap, distinct transactions/logs, cross-emitter tree
collisions, permanent ambiguity, first-discovery preservation, uint32 boundaries,
large money and direct stored null semantics. Missing or explicit Graph Null is
accepted; negative controls reject measured zero and a non-null root. Historical
source/schema checks remain separate evidence.

The provisioned native Matchstick0.6.0 bytes are pinned by SHA-256
`cd05611b588649e629e42e4ea0915d811d1ddbb73e8edd392a718c81b4361dbd`.
The author invokes that exact executable by absolute path in a minimal child
environment, with capped captured output, a finite60-second owning fuse and an
awaited/reaped process. Its private temporary path is not a portable installation.
The `test` package script pins `graph test --version 0.6.0`, but the Graph CLI may
download a missing binary and its native cache is unversioned: that script alone
does not authenticate cached bytes. Do not use it to auto-provision a replacement.

Local codegen has generated the pilot and inactive template event types. The
author's final selection passed **27 actual Matchstick tests**, **112 focused Bun
tests /240 expect calls**, and the exact four-root TypeScript strict check with
zero diagnostics. These are distinct mapping/runtime and source/contract checks,
not an additive live-coverage count. Independent review remains separate.
Parent owns the separate complete gate,
final actual WASM build and commit; none is inferred from codegen or an earlier
historical build. No Matchstick run proves live graph-node/Studio persistence or
indexing. No upload, deployment, query, key access, signing or spending is performed
for G4, and the consumed G1 deployment must not be replayed.
