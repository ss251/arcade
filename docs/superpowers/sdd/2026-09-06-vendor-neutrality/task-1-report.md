# Vendor neutrality Task 1 — wording report

September 6, 2026; base d57a7e3. Root self-review only, no independent agents or
parallel gate under the owner's shared-machine rule.

## Scope and provenance

README, seller guide, publishing page, CLI help and engine-format comments now
name Agent Skill (open standard), linking the
[Agent Skills specification](https://agentskills.io/specification). That primary
page was read September 6 through agent-reach's web reader and directly: name
and description are the required frontmatter fields. Documentation distinguishes
ARCADE's non-empty scalar checks and instruction-body requirement from full
specification validation. No parser behavior, naming constraint, YAML feature or
execution permission was added.

The requested Codex/ChatGPT/Cursor/Copilot/Gemini CLI/Claude Code sentence includes
client setup/tool caveats. This is format portability wording, not six live
compatibility runs. The current skill adapter still uses claude-agent; model
names, provider SDK names and actual CLI commands retain their identities.
The later free-route proof must distinguish two API adapters from two underlying
model vendors; both currently approved routes target GLM.

Eleven format-description lines across five existing public historical files
were normalized, each with a dated terminology note. The old B4 report retains
commit26434f1 with a labeled scope description, not a falsified subject quote.
Private originals and Git history remain unchanged. Plans remain historical,
including their existing implementation deviations and command examples.

## Tests and no-behavior check

Three failure-first tests genuinely failed on missing text: actual offline Bun
CLI help and React renders of both enabled/disabled publishing states. After
copy changes,37 focused tests across four files passed in875ms, including existing
skill-engine and publication-preview cases. No provider, credentials or wallet
were supplied to help/render tests.

The first exact strict probe incorrectly applied web-only ambient types to
server CLI dependencies and reported15 diagnostics (missing Bun and resulting
unknown values). Correcting the probe, not source: four server roots under the
root config and two web roots plus its ambient declaration each passed with0
diagnostics.

AST comparison confirms the two engine-source changes are comments only.
Removing exactly the new help paragraph reproduces the original CLI bytes;
removing exactly the new publishing paragraph reproduces original web bytes.
Seven manifest, engine, execution, introspection, style and lockfile contracts
also remain byte-identical. No control flow, grants, model, pricing, payment,
schema, preview authority or CSS changed.

## Native page check

The existing H8 synthetic fixture served the actual /publish page with publishing
disabled. One fresh Chromium151 headless shell (two-renderer bound), exact owned
harness and isolated profile/cache/runtime passed1280px light and390px dark cases.
AX specification link, exact provenance paragraph, disabled controls, contained
page/paragraph and no private marker passed. Both screenshots were viewed and
confirm legible contained copy; screenshots/runtime logs stay private.

No external specification link was visited in the browser, no preview was run,
and the synthetic hub recorded zero detail/receipt/name/other reads. No key,
discovery, model, wallet or payment call. All five exact owned PIDs and three
listeners were independently checked closed, with0 remaining profile processes.
Browser cleanup completed before the sole full gate.

## Gate

The sole full invocation (14540) passed 4,285 Vitest tests across 193 files in
61.84s, then Bun recorded 784 passes /6,003 assertions and two collection errors
in 167.75s. The new worktree had root dependencies but omitted the separate
subgraph toolchain, so schema/ABI suites could not import their pinned packages.
This invocation exited1; it is not labeled a clean full-gate pass.

After it stopped, the subgraph's unchanged frozen Bun lockfile was installed
with lifecycle scripts disabled. Only the two uncollected suites were run:
55 tests /111 assertions passed in283ms. The previously unreached root/web strict
and client/SSR build steps then completed0 in command32408; the retained build
output includes SSR171ms, while the client timing was truncated. Source and both
lockfiles stayed unchanged. All gate suites thus completed across the original
run and targeted continuation (784 +55 Bun tests), without a second full sweep.
This fresh worktree excludes G's private untracked test artifacts, so its Bun
count is not expected to equal that other worktree's prior gate.

The final audit passed20 frozen G8/G9/web/wording source pins,18 scoped paths,
five local links in the new record set and public-addition privacy checks.
The AST/byte preservation checks above passed again. A scoped atomic commit and
one-commit main fast-forward follow. No push or duplicate main gate. H10/H14
owner acceptance items remain separate; Task2 openai-api and Task3 plugin
ingestion are not implemented by this wording commit.
