> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H12b local wizard — read-only readiness, not source release

2026-09-06 while the sole H12a full gate runs. No H12b code, compiler, browser or
gate started; H12a source remains frozen. Root-only under machine-load constraint.

Read the full literal H12 (lines3674–4164), current CLI directory/introspection
paths, real tests, manifest/engine shapes, preflightWeb, production server and Vite
configuration. B9 historical mismatch permits defining a real batch contract at H;
H12a does so without altering singular directory output. CLI JSON can contain
private literal arguments/prompts/paths; never call full stdout publicly shareable.

Installed Start1.168.32 server reexports getRequest():Request from server-core
1.169.17. getRequestUrl/getRequestHost helpers may default localhost or trust
forwarded headers. For the execution guard inspect actual Request.url and explicit
Host/Origin headers, reject forwarded ambiguity, never infer local from a missing
host or provider marker. createServerOnlyFn is available but the Node subprocess
module must be kept out of the client graph by the actual Start server-function
boundary/build, not merely by a naming convention.

The current production Bun.serve has no hostname and therefore isn't a safe local
process boundary. Preflight detects only RAILWAY_/FLY_/RENDER_; Vite dev does not
run production preflight. When publish-local is enabled, require loopback binding
in both actual entrypoints (including Vite resolved CLI host overrides), refuse
on known platforms, and require exact same-origin local POST for executing preview.
Hosted/default mode must render passive explanation, no live target form or child.
An Origin check without loopback binding does not stop direct remote clients from
spoofing headers. Do not auto-enable the flag or mutate an owner's deployment env.

Dev Vite runs on Node, so the literal Bun.spawn crashes there. Use one fixed Bun
child via node:child_process with --no-env-file, explicit trusted repository/CLI
entry and cwd, a minimal environment and disposable empty HOME. Never use shell,
inherit credentials, select arbitrary executable/argv, import a seller module,
pass --yes/--force, or accept stdio command syntax in browser input. The existing
CLI directory path scans its sibling manifests; it does not execute entries.

Require a trusted explicit repo/allowed-root configuration (or a verifiably
resolved repo default); contain file targets by realpath plus no symlink traversal
or dot/private paths. Validate target unknown data, length and grammar before IO.
MCP URL input must correspond to one explicit remote discovery, not argv; no inline
credentials, query-secret leakage, redirect fallback or arbitrary local command.
Keep source/selection behavior explicit. OpenAPI can yield many listings; use all
bounded canonical entries or deliberate selection, never silently first entry.

Bound one child at a time per owner/process, stdout bytes, discarded stderr bytes,
request/input bytes, overall elapsed deadline and cleanup. Capture command/config
before awaiting. Nonzero exit, invalid/oversized/partial JSON, timeout and abort
must produce fixed public errors and never pass raw output through Start. Observe
late promises, terminate/reap exactly the owned process and remove only its temp
HOME; no process-table pattern kill. Actual offline subprocess tests must verify
cleanup on success/failure/timeout/oversize. No real keys or paid discovery needed.

Parse actual canonical directory or generated JSON with bounded own closed shapes,
existing core public/engine grammar and target/ID/projection correlation. Do not
copy the old brace-count human parser (quoted braces break it), JSON-as-cast, raw
error reflection or assumed pure model-tool grants. This repository has real JSON;
unsupported legacy prose can fail explicitly rather than invent private fields.
Public schema can legitimately name input properties engine/secrets; distinguish
public manifest fields from user-declared input schema names. Keep full private
output only on the approved local page, no logs, localStorage, chat transcript or
URL state; typing/newer selection/unmount clears stale preview and cancels work.

UI uses existing ARCADE tokens/native controls, full escaped bounded/selectable
JSON, obvious leaves/stays labels qualified to the hub boundary, model-tools vs
adapter-transport distinction, generated-unwritten state, and safely shell-quoted
manual next steps. No automatic generation/start, registration or upload. Append
CSS at EOF; preserve all H11/Chat/buyer/hub/signer behavior and source pins.

Suggested small implementation order: bounded pure JSON/policy first, then owned
CLI process plus actual local entrypoint guards, then route/UI and actual native
hosted/local proof. Each source chunk gets prewritten tests, exact strict, one
sequential max4 full gate and its own local commit. This note needs a scrubbed
public copy with H12b artifacts when implemented. H13/H14 and durable session gap
remain distinct, as do deferredG8/G9, vendor-neutral tasks and I.
