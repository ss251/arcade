> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H7 synthetic tree visual fixture — author checkpoint

September6,2026. **Fixture source frozen; exact one-root web strict check passed
with0 diagnostics. Actual import/runtime/server/browser checks NOT RUN by this
author.** This is the bounded visual-fixture slice, not component, geometry,
HTTP lifecycle or rendered-viewport acceptance.

## Scope and skills

Owned only `apps/web/test/fixtures/tree-server.tsx` and this ignored report.
Read the TypeScript testing and frontend-design skills completely, the global
browser-harness instructions, actual TreeGraph/layout/H4 types and formatter,
existing market-server/nav-server patterns, current tree component tests, and
relevant base/market/tree CSS. The testing skill guided typed data, fixed cases,
bounded resource ownership and truthful separation of compilation from behavior.
Frontend guidance was applied as preservation of the existing warm semantic
tokens/typography; no alternate graph design or copied component CSS was added.

No component/layout/H4/style/hub/provider/route/dependency file was edited. No
Git, network, key/environment lookup, server, browser, full suite, component test
or module runtime import was invoked. The missing optional private parent-decisions
filename was a read-path absence, not a product Red; existing H7 readiness was read.
No missing-module or new behavioral failure is claimed for this preparatory file.

## Launch and private ownership contract

From HROOT, in an explicitly minimal environment using the verified installed
Bun executable:

```sh
bun --no-env-file apps/web/test/fixtures/tree-server.tsx
```

No positional arguments, flags, file/module/origin/port selectors or environment
options are accepted by the fixture. Root owns launching the exact command as
an owned child, capturing its PID, bounding observation, sending SIGTERM and
awaiting/reaping that same handle. The documented command was **not executed**
by this author.

The native Node HTTP server binds only `127.0.0.1:0`. After listen succeeds it
prints one bounded fixed-prefix readiness line:

```text
[h7-tree-fixture] {"event":"ready","origin":"http://127.0.0.1:ASSIGNED_PORT","pid":OWNED_PID,"cases":["normal","wide","deep","long","incomplete","single","empty"]}
```

Only the assigned public loopback origin, own PID and constant case labels appear.
There is no HTTP control endpoint or dynamic provider diagnostic. The fixed
failure is `Tree fixture unavailable.\n` with exit1. Normal SIGTERM/SIGINT stops
the owned listener, destroys captured sockets and waits for its close callback.
Parent death is checked every250ms via the captured parent PID; a600000ms lifetime
timer also requests stop. Both use exit1. A separate2000ms close bound yields
failure if the native callback does not finish; process exit then provides the
dedicated-child boundary. Thus the intended total lifetime is at most ten
minutes plus two seconds of cleanup, not a claim of tested native teardown.
Root should retain its independent outer child fuse/reap.

Connection count16, requests-per-socket16,8192-byte header ceiling,5s header/request
timeouts and1s keepalive are configured. Normal pages are pre-rendered and bounded
to128KiB each; actual stylesheet is bounded to256KiB. No Vite, bundle, child spawn,
global transport replacement, real hub, token, wallet or provider exists here.

## Routes and visual data

GET only:

- `/` is the normal case.
- `/?case=normal|wide|deep|long|incomplete|single|empty` selects one exact case.
  The actual URL must contain exactly one literal allowed case, not the pipe
  notation; extra parameters, alternate casing/encoding, unknown paths and HEAD/
  other verbs receive fixed404 with no reflected path/Host text.
- `/styles.css` serves the actual current CSS bytes loaded at process start.

All responses use no-store/no-referrer/nosniff and a restrictive CSP: no scripts,
connect sources, frames, forms, fonts or external assets. Only same-origin CSS
and fixture-wrapper inline layout are permitted. Tree component/style bytes
are not handed-copied. A new fixture process imports the actual component and
loads current styles; running instances intentionally retain their start snapshot,
so parent restarts after any source change instead of assuming hot reload.

Synthetic cases are typed against the actual H4 TreeView/TreeNode interface and
fully frozen:

| Case | Contents |
| --- | --- |
| normal | Complete3-node recorded set:2 settled synthetic nodes,1 not-settled child; recorded0.05/0.20 sub-spend display |
| wide | Root plus12 contiguous positional siblings, including indexes10/11 and3 synthetic nonsettlements |
| deep |17 nodes,16 parent edges, no inferred flat-descendant relationship |
| long |64-character skill label,1024-character reason and exact uint256-maximum atomic price; full detail text remains available |
| incomplete | Missing-receipt/reservation-unresolved flags and no fabricated digest/committed/ceiling values |
| single | One complete synthetic root and explicit0.00/0.00 recorded descendant amounts |
| empty | Shaped empty/incomplete fallback, not proof a real job hired nobody |

Normal/long include two plausible **dummy** Arcscan links, and some other cases
retain a dummy root link. All page headers explicitly label data synthetic and
forbid following these references. Root approved keeping them for keyboard-focus
QA and will not navigate them; its isolated browser may additionally block HTTPS.
CSP does not guarantee blocking external top-level link navigation. No transaction
lookup or mined proof is represented. This page is static SSR; native details/
links/scrolling work without hydration or a second transport.

The max-length reason is a deliberately typed display stress fixture, not a claim
the actual H4 sanitizing decoder would emit arbitrary1024-character provider prose.
Similarly empty is the component's synthetic fallback, not a real hub response.
Import inertness is designed in fixture-owned top-level code; third-party module
loading is not an adversarial sandbox and no runtime import test was executed.

## Exact verification

