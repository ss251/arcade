# H12b2 local runtime — parent report

2026-09-06 after6bf0831. Root-only implementation/self-review under the owner's
machine-load constraint. No independent or parallel review. [Brief](task-12b2-brief.md)
preceded source; H12b1 parser/request/target contracts remain unchanged.

## Implemented boundary

The supported Bun production entry and actual Vite configuration bind literal
127.0.0.1 when ARCADE_PUBLISH_LOCAL=1. Known hosting markers refuse the flag;
Vite resolved all-interface/hostname/TLS/middleware overrides refuse before bind.
Disabled/default behavior and existing hub/model/approval checks are preserved.
A future route still must enforce the request gate; no publish page is enabled here.

Owner configuration supplies absolute ARCADE_REPO_ROOT and ARCADE_PUBLISH_BUN.
The runtime verifies the trusted repo's CLI/preload and selected source file,
refuses symlink descendants, non-regular/multilink or oversized input, then reads
a bounded file descriptor. One selected arcade.json (1MiB) or OpenAPI JSON (5MiB)
is copied into a fresh private snapshot. The real CLI sees the same relative
target but no sibling manifests, seller executable/assets or existing runner home.
This previews metadata, not entry-file validity or actual execution readiness.

One process-local owner survives module reloads. CLI argv is fixed: no shell,
--no-env-file, --no-install, fixed preload/CLI, publish, literal target, --json;
generated previews also use --out skills, without --yes/--force. The child receives
only executable-directory PATH, disposable HOME/TMPDIR, fixed testnet selection
and, for MCP only, the exact declared discovery URL. No inherited key, proxy,
config-path or model setting. No source repo/generated listing/config writes.

The preload permits fetch only to the exact MCP HTTPS URL and forces redirect
error/credentials omit; local-file previews refuse all fetch and all preconnect
attempts. This guards the actual CLI's fetch discovery, not arbitrary native
network syscalls in malicious replaced trusted code. No live MCP request ran.

Stdout1MiB and discarded stderr64KiB, 35s child budget less setup elapsed,
250ms TERM-to-KILL escalation and 1.5s hard-close check. Success waits for close,
valid UTF-8, the canonical parser and exact target/kind/generated-path correlation.
Every error is fixed; raw CLI text never escapes a refusal. The owner removes only
its snapshot after closure. Unproved close or failed removal poisons further
launches; parent exit/TERM/INT retains exact child ownership.

Filesystem operations must complete on the trusted local disk: the 35s timer
does not preempt a kernel-stalled filesystem call. This is not an OS sandbox
against a malicious local owner racing directory ancestors/replacing repo code.
No claim of protection against an owner deliberately changing the trusted Bun
executable, installed dependencies or runtime source. Partial failure does not
authorize an overlapping launch.

## Verification record

- 18:41:39: missing-module collection failures, two suites/zero tests; setup only,
  not a behavioral Red.
- 18:59:36:25 passed/one fixture assertion failed in26 checks. The repo already
  contained skills/fx-rate; corrected the assumption of absence to exact byte
  preservation. Actual directory and OpenAPI snapshot CLI runs succeeded.
- 19:01:23:23 passed/one fixture path assertion failed in24. macOS canonicalizes
  the temporary /var alias; fixture paths now use realpath, with no relaxed
  process closure, environment or argv checks.24 passed at19:02:45 in2.29s.
- Self-review retained signal/exit ownership on uncertain hard close and made
  snapshot cleanup failures refuse/poison rather than return a successful result.
  Parent signal cleanup is separately exercised with real owned processes.
- Added requested-target mismatch/partial JSON/snapshot removal and parent TERM
  cases:16/2 passed at19:05:23 in2.53s. Tests verify exact child PIDs are absent.
- Actual Vite config resolution plus guarded discovery and the production-entry
  Bun socket wiring:4/4 passed at19:06:12 in2.56s. That socket test substitutes
  only the build-dependent SSR handler and resolves source imports in a temporary
  copy of the real entry. It binds a real127.0.0.1 ephemeral socket, closes it,
  verifies the exact PID is absent and gets ECONNREFUSED on the former port.
  This is NOT complete Start UI/native-browser acceptance.
- Expanded strict found two genuine errors: optional hostname narrowing and Bun's
  fetch.preconnect requirement. Fixed by capturing the host once and explicitly
  refusing preconnect; no casts/suppressions removed the errors.
- Final14-root strict program:0 diagnostics. Final40 focused checks/5 files passed
  at19:09:35 in3.25s, including retained preflight checks. No browser/gate overlap.
- Thirteen frozen source/fixture/test pins below;39 H11 and6 H12b1 pins plus
  historical H12a helper/four unchanged H12a pins pass. A read-only inventory
  required sandbox escalation after a shell-invocation mistake and sandbox refusal;
  final inventory reported no gate candidates. No processes were stopped by it.
- Sole max4 sequential gate66574 exited0 at19:16 IST:4,111 Vitest/179 files/
  54.21s;834 Bun/54 files/6,091 assertions/164.40s; root/web strict0;
  client347ms and SSR161ms. Dot reporters change output only. No full repeat,
  source change, live request or browser overlapped the gate.

```text
7af8666ff4c6a73275dd8419660d808f5554035ddb0340fa7ff2d17f0f53eda9  apps/web/src/lib/publish-binding.ts
b4176d1c716d725f0aca94ce5c75b4f48121efec027f1b3ad4e0e6f748010b59  apps/web/src/lib/publish-child.ts
1dbb0a29e1a5f0bcf82bebe7a5a3b3a335e7faf28be471dee7f70db657b4a52e  apps/web/src/lib/publish-discovery-guard.ts
61b170eb76687c8cc7f9bdd7aabc6908529e270303d53d4a6e7f5a47d81b2705  apps/web/src/lib/publish-runtime.ts
f4a909227487cc44a9e5c8ed0f7e6e3d4c1a76885d628cd4ece4186bd319ab01  apps/web/server.ts
ea878ba4c04935af71814eababd5af15052ee5890738fbf743509fa2b1ec6f7d  apps/web/src/preflight.ts
a55a0142bd559bc1eda46d14fa7a538f86f5af63dd477653ae00c798b1aea077  apps/web/vite.config.ts
d9c13b3949b95e765c6363cefc6eadd165788d1ac2cdaf11cb2d616493d8f310  apps/web/test/publish-binding.test.ts
253c2697b7ce1869be6055de24a83118c5e156224425e3b54da29bde73b14cc0  apps/web/test/publish-child.test.ts
6532bb4ebb4a06161caee2ff5583b20941784ead85ba197c28f8d07a837695bd  apps/web/test/publish-entrypoints.test.ts
421d4dfe6842079b70b0a4f325a8a341e7afa32b10a0a3a98fa658e19999f8fc  apps/web/test/publish-runtime.test.ts
7d796508221a0007c144bac67594a86c4a79165579be5647c73098c6bc6d60af  apps/web/test/fixtures/publish-process.ts
9547d2eb91dddc90e766003c8fd61e44ebe3a01e4e6958c94359afbb53826fa6  apps/web/test/fixtures/publish-parent.ts
```

H12b3 must add the actual server-only bounded request route, passive hosted
explanation/local wizard, ownership-aware cancellation and full escaped preview,
manual next commands, client-bundle exclusion and actual Start/native proof.
Then H13/H14/session gap/H merge/deferred G8/G9/vendor tasks/Plan I remain.
No key read, live MCP, new spend, prior one-shot replay, production config,
ENS/mainnet change or push.
