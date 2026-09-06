# H12b3 local wizard — task brief

2026-09-06 afterff0fab3. Root-only under machine-load restrictions. Use the
frontend-design skill within existing ARCADE paper/ink, provenance typography,
native controls and light/dark tokens; no new font or aesthetic system.

Add the /publish page and fixed POST /api/publish-preview. This intentionally
uses a bounded raw Request handler for private preview JSON instead of the
literal plan's unbounded server-function serialization. The existing canonical
CLI, parser and local runtime remain the authority; no duplicate manifest
generation or shell interpolation.

Default/hosted page explains local publication with no active target form.
An explicitly enabled supported loopback entrypoint exposes only the fixed preview
POST; validate request authority before reading any body or source path. Read at
most4KiB within3s, close on abort/deadline/malformed input, and invoke the runtime
once. Fixed errors, no-store/nosniff responses; no raw causes or CLI diagnostics.
Reject unexpected content encoding/type/length and non-POST before IO.

Client request has42s total budget, response1MiB, no redirect/retry/cookies, and
revalidates canonical JSON/target correlation. Do not reuse the quote helper
with its larger input limit or weaker incoming abort ownership. Private output
lives only in the local page: no URL, chat, console, storage or SSR serialization.
Typing, explicit Cancel, newer operation or unmount hides/discards the old output
and aborts its owner; late output cannot restore an older selection.

Show every generated listing and skipped tool, directory snapshot versus
unwritten generation, real adapter/credential/model-tool grants and full escaped
JSON. "Leaves"/"stays" are hub-boundary labels, not claims of no adapter network
access or of arbitrary literal metadata never containing sensitive text. Mention
that no executable/assets/siblings were validated. Manual shell-quoted next
commands only; no writes, registration, runner starts, signing or payments.

Tests precede source: request bounds/abort/late completion/refusal zero runtime
calls, client fixed target/limits/late fetch cancellation, SSR passive versus
active form/escaped full entries and accurate boundary copy. Then actual Start
route/native real-directory/OpenAPI preview, refusal, cancellation,390/desktop
light/dark containment and exact owned process/port cleanup. Check actual client
bundle excludes Node process/filesystem/preload/runtime implementation.

Append only publish-scoped CSS; generated route tree changes are expected.
Keep H11/Chat/buyer/CLI behavior intact. One full sequential max4 gate after
source/native freeze, one atomic commit, no fan-out/parallel reviews/new spending,
keys/live MCP, production env/ENS/mainnet changes or push.
