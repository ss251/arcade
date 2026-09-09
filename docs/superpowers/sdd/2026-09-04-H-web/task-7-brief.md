# H7 brief: recorded receipt-tree geometry and SVG

September 6, 2026. Source and focused-review checkpoint only. Actual browser QA
is underway separately; parent full gate and commit are **NOT YET RUN** at this
publication-preparation checkpoint. H7 is not declared complete.

This implements the isolated layout/component scope of
[Plan H Task 7](../../plans/2026-09-04-H-web.md), under the
[shared work order](../2026-09-04-A-settlement-core/work-order.md). It adds no
route, receipt fetch, browser capability storage, payment or G8 activation.

## Current contract and plan adaptations

`layoutTree(view: TreeView): Layout` exports `Layout`, `PlacedNode` and constants
`NODE_W=168`, `NODE_H=52`, `COL_GAP=72`, `ROW_GAP=16`. It consumes actual H4
`complete`/`evidenceFlags` and positional parent/hop fields. At most 256 nodes and
16 edges deep are accepted, not the exemplar's three-level assumption. Numeric
sibling order is deterministic; malformed, duplicate, cyclic, disconnected or
inconsistent topology is refused before any partial graphic. Input and exact
money strings are preserved; only geometry uses numeric arithmetic.

`TreeGraph({ view }: { view: TreeView })` catches the fixed geometry failure and
renders unavailable. Empty props receive a neutral fallback, not a claim that a
real job hired nobody. Nonempty views use fixed-size SVG boxes and a contained,
focusable scroll region. Full labels, reasons, positional relationships and
qualified transaction links also appear in an adjacent native details list.
Private job IDs and tokens are never labels, keys for public navigation or links.

The component consumes H4's supplied explorer URL and checks its settled/hash/
configured-explorer relationship. It does not infer a rail from a hash, invent
missing URLs or turn Gateway/Test references into mined evidence. The digest is
labeled recorded, not independently committed on chain. Amounts are recorded
sub-spend versus recorded ceiling; missing evidence is not zero. Negative status
is qualified as “not recorded settled,” not a refund or no-charge guarantee.

Small state text now uses existing ink tokens; semantic settlement/refusal border
colors remain. Source-calculated ink/card contrast is 16.439266:1 light and
13.629524:1 dark. These calculations and static focus/scroll rules do not replace
actual computed-style, accessibility-tree, keyboard or viewport observations.

## Historical evidence and authorship

- The [geometry author report](task-7-layout-report.md) records the isolated
  layout implementation and 40 passing focused Vitest cases, with exact two-root
  web strict diagnostics 0. Initial missing-module loading collected no tests;
  the first implementation passed all prewritten cases. Neither that setup
  failure nor the corrected strict-check cwd is relabelled a behavioral Red.
- The [visual-fixture author report](task-7-visual-fixture-report.md) initially
  records only exact one-root strict 0. Its append adds seven actual-component
  pure server-rendered pages and import-inertness checks with zero server/fetch
  calls. It does not claim an HTTP listener or browser run. The fixture remains
  synthetic, bounded and loopback-only; dummy links are not transaction proof.
- The [initial independent review](task-7-independent-review.md) records 61
  focused tests across two files and exact four-root strict 0. Real H3 → H4 →
  rendering exposed a genuine fallback-link Red: five SVG links but no details
  links. Duplicate accessible row text was also observed. Its separate geometry
  and producer/decoder checks remain separately attributed, not extra Vitest
  cases or live receipt evidence.
- The [final delta review](task-7-delta-review.md) accepts qualified details
  links, distinct positional labels, uncertainty wording and focus rules. The
  initial failing fallback assertion then passed. It also found two small-text
  contrast pairs below 4.5:1; the parent recorded a genuine collected regression
  before changing the CSS to ink. Final independent verification passed **64
  Vitest tests / 2 files**: component 24 plus unchanged geometry 40, with exact
  four nested source/test roots strict 0. The prior 61/63 checkpoints remain
  historical rather than being overwritten.

