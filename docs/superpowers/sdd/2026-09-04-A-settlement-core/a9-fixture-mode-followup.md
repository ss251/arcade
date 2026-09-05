# A9 fixture mode follow-up — September 5, 2026

Checkpoint ec5cf74 preserved all six original source/manifest byte hashes, but the
loop-probe run.ts.txt snapshot inherited the original program's executable bit.
Parent noticed the mode in the merge's file inventory. The inert text snapshot
should not be directly executable, even though the historical loader only reads
its bytes and the ordinary compiler excludes the .txt suffix.

A new assertion checks execute bits on all three program snapshots in the
existing SHA-256/source-mutation test. At16:47IST it genuinely failed on the
loop-probe file: expected0, received73 (0111). Only that exact file was changed
from100755 to100644; all program contents and fingerprints remain unchanged.
The same focused case then passed with17 assertions;18 unrelated cases were
filtered, not claimed as a full-suite run. Original historical report/evidence,
live preparation, verifier, wrapper and current skill programs were not edited.

The original ec5cf74 precommit and all-four main gates passed2145Vitest/108files,
301Bun/3386assertions/26files, root/web TypeScript, web build and16Forge tests.
This metadata/test-only correction will have its own review, full gate and
separate commit. No fixture, key or live purchase was executed by changing a
file mode. No owner approval, production configuration or GitHub push changed.

Independent read-only source and public-artifact review was CLEAN. The follow-up's
own full test gate passed, including 301 Bun tests / 3,389 assertions across 26
files, followed by root/web strict TypeScript with zero diagnostics. No new live
run was performed. The three added assertions verify the inert program modes.
