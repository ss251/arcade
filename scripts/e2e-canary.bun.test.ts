import { describe, expect, it } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { OwnedProcesses, withEvidenceCleanup, type OwnedProcess } from "./e2e-canary.ts"

// These subprocesses only print public runtime arguments or wait. No hub, keys or RPC.
const fixture = async (source: string, test: (file: string) => Promise<void>) => {
  const directory = await mkdtemp(join(tmpdir(), "arcade-canary-lifecycle-test-"))
  try {
    const file = join(directory, "child.ts")
    await writeFile(file, source)
    await test(file)
  } finally { await rm(directory, { recursive: true, force: true }) }
}
const waitFor = async (ready: () => boolean) => {
  const deadline = Date.now() + 3000
  while (!ready() && Date.now() < deadline) await Bun.sleep(5)
  expect(ready()).toBe(true)
}
const forceReap = async (entry: OwnedProcess | undefined): Promise<void> => {
  if (entry === undefined || entry.child.exitCode !== null || entry.child.signalCode !== null) return
  // The regression intentionally exposes an incorrect done flag. Independently reap
  // only this actual fixture child rather than trusting that flag during test cleanup.
  const closed = new Promise<void>(resolve => entry.child.once("close", () => resolve()))
  entry.child.kill("SIGKILL")
  await closed
}

describe("canary evidence owned subprocess safeguards", () => {
  it("passes --no-env-file to the actual Bun child runtime", async () => {
    await fixture('console.log(JSON.stringify(process.execArgv));', async file => {
      const owned = new OwnedProcesses()
      let output = ""
      const child = owned.launch(file, {}, undefined, chunk => { output += chunk })
      try {
        await child.exited
        expect(child.child.exitCode).toBe(0)
        expect(JSON.parse(output)).toContain("--no-env-file")
      } finally { await forceReap(child); await owned.close() }
    })
  })

  it("does not treat a signal error as proof that a running owned child exited", async () => {
    await fixture('console.log("READY"); setInterval(() => {}, 1000);', async file => {
      const owned = new OwnedProcesses()
      let output = "", resolved = false
      const child = owned.launch(file, {}, undefined, chunk => { output += chunk })
      void child.exited.then(() => { resolved = true })
      try {
        await waitFor(() => output.includes("READY"))
        child.child.emit("error", new Error("injected signal failure"))
        await Promise.resolve()
        expect(child.done).toBe(false)
        expect(resolved).toBe(false)
        expect(child.child.exitCode).toBeNull()
        expect(child.child.signalCode).toBeNull()
        child.child.emit("error", new Error("another signal failure"))
        await owned.stop(child)
        expect(child.done).toBe(true)
        expect(child.child.signalCode).not.toBeNull()
      } finally { await forceReap(child); await owned.close() }
    })
  })

  it("still recognizes spawn failure without attempting to signal a missing PID", async () => {
    const owned = new OwnedProcesses()
    const child = owned.launch("unreachable-fixture.ts", { PATH: "/nonexistent-canary-fixture-path" })
    await child.exited
    expect(child.child.pid).toBeUndefined()
    expect(child.done).toBe(true)
    await owned.close()
  })
})

describe("canary evidence completion boundary", () => {
  it("never publishes PASS if cleanup fails after valid evidence", async () => {
    const output: string[] = []
    await expect(withEvidenceCleanup(async () => "verified", async () => {
      throw new Error("owned child is not confirmed stopped")
    }, proof => { output.push(`PASS ${proof}`) })).rejects.toThrow("not confirmed stopped")
    expect(output).toEqual([])
  })

  it("publishes only after the actual owned child has closed and cleanup completed", async () => {
    await fixture('console.log("READY"); setInterval(() => {}, 1000);', async file => {
      const owned = new OwnedProcesses(), events: string[] = []
      let output = ""
      const child = owned.launch(file, {}, undefined, chunk => { output += chunk })
      try {
        await waitFor(() => output.includes("READY"))
        await withEvidenceCleanup(async () => { events.push("proof"); return 2 }, async () => {
          await owned.close()
          events.push("cleanup")
        }, count => {
          events.push(`PASS ${count}`)
          expect(child.done).toBe(true)
          expect(child.child.signalCode).not.toBeNull()
        })
        expect(events).toEqual(["proof", "cleanup", "PASS 2"])
      } finally { await forceReap(child); await owned.close() }
    })
  })

  it("cleans up failed evidence without publishing a success", async () => {
    const events: string[] = []
    await expect(withEvidenceCleanup(async () => { throw new Error("proof missing") }, async () => {
      events.push("cleanup")
    }, () => { events.push("PASS") })).rejects.toThrow("proof missing")
    expect(events).toEqual(["cleanup"])
  })
})
