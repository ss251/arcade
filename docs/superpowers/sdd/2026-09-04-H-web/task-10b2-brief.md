# H10b2 — rail-correct browser wallet boundary

After H10b1 `ef44e50`, single-threaded under the owner load restriction.
This small step adds the signing boundary for later active UI/controller wiring;
it does not activate a new payment path or claim completed H10.

## Source-grounded correction

The existing browser signer always uses the USDC domain and validAfter zero.
Actual Gateway verification instead uses the pinned GatewayWalletBatched/1 wallet
domain and bounded backdated validity. Reuse the payment package's existing
requirements classification, gatewayDomain, EIP712_DOMAIN and TRANSFER_TYPES.
Load those environment-selecting modules only inside an explicit signing action,
never through the new helper's passive import. Their selected configuration must
agree with the previously captured H10a context. No challenge-selected deployment
or fallback from malformed Gateway to USDC.

Capture complete closed context/from/options synchronously, before awaiting
module loading or wallet calls. A single bounded overall lifetime includes module
loading, account/chain checks, one eth_signTypedData_v4 request, local signature
recovery and the post-sign account/chain check. No connect/switch, retry, HTTP,
storage, forwarding or raw provider-error reflection. Timeout/abort closes local
continuation; it does not cancel an already displayed wallet prompt or revoke a
signature. Late fulfillment must never return an authorization to the caller.

The wallet must report the selected chain and first authorized account before
signing and after recovery. Serialize a frozen request using captured original
amount/payee and a fresh cryptographic nonce. Validate canonical signature bytes
and recovered signer over the retained immutable data. Preserve the separate
Gateway time window; Test/unsupported/pending configurations refuse before signing.
Fixed errors distinguish refusal before signer entry, wallet-reported decline,
and possible-signature uncertainty; none assert external funds were not charged.

Fresh human approval/quote checks remain the later controller's responsibility.
H10b1 authority must be consumed before this helper is called. Signature results
are browser-private and must never enter server functions, transcript/model data
or recovery storage. The old signer remains active until the complete UI migration.

## Verification and publication

Write focused tests before implementation, including actual fixture-key recovery
for EIP3009 and Gateway, unsupported context, account/chain drift, wallet-reported
decline, raw error privacy, malformed/wrong-signer signatures, source mutation,
abort/deadline/late completion, immutable requests and passive import.
No real key or live payment. First-pass Green tests are not product Reds.
Run exact strict checks, parent self-review and one sequential full gate with
Vitest maxWorkers4/minWorkers1/maxConcurrency4 and Bun max-concurrency4 without
parallel. Publish the scrubbed parent report and an atomic local commit. No
delegates, independent review claim, push or new spending.
