# I2B private sanitized capture storage

Implements the [storage brief](task-2-storage-brief.md) as explicit library APIs.
The CLI is still inactive: default reports NOT_RUN/captureEnabled=false/writes=false,
help explains the library boundary, and live/capture/output flags refuse. No
listener, Circle CLI invocation, actual client fixture, owner key or signature,
network request, payment, approval replay or promotion occurs.

createCircleCaptureStore validates and snapshots public context/options before
creating a fresh canonical owned0700 temporary directory. Exclusive0600 public
context and pending-claim files are synced before a handle is returned or any
header is supplied. capture reserves its one attempt before validation, calls
the unchanged sanitizer internally, and writes only its sanitized fixture and
shape-only marker. A rejected header still consumes the attempt. No overwrite,
retry, repair, resume or caller-supplied scrubbed assertion exists.

Files use exclusive/no-follow creation, bounded readback, regular-file/owner/
mode/link-count checks, stable identity/stat checks and exact inventory. Context
and marker are bounded4096bytes each; fixture16384bytes. Hashes bind retained
public context and fixture bytes; the marker records authenticated=false,
provenance=supplied-header-shape-only and clientVersion=null. Only verified
complete data permits claim release. Individual synchronous descriptors close
in finally blocks; no descriptor is held awaiting header input.

Failures before release preserve partial facts and the pending claim. A lost
acknowledgement after release may leave a complete artifact: independent
historical readback can inspect it, but cannot assert that capture returned
success; the same handle still cannot retry. The reader requires an unclaimed
exact three-file store, rechecks hashes/bytes/inventory and re-sanitizes the stored
fixture without rewriting. Even a coherently rehashed raw signature is refused.

This is bounded local consistency, not authentication or proof of a particular
client. A coherent local rewrite of allowed public metadata can remain readable
with authenticated=false; hashes are not a trusted external provenance anchor.
Five-second monotonic phase checks detect deadline/cancellation between operations,
but cannot preempt blocked synchronous I/O. Child-exit fixtures are process
interruption evidence, not simulated power loss or a universal OS shutdown proof.
The future listener/owned process deadline remains separate.

## Executed verification

Initial missing-export Red prevented the new API test from running. First
implemented fresh-store check passed12assertions and exact two-root strict0.
Final focused result:41nativeBun/291assertions/2.73s, exact two-root strict0 PASS.

Native tests cover one-use/reentrant refusal; immutable context/options; unknown
bearer input without raw persistence; cancellation before and after release;
forward/backward clock jumps; symlink/hardlink/mode/oversize/extra/claim/UTF-8/
context/hash/marker corruption; raw-signature rehash refusal; coherent public
rewrite without authentication; and readback without byte changes. Invalid
context/options invoke no getters and create no capture store.

Actual children exit23 after context, fixture, marker and release sync boundaries.
The parent inspects exact files/private modes and absence of the synthetic raw
signature. Initial test setup incorrectly relied on a Bun built-in module mock,
then omitted Bun's own runtime cache and canonical temp-path resolution; these
fixture failures were corrected with explicit child-only TMPDIR and canonical
owned parents, without relaxing the store. No sensitive input was used.
A separate actual readback child traps subprocess/listener/network calls and
returns zero forbidden calls, false authentication and null client version,
with all retained bytes unchanged. This is not a whole-OS capability audit.

Original sanitizer and native-test suffix bytes are preserved mechanically.
Production payment/schema/decoder/consumer/validity/cap/replay code is unchanged;
the real versioned client fixture remains absent. The sole sequential four-worker
full gate81518 PASS:5371Vitest/242files69.20s;1862Bun/99files14475assertions313.23s;
root/web strict and client/SSR builds364/192ms. Six-path audit: three local links,
no privacy matches, three frozen source/brief pins unchanged. I2A's previously
recorded H8 teardown failure is retained; this later gate does not erase it.

## Next three steps

1. Finish final audit, atomic local commit and exact-one FF; do not repeat the gate.
2. Add the bounded owned-loopback listener lifecycle and synthetic HTTP cleanup
   tests while keeping live/default CLI activation disabled.
3. Keep I2/I3/J4 live paused pending owner release; no actual wallet capture or
   payment-authorization policy change is authorized by this offline tooling.
