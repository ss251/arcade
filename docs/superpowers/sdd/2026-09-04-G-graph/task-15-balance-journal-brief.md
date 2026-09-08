# G15O — reservation-bound durable balance journal

Release only the Graph harness/test and plan-owned brief/report/index/progress.
Consume one original fresh reservation handoff, including failed creation, to
create an exclusive private per-query balance journal. Require the same parent,
original current-source binding, active global writer/head and fresh admission
observation equal to the acknowledged balance. No reopened/copied handle can
resume an old exposure. Reuse the existing five-second local IO checks; change
no existing payment authorization validity constant, cap or replay protection.

Persist canonical bounded admission, pre-forward balance/public intent and
after balance records with immutable hash-chain files, exclusive claim, private
modes, fsync/readback and source/owner checks. Before forwarding, require a fresh
unchanged sufficient balance and the original intent validator. Retain valid
low or unexpected after balances: those facts are not payment success. Failure,
interruption, stale source/owner, re-entry or late acknowledgement poisons the
recorder and retains partial state; never overwrite/retry/refund/reset quota.

Close only a complete three-observation journal with an immutable complete
marker. Claim absence is not proof that the caller acknowledged close. Existing
reservation bytes stay unchanged/unresolved; journal correlation, global budget
reconciliation, consumer integration and no-key historical replay remain next.
Use owned synthetic state/children only, one sequential four-worker full gate,
one atomic local commit/main fast-forward; no operational root, key, RPC,
endpoint, signing/payment, new live authority or push.
