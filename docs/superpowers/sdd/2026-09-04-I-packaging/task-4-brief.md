# I4 — reproducible continuity snapshot

Build a read-only Git-derived generator before the README restructure. Preserve
two boundaries: inherited build57183db and planning/execution baseline6f38178.
Discover dated plans A–J, including J's later date, from the selected committed
tree. Read every first-column path, resolving sibling abbreviations, braces,
numeric ranges, globs and directory ellipses; unsupported syntax fails clearly.

Per-plan figures are non-merge declared-path activity, not exclusive authorship,
completion or live proof. Counts overlap and cannot be summed. Report total
reachable event commits independently. Read plans at the chosen revision, never
from uncommitted edits. Full revision pins make a README snapshot reproducible
after its own documentation commit; check reports newer excluded commits.

CLI: default prints current HEAD snapshot; --revision accepts only a full SHA;
--check verifies the one recorded README block; --write replaces only that block
with a fresh snapshot, never inserts missing/duplicate markers or follows a
symlink. No shell interpolation, Git writes, network, keys or payment code.

Use real disposable Git histories for parser/range/snapshot/check/write tests,
plus the actual repository read-only run. Bound child commands and output;
preserve all unrelated README bytes. One four-worker full gate before commit.
I2/I3 remain paused and no synthetic fixture is labelled a live CLI capture.
