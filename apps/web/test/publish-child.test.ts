import { afterEach, expect, it } from "vitest"
import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runPublishChild, type PublishCommand } from "../src/lib/publish-child.ts"
import { PublishFailed } from "../src/lib/publish-preview.ts"

const repo = new URL("../../..", import.meta.url).pathname
const probe = spawnSync("bun", ["--no-env-file", "-e", "console.log(process.execPath)"], {
  env: { PATH: process.env["PATH"] ?? "" }, encoding: "utf8", timeout: 6000, maxBuffer: 4096
})
if (probe.status !== 0) throw Error("Missing test runtime")
const homes: string[] = []
const command = (mode: string): PublishCommand => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "arcade-preview-child-test-"))); homes.push(home)
  return { bun: probe.stdout.trim(), cli: join(repo, "apps/web/test/fixtures/publish-process.ts"),
    preload: join(repo, "apps/web/src/lib/publish-discovery-guard.ts"), cwd: home, home, target: mode, generated: true }
}
const closed = (cmd: PublishCommand) => {
  const pid = Number(readFileSync(join(cmd.home, "pid"), "utf8"))
  expect(Number.isSafeInteger(pid) && pid > 0).toBe(true)
  expect(() => process.kill(pid, 0)).toThrow()
}
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }) })

it("uses fixed literal preview flags, empty child credentials and observes actual closure", async () => {
  const cmd = command("success"), output = JSON.parse(await runPublishChild(cmd, new AbortController().signal))
  expect(output.argv).toEqual(["publish", "success", "--json", "--out", "skills"])
  expect(output.cwd).toBe(cmd.home)
  expect(Object.keys(output.env).sort()).toEqual(["ARCADE_NETWORK", "HOME", "PATH", "TMPDIR"])
  expect(output.env.HOME).toBe(cmd.home)
  closed(cmd)
})
it.each(["nonzero", "oversize", "stderr", "utf8"])("returns a fixed refusal and reaps the real %s child", async mode => {
  const cmd = command(mode)
  await expect(runPublishChild(cmd, new AbortController().signal)).rejects.toEqual(new PublishFailed())
  closed(cmd)
})
it("kills a timed-out child that ignores TERM and never retains its output", async () => {
  const cmd = command("hang"), start = performance.now()
  await expect(runPublishChild(cmd, new AbortController().signal, 1000)).rejects.toEqual(new PublishFailed())
  expect(performance.now() - start).toBeLessThan(3500)
  closed(cmd)
})
it("cancels an already-started owned child and returns only after closure", async () => {
  const cmd = command("hang"), controller = new AbortController()
  const result = runPublishChild(cmd, controller.signal)
  // Observe the rejection before the async readiness check, avoiding an unhandled promise.
  const checked = expect(result).rejects.toEqual(new PublishFailed())
  const until = performance.now() + 3000
  while (!existsSync(join(cmd.home, "pid")) && performance.now() < until) await new Promise(r => setTimeout(r, 10))
  controller.abort("PRIVATE_ABORT_REASON")
  await checked; closed(cmd)
})
it("does not spawn for pre-abort and normalizes spawn failure", async () => {
  const cmd = command("success"), controller = new AbortController(); controller.abort()
  await expect(runPublishChild(cmd, controller.signal)).rejects.toEqual(new PublishFailed())
  expect(existsSync(join(cmd.home, "pid"))).toBe(false)
  await expect(runPublishChild({ ...cmd, bun: join(cmd.home, "absent") }, new AbortController().signal)).rejects.toEqual(new PublishFailed())
})

it("an owned parent TERM also kills its preview child", async () => {
  const cmd = command("hang")
  const parent = spawn(cmd.bun, ["--no-env-file", "--no-install", join(repo, "apps/web/test/fixtures/publish-parent.ts"), cmd.home], {
    cwd: repo, env: { HOME: cmd.home, PATH: process.env["PATH"] ?? "" }, stdio: "ignore"
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const reaped = new Promise<void>((resolve, reject) => {
    timer = setTimeout(() => { parent.kill("SIGKILL"); reject(Error("Parent did not close")) }, 6500)
    parent.once("close", () => { clearTimeout(timer); resolve() }); parent.once("error", reject)
  })
  const result = reaped.then(() => undefined, () => "failed")
  try {
    const until = performance.now() + 3500
    while (!existsSync(join(cmd.home, "pid")) && performance.now() < until) await new Promise(r => setTimeout(r, 10))
    expect(existsSync(join(cmd.home, "pid"))).toBe(true)
    parent.kill("SIGTERM")
    expect(await result).toBeUndefined()
    const pid = Number(readFileSync(join(cmd.home, "pid"), "utf8")), deadline = performance.now() + 1000
    while (performance.now() < deadline) {
      try { process.kill(pid, 0) } catch { break }
      await new Promise(r => setTimeout(r, 10))
    }
    closed(cmd)
  } finally {
    if (parent.exitCode === null && parent.signalCode === null) parent.kill("SIGKILL")
    await result; clearTimeout(timer)
  }
})
