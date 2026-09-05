# Plan F — execution records

F1's approved single live probe **passed** deposit, verification, accepted transfer
and exact buyer-debit checks. Recipient credit is pending batch, not available or
independently mined. F2–12 code work is unblocked; no extra live allowance is implied.

- [Approved plan](../../plans/2026-09-04-F-gateway-sessions.md)
- [Design specification](../../specs/2026-09-04-ethonline-continuity-design.md)
- [Original work order](../2026-09-04-A-settlement-core/work-order.md)
- [Task 1 brief](task-1-brief.md)
- [Task 1 local implementation report](task-1-report.md)
- [Task 1 single live run and pending-batch limits](task-1-live-report.md)
- [Task 2 brief and approved signing/request-copy policy](task-2-brief.md)
- [Task 2 original implementation checkpoint](task-2-report.md)
- [Task 2 initial independent review and reproduced findings](task-2-independent-review.md)
- [Task 2 correction follow-up and focused verification](task-2-independent-followup.md)
- [Task 2 parent correction and publication review](task-2-integration.md)
- [Task 3 brief and process-local settlement limits](task-3-brief.md)
- [Task 3 implementation and transport evidence](task-3-report.md)
- [Task 3 parent source review and independent focused reruns](task-3-parent-review.md)
- [Progress](progress.md)
- [Gate evidence and owner prerequisites](../../../evidence/m6-gateway.md)

Only reviewed execution artifacts are published. Private research, keys, owner
handoffs, live journals and runtime state remain excluded. Later evidence must
supersede a dated checkpoint explicitly, not silently rewrite it as a live PASS.

F2 source and focused correction tests are frozen. Parent source/correction and
public-copy review are CLEAN, with independent reruns and the full repository
test/root-web strict gate passing; F2 is committed as `02b6921`. The follow-up supersedes the original Blob replay and
Gateway paid-error findings; original reports remain historical. F2 is offline
authorization/request-boundary evidence, not another payment or batch proof.

F3 source and public-copy review are CLEAN within the process-local rail scope,
with focused worker and parent checks passing. Its own full repository test and
strict gate passed; the atomic commit is next, after F2. Gateway UUIDs identify accepted transfers, not
mined transactions or withdrawable credit. Durable reservations and held uncertain
outcomes remain F5–8 work before live sessions.
