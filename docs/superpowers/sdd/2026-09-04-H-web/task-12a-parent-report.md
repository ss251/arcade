# H12a canonical CLI preview — parent report

2026-09-06 after H11 `eb57aff`/`348dec1`. Root-only implementation and
self-review under the machine-load limit. [Brief](task-12a-brief.md) preceded source.
No completed wizard, hosted process authority or independent review is claimed.

## Contract reconciliation

The historical B9 mismatch explicitly leaves discovery/selection/JSON resolution
to H. Current MCP/OpenAPI discovery yielded multiple names/prices, not the singular
public/private shape the literal H12 sample assumes. This narrow integration
change adds a documented generated batch and reuses one pure canonical formatter
for directory and generated manifests; it does not choose an arbitrary first tool.
B is merged and no concurrent writer owns the CLI. All unrelated interfaces stay.

Directory JSON retains its shape and core toPublicListing projection. Generated
JSON returns version1/kind generated/source mcp or openapi/written false/target/
entries/skipped. Each entry has the same canonical projection and a hypothetical
unwritten output path. Whole-batch schema, publishability, positive price and ID
uniqueness are checked before stdout. Read-only MCP filtering and explicit selectors
remain; skipped names carry a structured not-marked-read-only reason.

JSON plus --yes/--force or duplicate JSON flags is refused before discovery/read/
write. Flags after -- belong to stdio argv, not the publisher. No generated writer
or discovered tool is invoked in JSON mode. Human preview and explicit file writing
retain their behavior. The shared formatter reads no environment values; private
configuration may itself contain prompts, paths and literal server arguments, so
the full CLI output stays local and is not advertised as safe to publish wholesale.

## Evidence before the sole full gate

-18:01:30 IST: six genuine new-contract failures/68 passes across74 existing and
new CLI tests,8.77s. The actual OpenAPI subprocess refused JSON, not a mocked pass.
-18:03:13:74/74 in8.91s after implementation. No network/service/account key was
used; remote fetch tests have explicit offline preload substitution.
-18:05:42:77 passes and one new helper-fixture failure/78 in10.98s. The fixture
used literal-plan file-read instead of the real read-workdir capability. Only that
fixture value/expectation changed; corrected helper4/4 passed18:06:49 in1.66s.
-Actual bounded no-env subprocess tests cover a local checked-in OpenAPI document
and real synthetic stdio MCP tools/list transport. Both return valid batch JSON
without generated files or runner configuration. Existing later --yes/--force
checks still exercise their owned disposable directories; no owner files touched.
-Additional helper checks preserve directory shape/core projection, keep private
fields out of public, do not resolve declared environment credentials, and refuse
subscription-backed listings. Exact five-root TypeScript program:0 diagnostics.
-39 retained H11/Chat/buyer source/test pins, CSS prefix and public records pass.
No browser runs or extra full gates. Five H12a source/test files frozen below;
the sole full gate result follows.

```text
9e635a0d9e8554d8594a67582578df1587a79b45241ed2ad22c98a62597db0d5  packages/runner/src/cli.ts
5d2361315b14303d6d784da1058a46cd865e52755a834606b04357c894731aa8  packages/runner/src/publish-preview.ts
6d23d581df9a72bf44cd2d2000c9dd67635efe1cd586ce5ce53ee9930ecf3dfc  packages/runner/test/publish-preview.test.ts
acfcc1caa4cfccfdbfa6f2d81f3fa80acd4502a554c5fde77ffbac11380ef5d2  packages/runner/test/publish-cli.test.ts
afb9cad9fb8ba69b377ef945dd41917177ce08f95be045fe186a1cab87556e79  packages/runner/test/publish-cli-integration.test.ts
```

## Sole full gate

Sole full gate36703 exit0 at18:13IST:4,022 Vitest/172 files/54.71s;
834 Bun/54 files/6,093 assertions/163.65s; root/web strict0; client354ms/SSR163ms.
No full-gate retry, concurrent review or browser. Final five H12a and39 retained
H11 source/test pins, public links/privacy and whitespace checks pass. This is
real CLI/fixture evidence, not real upstream discovery or completed browser safety.

H12b remains: strict bounded parsing of actual CLI JSON, contained approved local
targets, no arbitrary subprocess argv, platform refusal, loopback binding/origin
checks, per-process deadline/output caps and cleanup, passive hosted page and native
actual-route evidence. Do not copy the old unbounded spawn/prose parser or assume
empty model tool grants prohibit adapter network/filesystem access.

No keys, live remote discovery, payments, owner configuration, ENS/mainnet or push.
