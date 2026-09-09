> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G6 reviewed static-emitter integration — September 6, 2026

Frozen at 2026-09-06T03:22:22.993Z after the explicit post-G5 release following
commit42769befd5df157d7aa70c0d251fe8f59dbd7c21. Five owned files changed;
the sixth permitted template file needed no edit and remains byte-identical.
This is the integrator's local source/codegen checkpoint, not deployment,
mapping-runtime acceptance or completion of G6.

## Read scope and immutable interface

Read the full actual Task6, all302 readiness lines, all parent decisions including
the deployment/source split and post-G5 release, current renderer/list/template,
relevant schema/scaffold/manifest checks and the actual pinned toolchain. The
fully read ts-testing skill informed real renderer/list failure-first checks,
focused existing Bun tests and honest setup-versus-behavior reporting.

The generator author was informed before source edits of the exact interface:

```ts
approvedSplitterPin(address: string):
  Readonly<{ address: string; seller: string; startBlock: number }> | null
```

The export is inert and uses only two reviewed literal profiles. It accepts
valid42-character EVM strings, normalizes address casing, and returns a frozen
three-field object. Invalid/unknown runtime inputs return null without coercion
or property access. Both objects and their private list are frozen; no callback,
network/config lookup, arbitrary ABI or caller-supplied trust flag is accepted.

- Required pilot: 0xf95c8afefae677fdcfc7bd5b8aaaf3702db99206;
  seller0x3b2bbb840a9570223adbf2172a33bb77fe8d21af; startBlock0, explicitly the
  historical exception rather than an inferred creation height.
- Optional reviewed A9 V2: 0x9e304ec13dd862c81ee8caa8fd262dac426fbedf;
  seller0xcf821769ed3c0e55e152745377bb833d7155a78a; exact startBlock60460646.

These are the parent-accepted dated code/immutable/creation policy pins, not new
contract observations by this author or public-hub announcement authority.

## Renderer and selected inventory

The committed address/startBlock-only list contains both profiles, address-sorted.
Renderer requires the pilot, allows the exact A9 profile, normalizes order/case,
and refuses all changed heights, unknown/duplicate addresses and extra fields.
No zero-height fallback, caller seller/verified/ABI override, listing metadata,
context or arbitrary source can enter the manifest.

Pilot-only remains an intentionally supported compatibility selection; the
generator separately owns append-only preservation of every existing reviewed
pin. Rendering a selection does not itself claim discovery, catalog pruning
or atomic hub snapshot authority.

FeeSplitterSmoke retains the exact G4/G5 source/ABI/handler/zero-height behavior.
The additional static source is named FeeSplitterA9, with FeeSplitterV2 ABI,
existing fee-splitter.ts mapping, Settlement/Splitter/Tree/TreeOccurrence entities
and the actual Settled plus SettledTree signatures. Its mapping declaration
reuses the exact reviewed V2 template mapping, not a new handler implementation.
Static sources are emitted in address order.

The four inactive templates remain exact. Existing YAML static-source insertion
already supports the reviewed list; no template edit was necessary. Registries
are not activated and no template is instantiated. No Marketplace/global stats,
canonical Listing/Agent/Splitter links or per-skill attribution are created.
Existing fixed-error capture, input bounds, required-file checks and atomic
temporary-output replacement are retained.

Only current-selection assertions changed in the scaffold/schema checks. The
complete historical pilot/V2 snapshot remains exact after projecting the newly
selected static A9 source away. Current source names/order and all four inactive
templates are asserted separately; no schema or mapping behavior changed.

## Genuine chronology and focused checks

1. Before renderer/list implementation, five collected behavioral checks failed:
   **0 pass,5 fail,112 filtered,6 expect calls**, exit1. The committed list lacked
   A9; two actual render calls refused the reviewed V2 selection; current
   scaffold/schema assertions observed only the pilot. No missing export/module
   or compiler setup failure was presented as a behavioral Red.
2. Implemented the fixed immutable pin lookup, bounded two-profile selection,
   sorted static sources and explicit committed A9 entry. The unchanged selection
   passed **5/5,14 expect calls**, exit0. No expected assertion was weakened.
3. Added passing supplemental guards for frozen pin objects, exact three-field
   projection, malformed/unknown/coercible inputs, unsupported heights, required
   pilot and caller authority fields. Updated owned CLI fixture expectations to
   the now-two-source committed list, retaining separate pilot-only compatibility
   assertions. Full four-file selection passed **160/160,352 expect calls**.
4. Added one owned-temporary-file case checking four invalid profile updates
   preserve prior manifest bytes without a sibling temporary output. This is
   supplemental coverage, not a manufactured Red.
5. Exact four-root strict checking found two test-only diagnostics from using
   ES2023 toReversed under the unchanged ES2022 project lib. Changed the fixture
   to copy-then-reverse, retaining input immutability/equality assertions and
   compiler options. The next exact check reported0 diagnostics. This was not
   a runtime or product failure.
6. Final four-file focused run: **161 pass,0 fail,364 expect calls**, exit0.
   All prior schema/ABI/scaffold/manifest cases remain included;26 cases are
   additive to G5's135, not161 new tests.
