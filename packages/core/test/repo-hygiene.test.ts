import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"

/**
 * No source file may be gitignored.
 *
 * This exists because a bare `lib/` under "# Local caches" silently swallowed
 * `apps/web/src/lib/` — the entire tool layer of the chat surface — while `git status`
 * stayed clean, the commits read correctly, and the suite passed locally because the files
 * were sitting right there. A tracked test imported a subject that did not exist in the
 * repository, so every green number quoted that day was true of one working tree and false
 * of the repo. A judge cloning it would have got a chat UI with no tools.
 *
 * The lesson was not "be careful with .gitignore". It was that a rule living in one place
 * and depending on everyone remembering it fails silently, which is the failure mode that
 * has cost this repo the most. So the rule became a check, and the check became a test —
 * because a test inherits every invocation that already exists (local run, clean clone,
 * CI) rather than adding a command someone has to remember, or a hook that `.git/hooks`
 * would not carry to a clone.
 *
 * It enumerates NOTHING. There is no list of directories to keep in sync, so a new package
 * or app is covered the day it exists, and the next bare pattern anyone adds is caught by
 * the same line rather than needing its own rule.
 *
 * It lives in `packages/core` because vitest only collects test files under the per-package
 * and per-app test globs, and core is the shared foundation — the check is repo-wide rather
 * than core's own.
 */

const REPO_ROOT = new URL("../../..", import.meta.url).pathname

const ignoredSources = (): ReadonlyArray<string> =>
  execFileSync(
    "git",
    [
      "ls-files",
      "--others",
      "--ignored",
      "--exclude-standard",
      "--",
      // `:(glob)` magic is load-bearing. A plain wildcard pathspec must match the WHOLE
      // path, so `apps/*/src` matches only a path ending at `/src` and never a file
      // beneath it — it returns empty whether or not anything is ignored, which is a gate
      // that cannot fail. `:(glob)` with `/**` matches descendants. Verified by
      // reproducing the original bug against this check; see the note above.
      ":(glob)apps/*/src/**",
      ":(glob)packages/*/src/**"
    ],
    { cwd: REPO_ROOT, encoding: "utf8" }
  )
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s !== "")

describe("repo hygiene", () => {
  it("does not gitignore any source file", () => {
    const ignored = ignoredSources()
    expect(
      ignored,
      ignored.length === 0
        ? ""
        : `These source files are gitignored and would be MISSING from a fresh clone:\n\n` +
          ignored.map((f) => `  ${f}`).join("\n") +
          `\n\nRun \`git check-ignore -v <path>\` to find the offending pattern. The usual\n` +
          `cause is a bare directory pattern — \`lib/\` matches at any depth, \`/lib/\` does\n` +
          `not. Anchor it rather than deleting it, and if something under src genuinely must\n` +
          `be ignored, make that an explicit exception here rather than a silent one.`
    ).toEqual([])
  })
})
