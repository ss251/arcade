# H12b1 bounded preview/request validation — parent report

2026-09-06 after CLI28ce88a. Root-only self-review and implementation; no
independent/parallel reviewer. [Brief](task-12b1-brief.md) preceded source; the
[readiness note](task-12b-readiness.md) is a historical planning artifact, not a
claim that its runtime/route steps have been implemented.

## What this chunk does

parsePreview accepts only bounded current CLI JSON:1MiB UTF-8, depth24,
20,000 nodes,1–64 generated entries and at most1,000 skipped records. It preserves
directory versus generated/written-false states, all entries and exact skipped
reasons. Core schema/publishability and the same canonical CLI formatter validate
public/private/ID/engine/credential/grant/advisory correlation. Excess fields do
not survive, subscription-backed entries refuse, and generated prices pass the
actual CLI's positive-price gate. Public JSON Schema properties legitimately named
engine/secrets remain public schema data, not misidentified as private fields.
No raw CLI text or diagnostic escapes a failed parse. No filesystem/network IO.

The target gate copies one own-data field, refuses traversal/private/absolute paths,
options/shell syntax, bare stdio targets and URL credentials/query/fragment/path
repair; valid relative directories/OpenAPI JSON and explicit MCP discovery remain.
This proves syntax only, NOT realpath containment or symlink safety.

The local request gate requires an explicit flag, no known hosting marker, POST,
literal loopback HTTP URL, exact Host/Origin and no forwarded/proxy authority.
Fetch-site metadata must be absent or same-origin. It includes IPv6 loopback and
rejects missing headers/external/lookalike/all-interface hosts. This proves metadata
only, NOT socket binding or a safe process-launch endpoint. Neither gate is wired
to a listener, route or subprocess in this chunk.

## Failure-first and verification record

-18:18:55: two missing-module collection failures,0 tests; setup only, not a
behavioral Red. First implementation52/52 passed18:21:40 in826ms.
-18:23:54: four genuine new MCP syntax/path-repair regressions failed/54 passed
across58 in755ms. Character/path checks now run before URL parsing;58 passed
18:24:18 in719ms. Added real two-entry preservation and UTF-8-byte-over-character
coverage, not a first-entry-only mock.
-18:26:04: forged zero-price generated batch genuinely failed its refusal test.
The parser now calls the same parsePrice gate as CLI generation;58 passed at
18:26:25 in812ms. Directory projection semantics were not silently changed.
-18:28:02: a fresh no-env Bun import failed on invalid ARCADE_NETWORK. A separate
read-only probe confirmed eager chain selection through the core barrel. The web
parser and canonical H12a helper now import pure manifest/engine/money modules.
The first subpath spelling met Vitest's prefix alias limitation (two collection
failures); existing direct-file import conventions resolve it without changing
Vitest config or weakening the actual import assertion.
-18:29:38:63 focused tests/4 files passed in776ms, including fresh imports of
parser/policy/shared helper with invalid chain selection and request refusal.
Exact six-root nested TypeScript program:0 diagnostics. The helper change is
import-only; the historical28ce88a fingerprint remains a historical fact.
-The sole full sequential max4 gate25795 exited0, observed18:36 IST:
4,081 Vitest/175 files/52.93s;834 Bun/54 files/6,093 assertions/163.61s;
root/web strict0; client355ms and SSR181ms. No full repeat or source change.
The tool truncated middle test-detail output; both numeric summaries and final
exit0 were retained. Six current source/test pins remain frozen below.

```text
b54b192d9296bc87b38fdadf58ac56adbd4a89a63ce07c1d50181b8c82fc2f72  apps/web/src/lib/publish-preview.ts
62afb0659013ce82d0632a2c6675a98bf821ea4b7bb72b10edd93863e7a91bc2  apps/web/src/lib/publish-policy.ts
423bfcba16a163a662b0b0d1d99b673a7253674e4452a8c400a054b70f06c123  apps/web/test/publish-preview.test.ts
e6e00966476f508d18c33f3b434279c3661c67f90db419edde9272c965194df1  apps/web/test/publish-policy.test.ts
37f2ea2a8d87df04a2166db849ed7f5e787896627d4ae7c5d2059c08170375c9  apps/web/test/publish-import.test.ts
8fa535ca5d78d467cb150ae926a744265a88ba3250267614cd41039ad4406c52  packages/runner/src/publish-preview.ts
```

H12b2 still must prove trusted root/realpath containment, one fixed no-env child,
bounded output/time/cleanup, actual Vite/Bun loopback binding and route enforcement.
The UI/hosted explanation/native proof follows separately. No standalone policy
function is represented as authentication or a deployed security boundary.

No key, owner file, live discovery, payment, new listener, native browser,
production configuration, ENS/mainnet action or push. H13/H14/session/deferred
G/vendor/PlanI work remains.
