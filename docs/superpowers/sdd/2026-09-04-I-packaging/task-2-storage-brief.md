# I2B — private sanitized capture storage

Release the existing capture script/native test and plan-owned records. No
listener or live CLI activation yet. Create only a fresh owned temporary0700
store with immutable public context and a pending claim before any header input.
Accept one capture attempt. Call the original sanitizer internally before any
header bytes reach disk; do not trust caller-supplied scrubbed flags or objects.

Write only its sanitized fixture and exact shape-only marker through exclusive
0600 files, fsync/readback and bounded phase checks. Preserve partial files/claim
on failure, cancellation or child exit before release. Never overwrite,
retry, resume or repair. Close every owned descriptor. Only release the claim
after complete owned data verifies. Expose a read-only bounded verifier for
complete unclaimed stores; revalidate the dummy-signature fixture and public
context without making a client-version, authentication or payment claim.

Where release has not occurred, uncertainty retains the claim. A failure after
release may leave a complete unclaimed artifact; independent historical readback
does not fabricate the lost capture acknowledgement, and the original store
still cannot retry. Synchronous I/O cannot be preempted by phase checks; this is
not a universal process deadline or protection against a coherent owner rewrite.

Use original-byte preservation checks, alias/mode/oversize/corruption tests,
actual child exits after sync, cancellation and sanitized-only file inspection.
Tests use only clearly synthetic headers/owned temporary paths. No real wallet,
Circle CLI, signature, network/payment, public1.0.0 fixture or file promotion.
Keep sanitizer validation and production payment/schema/validity/cap/replay
unchanged. Single-threaded, one sequential four-worker full gate, atomic local
commit/mainFF, no push. I2/I3/J4 live remain PAUSED.
