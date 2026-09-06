# Agent Plugins — pinned Circle ingestion evidence

This checkpoint proves local plugin ingestion and read-only MCP discovery, not
wallet execution, paid service availability, settlement or full Circle plugin
installation. Runtime base72b40a0; fixture revision
26dc09ea0746a038c969c6f197feee1267f834b5, pluginversion1.4.0.

## Pinned fixture and offline proof

The [fixture](../../packages/runner/test/fixtures/circle/NOTICE.md) is a two-skill
excerpt from the [pinned Circle plugin](https://github.com/circlefin/skills/tree/26dc09ea0746a038c969c6f197feee1267f834b5/plugins/circle):
pay-via-agent-wallet and use-gateway, all17 references, the original compatibility
manifest/MCP descriptor/SVG, Apache license and added attribution/source records.
Upstream has18 immediate skill folders; this fixture does not claim all18.

All25 source mappings match their original Git blob hashes and byte sizes:
21 exact copies and four documented final-LF additions (three license copies and
the MCP descriptor). The plugin-creator validator passed without rewriting the
upstream manifest. No fixture instructions were executed.

Observed offline verification:110 tests/four files/3.00s, including native Bun
CLI preview, two fresh local listing trees and singular read-back. Both skills
retain every reference, license and NOTICE. SKILL.md bytes are unchanged;
generated manifests have no implicit credentials, model or tool capabilities.
Selecting only these skills makes no MCP discovery request. Exact test-root
TypeScript diagnostics:zero.

## One live read-only discovery session

2026-09-06T19:51:54.856Z–19:51:57.240Z (Sep7 01:21IST), the actual
preparePluginPublish handler processed --server circle with the pinned fixture,
default read-only filtering and write-free options. The standard MCP transport
used https://api.circle.com/v1/codegen/mcp. This was the handler path, not a
separate claim of a live native CLI subprocess; native CLI behavior is covered
by the offline tests above.

| Request | Result |
| --- | --- |
| POST initialize | HTTP200 |
| POST notifications/initialized | HTTP202 |
| GET optional server stream | HTTP405; ordinary tool discovery still succeeded |
| POST tools/list | HTTP200 |

Four fixed-tool listing candidates, each credential:none and local default
price$0.05 (a proposed listing price, **not a charge**):

- search_circle_documentation
- get_circle_product_summary
- list_available_coding_resources
- get_coding_resource_details

No skipped components, no warnings, no tools/call, no output directory. These
tools carry server-declared read-only annotations; that is not a security audit
or proof that executing them succeeds. Their bodies were not called.

The consuming process had a cleared environment and fresh private HOME. A
fetch boundary allowed only the exact endpoint, metadata/session methods,
redirect:error and finite method/request counts, with a45-second process limit.
Credential headers and other endpoints/methods were refused; zero refusals
occurred. No model API, Keychain, wallet, payment, terms acceptance, plugin
installation, hub registration or production operation was performed.

A separate observer at19:52:30.242Z confirmed the owned process was absent,
the ten-event journal had0600 permissions in a0700 directory, and the proposed
output directory was absent. Journal SHA-256:
5370cb39e4e333a115fc9b26a2fb23b28ec9578521f8b8f84f7fd2fedc8aea60.
The raw journal stays private; no session headers or raw server bodies were
recorded. This is a post-exit check, not continuous process supervision evidence.

## Reproduce the appropriate scope

From the repository, offline and write-free:

```bash
bun --no-env-file packages/runner/src/cli.ts publish \
  packages/runner/test/fixtures/circle \
  --skill pay-via-agent-wallet --skill use-gateway --json --out ./circle-preview
```

Read-only remote metadata discovery is a separate network action; do not rerun
it merely to verify this historical evidence:

```bash
bun --no-env-file packages/runner/src/cli.ts publish \
  packages/runner/test/fixtures/circle --server circle --json --out ./circle-preview
```

Keep the complete preview local. Review explicit provider/capability contracts
before any --yes generation or serving. See the [ingestion guide](../agent-plugins.md).
PlanJ's full18-skill checkout and two live paid listings remain separate, not run
by this evidence. Earlier B13 model proofs and consumed approvals were not replayed.
