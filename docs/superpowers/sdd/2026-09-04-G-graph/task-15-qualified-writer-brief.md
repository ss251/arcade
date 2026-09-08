# G15R — opt-in qualified reservation writer

Release only the Graph harness/test and plan-owned brief/report/index/progress.
Mechanically factor the existing writer behind its unchanged public wrapper.
Add a separate opt-in constructor accepting an original current-source manifest.
Before acquiring a claim, require existing fully qualified or empty state;
revalidate after acquiring its exclusive claim. Keep opening acknowledgement
within the existing five-second local IO budget, retaining uncertain claims.

Under that claim, each state read must compare the canonical ledger/head state
to a fresh qualified global view of exactly the same ledger. Only derived
unresolved count changes after complete evidence; preserve every quota count,
all head/journal bytes, unique-query restriction and original reservation guard.
No mutable paid/refund override, reset, recovery/takeover or cap/validity change.
The original raw writer still blocks on raw unresolved rows.
Reject orphan query/balance/cache artifacts before a new reservation and require
its admission balance to equal the previous qualified after-balance. Expose that
immutable last observation in the readonly view for this opt-in continuity check.

Exercise two actual reservations in one owned offline namespace, original
handoffs, real journal/cache/reader code and declared synthetic protocol data.
No fixture relocation/rehashing in this positive sequence. Test unknown and
corrupt evidence, source changes, reopen, contention and retained failure.
This remains an offline library seam, not configurable live budget authority.
Use one sequential four-worker full gate and one atomic local commit/mainFF;
no operational root, real key/RPC/endpoint/payment, approval replay or push.
