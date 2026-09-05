> Sanitized historical G1 checkpoint, September 5, 2026. Original retained unchanged; only the banner and explicitly recorded privacy substitutions differ. This report records its own observation time, not a complete G1 live gate. Later dated progress supersedes pending statements.

# G1 private Studio runtime — independent review follow-up

September 5, 2026. Offline independent review of the frozen private consuming
runtime and its dummy tests. CLEAN after the narrowly authorized error-projection
correction below. The parent must reread the frozen helper before the exact
owner-approved consuming command. This report grants no additional live authority.

## Scope and reviewed safeguards

Read the complete helper and tests. Verified the fixed single JSON-RPC 2.0/id 1
`subgraph_deploy` POST to `https://api.studio.thegraph.com/deploy`, slug
`arcade-ledger-arc-testnet`, version `v0.0.1-smoke`, and already-uploaded CID
`QmePuPnHraVaV9TmxaAwCCMKwTD8iFW96eoEUfSA1BoCW8`. No endpoint, name, version or CID
override and no re-upload are present. The exact 32-hex dummy credential is used
only in the bearer header; the CLI does not accept a key argument or retrieve one.

The once-only latch precedes the synchronous durable intent callback and dispatch;
it also covers concurrent invocation, intent failure and unknown outcomes. CLI
intent persistence appends and fsyncs before send. There is no retry, redirect,
fallback or status loop. The shared headers/body deadline is at most 20 seconds,
with a 16 KiB response cap, fatal UTF-8, JSON/encoding/length checks, late-response
cancellation and bounded cleanup. Malformed responses and post-dispatch transport
or journal failures remain fixed unknown outcomes, not guessed network diagnoses.

The success projection requires the actual returned Studio query URL, exact
allowed host/path and the reviewed slug/version (or returned `version/latest`
alias). It excludes arbitrary URLs, credentials, ports, query strings and
fragments. JSON-RPC identity and result/error exclusivity are checked. A returned
deployment URL is not evidence of indexing, query availability, source history,
authentication policy or support for a particular chain. A latest-version alias
is not immutable source proof.

Reviewed CLI import safety and environment read/deletion, absolute fresh-journal
requirement, real nonsymlink ancestors, owner/mode checks, exclusive no-follow
0600 creation under a private 0700 directory, file/parent identity and size
rechecks, append-only JSONL, file/directory fsync, poisoned writer latch, retained
intent on completion failure, no overwrite, descriptor cleanup and exit statuses.
The helper has a 25-second event-loop fuse; as already documented by the original
author, it cannot preempt an OS-blocked synchronous syscall. The parent retains
an independent owning-command deadline. Immutable JavaScript strings are not
physically zeroized. Unknown or incomplete journals must never be replaced with
a fresh journal to retry this consumed operation.

## Genuine independent Reds and authorized correction

The original frozen helper passed its 17 Bun tests / 129 assertions. Independent
dummy-only regressions at 2026-09-05T13:14:56Z then failed twice: provider rejection
prose could reflect the entire supplied dummy credential when split into two
16-character words or encoded as base64. Both representations survived the old
sanitizer in returned results and completion events, which the CLI would print
and journal. No real credential was accessed or exposed.

The parent authorized only a minimal private correction: project a fixed local
`Studio rejected deployment` message and the validated signed-32-bit numeric
error code. The helper no longer projects provider prose or `error.data`; it
does not infer unsupported-network status. Two original expectation tests were
updated to this contract. The two independent regressions were retained unchanged
in `g1-studio-review.bun.test.ts`, preserving their genuine existing-source Reds.

## Final verification and freeze

- `bun --no-env-file test internal/g1-studio-deploy.bun.test.ts internal/g1-studio-review.bun.test.ts`:
  19 passed, 0 failed, 134 assertions. The parent independently repeated this pass.
- Exact root-tsconfig TypeScript program for all three private files: 0 diagnostics.
- Dummy tests exercise injected fetch and isolated CLI subprocesses with a private
  preload, actual journal permissions/no-overwrite/symlink handling and bounded
  process cleanup. No external network or listener is required.
- Frozen SHA256:
  - `g1-studio-deploy.ts`: `6b2eb10475d10649a97094015c2e0e1e956809b420487475c22b9b1a87b15f2e`
  - `g1-studio-deploy.bun.test.ts`: `cb19ab118359d26f52606e8f4e052b912e290afcaeb16dcc6137df3e6f570967`
  - `g1-studio-review.bun.test.ts`: `4dc83e0f405ecbf84c577fbba8c74a5a84dc0b90cdf986903365d53758a569dc`

The earlier `task1-live-runtime-report.md` remains unchanged as a historical
checkpoint. Its sanitizer claims and old source/test hashes are superseded by
this follow-up, not silently rewritten. The ts-testing skill guided preservation
of real Reds and actual transport/process/file assertions.

No remaining blocker was found within this private wrapper review scope. No real
network request, Keychain access, Studio deployment, upload/query, mainnet x402,
tracked G/F source edit, Git action or full-repository gate was performed here.
No live success, chain support or indexing claim is made.
