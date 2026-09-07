# J5C2 — Pending-batch response compatibility

The actual keyless finalized preflight at2026-09-07T02:45:21.023Z found the
approved owner's19.61USDC, the delegate's19.496425USDC, zero owner Gateway
balance/allowance and no delegation. Mint authority is zero and USDC recognizes
the Minter. These are prerequisites, not newly funded balances.
[Public preflight](../../../evidence/J/unified-owner-preflight.json).

The real balances API includes pendingBatch alongside balance. The new Unified
runtime previously rejected this known metadata field at the signing preflight.
A real-SDK fake-IO regression reproduced the refusal before the source fix.

The parser now accepts only this additional known field, validates it as a USDC
decimal amount, and continues to compare **balance alone** with amount plus fee.
It does not add pending credit, remove unknown-field refusal or change any
validity, fee/gas cap, replay guard or F11 identity acceptance.

Regression cases cover sufficient available credit with pending metadata;
pending-only credit; malformed pending metadata; and an unknown balance field.
All negative cases refuse before key acquisition/transfer/mint. Tests use local
ephemeral fixture keys only. Focused11Bun/108assertions/1.76s and two-rootstrict0
PASS. Sole frozen59093 full gate PASS:4,825Vitest/214files/68.09s;
917Bun/61files/6,579assertions/171.96s;root/web strict;client494ms/SSR203ms.
Six-path/27local-link scope/privacy audit passed and both code/test pins remained
unchanged. Final audit/atomic commit/exact one-commit fast-forward follow.

J5C grant/deposit/spend/payment/harness remain unrun. Source-identity reproduction
is merged29e8f1e, but observed balances and SDK-return status do not establish
independent delivery or source debit. The next checkpoint is the owned live
harness with reviewed identity enforcement and receipt/API reconciliation.
