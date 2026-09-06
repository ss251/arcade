> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# G4 Matchstick runtime provisioning — CLI-only checkpoint

September 6, 2026. Provisioning and bounded CLI checks completed by 02:04:31 UTC
(07:34:31 IST). **The exact approved native asset loads and reports Matchstick
0.6.0 on this host. No mapping test or G4 implementation was executed.**

The agent-reach skill and its GitHub reference were read. The approved exact
public release URL was fetched directly over credential-free HTTPS; no account
setup, credentials, broader search, alternate artifact or update check was used.
The parent explicitly allowed this download and the private note; no source or
dependency release is inferred from runtime provisioning.

## Origin, bytes and retained executable

Parent independently verified the following official release metadata before
authorizing this task; that release API request was not repeated here:

- Repository: LimeChain/matchstick; release tag: `0.6.0`.
- Published: `2023-10-06T10:38:10Z`.
- Asset: `binary-macos-12-m1`; asset ID: `129329607`.
- Expected size: `18873352` bytes.
- API digest: null; no checksum asset listed in the parent's inspected release.
- Exact approved retrieval URL:
  `https://github.com/LimeChain/matchstick/releases/download/0.6.0/binary-macos-12-m1`.

Fresh owned directory created by mktemp, mode 0700, UID 501:
`<owned-runtime-directory>`.

Retained executable for the later explicitly released executor:
`<owned-runtime-directory>/binary-macos-12-m1`.

Actual retrieved size: **18873352 bytes**, exact expected match. SHA-256, checked
again unchanged after both CLI executions:

```text
cd05611b588649e629e42e4ea0915d811d1ddbb73e8edd392a718c81b4361dbd
```

It was downloaded as a regular 0644 file, then made owner-read/execute-only 0500
after metadata/dependency inspection. The directory contains only this binary.
The local hash pins these retrieved bytes; without an upstream digest it is not
an independent publisher-authenticated checksum. Do not silently substitute a
different file with the same version string in a future run.

## Retrieval and inspection actually performed

curl ran in an empty environment with user curl configuration disabled (`-q`),
HTTPS-only initial/redirect protocols, at most three redirects, connect timeout
10 seconds, total timeout 60 seconds, no automatic retry and maximum size
18873352. The first sandboxed attempt failed DNS resolution with HTTP000/zero
bytes. The same exact approved download was then executed with scoped network
permission and completed **HTTP200 / 18873352 bytes / exit0**. No alternative
URL, mirror, library or Docker image was fetched. This DNS setup failure is not
a Matchstick compatibility failure.

`file` reports **Mach-O 64-bit executable arm64**. `otool -l` reports minimum
macOS 12.0, SDK 13.1, dyld `/usr/lib/dyld`, and no LC_RPATH entry. The host reports
Darwin 25.5.0 arm64 and macOS 26.5.2. `otool -L` lists exactly:

1. `/System/Library/Frameworks/Security.framework/Versions/A/Security`
2. `/System/Library/Frameworks/CoreFoundation.framework/Versions/A/CoreFoundation`
3. `/usr/lib/libiconv.2.dylib`
4. `/usr/lib/libSystem.B.dylib`

All four Apple dependencies were actually loadable through ctypes.CDLL in a
separate empty-environment process; no library was installed or linked manually.
The Python launcher emitted two local temporary-directory lookup warnings and
then reported dependencyCount=4/allLoadable=true. Those warnings are separate
from the Matchstick CLI, whose stderr was empty.

`codesign --verify --verbose=2` passed the embedded on-disk requirement. Display
metadata identifies the signature as **ad hoc / linker-signed**, with no Team ID
or CMS publisher authority. This check is not a publisher-identity attestation.

## Bounded CLI execution, not mapping execution

Only the exact arguments `--help` and `--version` were executed, sequentially,
from the fresh owned directory with an empty child environment, ignored stdin,
captured stdout/stderr, a five-second per-child SIGKILL fuse and 16KiB per-stream
output cap. Both exact child handles were awaited; neither timeout fired and no
fallback signal was needed. No PATH, DYLD setting, global configuration or Graph
cache was changed.

| Argument | Exit | Elapsed | Result |
| --- | --- | --- | --- |
| --help | 0 | 1468 ms | Reports Matchstick 0.6.0; lists coverage/help/recompile/version and positional test_suites; stderr empty |
| --version | 0 | 6 ms | `Matchstick 🔥 0.6.0`; stderr empty |

This proves native startup and these two CLI modes only. It does not prove that
the current graph-ts/AssemblyScript suite compiles under the runner, that host
store behavior works, or that the eventual G4 mapping passes. Those remain real
test gates after source release, with genuine behavior failures distinguished
from compiler/setup failures.

## Preserved boundaries / next use

No mapping/test suite, Graph command, codegen/build, full test gate, Docker
container, registry/RPC/Studio call, operational signature, funded action or Git
operation ran. No operational environment/key/owner wallet was used. No package,
lockfile, source/test, OS library, PATH or persistent configuration was modified.
The Graph CLI's unversioned native cache directory remains absent. Only the
approved temporary asset/permissions and this ignored report were created.

Retain this exact temporary executable for parent-approved G4 work, recheck its
hash immediately before use, and invoke it by absolute path rather than teaching
the unversioned Graph cache to trust it. Temp storage can disappear independently;
absence is not permission to auto-download again or choose an alternative. Parent
owns any later execution/provisioning decision. No runtime install or mapping
PASS is claimed here, and the earlier readiness note remains historical.
