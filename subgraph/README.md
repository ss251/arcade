# ARCADE ledger

Latest status: [G6 indexed A9 match](#september-6-2026--g6-indexed-a9-match).
Local J11 escrow mappings remain inactive; see [J11B1](#j11b1-inactive-escrow-observations).
The dated local/G1 sections below are historical checkpoints. Neither a successful
build nor an acknowledgment proves the later indexed-event acceptance gate.

## J11B1 inactive escrow observations

September7: two real inactive escrow/hook mapping templates now compile and
have actual Matchstick runtime coverage. Neither template is instantiated or
given a deployed address/start block; the two active splitter sources remain
unchanged. Local Arc-testnet source context must bind proxy/hook/evaluator
before any record is created. Metadata cannot activate them.

Immutable event records preserve public facts and reject conflicting replays.
An observed matching creation owns the job summary; absent history remains
unlinked and monetary observations remain null until emitted. Last-observed
status is not verified current state. Payment/fee/refund/hook events stay
separate; no escrow Settlement or verified receipt Tree is created yet.
Amounts are raw token units. Hook detachment/upgrades are not tracked, so the
summary hook records creation, not a current administrative-state assertion.

All88 actual mapping tests passed sequentially, including27 new escrow cases.
The [J11B1 report](../docs/superpowers/sdd/2026-09-06-J-arc-native/task-11b1-report.md)
separates these offline results from the still-blocked live deployment/indexing
and next terminal-payment correlation work. No new CID or live query exists.

## J11A offline escrow schema

September7: staged ERC8183/ArcadeJobHook event subsets match the pinned local
Solidity source. New EscrowJob/EscrowEvent schema preserves full integer widths,
immutable occurrences and nullable unknown observations. Settlement gains a rail
and optional escrowJob; legacy exact mappings retain their actual splitter and
nonce with rail=eip3009. Future escrow must not invent those legacy fields.

The active manifest, two splitter sources and four inactive templates are
unchanged. No escrow event is indexed or job created by this checkpoint.
Local Graph codegen/WASM and the actual27-test legacy Matchstick suite passed;
that does not prove deployed escrow compatibility, escrow mappings or indexing.
See the [J11A report](../docs/superpowers/sdd/2026-09-06-J-arc-native/task-11a-report.md).
Proxy/hook activation and Studio v0.0.2 remain blocked by the missing usable
approved deployment and independently verified source pins/start blocks.

## Historical G1 smoke checkpoint

See the dated evidence below for live scope; local additions do not update a CID.

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

## September 6, 2026 — G5 inactive registry integration

G4 committed before this local integration was released. The static pilot and
existing inactive FeeSplitterV2 template remain exact. Three additional
**inactive** IdentityRegistry, ReputationRegistry and ValidationRegistry templates
declare their real local handlers and staged ABIs. They have no address, start
block or context; no handler instantiates a template. RegistryEvent adds eight
required fields for immutable transaction/log replay memory. Neither these
declarations nor local generated types activate registry indexing or change the
acknowledged G1 deployment.

The registry policy supports canonical Graph event order plus exact replay, not
arbitrary first-delivery ordering. Accepted events and prerequisite/conflict skips
are remembered before a later replay can fabricate backfill. Agent creation needs
the pinned emitter and an actual nonzero Registered owner. Transfers clear the
optional wallet; an unsupported known-Agent transfer to zero aborts before writes
because the required-owner schema cannot represent a burn truthfully. Operator URI
updates do not establish ownership. Unknown agents remain absent, not placeholders.

Only four bounded, typed metadata claims are recorded: arcade.listingId,
arcade.feeSplitter, arcade.priceAtomic and arcade.endpoint. They do not create a
canonical Listing, bind a Splitter, authorize discovery or fetch a URL. Unsupported
wallet metadata is ignored. UTF-8 text is bounded and rejects controls; indexed
metadata/tag hashes must match the retained unindexed values. Invalid tag1 is a
remembered skip, while invalid optional feedback text can be omitted independently.

Feedback preserves signed values, decimals and full-width indices. Counters cover
accepted/observed bounded registry records, not all feedback, external payers or
verified service payments. Revocation and validation pass-count changes are
replay-safe deltas. Validation retains its request binding; PASSED means the local
response policy of 50..100, not validator trust or payment proof. No Marketplace
row, aggregate coverage or independent settlement proof is invented here.

The schema and manifest checks retain the complete G4 pilot/V2 snapshot, compare
all registry event signatures with the staged ABIs, and reject activation fields,
changed layouts, missing replay entities or missing local mapping/ABI assets.
CLI failure preserves prior output. These TypeScript/Bun checks are distinct from
the mapping author's actual AssemblyScript store tests and the parent's final
WASM build/full gate. G6 still owns source activation and documented observed
epochs: current implementation corroboration does not prove pre-upgrade history.
No network, registry write, new payment, key access, upload or deployment is
performed by this integration; do not replay the consumed smoke deployment.

The integrator's selection passed **135 focused Bun tests / 289 expect calls**
and its exact four-root TypeScript strict check. One coordinated local codegen
generated RegistryEvent and the three inactive template event modules after all
four real registry source drafts existed. These results do not claim mapping
runtime acceptance, a complete gate, registry activation or a new deployment.

## September 6, 2026 — G6 selected-emitter ledger

Local source now selects two reviewed Arc-testnet settlement emitters. This
checkpoint is implementation in progress, not a new Studio acknowledgment or
indexed-tree proof. G5 committed as `42769befd5df157d7aa70c0d251fe8f59dbd7c21`.

| Static emitter | ABI | Start block | Scope |
| --- | --- | ---: | --- |
| `0xf95c8afefae677fdcfc7bd5b8aaaf3702db99206` | FeeSplitter | 0 | Retained historical pilot exception, not a creation-height fallback |
| `0x9e304ec13dd862c81ee8caa8fd262dac426fbedf` | FeeSplitterV2 | 60460646 | Verified A9 deployment, Settled and SettledTree |

The A9 source creation receipt and fixed-block runtime/immutable checks are
separate from hub announcements. At block 60670577 both selected runtimes matched
the reviewed compiler artifacts outside declared immutable slots, including
their metadata trailers. Their USDC immutable was
`0x3600000000000000000000000000000000000000`, with 500 bps fees. Pilot seller and
treasury were `0x3b2bbb840a9570223adbf2172a33bb77fe8d21af`; A9 seller and treasury
were `0xcf821769ed3c0e55e152745377bb833d7155a78a`. This dated verification does not
establish exclusive historical use by any skill.

Four templates remain inactive: V2 plus IdentityRegistry, ReputationRegistry and
ValidationRegistry. Current proxy ABI observations do not establish pre-upgrade
history, so no registry epoch is silently activated. No Marketplace row or
canonical Listing/Agent/Splitter assignment is synthesized. Emitter-level counts
must not be relabeled per-skill, all-rail or marketplace-wide totals.

### Bounded operator workflow

Run from the repository root with its locked dependencies and the separately
pinned subgraph toolchain already installed:

```sh
bun --no-env-file run subgraph:splitters --help
bun --no-env-file run subgraph:splitters --hub https://arcade-hub-production.up.railway.app
bun --no-env-file run subgraph:manifest
bun --no-env-file run subgraph:build
bun --no-env-file run subgraph:deploy --help
```

Discovery is a default dry run. An explicit `--write` permits only a validated
local list update. It joins two bounded GET responses, `/listings` and
`/.well-known/x402`, against the exact default EIP-3009 chain/token/price/resource
coordinates and reviewed immutable profiles. It does not POST a quote, discover
arbitrary contracts, fetch metadata, use zero on lookup failure or prune historical
emitters. Multiple current skills may share one emitter; their observed IDs are
not canonical payment attribution. These GETs are not an atomic hub snapshot.

The dated public observation at 2026-09-06T02:21:52Z had an empty catalogue and
empty discovery resources, with no rail in the retained projection. That is not
permission to invent an EIP-3009 default or delete the two historical pins.
Unavailable or inconsistent discovery must preserve the existing list.

The new deploy command accepts an explicit reviewed CID, fixed `v0.1.0` version
and fresh absolute journal path. It selects the approved macOS Keychain service
`arcade-graph-deploy-key` / account `GRAPH_DEPLOY_KEY` inside its consuming process.
No deploy key is accepted in arguments, printed, written to a file or saved by
`graph auth`. Imports/help do not retrieve it. A successful acknowledgment records
the exact returned versioned query URL; it does not prove indexing. A dispatched
unknown outcome requires reconciliation, never an automatic retry or a fresh
journal to replay it. The old G1 deployment and its journal remain untouched.

Building does not upload. Any deliberate public IPFS upload and one fresh Studio
deployment follow source review, offline checks and the parent gate. No such
remote operation is claimed yet by this local checkpoint. Existing A9 settlements
will supply the indexing proof; do not buy them again to refresh the subgraph.

## September 6, 2026 — G6 deployment acknowledged, indexing pending

The local implementation committed as `8532df81d965c7ebf675cc4a40462a89d9412c2f`.
One public upload returned CID `QmWL6jCCNvRkmB3mvPaxvMH7931AvQ5Y7jmBzCJ2gdpjHF`
at 03:59:52.062 UTC with all reviewed build hashes unchanged. The bounded
consumer's single fresh deployment was acknowledged at **04:01:17.711 UTC**,
slug `arcade-ledger-arc-testnet`, version `v0.1.0`, with the exact returned
[Studio query URL](https://api.studio.thegraph.com/query/1721684/arcade-ledger-arc-testnet/v0.1.0).
The key stayed inside the consumer; the fresh journal retains all three phases.
**This deployment operation is consumed. Do not rerun it or the G1 operation.**

At 04:03:58.766 UTC, the first keyless exact-A9 query returned HTTP200 but failed
the strict proof. Separate metadata reads at 04:05:36.266 and 04:08:15.957 UTC
returned one GraphQL error; the latter explicitly reported that this exact CID
had not started syncing. No indexed height, event/tree match, no-error state,
Marketplace result or Studio Synced claim is available from these reads.
This is startup evidence, not a proven unsupported-network failure.

The [live checkpoint](../docs/superpowers/sdd/2026-09-04-G-graph/task-6-live-brief.md)
preserves exact facts, hashes and independent local reviews. Task6 live acceptance
stays open. Later readback must match existing A9 events and this exact CID;
wait/check indexing, never buy again or automatically redeploy. Registry templates
remain inactive, and canonical per-skill/Marketplace data remain unavailable.

At **04:14:55.681 UTC**, a separate keyless metadata read returned the exact CID,
block **10795110**, hash
`0xa3fe77d8b06c834e3bd6a4600b6e1314ea74b46a05f8810a815133a9ec6964d7`,
and `hasIndexingErrors:false`. Indexing has started; this supersedes the startup
absence, not the missing A9 proof. The required historical height is60523612.
The read does not establish current-head/Studio-Synced status or event contents.

## September 6, 2026 — G6 indexed A9 match

The keyless read at **05:07:47.534 UTC** returned the exact v0.1.0 CID above,
indexed block **60694598** and `hasIndexingErrors: false`. The unchanged strict
verifier matched all three existing A9 settlement occurrences and one unambiguous
root tree: **2 children /60000 atomic USDC**, tree ID
`0x87cb3b5b32d849ebb6d5777ac247bdbdb15aa532b226fb86a591c491fa8f4a28`.
Actual `marketplace: null` and empty registry/canonical tables remain unavailable
coverage, not zero marketplace totals. See the [exact evidence and limitations](../docs/superpowers/sdd/2026-09-04-G-graph/task-6-indexed-match-brief.md).

This satisfies the selected historical indexed-match requirement, not dashboard
Synced/current-head status, complete marketplace coverage or canonical per-skill
attribution. No deployment/upload, A9 purchase or paid Base query was repeated.
Independent retained-record review, final evidence gate and G merge are separate.
