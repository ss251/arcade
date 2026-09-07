# J8C — durable root escrow admission

Continue after [socket correlation](task-8b3c2-report.md). Implement and verify
the actual SQLite Store integration before enabling any HTTP escrow route.
Single-threaded, four workers, one sequential full gate per atomic commit;
no keys, network, spending, deployment, existing policy changes or push.

## C1: atomic inference ownership

- Bind one full verified public context `(chain, escrow, onchainJobId)` to one
  hub job and exact input before dispatch. Retrying that verified request returns
  the existing hub ID; conflicting context and cross-session/legacy IDs refuse.
- Admission atomically inserts its binding and queued job. A current-disk CAS
  permits execution once; admitted/executing/uncertain states never auto-release
  or auto-replay. Only the caller receiving created/claimed authority may dispatch.
  This store does not verify a capability; its caller must first use the guarded
  rail's verification. Public job ID alone is not admission authority.
- Add a reciprocal durable marker on the jobs row. Check both directions before
  legacy boot reaping so a missing binding cannot masquerade as ordinary work.
  Old databases get an additive migration, not a rebuilt or erased jobs table.
- Exclude escrow-owned jobs/receipts from legacy caches/reaper and refuse stale
  legacy writers using current disk. Session reservations cannot overlap them.
  Read copies from current disk; publish nothing before transaction commit.
- Preserve exact JSON input ordering: `hashJson` is order-sensitive, whereas
  the session serializer sorts keys. Scope bigint decoding to known metadata,
  not arbitrary buyer input containing a `__bigint` field. No capability stored.
- Bound row/evidence sizes and retained records. Corrupt/missing metadata fails
  closed; no repair, eviction or release disguised as uncertainty reconciliation.

Verify through actual Store/openSqliteStore with two simultaneously open
handles, restart, exact retries/conflicts, stale writers, rollback, deleted and
corrupt reciprocal rows, input ordering/copy mutation, capacity and volatile
mode refusal. Keep legacy session/store tests. This checkpoint does not provide
terminal receipts, budget HTTP activation or a live proof.

## C2 and D follow

Compose the budget route with capability verification, current listing and
provider checks, limits and the guarded journaled relay. Then8D must atomically
persist terminal job/receipt/action evidence, expose proven refund versus
uncertainty, and update token-gated result wording. The existing legacy result
fallback says "you were not charged"; it must never describe a funded escrow
failure that way. Full root dispatch/pipeline activation follows only with
these guards. Children/sessions/default rails remain unchanged;9 buyer follows.
