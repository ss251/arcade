> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G6 readiness — public discovery, static coverage, existing A9 proof

September 6, 2026. Read-only preparation, not G6 source/deployment release.
Read full Plan G Task6, G3/G4/G5 decisions, actual catalog/detail/discovery,
schema and G7 reciprocal decoder, H/G8 merge seams, and retained A9/provenance
records. `ts-testing` informed the proposed behavioral matrix only. No tests,
network, keys, Git, generation, deployment or funding were performed here.

## Decision-ready result

The minimum honest implementation is a bounded GET-only discovery join plus a
local, atomically validated update of already reviewed static emitter pins.
Discovery supplies current hub-announced payout candidates, not signed Hello
evidence, historical skill assignment, contract identity or canonical Agent links.
Add the independently reviewed A9 V2 emitter explicitly even if today's hub has
no listings; never remove historical pins because discovery is empty or changes.
Keep Marketplace and canonical Listing relationships absent. Prove indexing
against the already settled A9 tree, not by buying another call.

This adapts the literal task: its `/listings[].feeSplitter` does not exist; its
creation-height fallback to zero, first-listing-wins binding and automatic
three-registry/one-template coverage claims are not acceptable implementations.

## Actual source boundaries

- `apps/hub/src/server.ts:910–918`: `/listings` emits PublicListing + seller and
  optional ENS name, filtering delisted AND ENS-expired records. No splitter,
  version, verified flag or observed immutable fee/network fields are public.
- `server.ts:957–974`: detail adds stats, ratings, optional ERC-8004 evidence,
  ENS/payment-test status, but still no splitter. `listing-evidence.ts` can prove
  a fresh current ownerOf/seller match; its announced registration transaction
  does not itself prove mint history or payment attribution. Detail reads are
  unnecessary for the minimum emitter generator and cannot repair these gaps.
- `openapi.ts:448–473`: `/.well-known/x402` has exact POST resource URLs and
  accepts `{scheme, network, asset, payTo, amount, resource, description}`.
  It uses ONLY the default rail. Gateway chooses seller; otherwise it chooses
  `feeSplitter ?? seller`. The `rails` array does not advertise separate payment
  alternatives. Test/Gateway/default-unknown discovery must not become EIP-3009
  splitter authority. Its filter excludes delisted records but not ENS expiry.
- This is deliberately NOT complete PaymentRequirements: timeout and signing
  domain are absent (`packages/payments/src/types.ts:16–27`). Use a dedicated
  discovery decoder; do not fabricate these missing fields or POST a quote.
- `packages/core/src/protocol.ts:24` and `server.ts:548–722`: signed Hello carries
  one per-SELLER splitter reused across that seller's listings. Verification can
  fail open on unavailable RPC and remain unverified. Public discovery neither
  supplies the signed message nor the verification evidence. The discovery code's
  “per-listing” comment does not change this actual storage/registration behavior.

### Empty production catalog is an observation, not a fallback trigger

Parent-retained `internal/task6-hub-observation.json` records two HTTP200 reads at
2026-09-06T02:21:52Z: `/listings` was 2 bytes with empty projection, discovery
41 bytes with empty resources projection, rail absent in both. No current payout
join is available. I read that record, not the remote services; it retains body
hashes/projections, not both complete raw bodies, so I did not recompute those
body hashes. Do not infer the absent fields of the raw discovery document.

Empty validated arrays mean no discovered additions and an unchanged historical
list. Missing required discovery identity/rail fields must remain unavailable,
also without mutation; do not synthesize `rail:eip3009` even for empty input.
This is current technical availability, not an owner-only blocker, a request to
republish skills, proof of unsupported Graph, or reason to rerun A9.
Parent separately reports ten fixed-block code/getter checks passed; their
independent review is pending and is not silently included in this note.

## Proposed exact small API and update contract

Keep the new generator import-safe in `scripts/graph-splitters.ts`:

```ts
type SplitterCandidate = Readonly<{
  address: string; seller: string; listingIds: readonly string[]
}>
type SplitterDiscovery = Readonly<{
  kind: "empty" | "observed"; candidates: readonly SplitterCandidate[]
}>
decodeSplitterDiscovery(hubOrigin: string, listings: unknown,
  wellKnown: unknown): SplitterDiscovery
planSplitterUpdate(existing: unknown, discovery: unknown): Readonly<{
  json: string; added: number; total: number
}>
updateSplitterList(options: Readonly<{
  hubOrigin: string; output: URL; template: URL; chainConfig: URL;
  fetchImpl: typeof fetch; signal?: AbortSignal; write: boolean
}>): Promise<Readonly<{ changed: boolean; added: number; total: number }>>
```

