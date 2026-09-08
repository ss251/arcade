# G15H — awaited pre-forward payment-intent observation

Release only Graph client and its Vitest/native Bun tests plus this plan's
brief/report/index/progress. Add an optional captured-once pre-forward callback
after the existing validated signing/payload creation and before the original
single paid fetch. Provide an immutable public authorization/domain snapshot
and SHA256 digests of its canonical JSON, query body and encoded payment header.
Never expose the private key, raw signature/header, signer or mutable arguments.

The callback is a trusted private-journal/fresh-balance seam, not a signer-entry
event, proof of forwarding, receipt proof or permission to spend. It may refuse
but cannot rewrite original payment bytes. Await it within the existing overall
deadline and at most5s, with a scoped abort signal. Error/cancellation/timeout
must prevent the paid send and preserve the original signed-uncertainty terminal
state. A late callback completion must never dispatch or allow another query.

Do not change any existing validity constant, timeout cap, attempt/signature cap,
nonce rule, receipt verification or replay protection. Freeze/compare original
reader/RPC/receipt, signer validation, signing call and post-paid validation
segments. No callback configured retains the existing route. Test actual public
synthetic signing with injected/owned-loopback transport, exact hashes/timing,
mutation attempts, callback replacement, rejection, abort, late completion and
no repeat. No real key/endpoint/payment or operational integration is released.
One exact strict check, one sequential full four-worker gate, atomic commit/main
fast-forward, no push. J4 live remains paused and G15 live stays NOT_RUN.