Executed only a fileless TypeScript program from HROOT/apps/web. It read the real
absolute web tsconfig with its configFilePath, preserved its parsed compiler
options and real dependency graph, and supplied only the absolute fixture root.
Explicit noEmit/incremental:false/composite:false prevents generated output.
**1 root,0 diagnostics, exit0,2.084s.** No test pass count or visual/runtime proof
is derived from that result.

Compiler body:

```js
const ts=require("typescript"),path=require("node:path");
const config=path.resolve("tsconfig.json");
const raw=ts.readConfigFile(config,ts.sys.readFile);
const parsed=ts.parseJsonConfigFileContent(raw.config,ts.sys,path.dirname(config),undefined,config);
const roots=[path.resolve("test/fixtures/tree-server.tsx")];
const program=ts.createProgram({rootNames:roots,options:{...parsed.options,noEmit:true,incremental:false,composite:false}});
const ds=[...(raw.error?[raw.error]:[]),...parsed.errors,...ts.getPreEmitDiagnostics(program)];
console.log(ts.formatDiagnosticsWithColorAndContext(ds,{getCurrentDirectory:()=>process.cwd(),getNewLine:()=> "\n",getCanonicalFileName:x=>x}));
console.log(JSON.stringify({roots:roots.length,diagnostics:ds.length}));process.exit(ds.length?1:0);
```

## Frozen fingerprints

| File | SHA256 |
| --- | --- |
| apps/web/test/fixtures/tree-server.tsx | 1aa87050123bfae9d62fb5f7f52e3c780552b1d449891bd66d03c2504050076f |
| apps/web/src/components/tree-graph.tsx | c5b2f92aec04b7d5fd4e5b19e8bce821305d5ad76d756e600300a0b4150f24c4 |
| apps/web/src/lib/tree-layout.ts | 4edac462f5b75b30213a14922972a2500c188687af6c63245734be6f9c0c71e5 |
| apps/web/src/lib/hub-decode.ts | 7c90180e386f7599521bea71e29ff6a979f015638c500b7e44dd09b18a20e0d9 |
| apps/web/src/styles.css | 661f23ca1fd0675b11c862baf4c983dc9599550905fd6bf1995e679d66ae3a58 |

The last four are current consumed-input hashes, not files authored or changed
by this slice. Fixture9364 bytes; actual CSS37931 bytes. Root retains source
review, owned-child import/HTTP/termination checks and four-viewport/scheme visual
acceptance. No process started by this author remains to stop.

## Follow-up verification and final freeze — 2026-09-06

Parent requested checking the fixture money strings and updating consumed-component
link counts before its first server launch. The original source remains
**unchanged** at`1aa87050123bfae9d62fb5f7f52e3c780552b1d449891bd66d03c2504050076f`.

The actual isolated HROOT money formatter returned:

```json
{"ceiling":"$0.20","zero":"$0.00","child":"$0.05"}
```

This was a keyless fileless Bun import of the explicit money module under an empty
environment plus fixed PATH/ARCADE_NETWORK=arc-testnet; no network or server ran.
The suggested$0.2 change was therefore an incorrect review hypothesis, not a
behavioral Red. Parent accepted preserving the current canonical strings.
Direct money.ts imports chain.ts, which selects a network at module initialization;
the fixture intentionally does not add that ambient dependency merely to replace
already correct synthetic constants.

After parent's separate component changes, ran one pure in-memory fixture import
and all seven actual`renderToStaticMarkup(TreeGraph)` pages, with native
node:http.createServer replaced by a throwing counter and synchronized ESM exports,
and fetch/preconnect replaced by throwing counters. An invalid synthetic ambient
ARCADE_NETWORK value did not affect the fixture. The check exited0 in38ms:
**server calls0, fetch calls0**, no unavailable-topology output. No actual server
listener or browser was started.

| Case | Nodes | Maximum hop | SVG links | All anchors including7 fixture-nav links | HTML bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| normal |3|1|2|11|4816|
| wide |13|1|1|9|12366|
| deep |17|16|0|7|15194|
| long |3|1|2|11|8175|
| incomplete |2|1|1|9|3623|
| single |1|0|1|9|2819|
| empty |0|0|0|7|1175|

Thus normal/long now contain **2 SVG +2 details transaction anchors** for the
same two synthetic references (4 external anchors, not four transactions), plus
7 local case links. The initial two-link description belonged to the prior
component checkpoint. Parent separately reports its23 component +40 geometry
tests; this author did not run or add those63 tests. Their genuine Reds and
corrections remain parent/geometry-author evidence, not fixture-author claims.

Repeated the same exact one-root web-config strict check against the current real
component dependencies: **0 diagnostics, exit0,1.979s**. Current consumed input
pins now are:

| File | Current SHA256 |
| --- | --- |
| apps/web/src/components/tree-graph.tsx | f71e9702a2efdc1ca93a1e319ecde86717ae91e3aceb8c0f4b853d2ab51b39cc |
| apps/web/src/styles.css | 76944d622aac061890ebfa29542a041623baf4d35277ecfeebd132a06030de1c |
| apps/web/src/lib/tree-layout.ts | 4edac462f5b75b30213a14922972a2500c188687af6c63245734be6f9c0c71e5 |
| apps/web/src/lib/hub-decode.ts | 7c90180e386f7599521bea71e29ff6a979f015638c500b7e44dd09b18a20e0d9 |

Only this report append was written after the initial freeze. Fixture source
and safe launch contract are unchanged; actual HTTP method/route behavior,
SIGTERM/deadline/parent-death cleanup and all visual viewport/scheme/focus checks
remain for root's owned launch. Import/SSR verification supersedes only the
initial NOT RUN statement for those pure checks, not the untouched server/browser
limit. No behavioral failure or full-gate result is invented.

