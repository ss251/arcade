# J12 — source ingestion and evidence-qualified documentation

Implements the offline scope of the [Task12 brief](task-12-brief.md) after
[J11C2](task-11c2-report.md). Live paid listings and broad spec §9 claims remain
unproved; this checkpoint does not complete those live gates.

## Full pinned source, no skill execution

Using the research skill's GitHub CLI route, public commit metadata and a fresh
clean detached checkout agreed on revision26dc09ea0746a038c969c6f197feee1267f834b5
and tree d7aac48698e88448de5ead3f7d3d53a0011990e0. Hooks disabled, no install.
All25 earlier source mappings/23distinct original files matched Git blob hash
and byte length; all18 immediate skill folders were recognized. The actual
native publish CLI selected the two specified skills, returned19source-file
inventory entries and exited0 within its15s/512KiB bound. No output directory,
wallet config, model, capabilities or secrets were provisioned.

A separate real handler run counted zero fetches under a refusing boundary
and produced the same public projection. Native child fetches were not separately
instrumented; it ran with clean environment/private HOME/restricted sandbox.
No MCP server or model/wallet instruction was invoked. Source checkout stayed
clean. The [public record](../../../evidence/J/circle-full-source-preview.md)
and [JSON](../../../evidence/J/circle-full-source-preview.json) give exact scope,
inventory and projection digest. This is preview, not generating/serving a paid
listing. Raw source lacks per-skill license copies, so the docs require retaining
the upstream repository license/attribution before redistribution; the existing
committed excerpt already includes those additions. No full checkout is committed.

## Documentation

- Runbook: selection/fee/gas/commitment table, deferred Circle inspect/pay command
  shapes, source-only root Gateway mismatch versus unchanged vanilla path,
  separate deployment rationale/admin risks, delegate funding and claim limits.
- README: compact Arc-native implemented-versus-live status, linked to evidence.
- Continuity: a dated extension after the frozen original nine-move checkpoint,
  preserving inherited history and AI attribution rather than rewriting counts.
- Architecture: correct dedicated escrow contract, explicit buyer opt-in and
  public terminal link policy, plus two short Mermaid source flows. The diagram
  skill's source guidance was applied; rendering remains assigned to Plan I.

No source behavior, dependency, browser signer/recovery, authorization window,
cap, replay rule or production configuration changed. No wallet/model key,
chain RPC, grant, deposit, payment, deployment, approval replay or push.

## Validation and remaining gates

GitHub/source and native preview checks passed as recorded above. Direct web
Mermaid import was unavailable; resolving the already-installed11.16.1 through
streamdown succeeded, but its parser requires a DOM-backed sanitizer. No DOM
shim/dependency was installed or sanitizer disabled. The two new source flows
are not claimed parsed/rendered or visually verified; Plan I must do that before
shipping rendered architecture. Current README raster remains historical.

Final scope audit: eleven docs/evidence paths,214 local links, empty index and
no privacy-pattern matches. The sole sequential four-worker full gate passed:
5,327 Vitest tests across242 files (68.94s);1,362 Bun tests across92 files,
11,713 assertions (191.55s); root/web typechecks and client/SSR builds
(330ms/161ms). Frozen content is rechecked before the atomic commit and
exact-one main fast-forward; no full gate replay or squash. J4/J5 live, J6 treasury/size/live
executor, Task10 and live subgraph activation remain open. Task12 paid listings,
J11 create/fund public history and Plan I packaging/owner capture remain open.