These are proposed signatures, not implemented exports. Fixed diagnostic codes
such as `discovery_unavailable`, `discovery_invalid`, `unapproved_splitter`,
`manifest_invalid`, `write_failed` contain no remote body/URL/error text.

1. Require explicit canonical hub origin (HTTPS; HTTP only explicit loopback in
   local tests). No credentials, query, fragment or arbitrary base path. Exactly
   two GETs: `/listings` and `/.well-known/x402`, captured origin, redirect:error,
   credentials:omit, no authorization/session/payment headers. No endpoint POST,
   RPC, explorer, ENS/metadata fetch, environment discovery or retries. Suggested
   caps: 1MiB each, 1,000 rows, JSON depth16, ten-second whole-operation deadline;
   fatal UTF8 and bounded streamed body, cancellation before any file mutation.
2. Capture bounded own data; reject accessors/proxy failures with fixed errors.
   Decode only the known public shapes and explicitly project identity/payment
   coordinates; schemas/descriptions never enter the operational list. Validate
   SkillId's actual ASCII 2–64 pattern, nonzero20-byte addresses, exact same-origin
   `/x/{seller}/{id}` and matching inner resource, method POST, x402Version2,
   explicit default eip3009, one exact accept, pinned CAIP-2/USDC and canonical
   positive uint256 amount. Amount must equal exact six-decimal parsePrice of the
   listing price (bounded before parsing); no Number money or invented default.
3. Join exact current listing id/seller to resource, then canonicalize address
   casing. Every eligible catalog listing needs one matching resource; reject
   duplicate/conflicting resources, amount/seller drift or missing match before
   writing anything. Discovery-only resources are excluded as not currently
   listable, not treated as evidence of a new listing; ENS filtering explains why
   equality of both full sets is not required. Two GETs are NOT an atomic hub
   snapshot: record that limitation, and refuse observed inconsistencies rather
   than claim a historical or continuous binding. A third GET is not needed for
   this minimum candidate-only contract and would not prove atomicity either.
4. Multiple skills sharing an emitter produce ONE candidate with sorted observed
   listing IDs; none becomes canonical. Conflicting seller claims fail. A seller
   fallback payTo is not silently accepted as a splitter. Candidate addresses must
   resolve to exact parent-reviewed immutable source pins including the seller,
   USDC, ABI/version and verified activation height; no `verified:true` input or
   caller-supplied evidence flag can widen the renderer's address allowlist.
5. Avoid duplicated policy: narrowly export an inert
   `approvedSplitterPin(address:string): Readonly<{address:string;
   seller:string;startBlock:number}> | null` from the existing manifest module,
   backed by its reviewed fixed source profiles. Generator consumes this; unknown
   addresses require later reviewed evidence/profile addition, not a generic
   explorer lookup accepted as authority. The historical pilot remains a named
   exception, not the rule for newly added sources. Preserve the initial list's
   address/startBlock-only shape; listing IDs stay out of it and mapping context.
6. Validate all existing pins, candidates and final rendered manifest/active
   mapping/ABI paths before creating a sibling temporary file and replacing the
   output. Preserve every existing address/startBlock, including absent/delisted
   sellers and the exact pilot0 exception; no pruning or lowering/replacing known
   heights. New heights must be verified integers1..2147483647, never0 on absence,
   HTTP error, invalid numeric text, null receipt or code mismatch. Unknown/mixed
   candidates refuse the entire update; no partially appended output.
7. Guard CLI with import.meta.main, explicit `--hub`, default dry run and explicit
   `--write` for the fixed repository output. Tests use explicit owned paths.
   Imports/help do no I/O; output only closed status/counts. No automatic build or
   deploy. Atomic replacement covers one local file, not a two-file transaction
   or hostile-filesystem/process-crash durability claim. Render validation happens
   in memory; the existing manifest command independently regenerates YAML later.

## Static activation and truthful coverage

Current G4 source is still precisely pilot static + inactive V2 template; its
renderer refuses any other address. G5 decisions add three inactive registry
templates with real handlers, never instantiated. G6 must explicitly extend that
strict selection; changing splitters.json alone will correctly fail today.

Smallest first activation: retain pilot, add known A9 V2 as a static source with
both Settled and SettledTree, preserve prune:never, and leave unused templates
inactive. No metadata-triggered template creation. The V2 creation receipt
correlates address `0x9e304ec13dd862c81ee8caa8fd262dac426fbedf` to block60460646
and transaction `0x34f657969d408d4d5d00848c5d0933d40ae7914859a4d6aeb976cd765d2d88f4`.
Creation receipt alone is not runtime/USDC/payee proof: adopt only after the
separate exact runtime/source/immutable checks are independently accepted.
Keep the source evidence/provenance in the reviewed activation inventory/README,
not self-announced listing metadata. Current owner and historical skill binding
are distinct predicates and are not prerequisites to observing emitter facts.

