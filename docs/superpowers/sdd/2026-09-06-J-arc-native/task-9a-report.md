# J9A — offline buyer intent and pre-create deployment facts

Implements the first checkpoint of the [buyer brief](task-9-brief.md).
Task9 is not yet an executable buyer path. No key, network, signer, journal,
transaction, live configuration or new spending is introduced here.

The existing identity reader now exposes readDeployment before a job exists.
It shares all three full code-hash checks, implementation slot, paused/500bps/
zero evaluator fee/treasury, token/hook allowlists, hook binding, EIP-712 domain,
fresh finalized head and closing canonical block/chain checks with readJob.
It never reads job zero or predicts jobCounter. Historical readJobAt still
requires a fresh finalized head and exact canonical target block; a historical
proof is not current send authority. Existing job read order/shape is retained.

The new offline buyer intent captures independently trusted full identity,
current request/listing call, explicit approved expiry, client, max principal
and total gas budget. Every call field must equal the closed challenge. The URL
must be the exact credential-free HTTP(S) root seller/skill route, without query
or fragment. Provider agent identity is positive; provider/client and
provider/evaluator cannot coincide. The intent retains a secret-derived request
commitment, not the raw capability; nested terms are captured and frozen. Copies
are not accepted by preparation functions; a durable executor will reconstruct
an original intent from its separately private journal.

Arc native and ERC-20 USDC use the same balance at different decimal precision.
The reserve is principalAtomic×10^12 plus the remaining explicitly approved gas
budget, with uint256 overflow refusal. Proven prior gas may reduce the remaining
reserve; principal stays reserved until funding. A separate six-decimal balance
check would double-count available funds. Correct token-emitter logs, not naive
balance deltas including gas, must prove principal movement in the next stage.
[Arc stablecoin model](https://docs.arc.io/arc/concepts/stablecoin-native-model).

Preparation emits only exact createJob/approve/fund calldata with buyer sender,
Arc chain and zero native value. Create requires the full deployment snapshot.
Approval/funding require a fresh exact Open/budgeted job, no pending claim or
submission/settlement, correct provider/agent/description/client/expiry and the
unchanged timeout+600 funding margin. Approval is exact-price from zero allowance;
funding requires exactly that allowance, not an unlimited grant. No automatic
allowance reset is supplied. The runtime must independently read allowance at
the same canonical block and impose cumulative gas/nonce/hash-before-send claims.
Supplied facts and prepared calldata are not signing authority or mined proof.

## Verification and remaining work

Initial scaffold failed on the not-yet-created module. Fixture expectations were
corrected for viem checksum-case output and the actual named deployment reads;
no production safety checks were weakened. Focused123Vitest/5files passed1.57s,
including historical reader/chain/receipt/request regressions. Four-root strict
checking reported zero diagnostics. The sole sequential full gate passed
5,158Vitest/236files in71.73s, 1,237Bun/84files with9,952assertions in191.19s,
root/web strict checks and client/SSR builds. Ten paths/120local links passed
scope/privacy audit; four frozen code/test pins are checked again before commit.

Next9B: actual signed/mined/event/readback proofs, durable private capability and
buyer-action journal, then once-only bounded executor. Next9C: explicit SDK/MCP/
CLI composition and armed-only public health identity, preserving ENS and all
existing rails. J4/J5 live and J6 treasury/size pauses remain. No live evidence,
owner key, payment window/cap/replay change, approval replay, deployment or push.
