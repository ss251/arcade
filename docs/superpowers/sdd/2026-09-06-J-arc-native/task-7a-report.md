# J7A — offline escrow facts and provider signatures

Added source-shaped ABI, strict job/receipt codecs and provider SetBudget/Submit
authorization helpers. Exports do **not** install or advertise an escrow rail.
No chain client, RPC, Keychain, wallet discovery or broadcast exists in these
helpers. Task7B runtime/relay, Task8 request/admission/pipeline and Task9 buyer
lifecycle remain unimplemented.

## Source alignment

A local comparison against the pinned Solidity0.8.28 compiler output matched
all28escrow ABI entries: selectors, parameter/tuple/output types, mutability
and indexed-event layout. The comparator initially distinguished absent
`indexed` from explicit false; normalization corrected that representation
difference. Parameter names are not selectors. Source review established that
JobCreated has six fields and omits description/agent id; read getJob for them.
BudgetSet's token is indexed.

The named Job tuple round-trips through real ABI encoding/decoding. Funded facts
require exact amount/token/provider/evaluator/hook/agent/request description,
nonzero client, expiry at least listing timeout plus600seconds, no prior submit,
no settled amount/pending claim and no payout redirection away from provider.
These checks are **not caller-ownership proof or durable duplicate prevention**.
Task8 must establish those separately before any execution.

Fee quoting matches upstream floor division at500bps, including zero rounded
fees on tiny amounts and the checked uint256 multiplication bound. It does not
change existing FeeSplitter rounding. Receipt tuple encoding requires coherent
empty/nonempty tree data and a nonzero receipt commitment. The versioned
pre-settlement receipt projection itself is still a Task8 obligation, not
provided by this codec.

Provider authorizations use ERC8183/1, exact source type fields, hashed empty
optParams, nine-byte uint72 randomness and signer/24zero-bit-padding/nonce
packing. The plan's new fixed ten-minute provider-action window is separate
from every existing payment/session window, all unchanged. Real local EOA
signature recovery precedes calldata construction. No relay is sent; the later
executor must recheck time, nonce, job and deployment immediately before relay.
Contract-wallet provider signatures are not claimed supported by this helper.

## Verification

TDD began with missing-module failures. One test-label formatter tried JSON
serialization of BigInt and was corrected before those cases ran; this was a
test harness error, not a product failure. Focused26Vitest/2files/394ms and
six-rootstrict0PASS. Cases cover expiry boundaries, all status/identity/amount
refusals, getter-safe decoding, fee arithmetic, exact tree tuple, independently
assembled EIP-712 hash, real signature recovery and signed-message mutation.

Sole frozen99429 fullgatePASS:4,851Vitest/216files/66.77s;
964Bun/69files/7,319assertions/173.45s;root/webstrict;client343ms/SSR177ms.
Initial11paths/50links/privacy0, six frozen code/test pins. The final audit also
includes one new documentation-only [Arc size simulation record](../../../evidence/J/erc8183-estimate.json).

At05:26:59UTC, two unsigned read-only RPC requests (chainId plus eth_estimateGas)
confirmed chain5042002 and returned error-32003,`revert: CreateContractSizeLimit`
for the pinned via-IR creation bytecode. No state override, key, signature,
broadcast, deployment or paid call. This corroborates J6's local size failure;
it is not a J4 payment refusal. Arc's [published EVM differences](https://docs.arc.io/arc/references/evm-differences)
do not document a larger code-size allowance; the actual node response, not an
inference from generic Ethereum compatibility, supports this blocked simulation.

After commit/exactFF, continue7B then8/9 offline. J6 size/treasury checkpoint and
J4/J5 live pauses remain; no real keys, money, existing caps/replay changes,
subagents or push.