Do not automatically add three registry sources at explorer-asserted creation
heights. G3 proved only current implementation ABI correlation at block60670577;
creation receipts are null and pre-upgrade behavior/completeness is unproven.
Minimum decision: registries stay inactive until a specifically bounded epoch
is accepted. If a later fixed epoch is selected, document excluded history and
unknown-agent skips; do not call it full registry coverage. Installed Graph CLI
Ethereum manifest declares endBlock, but that declaration alone is not proof of
live indexing semantics or of a safe historical interval. No epoch is invented
by this note, and an unbounded future proxy epoch is not source identity proof.

`Splitter.listing` is singular, while actual seller splitters serve multiple
skills. G7 decodeEvidence (graph.ts:231–279) requires reciprocal Listing/Agent/
Splitter links and returns emitter totals. Merely writing those links would
launder all seller activity into a selected skill; even one current listing does
not establish exclusive historical use. Keep canonical links absent and G7
evidence null until a separately approved per-event/interval binding can support
the claimed quantity. Do not duplicate emitter totals under several listings.

Marketplace remains absent: selected emitters from selected epochs are not all
ARCADE calls, all rails or complete ERC-8004 coverage. Its existing schema/G7
GraphStats has no scope/coverage field. Retain exact per-emitter counters and
TreeOccurrence facts; report coverage separately in evidence, not an apparently
global zero-filled singleton. G5 feedback counts observed unrevoked records and
validation counts use a local classifier, not proof of paid service fulfillment.

## Minimum files and behavioral matrix after explicit release

- Generator author: new `scripts/graph-splitters.ts` and
  `scripts/graph-splitters.bun.test.ts` only.
- Integrator: `subgraph/build-manifest.ts`, `subgraph/subgraph.template.yaml`,
  `subgraph/splitters.json`, `subgraph/checks/manifest.bun.test.ts` and exact
  scaffold/schema current-manifest assertions only as needed. Preserve mapping
  behavior/schema; no ids.ts, registry handler, graph.ts or hub route changes.
- Parent: root package scripts, subgraph README and runbook evidence/publication.
  Root currently has no subgraph:* aliases. Add manifest/build/splitters using
  nested Bun --no-env-file. Do not turn deploy into a credential-reading retry
  helper or invoke it as a check. No lockfile/dependency/new framework required.

Use existing Bun tests and actual renderer, not a mirror implementation. Cases:

1. Real buildWellKnownX402 + canonical PublicListing projection joins one/multiple
   same-seller skills; no feeSplitter field is assumed on `/listings`.
2. Default Gateway/Test/absent rail, advertised-but-nondefault EIP rail, seller
   fallback, wrong chain/token, foreign/path-confused resource, wrong method or
   accepts/amount shape all fail or explicitly remain unavailable without writes.
3. ENS-only discovery extras are excluded; duplicate IDs/resources, conflicts,
   missing matches and changed seller/price refuse; case normalization is stable.
4. Empty valid arrays/no additions preserve exact existing pins. Current retained
   projection is evidence of emptiness, not a fabricated complete raw fixture.
5. Own accessor/proxy/toJSON traps, oversized/malformed UTF8/JSON, timeout/abort,
   HTTP/redirect failures use fixed diagnostics; no remote string reaches output.
6. Unknown code/profile, null/mismatched creation receipt, zero/negative/fractional/
   unsafe block, mismatched immutable seller/token and stale changed pin cannot
   activate. The accepted pilot0 exception cannot authorize zero for another pin.
7. Stable address sort/dedup; shared emitter never gets listingId/context; no
   Marketplace/Agent/Listing creation or template instantiation from discovery.
8. Owned-temp import/help/dry-run and invalid input do not mutate output; valid
   write round-trips through actual renderManifest; write failure leaves prior
   bytes, temporary resources cleaned. Stubbed fetch asserts exact two GETs and
   no credential headers/POST/RPC. No loopback child required for pure checks.

Run only focused Bun/exact nested strict after release. Parent coordinates actual
codegen/WASM build and sole full gate; build is not Matchstick or live indexing.
No executed Red/Green, fixture count or gate result is claimed by this readiness.

## Future live acceptance — already settled A9, no new funds

The independently verified A9 runbook checkpoint is2026-09-05T04:38:07.372Z,
Arc testnet5042002. Fixed known facts:

- Root tx `0x0d02f5f9793bc7baede3d88b65666052be2b549bc10ea4024d74ecacce28e23d`,
  total300000; treeHash
  `0x87cb3b5b32d849ebb6d5777ac247bdbdb15aa532b226fb86a591c491fa8f4a28`.
