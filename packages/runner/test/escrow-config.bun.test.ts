import { expect, test } from "bun:test"
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { openEscrowRunnerConfig, parseEscrowRunnerArgs } from "../src/escrow-config.ts"
import { rpcFixture } from "../../payments/test/fixtures/erc8183-rpc.ts"
test("escrow startup is explicit: both flags exactly once, never guessed", () => {
  expect(parseEscrowRunnerArgs(["start", "--skills", "fixture"])).toBeUndefined()
  expect(parseEscrowRunnerArgs(["start", "--escrow-config", "/tmp/public.json", "--escrow-journal", "/tmp/private/signatures.sqlite"]))
    .toEqual({ configPath: "/tmp/public.json", journalPath: "/tmp/private/signatures.sqlite" })
  for (const args of [["start", "--escrow-config", "/tmp/public.json"], ["start", "--escrow-journal", "/tmp/signatures.sqlite"],
    ["start", "--escrow-config", "--escrow-journal", "/tmp/signatures.sqlite"],
    ["start", "--escrow-config", "a", "--escrow-config", "b", "--escrow-journal", "c"]])
    expect(() => parseEscrowRunnerArgs(args)).toThrow(/^escrow_runner_configuration_refused$/)
})
test("bounded public identity config opens a private journal without a key or discovery fallback", async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "arcade-escrow-config-test-"))); chmodSync(dir, 0o700)
  const path = join(dir, "public.json"), journalPath = join(dir, "provider.sqlite"), h = await rpcFixture("budget")
  try {
    const config = { identity: h.identity, operationTimeoutMs: 30000 }
    writeFileSync(path, JSON.stringify(config), { mode: 0o600 })
    const opened = openEscrowRunnerConfig({ configPath: path, journalPath })
    expect(opened.options.identity).toEqual(h.identity); expect(opened.options.operationTimeoutMs).toBe(30000)
    expect(opened.options.journal.durability).toBe("durable"); opened.close(); opened.close()
    expect(() => openEscrowRunnerConfig({ configPath: path, journalPath: path })).toThrow(/^escrow_runner_configuration_refused$/)
    expect(readFileSync(path, "utf8")).toBe(JSON.stringify(config))
    expect(h.calls).toHaveLength(0); expect(h.acquisitions()).toBe(0)
    for (const bad of [{ ...config, privateKey: "forbidden-field" }, { ...config, operationTimeoutMs: 300001 },
      { ...config, identity: { ...h.identity, chainId: 1 } }, { ...config, identity: { ...h.identity, hookCodeHash: "0x" } }]) {
      writeFileSync(path, JSON.stringify(bad))
      expect(() => openEscrowRunnerConfig({ configPath: path, journalPath: join(dir, "never.sqlite") })).toThrow(/^escrow_runner_configuration_refused$/)
      expect(existsSync(join(dir, "never.sqlite"))).toBe(false)
    }
    writeFileSync(path, JSON.stringify(config)); symlinkSync(path, path + ".link")
    expect(() => openEscrowRunnerConfig({ configPath: path + ".link", journalPath })).toThrow(/^escrow_runner_configuration_refused$/)
    chmodSync(path, 0o666)
    expect(() => openEscrowRunnerConfig({ configPath: path, journalPath })).toThrow(/^escrow_runner_configuration_refused$/)
    chmodSync(path, 0o600)
    writeFileSync(path, " ".repeat(32769))
    expect(() => openEscrowRunnerConfig({ configPath: path, journalPath })).toThrow(/^escrow_runner_configuration_refused$/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
test("actual CLI refuses invalid escrow config before resolving a seller key or creating its journal", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "arcade-escrow-cli-test-"))); chmodSync(dir, 0o700)
  const configPath = join(dir, "runner.json"), publicPath = join(dir, "public.json"), journalPath = join(dir, "provider.sqlite")
  try {
    writeFileSync(configPath, JSON.stringify({ runnerId: "rnr_fixture", sellerAddress: "0x" + "01".repeat(20),
      hubUrl: "http://127.0.0.1:1", maxConcurrency: 1, agents: {} }))
    writeFileSync(publicPath, JSON.stringify({ identity: {}, operationTimeoutMs: 30000 }))
    // Invalid explicit env key prevents any Keychain fallback even if this guard regresses.
    const run = spawnSync(process.execPath, ["--no-env-file", new URL("../src/cli.ts", import.meta.url).pathname,
      "start", "--escrow-config", publicPath, "--escrow-journal", journalPath], {
      env: { PATH: process.env.PATH ?? "", HOME: dir, TMPDIR: dir, ARCADE_CONFIG_PATH: configPath,
        ARCADE_SELLER_KEY: "not-a-real-key" }, encoding: "utf8", timeout: 5000, maxBuffer: 65536
    })
    expect(run.status).toBe(1); expect(run.stderr).toContain("escrow_runner_configuration_refused")
    expect(run.stderr).not.toContain("not-a-real-key"); expect(existsSync(journalPath)).toBe(false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
