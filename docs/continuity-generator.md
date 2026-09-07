# Reproducing the continuity snapshot

The [generator](../scripts/continuity.ts) reads only local committed Git objects.
It makes no network request, signs nothing, changes no Git state, and does not
read owner handoffs or private working files. The [historical continuity record](CONTINUITY.md)
describes implementation/evidence status separately.

```bash
# Print a snapshot at current HEAD; it does not edit README.
bun --no-env-file scripts/continuity.ts

# Reproduce a specific snapshot: full commit SHA only.
bun --no-env-file scripts/continuity.ts --revision aec5e43001f70446eaea48a1344af0b29b56ec95

# Once I5 adds the unique README markers:
bun --no-env-file scripts/continuity.ts --write
bun --no-env-file scripts/continuity.ts --check
```

The output records its full revision. Check re-derives **that committed snapshot**,
not a perpetually moving HEAD, and reports how many newer commits it excludes.
Thus committing the README does not invalidate its own historical statement.
Before submission, deliberately refresh to the reviewed checkpoint and review the
diff. A passing snapshot check does not mean all later commits are documented.

Two boundaries stay distinct:112 inherited commits through57183db, then the
planning commit6f38178. Event totals include planning; the separate post-baseline
total does not. At aec5e43 those event/post-baseline totals are216/215.

## What plan rows mean

The generator discovers plans A–J regardless of their date prefix and reads their
File structure tables **at the snapshot revision**. Every first-column code path
is considered; responsibility prose and parenthetical alternatives are not.
Sibling filenames and overlapping relative directory prefixes are resolved;
single-level braces and bounded numeric filename ranges expand; trailing slash
or directory ellipsis means all descendants; ordinary Git glob path patterns
remain globs. Unsupported or ambiguous syntax, duplicate letters, absent tables
and reversed commit ancestry fail rather than silently dropping a row.

Each row counts distinct non-merge commits touching its declared paths after the
execution baseline. It is **not exclusive plan attribution**: shared files,
broad directories and later edits appear in several rows. The counts cannot be
summed. Unlisted implementation files, relocated sources and parenthetical
alternative directories are outside that declared-path view. Zero activity is
not described as “not started.” A/J may both include a later shared-file edit.
First/last commit links are endpoints, not a contiguous plan range.

## Write and failure boundaries

`--write` replaces only an existing, unique, ordered continuity marker block.
It refuses missing/duplicate markers, symlinks, hardlinks, non-regular files,
invalid UTF-8 and README files over2MiB. It builds a unique sibling temporary
file, rechecks original identity/bytes, then renames it over README, retaining
ordinary permission bits and all bytes outside the block. Temporary files are
cleaned on success/failure. It is not a cross-process filesystem lock: do not
concurrently edit README during a write.

Git children have5s individual limits within a30s reader budget and4MiB output
caps; commands receive argument arrays, no shell or revision expressions from
flags. Print/help/check are read-only. Import is inert. Sanitized command errors
do not dump Git stdout/stderr or personal paths.

I4 intentionally leaves README unchanged; I5 owns marker placement and the
seven-section restructure. Actual help passed and actual check/write refused
the presently missing markers, with README hash unchanged. The
[task record](superpowers/sdd/2026-09-04-I-packaging/task-4-report.md) records
tests and gate results. None of this proves a Circle payment or current live
deployment.
