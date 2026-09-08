# G15G — read-only retained-capture validation

Release only existing harness/test plus plan-owned brief/report/index/progress.
Read bounded existing private capture files; never create, repair, reclaim or
rewrite state. Reuse original current-source binding and response-shape checks.
Require exact manifest, contiguous record names, canonical envelopes/hash chain,
bounded byte/count totals and monotonic nonfuture capture times. Read back the
same bytes/inventory before returning a frozen private snapshot.

Expose whether the claim is present, not a claim that clean close or payment
succeeded. Even an absent claim is not an acknowledged close, receipt proof,
validated result, cache eligibility or authority to clear a reservation. An
interrupted but byte-complete capture can be inspected; corruption refuses.
Raw responses stay private. No CLI dump, key/RPC/consumer/dependency change,
operational root, replay, new spending or existing payment guard modification.

Test owned retained files and a separate read-only child: missing/corrupt/aliased
state, altered/recomputed envelopes, duplicate keys, gaps, source mismatch,
future/reversed times, claim validation, empty/partial captures, immutable nested
snapshots and byte preservation. Bound read acknowledgement5s; synchronous IO
cannot be preempted. One full four-worker sequential gate, atomic commit/main
fast-forward, no push. Live G15 remains NOT_RUN.