One attribution clarification: the fixture's `$0.20` ceiling was confirmed by
the actual formatter, and its source stayed unchanged. The proposed `$0.2`
replacement was rejected, not a product bug or behavioral Red. The delta review's
historical “fixture correction” phrase must not be read as a fixture source
change. The complete fixture-author append records that distinction.

This publisher read all four reports and the current contract; it did not rerun
their checks, launch a fixture, inspect browser pixels or execute a full gate.
Root will record the separate browser result, full gate and commit checkpoint.

## Integration and publication boundaries

Canonical G → H integration remains separate. The accepted F/H preflight work
is not waived: H3 must preserve settleRefKind presence, H4 must distinguish true
absence from present-invalid kind, and H1 must retain F's safe public session
boolean without private IDs. H7 cannot restore provenance erased upstream.
No listing-detail page, H9 token store, G8 integration or new spending authority
is implied by these isolated geometry/component results.

Four historical copies use the existing standard banner followed by exact
original body bytes and EOF. There are **zero body substitutions**: inline
private report/preflight basenames are historical provenance, not clickable
private links or publication of those files. No runtime, screenshot, profile,
database, script or private research is copied. The fifth file is this brief.
Exact original/copy hashes and link/privacy checks are retained in the private
publication-preparation manifest. Entry-point updates remain parent-owned;
see the existing [H index](README.md).

The document-generation skill guided the separation of current contract,
historical reference evidence and explanatory limits. Its broader Git, sync,
telemetry and entry-point-edit workflow was outside this five-file preparation.

## H7 later parent acceptance — September 6

G's released local work now merged to main5259f9a, after owner-requested Pages
fix8b8e8e5 landed first. H7 remains a separate isolated branch commit, not a main
merge or waiver of the accepted F/H provenance/session integration.

Parent's [implementation record](task-7-parent-report.md), the
[actual visual review](task-7-visual-review.md) and the later
[native-scroll follow-up](task-7-scroll-review.md) preserve distinct checkpoints.
The 28 exact-document cases passed expected node counts, text fitting, page-width
containment and accessible full details at1280/390 in both schemes. Four native
focus/disclosure sequences passed; actual SVG focus was a visible3px semantic
green stroke, not computed ink. Six measured text contrast pairs passed AA.
Parent directly inspected eight selected matrix/focus/expanded-detail images,
not all52 retained PNGs or a replay of the author's keyboard sequence.

The initial native-scroll gap was resolved separately with unchanged source:
mobile-dark deep wheel moved scrollLeft0→740 after activation of only the owned
background tab and one retry; visible desktop ArrowRight moved0→40 and wheel
40→390. The mobile value may include queued input, not one exact event distance.
Parent inspected all four before/after images and read the separate cleanup
evidence. Mobile keyboard-only and touch gestures were not separately proved.
All three owned browser/fixture runs were stopped; handles were reaped and
their loopback ports independently refused. No real hub, wallet, model or chain
interaction was part of this synthetic SSR acceptance.

Seven historical copies now preserve exact originals under the standard banner:
the visual review substitutes four literal private locations, the scroll review
three occurrences of its owned directory, and the other five copy bodies are
unchanged. Raw scripts, pictures, profiles and logs remain private. The original
reports' pending statements are preserved, not relabelled as later results.
Parent's one complete H7 test/type/client+SSR gate is in progress; final gate,
publication review and atomic commit follow. No H8 route or G8 work is released.

### Final H7 gate

The single full H7 gate completed successfully: **2,395 Vitest tests / 119 files**,
**325 Bun tests / 31 files / 3,735 assertions**, root and web strict TypeScript,
and actual production client/SSR builds (359 ms / 170 ms). These are the isolated
H branch totals, not the larger main branch after F/G integration. No full suite
was repeated for publication-only updates; the independent final publication
review and atomic commit are separate checkpoints.