7. After notifying parent and the generator author, ran exactly one coordinated
   local codegen, exit0. All real mapping files already existed. The new
   generated/FeeSplitterA9/FeeSplitterV2.ts was byte-identical to the existing
   generated/templates/FeeSplitterV2/FeeSplitterV2.ts. Generated pilot/schema/
   registry modules also remained available. This is actual code generation,
   not an AssemblyScript runtime or final WASM build claim.

Commands from subgraph/:

```sh
bun --no-env-file test ./checks/manifest.bun.test.ts ./checks/scaffold.bun.test.ts ./checks/schema.bun.test.ts -t 'commits exactly the reviewed|renders the reviewed V2|canonicalizes order and case|preserves the runbook pilot|declares pilot entities'
bun --no-env-file test ./checks/manifest.bun.test.ts ./checks/abis.bun.test.ts ./checks/scaffold.bun.test.ts ./checks/schema.bun.test.ts
bun --no-env-file run codegen
```

Exact strict ran from GROOT: root tsconfig.json read/parsed with its absolute
filename and current root base; ts.createProgram received only
subgraph/build-manifest.ts plus checks/manifest.bun.test.ts,
scaffold.bun.test.ts and schema.bun.test.ts with unchanged root compiler options
and actual dependencies. Parsed-config plus pre-emit diagnostics:0.

The Bun selection includes actual bounded local renderer CLI/import children in
owned temporary layouts, no env-file or credential use. There was no native AS,
full repository suite, final Graph build, dependency change, network request,
key lookup, upload, deployment, payment, Git action or public-document edit by
this slice. Parent owns README/root aliases, final build/full gate and any
separately reviewed remote procedure. No generator behavior acceptance is
inferred from the stable shared export.

## Frozen changed paths and unchanged template

```text
853f1f1a5133e0c643f2a030e355cfe0d21a89d9ac8a04cc7f7fbb6c26efcc9d subgraph/build-manifest.ts
2bb81f7ba113799c9204a85c30cad13279826c4763708b3d835adb7d2a7dd2c9 subgraph/splitters.json
29f00a64dfa57223916cf5d5479edef2a99b34f8cd7b5b0d30f421e148510b89 subgraph/checks/manifest.bun.test.ts
bca223ab29b681b0884a9a38bead48a57d2ed5962144db4ff2bbc5161c6fe1a2 subgraph/checks/scaffold.bun.test.ts
77b0fd9a5e2c2ac91fccb33220e5460b768e3cbf928591ebc87740157e3075ec subgraph/checks/schema.bun.test.ts
85a05e6002647d2f1bff3aca984354764c6b2876464d1cc4059d88b2d1d2a39f subgraph/subgraph.template.yaml (unchanged)
```

## Preserved mapping/schema/runtime inputs

The following16 pins matched their frozen G4/G5 inputs after codegen. No schema,
handler, AS suite, historic smoke fixture, ABI or Matchstick configuration changed.

```text
eb08f3767b2916cbe0b4e66f73f81f6b23156b362b20f58cf925f6fae66e97db subgraph/schema.graphql
cd7d84e90188cd49b494fd6d6f7c0d477f8f682901483e1e7e768ea6cd0427db subgraph/src/ids.ts
50d8a7d5c4fb28b228f420321f1facdfb23887d6f4c54228aa764be9fa1ba642 subgraph/src/fee-splitter.ts
c9686c6c284ecd2a8905a4f55fa1ff43fa1d5c8a759bdb62e811d37ff1ddc810 subgraph/src/identity.ts
ba448181295f4a2c87e8846d7828ce85266c4cb9c4b62ceeecb4e710ff9657fe subgraph/src/reputation.ts
049347854a9ad81b1c6d07435b313de88d48c63f2d90367bec83adbb61a83d65 subgraph/src/validation.ts
72fecf0bc69da5342e5f3809d4e9a224109a13ef87df82571876259c87e757a9 subgraph/src/registry.ts
e1fcae5efd9d149e5e0548ee467406233650b80675a4bc22345c26f4441d9c6f subgraph/tests/fee-splitter.test.ts
09c8aa39b9dbd6cbfaabc80f8de10787b7d1a60ccaa62de2a609e460bd09727c subgraph/tests/identity.test.ts
a629b8b49c3f7c68d554eb75cc55bdf97bfe5876e8194aa4bbcc75dc075afac4 subgraph/tests/reputation.test.ts
b33922173c861e04103c851aea7990b4fdfa39d0a9bd89e3cd6536d8dc134c97 subgraph/tests/validation.test.ts
9036856089a6cb23c0733464f624285652d4ab574c0ba05425af87529589b124 subgraph/matchstick.yaml
e77ad5aa223ce271ab1d2ea8c01a10d6de48f13a467757d9374406a01703f63d subgraph/src/smoke.ts
114cfff3389dccb395606f4aa6db60d02fb49c7a5886788cf5dc6f64777aee1c subgraph/checks/fixtures/g1-schema.graphql
e3afd30b6cab0f1a33ce79e17ffb6605201e2e6d93b3cff7ac6b903fb236faea subgraph/abis/FeeSplitter.json
cebfd2284c59bafc22c2c87d52f548ac37592e0365ef1adbcf3b0f02620c7c99 subgraph/abis/FeeSplitterV2.json
```
