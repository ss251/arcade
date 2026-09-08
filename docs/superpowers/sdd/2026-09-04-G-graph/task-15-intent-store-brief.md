# G15I — durable private forward-intent capture (not Plan I packaging)

Release only existing harness/test and plan-owned brief/report/index/progress.
Connect the new pre-forward callback to an exclusive private forward.json file
inside a query capture. Validate fixed payer/domain/token/payee/amount/query and
canonical public authorization/digests, anchor it after the initial three client
responses, and fsync/read back before acknowledging. Retain partial files/claim
on errors, re-entry, cancellation or deadline; never overwrite or retry.

This is one additional fixed metadata file, not another response/payment slot:
keep32 response slots,16MiB response total,2MiB response files and original payment
caps/windows/replay guards unchanged. Extend readback for the optional forward
file and exact prefix/next-paid-response/time correlation. Legacy captures with
no forward file remain inspectable, never cache-eligible by that fact alone.
Public authorization is data provenance, not signature/dispatch/payment proof.

No client edits, key/real endpoint access, operational budget, actual payment,
cache success or live approval. Test positive fixtures explicitly as declared
synthetic intent data for the fixed expected payer, not actual signatures from
that owner. Actual-client synthetic-payer mismatch must refuse before paid send;
do not invent a private key or relax the fixed owner policy for test convenience.
Test one-shot storage, exact hashes/readback, corruption and interruption with
owned fixtures. One strict check, one sequential full four-worker gate, atomic
commit/main fast-forward, no push. J4/G15 live pauses remain unchanged.
