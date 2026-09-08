# I2C bounded synthetic loopback capture

Implements the [listener brief](task-2-listener-brief.md) as an explicit library,
separate from the unchanged capture script. No CLI is activated: invoking the
new module as a script refuses with a fixed library-only diagnostic. The existing
capture CLI remains inert. No Circle wallet/client, key reader, signer, outbound
service, payment or actual versioned client fixture is involved.

startCircleCaptureListener requires explicit distinct nonzero public payer/payee,
own-data options without getters, and a finite25–30000ms lifetime(default15000).
Unknown options, host/output overrides, null timeout and already-aborted signals
refuse before binding. It binds127.0.0.1 only, with an OS-assigned ephemeral port,
derives the exact context from that port, and creates the existing private store
before handling requests. No inherited host/port/output environment is used.

One correct-path POST obtains the unsigned capture-template challenge with
maxTimeoutSeconds604900. At most one subsequent payment-signature or legacy
x-payment header is passed into the unchanged store/sanitizer. Both headers,
wrong path/method, repeated challenge, premature signed request and malformed
payload refuse; supplied authorization times/echo are not rewritten. A synthetic
2592000 echo remains2592000. This capture challenge does not admit a payment and
does not change any production validity constant, cap, rail or replay protection.

Public success says captured=true/authenticated=false/settled=false. Other
application replies are fixed diagnostics without raw headers/body/errors.
Body size is1024bytes; Bun can return413 before the handler, after which the
remaining listener lifetime still expires. Development error pages are disabled.
No request body, raw header or credential is written by the application.

The result separates captured/refused/cancelled/expired from listenerClosed.
Client identity is always unverified and client acknowledgement unconfirmed.
Successful/refused responses get only a25ms flush opportunity, not a delivery
guarantee. The owned server then receives one forced stop and at most750ms for
its acknowledgement. An absent acknowledgement remains false, even if a separate
observer sees closure. This in-process phase deadline cannot preempt synchronous
I/O or a blocked event loop; it is not an independent process-kill guarantee.

## Executed verification

Initial missing-module Red:0pass/1fail/1module error. First actual synthetic HTTP
challenge/capture passed14assertions and exact two-root strict0. Two subsequent
regressions were reproduced: null timeout reached binding, and graceful Bun stop
acknowledged while an incomplete TCP connection remained open. A separate native
draining observer confirmed no EOF/close/bytes after the acknowledgement, ruling
out the unconsumed-client-buffer hypothesis for that run. Undefined-only defaults
and forced owned shutdown corrected the failures without weakening the assertions.

Final focused56nativeBun/413assertions/5.81s plus exact two-root strict0 PASS.
The15 new listener tests include actual HTTP success/refusal/legacy behavior,
body overflow, cancellation/expiry, independent port refusal and incomplete TCP
connections both on expiry and alongside a successful capture. Invalid-option
child traps record no getter or bind calls; direct CLI activation/output flags
refuse. Another actual child withholds the real stop promise's acknowledgement:
one forced stop closes the real port, yet the result correctly remains
listenerClosed=false. This injected lost-ack case is not a real runtime failure.

Every synthetic capture has dummy signature/private modes and shape-only
metadata; tests clean only their freshly owned paths and connections.
Existing storage/sanitizer/native tests and production payment/consumer source
remain byte-unchanged; the real client fixture is absent. No actual client
compatibility, payment admission or settlement is claimed. The sole sequential
four-worker full gate55094 PASS:5371Vitest/242files68.94s;1877Bun/100files
14597assertions313.68s; root/web strict and client/SSR builds339/171ms.
Final six-path audit: three local links, no privacy matches and three frozen
source/brief pins unchanged. Prior I2A's H8 teardown failure remains recorded;
there was no whole-gate repeat or payment-policy relaxation.

## Next three steps

1. Complete final audit, atomic local commit and exact-one FF; do not repeat the gate.
2. Retain this library as offline preparation; do not activate a live capture
   workflow or fabricate the real versioned client fixture while I2/J4 are paused.
3. After owner release, separately define the bounded owned client process and
   capture/readback/promotion procedure, then evaluate actual client evidence
   without widening authorization policy to fit a fixture.
