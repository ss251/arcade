> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H integration — parent checkpoint, September 6

H7 committed974c02e after one full gate (2395Vitest119/325Bun31/3735assertions,
root/web strict0,client359ms/SSR170ms) and source/browser/publication acceptance.
Its exact historical fixture copy retains the original two terminal LF bytes;
default staged diff-check stopped there. A command-scoped blank-at-eof exception
passed without changing the audited copy. No global Git configuration changed.

Rebased all seven H commits onto main5259f9a, which contains the owner Pagesfix
8b8e8e5 and17 G commits. H now616ce5e. Rebase range mapping:
e09e368→4333e77,d746f56→1d700ac,46d8e1a→28ef383,d1f89f6→a8174ac,
031d6c9→b2ebe32,b0a230d→8ea32fc,974c02e→616ce5e. Last four patches
range-diff '='. H1 combined F reference helpers/session boolean/kind projection
with H's explicit whitelist; preserved F Store guard and defensive reads around
H ordinary upsert/statsSource. H2 retained both import groups; H3 uses F's same
ASCII-safe constant-time token helper and retains all session route handlers.
Execution index preserves main's F row plus H. No squash, push or main change.

Root inspected complete main→H server/store diffs. Only approved H read-route,
safe catalog pay-test projection, statsSource and guarded ordinary upsert were
added. SQLite/session handlers/reference helper remain identical to main.
Pages config hash remains ec9d4b1ab31167c8d857454de03ad087f60940d2acce36390281aea9e5c14186.

Added two memory/disk Store integration tests using genuine local session API
admission/release. Ordinary duplicate upserts retain one current row; stripping
a session marker cannot overwrite the session-owned job, adding one to another
row cannot invent membership, and terminal pair/accounting remain unchanged.
First memory case passed; disk case failed only on an unjustified mixed-lane
iteration-order assumption. Corrected test compares canonical job-ID order;
production stayed unchanged. This is a fixture correction, not a product Red.
Focused result2PASS/14assertions. Broader focused result194Vitest/6files and
43Bun/1file/202assertions PASS, including bounded owned subprocess death/reopen
fixtures. These are offline accounting observations, not live Gateway evidence.

Root frozen-lockfile install --ignore-scripts passed after rebase; no lockfile
change or secret environment loading. Feed/fixture and H3/H4 provenance reviews
remain separately in flight. Full integrated gate, public record and commit
remain pending. No H8 source, G8 implementation, credential, payment or deployment.

Exact root-config strict check of the new nested Bun test caught three diagnostics
from using ES2023 toSorted against this project's ES2022 library. Replaced only
the test's sorting expression with a copied-array sort; production is unchanged.
The prior iteration-order failure and this test-only type issue remain recorded.
Corrected exact nested strict0 and two cases/14assertions passed. Production unchanged.

Worker's direct Bun-hosted Vitest invocation reported6 unchanged receipt-reference
manifest mock failures. Root isolated canonical installed CLI passed48/48, then
same combined receipt-reference/feed/public-feeds suites passed114/3. Installed
vitest.mjs declares #!/usr/bin/env node; worker had directly executed its JS in
Bun instead of the project's Node-shebang path. Both invocations are retained as
distinct runner evidence; no helper/config/test correction or product defect
is inferred. Final full gate will use the canonical project's script once.

The sole full integration invocation collected3253Vitest tests/142files:
3252passed and1failed, all receipt-reference48 passed. Failure was existing
session-pipeline duplicate-child fixture: two ordinary putReceipt calls now
upsert one row, so the intended corrupt duplicate never reached the pipeline.
Corrected only the fixture to inject a second row into its read facade, explicitly
asserting real Store1row versus injected2rows. All original refusal/no-settle/no-
output/released-accounting assertions remain. Production code unchanged. Focused
pipeline repair and previously unexecuted Bun/type/build stages follow; no second
full Vitest invocation is planned under the one-full-gate-per-commit constraint.
Corrected full session-pipeline focused suite48/48 PASS; exact two changed nested
tests strict0. All production and other test files remained frozen.

The first Bun sweep reported768pass/2fail/2errors,5806assertions across53files:
the separate subgraph toolchain had not been installed in this newly rebased H
worktree. Both errors were module-resolution setup failures in schema/ABI checks,
not executed assertion failures. Root workspace installation did not include that
separately locked package. Installing subgraph's existing frozen lock with scripts
disabled, then rerunning only the two affected suites and remaining strict/build
stages; no second full Bun sweep or source/dependency-version change is planned.
The two previously uncollected suites passed55/55 with111assertions after the
separate frozen install. Root/web strict passed, followed by actual production
client334ms/SSR145ms builds. Both lockfiles unchanged. The initial full invocations
were not retroactively relabelled green: one focused48-test fixture repair and
55 previously blocked schema/ABI tests complete their coverage, without repeating
either full sweep. No production correction followed the source freeze.

Parent fully read both six-path author reports and the independent server/store
review, then the complete final14file source/test diff. No additional source issue
found. Three public copies verified byte-exact under the388B historical banner;
only two owner-home strings in the provenance report were substituted. Four local
links valid/no targeted private material. Final entry-point updates and this fourth
historical parent copy follow under the same policy; original reports stay frozen.

Root test pins: session-pipeline35b177fc63a98e6ba4222ea47dbc8eda4086b4536bafdbfeaf0a2eff820c2c5b;
sessions-storebf8c3fda00c0a617550f4fc401c7f293bed0982f5ec59e3739428edc5463f501.
No actual browser rerun was needed: H7's six rendering/fixture pins are unchanged;
this is source/SSR provenance integration, not additional visual or live evidence.
H8 listing-page implementation is next after the atomic follow-up commit.
