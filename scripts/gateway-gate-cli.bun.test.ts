import { describe, expect, it } from "bun:test"

const entry = new URL("./g2c-nanopay.ts", import.meta.url).pathname
const launch = async (args: string[]) => {
  const child = Bun.spawn([process.execPath, "--no-env-file", ...args], {
    env: { PATH: process.env.PATH!, LANG: "en_US.UTF-8", ARCADE_BUYER_KEY: "never-print-this-fixture" },
    stdout: "pipe", stderr: "pipe", timeout: 2000, killSignal: "SIGKILL" })
  const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  return { exit, stdout, stderr }
}
describe("F1 owning process boundary (no live IO)", () => {
  it("prints helpful explicit owner controls without using an ambient key", async () => {
    const result = await launch([entry, "--help"])
    expect(result.exit).toBe(0); expect(result.stdout).toContain("--pay-to DISTINCT_ADDRESS")
    expect(result.stdout + result.stderr).not.toContain("never-print-this-fixture")
  })
  it("refuses the legacy deposit invocation before any supported request", async () => {
    const result = await launch([entry, "0.5"])
    expect(result.exit).toBe(1); expect(result.stderr).toContain("configuration refused")
    expect(result.stdout + result.stderr).not.toContain("never-print-this-fixture")
  })
  it("hard-stops pending work or cleanup in its owned process", async () => {
    const result = await launch(["-e", `import { runGateCli } from ${JSON.stringify(entry)};
      await runGateCli(() => new Promise(() => {}), 20);`])
    expect(result.exit).toBe(124)
    expect(result.stderr).toContain("hard deadline")
    expect(result.stdout + result.stderr).not.toContain("never-print-this-fixture")
  })
  it("clears the owning fuse after normal completion", async () => {
    const result = await launch(["-e", `import { runGateCli } from ${JSON.stringify(entry)};
      await runGateCli(async () => 0, 20); console.log("DONE");`])
    expect(result.exit).toBe(0); expect(result.stdout.trim()).toBe("DONE"); expect(result.stderr).toBe("")
  })
})
