# J9C2A — owner configuration and strict escrow CLI

First checkpoint of the [private command brief](task-9c2-brief.md).
MCP remains next; no live deployment or purchase is enabled by this evidence.

## Implemented

- Explicit paired owner config/journal environment, Arc-only and exact fields:
  ten local deployment pins, expected buyer distinct from evaluator, positive
  gas budget, expiry and bounded operation duration. Disabled/read-only config
  reads no key and creates no file. Neither a seller nor a tool selects paths.
- Canonical owned0700 parents and0600 single-link regular files, no symlinks,
  sidecars or oversized config. No-follow/nonblocking descriptor, strict UTF8,
  before/after inode/metadata checks and digest-bound original boot. Recheck
  before opening SQLite. Used files refuse before key acquisition; never rotate,
  reset, repair or replay. The private key stays inside the consuming process.
- Strict `--rail erc8183` ID or ENS command, explicit JSON and principal cap.
  ID requires explicit seller/hub. ENS retains endpoint/payee checks. Unknown,
  duplicate or malformed rail flags cannot fall through to legacy key parsing.
  Existing funding/session/default commands remain unchanged; help is keyless.
- Explicit owner gas cap is additional to CLI principal cap; combined exposure
  rounds native gas upward to USDC micro-units. Main joins SDK interruption
  before closing the journal. Repeated SIGTERM/SIGINT abort once and await work;
  the330second owning-process fuse covers stalled cleanup/output. Errors are
  fixed and omit arbitrary input, paths, credentials and provider diagnostics.
- Output revalidates the actual owned journal's accepted state, private hub job
  identity, all four transaction proofs, payer roles, local pins, amount and gas.
  Export only closed JSON-safe public proof, explicit hub-reported status and
  fenced seller data. Raw signed transactions and bearer capabilities stay in
  the private journal. Funding is not terminal settlement or refund proof.

## Verification

Ephemeral fixture credentials generated in memory, owned SQLite/loopback and
synthetic Arc RPC only. Actual strict command consumes the key once, composes
SDK/current listing/health/budget/root/poll and returns journal-qualified output
without key/token/path leakage. Owned-file and command tests cover unsafe modes,
links, sidecars, size/UTF8/config drift, copied boot, used-file byte retention,
cancel before signer, gas rounding, strict argument capture and keyless help.
Actual processes verify import inertia, malformed-rail refusal, repeated-signal
cleanup and hard fuse. Direct CLI cancellation verifies durable uncertainty
before journal close. Legacy funding/session command regressions also pass.

Targeted strict checks found a table-driven test passing individual strings
instead of argument arrays, then fixture union narrowing; corrected without
loosening production types or policy. Final focused61Bun4/1,386assertPASS6.19s;
8-root TypeScript diagnostics0. Sole sequential fullgate42275PASS:
5,258Vitest240/75.44s;1,324Bun90/11,584assert194.08s; root/web TypeScript
and client/SSR builds. Fourteen-path scope/privacy audit and144 local links
pass; eight frozen code/test pins checked before atomic commit/exact-one main
fast-forward. No main gate replay.

## Remaining

J9C2B must integrate explicit owner-configured MCP escrow with the existing
serialized per-call/cumulative budgets including principal plus gas. Unknowns
retain full exposure; remote refund claims cannot release it. J4/J5 live and
J6 treasury/code-size pauses remain. No owner keys, real RPC, payments, deposits,
grants, deployments, authorization-window/cap/replay changes or push occurred.
