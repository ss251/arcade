# J9B1 — buyer transaction and budget-relay proofs

Continue the [buyer brief](task-9-brief.md) after [offline intent](task-9a-report.md).
This is still offline proof code, not a buyer executable or live approval.

- Bind original prepared intent to recovered exact EIP-1559 sender/chain/nonce/
  calldata/value/gas. Capture immutable values before asynchronous verification.
- Match separately fetched mined transaction, successful canonical receipt,
  ordered correct-emitter logs and full identity-checked job at that receipt's
  finalized block. A provisional JobCreated ID is only a lookup hint until the
  full proof binds description, provider agent, client, expiry and deployment.
- Approval proves exact buyer→escrow allowance. Funding proves the six-decimal
  token Transfer and JobFunded plus exact job and consumed allowance; an optional
  exact zero-allowance Approval emitted by transferFrom is not an extra spend.
  Do not count a different native/system emitter as six-decimal principal.
- Independently verify the hub budget relay's mined signed transaction, exact
  provider authorization calldata/signature, successful BudgetSet and full job.
  HTTP budgetTx is not authority. Historical verification does not authorize a
  new send or widen the existing provider deadline/funding margin.
- Return only qualified create/approve/fund/budget proof fields. Never label
  funding as settlement or expose capability/raw signed bytes as SDK evidence.

Tests use ephemeral generated accounts and source-shaped synthetic receipts;
mutations cover sender/chain/nonce/calldata/gas/log/receipt/job/allowance and
post-await source changes. No real keys, RPC or send. Then one sequential full
gate, atomic commit and exact FF. Private journal/executor and SDK remain next.
