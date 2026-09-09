> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G3 renderer and ABI staging readiness — parent decision required

September 5, 2026. Read-only preparation, with this ignored note as the sole write.
No source/test/generated/dependency/Git change, suite, network request, key access,
live query, transaction, upload or deployment was performed. No prior G3 readiness
file existed when checked. Existing author reports, handoffs and private task-preparation
state were not edited. This is a proposal, not an implementation review or PASS.

Parent supplied the accepted baseline: G2 committed as `9c691d1` with full gates;
G1 historical indexed-runbook requirement met at the acknowledged CID
`QmePuPnHraVaV9TmxaAwCCMKwTD8iFW96eoEUfSA1BoCW8`. Its one-shot approval is consumed.
Nothing below authorizes rerunning that deployment or infers new live coverage.

## Recommended bounded decision

Release an explicitly labeled **G3 local staging commit**, keeping the active
manifest limited to the existing pilot smoke mapping. Stage the renderer and ABI
contracts now; activate each new data source in the same later commit as its real
handler. This satisfies every-commit buildability without implementing G4/G5 early.
Do not call this complete three-registry/V2 indexing or complete live G3 verification.

The literal G3 plan references missing `fee-splitter.ts`, `identity.ts`,
`reputation.ts` and `validation.ts`; its expected failed codegen conflicts with the
global requirement for a successful graph build before every commit. The installed
CLI separates ABI/schema generation from mapping compilation, so a missing mapping
is also not a reliable meaningful codegen Red. Required evidence is actual successful
codegen plus WASM compilation of the active manifest, with dedicated failing
renderer/ABI contract tests before implementation.

Smallest staged ownership after parent release:

- Add `subgraph/subgraph.template.yaml`, `subgraph/splitters.json`,
  `subgraph/build-manifest.ts`, four planned ABI JSON files, focused Bun checks,
  and a dated README section. Preserve `abis/FeeSplitter.json` and `src/smoke.ts`.
- Modify only relevant `subgraph/package.json` scripts, current-manifest assertions
  in the two existing checks, and matching `.gitignore`/`.dockerignore` patterns.
  Do not relax money/schema/event-identity/unknown-attribution assertions.
- Turn `subgraph/subgraph.yaml` into generated output after successful regeneration
  from committed inputs. Parent handles index removal/commit after review; this
  note performs no Git action. Keep immutable G1 evidence and original schema fixture.
- No new `src/ids.ts`, G4/G5 mapping, schema entity, Marketplace row, hub/runner
  writer, dynamic template instantiation, or live splitter-list regeneration in G3.

## Buildable activation sequence

1. **G3:** Render the existing single `FeeSplitterSmoke` source using the existing
   `FeeSplitter` ABI and `./src/smoke.ts`, with only `Settlement` and `Splitter`
   entities and the existing `Settled` handler. Retain the source name because the
   adapter imports `../generated/FeeSplitterSmoke/FeeSplitter`. Never rename it to
   `FeeSplitterStatic0` without a coordinated mapping/import change. No registry
   data sources or V2 template in the active YAML. The new ABIs are explicitly
   staged/inactive; successful active-manifest codegen does not validate their use.
2. **G4:** In its own released, tested commit, add real settlement helpers/mappings
   and activate the static ledger source plus any V2 template needed by its generated
   imports. Add every entity actually written, including `TreeOccurrence`. Preserve
   event de-duplication and full uint32 occurrence counts. Registry coverage remains
   absent; Marketplace must remain absent until a separately reviewed coverage
   model avoids presenting unindexed registry counters as measured zero.
3. **G5:** In its own released, tested commit, activate each verified registry source
   together with the corresponding real mapping, including Identity `Transfer`
   handling and `ListingClaim`. Dynamic discovery/trust and canonical bindings must
   meet the constraints below. Do not activate three empty/no-op mappings merely to
   make a full-looking manifest build. Revalidate coverage before enabling aggregates.

Use one active template and ordinary reviewed edits between stages. Avoid runtime
file-existence detection, an environment-selected phase, or a deployable broken
"full" manifest: source activation should be explicit and deterministic in commits.
The staged README should say exactly `1 pilot source; 0 registry sources; 0 dynamic
templates`, not reuse the plan's misleading `+ 3 registries + 1 template` log.
`prune: never` may be added explicitly with its matching assertion; it does not
create history/coverage that the source selection cannot supply.

## Renderer contract and focused validation

