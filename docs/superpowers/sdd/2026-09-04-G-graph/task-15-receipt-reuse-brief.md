# G15J — reuse receipt consistency validation (not Plan J arc-native)

Release only Graph client and its focused tests plus plan-owned brief/report/
index/progress. Mechanically extract the existing receipt/log and receipt-block
checks into shared pure helpers, preserving their exact logic and the client's
existing chain check, bounded polling, block request order and failure handling.
Expose one inert supplied-evidence checker for the offline harness. Do not add
an independent second payment policy or new RPC/signing/forwarding behavior.

Normalize indentation only when proving moved-check body equality. Preserve
all existing validity constants, caps, nonce/signature checks, receipt rules
and replay/uncertainty handling. The new wrapper validates canonical expected
payer/transaction/nonce parameters and returns only frozen reference fields.
It checks supplied evidence consistency, not RPC authenticity, independent
consensus, chain acquisition or cache/spending authority. Callers must separately
bind bounded captured source, network, intent and response evidence.

Test the actual client's original synthetic positive/negative paths and the
new pure checker against supplied receipts/blocks with meaningful mismatches.
No key/actual endpoint/operational state/payment. One exact strict check, one
sequential full four-worker gate, atomic commit/main fast-forward, no push.
Live J4/G15 and owner checkpoints remain unchanged.
