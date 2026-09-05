#!/usr/bin/env bash
# M1 evidence: preview the publish adapters, then execute all three by default.
# diff-triage requires ANTHROPIC_API_KEY and its configured ANTHROPIC_BASE_URL.
# The MCP and OpenAPI examples need no provider credentials. Never reload a repo .env.
# For explicitly partial free evidence, pass --only search-arc-docs --only fx-rate.
set -euo pipefail
repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"

echo "── 1. introspect a public MCP server ───────────────────────────────"
bun --no-env-file run packages/runner/src/cli.ts publish mcp://docs.arc.io/mcp --price '$0.02'

echo
echo "── 2. introspect an OpenAPI document ───────────────────────────────"
bun --no-env-file run packages/runner/src/cli.ts publish skills/fx-rate/openapi.json --price '$0.01'

echo
echo "── 3. what leaves the machine, per adapter ─────────────────────────"
for listing in diff-triage search-arc-docs fx-rate; do
  echo "--- $listing"
  bun --no-env-file run packages/runner/src/cli.ts publish "skills/$listing" | sed -n '1,3p;/STAYS ON THIS MACHINE/,$p'
done

echo
echo "── 4. local execution of the selected adapters ─────────────────────"
bun --no-env-file run scripts/e2e-publish-adapters.ts "$@"