- Read only explicitly named local template/config/list inputs; expose a pure
  renderer for tests and put writing under an `import.meta.main` guard. Importing
  the module in a test must not rewrite the repository manifest.
- Pin `arc-testnet` / chain `5042002`; read the explicit public
  `config/chains/arc-testnet.json` rather than ambient `ARCADE_NETWORK`. Check the
  three registry addresses against that config, even while inactive. No dotenv,
  credential lookup, network discovery, shell spawn or dynamic dependency install.
- Validate JSON as unknown before use. Reject wrong shapes, unsupported fields or
  contracts, empty active lists, malformed/zero addresses, control characters, and
  noninteger/negative/unsafe block numbers. Current Graph query block values use
  signed Int; choose and document the active renderer's supported upper bound.
- Normalize addresses and reject duplicate/conflicting source entries instead of
  silently keeping the first case-insensitive duplicate. Generate stable safe source
  names independently of list order where multiple sources later become supported.
  In G3 the sole supported source is the exact existing pilot; reject a new emitter
  until the appropriate verified source/mapping profile is released.
- Serialize values safely; never interpolate unchecked address/listing/note text into
  YAML. Reject missing/extra/unresolved template markers. Parse the rendered YAML and
  assert exact source/ABI/handler/entity/context selections and path existence before
  replacing the output. Input failure must leave an existing manifest unchanged and
  must not print arbitrary input fields in errors.
- Chain local `manifest` into codegen/build (and the documented deploy preparation
  path), using `bun --no-env-file` in nested Bun invocations as well as the parent
  command. Keep installed Graph CLI 0.98.1/graph-ts 0.38.2 and the existing lockfile.
  Do not execute the deploy script during these checks.
- Existing scaffold and schema tests currently read `../subgraph.yaml` directly;
  after it becomes ignored they must also pass in a fresh checkout with no generated
  files. Make their source-contract assertions consume the pure renderer, and add a
  separate CLI integration check that renders into a temporary fixture directory and
  compares the parsed output. Do not rely on pre-existing ignored YAML or require an
  implicit writer during the root test suite. Preserve the historical exact schema
  fixture/hash and G1 dated evidence checks unchanged.
- Focused Reds: malformed input, duplicate address with different case/provenance,
  wrong network, missing marker, YAML injection/control characters, unsafe block,
  unsupported emitter/profile and missing ABI/mapping. Test deterministic rendering
  from committed inputs and from another working directory, no write on invalid
  input/import, correct complete output, and no untrusted canonical context.
- Parse all four staged ABI files explicitly using installed Graph tooling, then
  compare exact event name/order/type/indexed flags to approved fixtures/local
  contracts/shared core subset. CLI `ABI.load()` and `eventSignatures()` exist in
  `subgraph/node_modules/@graphprotocol/graph-cli/dist/protocols/ethereum/abi.js`;
  neither alone is a complete shape/deployment validator. Include negative indexed,
  signedness, width and argument-order mutations. No dependency change is needed.
- After implementation: focused Bun checks, exact nested strict TypeScript program
  including renderer and checks, actual pinned codegen/WASM build, then parent full
  root gates and review. Root tsconfig excludes `subgraph`, so a root typecheck alone
  is insufficient. Matchstick/live runtime claims are outside these offline checks.

## Deployment facts still required

Local evidence is useful but does not finish G3 Step 1. `config/chains/arc-testnet.json`
pins all three public addresses without creation heights. Core's ABI header says its
subset was checked against the ERC and an Arc tutorial, not an explorer-returned ABI
for each deployed implementation. Current `subgraph/README.md` explicitly says the
pilot's `startBlock: 0` is a temporary smoke setting, not a verified creation block.
The indexed settlement at block 53,891,400 is not the splitter's creation block.

Before activating a new source/full-history claim, collect public, bounded evidence
under a separate parent release for read-only network checks:

- Each pinned registry's exact emitting address, creation transaction and receipt
  block/hash. Use per-registry start blocks; a single unexplained
  `erc8004StartBlock: 0` loses provenance. A common minimum is only acceptable if
  derived from and documented against independently verified per-registry heights.
- Explorer ABI/source response provenance and retrieval time/hash; distinguish a
  proxy emitting address from implementation bytecode/ABI. Verify relevant deployed
  implementation/upgrade history if needed to interpret historical logs. Compare
  full inputs/indexed flags, not just topic0 (indexed flags do not change topic0).
- Missing/unverified explorer ABI may produce an explicitly labeled inactive
  candidate from pinned upstream documentation, as the plan allows. It must not be
  described as deployment-verified or silently promoted into trusted coverage.
  Unsupported endpoints or absent historical receipts leave verification unresolved.
