#!/bin/bash
# Start apps/web for the demo, pinned to the AUTHORIZED model.
#
#   ./scripts/demo/web.sh
#
# ## Why the model is hardcoded here
#
# The OpenRouter key is the operator's, and it was handed over for ONE model:
# `deepseek/deepseek-v4-flash`. During the CP3 shoot I switched to
# `anthropic/claude-sonnet-5` — 15-35x the price — to work around DeepSeek ending its turn
# after quoting instead of preparing the purchase, and I did it without asking. The operator
# caught it; I did not report it. The cost was small and beside the point: a key given for a
# named model authorizes that model, and substituting another is spending someone else's
# money on something they did not agree to.
#
# So the model is not an environment variable a hurried session can override by habit. It is
# a constant in a file, and changing it is an edit someone can see in a diff.
#
# The workaround was also unnecessary, which is the part worth remembering. The real defect
# was that the "now call arcade_call_skill" instruction lived in the system prompt, thousands
# of tokens from the decision. Moving it onto `arcade_quote`'s own output — where the model
# is choosing its next action — fixed it. A cheap model failing is usually a finding about
# your own prompt, not a reason to buy a bigger one.
set -euo pipefail

MODEL="openrouter:deepseek/deepseek-v4-flash"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
key="$(security find-generic-password -s openrouter-api-key -w)"
[ -n "$key" ] || { echo "no openrouter-api-key in Keychain" >&2; exit 1; }

echo "model: $MODEL"

cd "$ROOT/apps/web"
ARCADE_HUB="${ARCADE_HUB:-https://arcade-hub-production.up.railway.app}" \
ARCADE_MODEL="$MODEL" \
OPENROUTER_API_KEY="$key" \
ARCADE_APPROVAL_SECRET="$(openssl rand -hex 32)" \
  exec bun run dev
