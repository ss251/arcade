# J9B3 — bounded once-only buyer driver and Arc ports

Continue after [private journal](task-9b2-report.md). Compose the actual buyer
lifecycle offline before SDK integration. No live configuration, owner key,
transaction or approval replay; J4/J5/J6 live pauses remain.

1. Capture locally trusted full identity/current listing call, actual stable JSON
   input, closed challenge, buyer, explicit principal/gas/expiry and private
   capability before IO. Require root-only path, HTTPS or explicit loopback,
   distinct buyer/evaluator and an empty one-purchase durable journal. Preserve
   the existing ENS authority gate before any gas/signature.
2. Verify the independently pinned deployment, provider EOA, native balance and
   zero initial allowance at canonical fresh facts. Reserve principal plus
   remaining total gas together. For each create/approve/fund: record exact intent,
   bounded gas/nonce terms, recovered signed hash and attempt before one send.
   Recheck current identity/job/allowance/balance/nonce/time immediately before
   sending. Do not reuse the evaluator-only chain port as a buyer actor.
3. Prove create's actual job ID and full readback. Record one budget HTTP attempt
   before posting the closed input+capability envelope; independently verify the
   returned mined provider-authorized budget relay. Then exact approve/fund and
   their canonical proofs. Read-only receipt polling may back off; sends cannot.
4. Record one root HTTP attempt with the same bound capability after funding.
   Capture the actual closed202 response: job_id, queued status, job_token,
   price and same-origin poll_url. The real token is exactly32lowercasehex;
   preserve existing SDK validation. Persist privately before returning a bounded
   response/public proof summary. Funding is not settlement.

Use existing escrow operation range at most300000ms, bounded per-IO5seconds,
monotonic clock/cancellation and bounded cleanup. Stop on uncertainty with
retained journal ownership, never automatic retry/refund/allowance reset or a
fresh capability. Expose only fixed safe errors; bounded HTTP/RPC readers must
not leak private payloads, result tokens or upstream diagnostics. Concrete Arc
transport remains fixed to5042002 with retries disabled; signer acquisition
checks cancellation and exact buyer address. Reconstruct budget signed bytes
from independently fetched transaction fields/signature, not HTTP authority.

Test coordinator ordering with real private SQLite and synthetic ports first,
then real viem ABI/JSON-RPC over owned fixtures and loopback HTTP. Include changed
facts after signing, nonce/price/gas/time mismatches, request/response tampering,
late completion/cancellation and one-send fences. No live proof or owner keys.
Use bounded atomic checkpoints if needed, one sequential four-worker full gate
per commit and exact main fast-forward, no push. SDK/MCP/CLI/local-pinned health
composition remains J9C; the existing exact/session paths stay unchanged.