- The pilot needs its own creation evidence. Preserve zero only as the explicit
  historical smoke exception for G3 local staging, with parent acceptance; never
  rename it to a verified creation block. If parent requires literal Step 1 before
  any G3 commit, readiness stops short of release until that evidence is supplied.
- The newer runbook V2 address `0x9e304ec13dd862c81ee8caa8fd262dac426fbedf` and deploy
  transaction `0x34f657969d408d4d5d00848c5d0933d40ae7914859a4d6aeb976cd765d2d88f4`
  are leads, not permission to add it to G3. The runbook supplies no creation block
  in the inspected section. Source-code consistency is not bytecode verification.

Identity ABI must include verified ERC-721 `Transfer(address,address,uint256)` for
G5 current-owner semantics in addition to Registered/URIUpdated/MetadataSet. Core
already pins Transfer; the literal G3 ABI omits it. Core currently lacks URIUpdated,
MetadataSet and FeedbackRevoked, so extracting its event subset alone is incomplete.
The local FeeSplitterV2 events match the plan's two signatures/order, and its entry
points emit Settled versus SettledTree disjointly. That does not remove delivery
de-duplication needed for static/template overlap, or validate arbitrary emitters.

## Trusted bindings versus claims and dynamic emitters

Separate **source discovery**, **contract verification**, and **canonical hub
assignment**. A checked-in address is a selection for indexing; an operator-reviewed
provenance record is what can establish verification. Neither `source: static` nor
`source: metadata` is authority. G3 should seed no canonical listing binding.
Treat any retained `listingId` as a labeled hint/comment, never sufficient context
to assign Listing/Agent/Splitter relations. Prefer omitting operational listingId
from the pilot entry until a binding exists instead of silently discarding it.

A later trusted static binding needs the exact chain, pinned identity registry,
agent ID, current owner/seller, splitter address and verified code/version/USDC,
canonical hub listing ID, and dated/block-pinned independent evidence for the hub's
assignment. Render a reviewed binding into explicit typed data-source context only
when a real mapping can validate/consume it. Never accept a caller's boolean
`verified` or a metadata-supplied reciprocal string as the evidence. Transfer or
conflicting ownership must invalidate attribution rather than preserve stale links.

Arbitrary MetadataSet belongs only in bounded, typed, agent-scoped immutable
ListingClaim evidence. It must not overwrite canonical listing/owner/seller/agent
relations, promote a globally recognizable listing name, or fabricate Agent with
empty/zero owner. The actual D writer registers only an agent URI; do not claim the
optional arcade metadata announcements/order are already implemented.

The minimal safe G5 dynamic policy is **no canonical settlement template creation
from arbitrary metadata** until an independent contract/deployment trust mechanism
has been approved. Look-alike events and spoofed seller/version/token getters can
all be forged. If later quarantine indexing is desired, it needs an explicit schema
and aggregate exclusion policy; do not quietly reuse trusted Settlement/Marketplace
paths. Mere Splitter.load existence is neither provenance nor a reliable template
creation/de-duplication guard. Dynamic history starts at discovery; it never proves
pre-announcement history. Attributed evidence must remain null when the required
binding is absent, and G7/G8 still need authoritative hub expectation checks.

## Parent decisions to record before implementation

1. Accept staged G3 active-pilot manifest and defer data-source activation to real
   G4/G5 commits, instead of the literal broken-manifest commit.
2. Accept explicit legacy pilot block-zero/inactive ABI provenance for local staging,
   or release bounded keyless public verification before completing G3 Step 1.
3. Seed no canonical binding and prohibit arbitrary-metadata template promotion;
   reserve independent binding/coverage decisions for released G4/G5 work.
4. Approve the narrow existing-check/script changes needed for reproducible ignored
   manifest generation; preserve source/schema money checks and historical reports.

Instruction basis read locally: worktree CLAUDE.md and applicable ancestor guidance;
Plan G global constraints and complete Tasks 3–5; retained private G2 parent decisions (not published)
and retained private G2 readiness (not published); current schema/smoke/manifest/ABIs/core config and
ERC-8004 ABI/tests/contracts; README/scaffold/schema checks/runbook. Local `use-arc`
skill reinforced separate 6-decimal ERC-20 money and explicit chain identity. Browser
and executing-plans instructions were inspected, with no browser or implementation
workflow started. No external documentation or brain service was queried under the
explicit no-network scope.
