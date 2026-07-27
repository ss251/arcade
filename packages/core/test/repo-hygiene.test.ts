import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
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

/** Meaningful patterns from an ignore file: no comments, no blanks, no negations. */
const patternsOf = (file: string): ReadonlyArray<string> =>
  readFileSync(join(REPO_ROOT, file), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#") && !l.startsWith("!"))

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

  /**
   * Git and Docker are two channels off this machine, and an exclusion enforced in one and
   * absent in the other is the shape of every failure this repo has hit. The Dockerfile
   * ends in `COPY . .`, so without a `.dockerignore` the build context was the whole tree
   * — `internal/` included, which the repo's first hard rule says must never be published.
   *
   * So the rule is not "remember to update both files", which is exactly the kind of rule
   * that has failed here repeatedly. It is this assertion: `.dockerignore` must be a
   * superset of `.gitignore`. Adding a pattern to one alone fails the suite.
   */
  it("excludes from the Docker build context everything git excludes", () => {
    const docker = new Set(patternsOf(".dockerignore"))
    const missing = patternsOf(".gitignore").filter((p) => !docker.has(p))
    expect(
      missing,
      missing.length === 0
        ? ""
        : `.gitignore excludes these but .dockerignore does not, so they ship inside the\n` +
          `production image even though they are absent from the repo:\n\n` +
          missing.map((p) => `  ${p}`).join("\n") +
          `\n\nAdd them to .dockerignore. The Dockerfile ends in \`COPY . .\`, so anything\n` +
          `not excluded here is in the image.`
    ).toEqual([])
  })

  /**
   * The Bun-only tests must actually be reached by `bun run test`.
   *
   * They were not: the root script was `vitest run` alone while `vitest.config.ts`
   * excludes `*.bun.test.ts`, so the seven durable-store tests that make the deploy's
   * persistence claim true ran only when a human remembered a second command — and the
   * suite read green without them.
   *
   * Fixing the script is not enough, because `bun test <filter>` **exits 0 when the filter
   * matches nothing**. So a renamed file or an edited filter would restore the silence
   * with a passing gate, which is the same vacuum as a pathspec that can never match. This
   * asserts the filter and the files still meet.
   */
  it("routes every Bun-only test through the root test script", () => {
    const files = execFileSync("git", ["ls-files", "*.bun.test.ts"], {
      cwd: REPO_ROOT,
      encoding: "utf8"
    })
      .split("\n")
      .filter((f) => f.trim() !== "")

    // If this ever legitimately reaches zero, delete this test deliberately rather than
    // letting it pass on an empty set.
    expect(files.length).toBeGreaterThan(0)

    const script = String(
      (JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
        scripts: Record<string, string>
      }).scripts["test"]
    )
    expect(script).toContain("vitest run")
    expect(script).toContain("bun test")

    // The filter `bun test` is invoked with must actually select those files.
    const filter = /bun test (\S+)/.exec(script)?.[1]
    expect(filter, "root `test` script must pass a filter to `bun test`").toBeDefined()
    for (const f of files) {
      expect(f, `${f} is not matched by \`bun test ${filter}\` and would never run`).toContain(
        filter!
      )
    }
  })

  /**
   * Every Dockerfile that runs a frozen install must COPY every workspace manifest.
   *
   * `bun install --frozen-lockfile` resolves the whole workspace graph, so a missing
   * manifest fails the build with "lockfile had changes, but lockfile is frozen". The
   * hub's Dockerfile enumerated five workspaces, which was correct when written and became
   * wrong the moment `apps/web` was added — the build was broken for real, and nothing
   * said so until someone deployed. Docker COPY cannot glob directories selectively, so
   * the enumeration has to exist; this is the assertion that it stays complete.
   */
  it("copies every workspace manifest in every Dockerfile that installs", () => {
    const manifests = execFileSync(
      "git",
      ["ls-files", "packages/*/package.json", "apps/*/package.json"],
      { cwd: REPO_ROOT, encoding: "utf8" }
    )
      .split("\n")
      .filter((f) => f.trim() !== "")

    expect(manifests.length).toBeGreaterThan(0)

    const dockerfiles = execFileSync("git", ["ls-files", "*Dockerfile"], {
      cwd: REPO_ROOT,
      encoding: "utf8"
    })
      .split("\n")
      .filter((f) => f.trim() !== "")

    expect(dockerfiles.length).toBeGreaterThan(0)

    for (const df of dockerfiles) {
      const body = readFileSync(join(REPO_ROOT, df), "utf8")
      if (!body.includes("--frozen-lockfile")) continue
      const missing = manifests.filter((m) => !body.includes(m))
      expect(
        missing,
        missing.length === 0
          ? ""
          : `${df} runs a frozen install but never COPYs:\n\n` +
            missing.map((m) => `  ${m}`).join("\n") +
            `\n\nbun resolves the whole workspace graph, so the build fails with\n` +
            `"lockfile had changes, but lockfile is frozen" even though this image never\n` +
            `runs that workspace. Add a COPY line for each.`
      ).toEqual([])
    }
  })

  /**
   * Railway's monorepo guide: "The Railway Config File does not follow the Root Directory
   * path." So a second service inherits the ROOT `railway.json` — which pins the hub's
   * Dockerfile — even when given its own root directory. It would build a valid Dockerfile,
   * succeed, and start a SECOND HUB, with Railway reporting a healthy deploy. Every app
   * therefore needs its own config naming its own Dockerfile, and the service must be
   * pointed at it explicitly.
   */
  it("gives every deployable app its own Dockerfile and railway config", () => {
    const apps = execFileSync("git", ["ls-files", "apps/*/package.json"], {
      cwd: REPO_ROOT,
      encoding: "utf8"
    })
      .split("\n")
      .filter((f) => f.trim() !== "")
      .map((f) => f.replace(/\/package\.json$/, ""))

    for (const app of apps) {
      // The hub is the root Dockerfile's subject, for historical reasons and because the
      // live service is already wired to it. Everything else must carry its own.
      if (app === "apps/hub") continue
      const files = execFileSync("git", ["ls-files", `${app}/Dockerfile`, `${app}/railway.json`], {
        cwd: REPO_ROOT,
        encoding: "utf8"
      })
      expect(files, `${app} must have its own Dockerfile — otherwise Railway builds the root one`).toContain(
        `${app}/Dockerfile`
      )
      expect(
        files,
        `${app} must have its own railway.json, and the service's Config File Path must point at it`
      ).toContain(`${app}/railway.json`)
    }
  })

  it("keeps internal/ out of both channels — the repo's first hard rule", () => {
    // Named explicitly rather than left to the superset check. This one is the reason the
    // superset check exists, and a rule worth stating is worth being able to grep for.
    expect(patternsOf(".gitignore")).toContain("internal/")
    expect(patternsOf(".dockerignore")).toContain("internal/")
  })
})
