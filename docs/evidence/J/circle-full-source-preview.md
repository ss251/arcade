# J12 — full pinned Circle checkout, selected offline preview

Source verification and local ingestion only, September8IST2026, runtime
c5fdb47. No plugin installation, instruction execution, model call, wallet
access, MCP discovery, hub registration, paid listing or live payment.

The public GitHub commit API and a fresh detached clean checkout agreed on
[revision26dc09ea0746a038c969c6f197feee1267f834b5](https://github.com/circlefin/skills/tree/26dc09ea0746a038c969c6f197feee1267f834b5)
and tree d7aac48698e88448de5ead3f7d3d53a0011990e0. Git hooks were disabled.
The actual plugin loader recognized all18 immediate skill folders, its original
Codex-compatible manifest and no component issues. This does not claim all18
skills executed or conform to the portable Agent Plugins1.0.0 manifest.

All25 existing fixture source mappings (23 distinct upstream files) matched
their recorded original Git blob hashes and byte sizes against the checkout.
This independently binds the earlier [two-skill excerpt](../B13-agent-plugins.md)
to the complete source tree, including its documented final-LF normalizations.

The actual native Bun publish CLI selected only pay-via-agent-wallet and
use-gateway, exited0, and returned two previews at proposed price$0.05 each.
That price is not a charge. All19 source files (two SKILL.md plus17 references)
were retained in the preview inventory. No output directory or wallet config
was created; model unset, capabilities empty, secrets empty, source unchanged.
The separate actual handler run agreed byte-for-byte on public projections and
made zero fetch calls under a refusing fetch boundary. The native child used a
clean environment/private HOME and restricted sandbox; its fetch count was not
separately instrumented. The child was bounded to15s/512KiB and reaped at exit.

The [machine-readable record](circle-full-source-preview.json) preserves full
inventory, stable listing IDs, exact scope and public-projection SHA256:
3749b8f550d807521c6f94ef80daef36d9bc2977eb7482457a1da19672d51dc5.
The checkout is temporary local source, not committed or installed.

## Reproduce without executing the skills

Use a fresh owned directory, not an existing checkout to overwrite:

```sh
gh repo clone https://github.com/circlefin/skills.git ./circle-source -- \
  --no-checkout --filter=blob:none --depth=1 --config core.hooksPath=/dev/null
git -C ./circle-source -c core.hooksPath=/dev/null fetch --depth=1 origin \
  26dc09ea0746a038c969c6f197feee1267f834b5
git -C ./circle-source -c core.hooksPath=/dev/null checkout --detach \
  26dc09ea0746a038c969c6f197feee1267f834b5
bun --no-env-file --no-install packages/runner/src/cli.ts publish \
  ./circle-source/plugins/circle --skill pay-via-agent-wallet --skill use-gateway \
  --json --out ./circle-preview
```

Selecting only skills avoids the real MCP endpoint. Keep the full preview
local. Do not run source instructions or add --server/--yes/start merely to
recheck this evidence. The selected upstream folders do not contain the
repository-level Apache license: retain that license and required attribution
separately before any redistribution. The committed excerpt includes these
copies and NOTICE records; a raw full-checkout preview does not add them.

Task12's two live paid listings remain NOT_RUN. J4 live remains paused, and
this source-only success does not bypass the Circle Gateway validity mismatch,
J5 timing prerequisite or J6 deployment/treasury blockers.