- Child tx `0x315c65b65a03a4a7ab381263d22e7eaf1d435544486d71caac80037c52abf656`,
  total50000; grandchild tx
  `0xe944dc51e6a14b762336bcc04bef9020b63368280c8207692792065fd23d3be3`, total10000.
- Root-only SettledTree, childCount2, childTotalAtomic60000; two ordinary Settled
  children. Prior proof independently checked nonces, transfers and receipt tree.

After any separately authorized deployment, retain its actual acknowledged
CID/version/query URL. Query the exact tree/hash and all three known transactions,
not latest:first3. Require no GraphQL/indexing errors, the expected deployment
identity, indexed height at least the actual root event height, exact emitter/
money/nonce/tx/block/log occurrence correlation and expected Tree root/count/total.
Use bounded queries with an extra row to detect collisions/extras. Obtain actual
event block/logIndex/nonce/seller/fee fields from the retained A9 evidence; they
are not all printed in the runbook and must not be invented. Tree ambiguity must
remain explicit; a collision cannot be relabeled a successful unique-root match.

This proves indexing of known historical events, not a fresh payment, complete
Marketplace, skill-specific historical counts, Studio dashboard Synced status or
current-head finality. Historical RPC absence does not erase retained evidence;
separate any new read from the dated proof. Current empty catalog does not
prevent this known-source query. Do not invoke e2e-lineage, funding or F1/G1 again.
G1's one-shot deployment authority is consumed; a future G6 deployment remains
NOT RUN without fresh explicit authority. No owner request is needed now.

## Deferred H/G8/G9 handoff and parent decisions

The recorded exception is real: Plan H Task1 supplies `/stats`/statsSource before
G8, and G8's merge notes require the H server routes before its final server edit.
G6 creates none of those seams. Complete the approved H handoff/rebase before
G8 and preserve F session privacy/rails, ENS/delisting and D identity evidence.

Concrete integration gap: H's draft `/stats` (H plan:288–321) always computes
values from Store/SQLite, but separately reads statsSource. Changing only that
seam after a successful Graph probe would falsely label SQLite numbers as Graph.
Keep source:"hub" until actual selected values and provenance come from the same
compatible read. A Graph settlement subset also cannot relabel hub catalog/call
counts. Resolve this narrow contract in the later H/G8 decisions, not in G6.

G9 waits for G8 and must preserve F10's MCP session behavior. Its literal
“settlement-backed feedback” and seller-cannot-write claims exceed G5's facts;
use qualified observed-registry labels only after real canonical attribution and
strict buyer wire decoding. No evidence line is better than manufactured links.

Parent choices to record before release: accept candidate-only join/append-only
known profiles; approve exact A9 static activation after independent code evidence;
hold registry epochs and Marketplace/canonical links rather than claim complete
coverage; separate local and existing-event live acceptance; preserve H-before-G8
with truthful same-read source labels. These are technical decisions, not new
coordination, deployment, funds or owner-input requests.

## Inspected checkpoint hashes (SHA-256)

G4 renderer is a current authored checkpoint, not newly independently reviewed here.

```text
apps/hub/src/openapi.ts 1ca5df6f5008d886d4008d02e5aaf9dc2c64ef9778f87773e138cec870c33240
apps/hub/src/server.ts 533f80fe8a6af49214bad0c778b2cd93188dae1f24d208ed2abfffba9aedc6f2
apps/hub/src/graph.ts 87b72678d4493a0625aba4b61e39158bb7b12940586b7243497161c0864c7ad7
apps/hub/src/listing-evidence.ts d30b6086a9d2594589661a413bfccf76de35a5986450816540d402e3f2f06919
packages/core/src/manifest.ts 3eb758b690b3e71d93819a0ddfefd122a8a2c08afa2fe4532ae28daa7caa3309
packages/core/src/protocol.ts 5a1e37bc0ec38f7fa95c271fe6b285f45f2b8a943296ee4ccff9caac072c76f8
subgraph/schema.graphql 913780f0d521079f2cb97670a0bd542a087ac27cbc2e0ae93d58d8e75defb483
subgraph/build-manifest.ts 355a4efcdfd1912a1543785dc6aee725d6560c6e303966c44de0694c724c66d3
internal/task3-parent-decisions.md b7dd848c68ea061f4985d4e00e45fba79a0f8bebb6e90fef210718849fb3ab59
internal/task4-parent-decisions.md 3de152a54ae91c4d4e82b8d2285d42ae544466d00c8631ec15919704f5e5cca7
internal/task5-parent-decisions.md 187c49c9a4c6c203b1c47f6537df5f9ca00108d8ac1dd8b8876e645713787603
internal/task6-hub-observation.json fb844305fcdf76c7430a4fb5156e8405fec7acb3bbd94c66764bcb236986d326
```
