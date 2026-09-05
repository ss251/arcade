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
- [Progress](progress.md)
- [Gate evidence and owner prerequisites](../../../evidence/m6-gateway.md)

Only reviewed execution artifacts are published. Private research, keys, owner
handoffs, live journals and runtime state remain excluded. Later evidence must
supersede a dated checkpoint explicitly, not silently rewrite it as a live PASS.

F2 source and focused correction tests are frozen. Parent source/correction and
public-copy review are CLEAN, with independent reruns and the full repository
test/root-web strict gate passing; the atomic F2 commit is next. The follow-up supersedes the original Blob replay and
Gateway paid-error findings; original reports remain historical. F2 is offline
authorization/request-boundary evidence, not another payment or batch proof.
