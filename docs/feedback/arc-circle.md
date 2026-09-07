# Arc / Circle — integration feedback draft

Prepared September8,2026; not sent. Suggestions arise from ARCADE's recorded
integration, not a claim that every developer or current SDK has these issues.

## Make negotiated time limits inspectable before signing

Circle's current [x402 explanation](https://developers.circle.com/gateway/nanopayments/concepts/x402)
distinguishes negotiation from rail verification and settlement. Our pinned
Circle CLI1.0.0 source review predicts a conflict: Gateway raises the advertised
604900-second timeout to2592000; ARCADE checks the echoed requirements first.
The predicted root refusal is `payment_invalid / requirements_mismatch`, not
the session ledger. No live signed header or actual sent `validBefore` exists
from that paused run. [Precise local diagnosis](../interop/circle-cli.md).

Request: expose the selected acceptance, any SDK-imposed minimum duration and
the server's bound in a no-sign preflight, with a structured incompatibility
reason. Integrators should not discover a policy conflict by broadening an
authorization. Our bounds remain unchanged; root vanilla exact has a different
verification path and is not automatically blocked by this Gateway issue.

## Separate acceptance from spendable credit in examples

The same Circle page explains Gateway batching. Our one approved F1 probe
proved deposit and payment acceptance, but not mined-batch completion or
recipient available credit. F12's twenty-call proof uses fixture external
services and moves no funds. [Dated evidence categories](../evidence/m6-gateway.md).

Request: show a bounded, read-only reconciliation example linking the accepted
transfer identifier, pending/available balances and eventual on-chain evidence,
including unknown and timeout states. Do not teach an uncertain caller to pay
again. This is a documentation request, not an allegation that accepted money
was lost or that our offline transfer UUIDs are Circle transactions.
