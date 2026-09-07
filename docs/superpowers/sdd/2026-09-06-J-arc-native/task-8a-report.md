# J8A — strict escrow socket data contracts

Implemented the first boundary in the [Task8 brief](task-8-brief.md): separate
EscrowBudgetRequest/EscrowSubmitRequest, corresponding signed replies, and a
fixed EscrowAuthorizationRefused shape. Existing core hub/runner unions now
decode/encode those messages; daemon/server handlers are still absent, so no
message triggers a signature, payment or inference at this checkpoint.

Requests have a nonzero32-byte request ID and full public action context;
submit additionally names the actual hub job and output commitment. Replies
carry request ID, escrow/job ID, canonical uint72 nonce, deadline and65-byte
signature. The current ten-minute provider-signature validity is not changed;
wire syntax alone does not prove freshness, authority or signature validity.
Caller claims remain untrusted until8B's local policy/socket binding checks.

Nested records reject all unknown fields, getters, class instances, arrays,
cycles and bounded-depth/size violations. Addresses/hashes are canonical
lowercase; zero identity/hash values, wrong chain/token, lossy integers and
overflow quantities refuse. Signature errors have a fixed wire refusal string.
The typed Schema composition accepts unknown input before the validating Struct;
its type-compatibility option does not disable runtime validation or strict
excess-property rejection. Existing Hello v2 and legacy tolerant decode remain
unchanged. New messages cannot carry a capability, raw input/output or keys.

Payment helpers convert the actual immutable action context to/from decimal
wire quantities without losing uint256 precision. They recapture semantic facts
and return frozen values with fixed errors. Parsing/conversion is not verifying
a chain snapshot or granting action authority.

TDD began with missing modules. The first focused run passed, while strict
checking found an Unknown→Struct generic composition error; the supported
composition overload corrected typing and retained all refusal tests.
Focused36Vitest/3files passed, including15new socket/context cases and21existing
Hello cases. No owner keys, RPC, signing, spending, deployment or push occurred.
Final seven-root strict checks passed with zero diagnostics. Sole gate18650
passed:4,998Vitest/226files/70.00s,973Bun/72files/7,643assertions/174.09s,
root/web strict and client/SSR builds. Seven code/test pins remained frozen;
13-path scope/privacy audit and80local links passed. No gate replay.

Next8B implements runner signing and original-socket correlation (broker job
ownership currently disappears at JobResult);8C adds atomic durable hub admission;
8D wires root dispatch/pipeline/refund-or-uncertainty receipts; then Task9. J4/J5
live and J6 treasury/size checkpoints remain paused. No activation claim.
