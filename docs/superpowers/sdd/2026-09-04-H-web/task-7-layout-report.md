> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H7 pure receipt-tree geometry — author checkpoint

September 6, 2026. **40 focused Vitest tests pass; exact two-root web strict
diagnostics 0.** The two owned paths are frozen for independent review. No whole
H7 component, visual acceptance, full gate or merge is claimed.

## Scope and inspected contracts

Only new `apps/web/src/lib/tree-layout.ts`, new
`apps/web/test/tree-layout.test.ts`, and this ignored report were written.
Existing HROOT files and GROOT were not modified. No CSS/component/hub/formatter,
server/config/dependency edits, full suite, build, Git, browser, network, key or
payment operation occurred. No owned process remains active.

Read full actual H7 plan, H globals and task7 readiness; actual H4 TreeNode,
TreeView/TreeEvidenceFlag/decodeTree and relevant H4 tests; H3 tree producer and
its lineage/evidence fixtures; actual package scripts, Vitest and web TypeScript
configuration. Fully read ts-testing, design-sauce, emil-design-eng and
apple-design. The local/catalogued pick-ui-library/dataviz and requested
superpowers implementation skills were unavailable; existing parent-directed
execution and actual H7/H4 contracts supplied the bounded fallback. No new UI
library or visual implementation was needed in this isolated geometry slice.

The test skill guided behavior-first assertions and explicit setup-versus-Red
attribution. Design guidance preserves the fixed spacing model and no motion;
it does not turn static geometry checks into screenshot/accessibility evidence.

## Frozen API and geometry contract

- Exactly `layoutTree(view: TreeView): Layout`, exported `PlacedNode extends
  TreeNode`, exported `Layout`, and constants NODE_W168/NODE_H52/COL_GAP72/ROW_GAP16.
- Type-only import from `hub-decode.ts`: no hub client, credential/network or
  browser runtime import. Layout never reads or returns rootJobId, commitment
  fields or a private capability.
- Capture bounded own-data node fields and coherent complete/evidenceFlags.
  Shape/reflection failures throw only `Error("Invalid receipt tree layout")`.
  Consumers catch it and render an unavailable state, never a partial graphic.
- At most256 nodes, at most16 edges deep and H4's canonical positional IDs.
  Exactly one root0 with null parent/hop0; exact prefix parent and hop increment;
  unique IDs and contiguous numeric sibling indices. Whole topology is checked
  before placement. Parent IDs strictly shorten, so cycles/disconnected records
  cannot satisfy the validated topology. Final visit count checks all nodes.
- Input order is irrelevant. Numeric index sorting keeps 0.2 before0.10.
  Post-order output, one hop per240px column, one68px row per leaf, each parent
  centered between its first/last immediate child. Subtrees own disjoint leaf
  intervals. One cubic edge per actual parent link, from box-right center to
  child-left center; all boxes and control points fit finite canvas geometry.
- Exact plan sizing: width maxHop*240+168 for nonempty trees, height leafCount*68.
  Empty shaped view returns `{width:0,height:68,nodes:[],edges:[]}` as a neutral
  fallback, not an economic claim. Actual H4 presently rejects empty responses;
  this explicitly handles the component's empty prop state.
- Input is untouched; node copies, edges, arrays and returned Layout are frozen.
  Extra unconsumed props are not spread into output, including arbitrary private
  fields or callbacks.
- Money/reference/display strings remain bounded pass-through data. No amount
  is parsed, narrowed, added or compared; `Math` is used only for geometry/hops.
  H4 retains price/link/commitment semantics and the component retains safe link
  rendering and uncertainty wording. Layout is not a second evidence decoder.

## Test-first chronology and exact commands

1. Added the full40-case test file before source. Initial actual Vitest command
   at10:07:23 IST failed loading the nonexistent layout module: **1 failed suite,
   no tests collected**. This is setup absence, not forty behavioral Reds.
2. Implemented the bounded layout once. First collected run at10:08:51 IST:
   **40/40 pass**, 33ms test time,902ms command duration, exit0. No failing
   production behavior was seeded to manufacture a Red; all prewritten cases
   passed on the first implementation.
3. First fileless strict program used root cwd without the web config's file
   identity and could not resolve web-local `@types/node` (TS2688). Correcting
   the checker to actual apps/web cwd and configFilePath produced **2 roots,
   strict:true,0 diagnostics**, exit0, with unchanged source/test/config/deps.
   This was a checking-harness setup issue, not a source defect or suppression.
4. Final unchanged focused repeat at10:11:21 IST: **40/40 pass**,32ms test time,
   778ms command duration, exit0. Source/test hashes remained unchanged.

Focused command from HROOT:

```sh
bun --no-env-file x --no-install vitest run apps/web/test/tree-layout.test.ts
```

Exact strict: read actual apps/web/tsconfig.json using TypeScript readConfigFile
and parseJsonConfigFileContent with its absolute configFilePath; createProgram
with exactly the absolute layout source and test roots, inherited actual options
plus noEmit:true/incremental:false/composite:false. The command ran from apps/web
so its existing Node/Vite types resolve normally; getPreEmitDiagnostics returned0.

## Behavioral coverage and limits

Positive fixtures include real H3 Receipt/ReceiptChild/treeHashOf generation
passed through actual H4 decodeTree, complete and unresolved views, root-only,
empty, uneven subtrees, twelve numerically ordered siblings, all256 nodes,
depth16, exact edge curves, full canvas bounds, same-column nonoverlap, repeated
and reversed input, frozen-input preservation and exact strings above2^53.

Failure cases cover duplicate/missing/multiple roots, orphan/disconnected/self
and root cycles, wrong parent/hop, sibling gap, noncanonical/oversized IDs,
hop17/negative/fraction/NaN/Infinity/string,257nodes, incoherent/unknown/duplicate
evidence flags, sparse/oversized arrays, own accessors and throwing reflection.
No accessor diagnostic reaches the caller. These are collected passing rejection
assertions, not separately observed historical production regressions.

The layout does not prove live receipt truth, no-charge outcomes, mined tree
commitments, explorer authority, rendering accessibility, text fitting or mobile
scroll containment. Root owns component/styles, independent review and later
integration/visual/full-gate evidence. Canonical merge remains G then H.

## SHA256 inventory

| Path | SHA256 |
| --- | --- |
| `apps/web/src/lib/tree-layout.ts` | `4edac462f5b75b30213a14922972a2500c188687af6c63245734be6f9c0c71e5` |
| `apps/web/test/tree-layout.test.ts` | `a737ea079cf44d5f83b5f3322df3c87488149861a98288cae5f54653d921f18a` |
| Existing `apps/web/src/lib/hub-decode.ts` | `7c90180e386f7599521bea71e29ff6a979f015638c500b7e44dd09b18a20e0d9` |
| Existing `apps/hub/src/tree-view.ts` | `c6ac65dd4e92cbb81bee2c1aebf92248887342fabaaddf423b8f8d5afe14f19f` |
