# J5C preflight — canonical RPC URL correction

The first two actual keyless runtime status reads returned read_unavailable
before any key or monetary action. The diagnostic read observed HTTP200 for
eth_chainId, JSON content type, no compression,44bytes. A separate bounded
unsigned probe confirmed the exact requested URL was https://rpc.testnet.arc.io
while Bun's response.url was https://rpc.testnet.arc.io/ and its JSON result
was0x4cef52. The existing F11 bounded wire compared these literal spellings.

One source change compares response.url to new URL(requested).href. It does not
accept redirects, changed hosts, schemes or paths. All existing body/deadline,
identity, validity, gas/fee and replay controls remain intact.

Regression: canonical-root case failed before the fix; adversarial URL/redirect
cases passed. After the fix53Bun/2files/254assertions/3.21s and two-rootstrict0
passed, including the existing funding runtime and actual Unified Balance SDK
fixture. A test-only Bun fetch.preconnect type stub was corrected before freeze.

At2026-09-07T02:14:28.768Z the corrected runtime's keyless live **read**
returned status none for the exact approved owner/delegate on Arc testnet.
eth_chainId and eth_call each returned HTTP200; zero key acquisitions or
monetary actions. The [public preflight](../../../evidence/J/unified-delegate-preflight.json)
is prerequisite evidence only, not a grant/funding/payment or compiled-source
match. The [5C brief](task-5c-brief.md) records the remaining sequence.

Sole frozen full gate37717 PASS:4,825Vitest/214files/67.42s,
902Bun/60files/6,526assertions/174.27s, root/web strict checks and
client395ms/SSR195ms builds. Both source/test pins remained unchanged. The
seven-path scope/privacy and27local-link audit passed before the gate; final
audit and atomic commit follow. No J4 policy change, live grant/deposit/spend/
payment, agent, mainnet action or push.
