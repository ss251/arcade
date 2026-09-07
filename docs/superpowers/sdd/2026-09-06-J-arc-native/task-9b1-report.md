# J9B1 — exact buyer transaction and budget-relay proofs

Implements the [proof brief](task-9b1-brief.md) after [J9A](task-9a-report.md).
This remains offline verification, not an executable buyer, live funding or
spending authority. Private durable journal/runtime and SDK composition remain.

## Binding and evidence

Original frozen prepared actions bind a recovered buyer signature to exact
EIP-1559 sender, Arc chain, nonce, zero value, recipient, calldata, bounded gas
terms and empty access list. The shared evaluator/buyer wire verifier captures
intent fields before asynchronous address recovery, refusing accessors. Buyer
gas terms cannot exceed the intent's total explicit cap; the forthcoming journal
must also enforce the remaining cumulative budget. Copied action/signed results
are not accepted as originals; reconstruction re-verifies private raw bytes.

A separately fetched mined transaction must match the signed hash, sender,
recipient, nonce, value, calldata and canonical receipt block. Receipts must
be successful EIP-1559 calls, not deployments, and use bounded proven gas.
All log metadata is captured, bounded and validated, including ordering and
transaction/block identity. Token/escrow/hook logs must match exact expected
events. Other emitters cannot substitute for those events.

JobCreated yields only a provisional lookup ID. Its event omits description and
providerAgentId; the full identity-checked canonical getJob readback must match
both, together with client/provider/evaluator/hook/expiry and the exact Open
zero-budget state. Approval proves exact token allowance to the escrow, while
funding proves the correct six-decimal token Transfer and JobFunded, Funded
job state and consumed allowance. An optional exact zero-allowance Approval
from transferFrom is allowed only before JobFunded. Duplicate, extra or changed
scoped events refuse. Native/system-emitter transfers do not count as principal.

The hub budget relay is verified independently of its HTTP hash. Reconstruct
signed bytes from the separately fetched mined transaction; verify evaluator
sender, exact provider EIP-712 signature/call/nonce/deadline/empty opts, successful
AuthorizationUsed and BudgetSet, and full canonical Open/budgeted job. Historical
provider validity is checked at the receipt timestamp using the existing window;
it does not grant current send permission. Input facts are captured before async
signature verification, so later mutations cannot alter the proven projection.

Public proofs identify intent/job/chain/escrow, canonical transaction/block,
gas payer/amount and actual funded principal. They contain no capability or raw
signed bytes and do not label create, approval, budget-setting or funding as
settlement. Facts still require independently trusted reader/RPC provenance;
pure proof functions do not themselves establish network honesty/finality.

## Verification and next work

The initial scaffold failed on the absent proof module. Focused166Vitest/6files
passed1.88s, including existing action/reader/chain proofs. Five-root strict
checking reported zero diagnostics. Tests use only generated ephemeral accounts
and source-shaped synthetic receipts, no real RPC or transaction sends. Mutation
coverage includes signer/relayer/provider signature, calldata, gas, chain, nonce,
receipt/log metadata/order/duplicates/emitters, full job state, allowance, original
object ownership and changes during async verification. The sole sequential full
gate passed5,204Vitest/237files in72.30s and1,237Bun/84files with9,952assertions
in189.90s, then root/web strict checks and client/SSR builds. Eleven paths and
126local links passed scope/privacy audit; five frozen code/test pins are
checked again before the atomic commit and exact-one main fast-forward.

Next9B2: private durable capability/transaction journal and once-only bounded
buyer driver, preserving uncertain outcomes and accepted result tokens. Then9C
actual SDK/MCP/CLI and independently pinned health checks. J4/J5 live and J6
treasury/size pauses unchanged. No existing validity/cap/replay change, owner key,
spending, live configuration, deployment, approval replay or push.
