import { spawn } from "node:child_process"
import { dirname } from "node:path"
import { PublishFailed } from "./publish-preview.ts"

/** Trusted server configuration, never a browser DTO. */
export interface PublishCommand {
  readonly bun: string; readonly cli: string; readonly preload: string
  readonly cwd: string; readonly home: string; readonly target: string
  readonly generated: boolean
}
export class PublishUnreaped extends PublishFailed {}

/** One exact no-shell child. The caller owns the snapshot and process-wide lock.
 * Resolves only after close (not merely exit); a missed hard close poisons its owner. */
export const runPublishChild = (command: PublishCommand, signal: AbortSignal, timeoutMs = 35000): Promise<string> => {
  if (signal.aborted || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 35000) return Promise.reject(new PublishFailed())
  const args = ["--no-env-file", "--no-install", "--preload", command.preload, command.cli,
    "publish", command.target, "--json", ...(command.generated ? ["--out", "skills"] : [])]
  const env = { PATH: dirname(command.bun), HOME: command.home, TMPDIR: command.home,
    ARCADE_NETWORK: "arc-testnet", ...(command.target.startsWith("mcp://")
      ? { ARCADE_PREVIEW_MCP_TARGET: "https://" + command.target.slice(6) } : {}) }
  return new Promise((resolve, reject) => {
    let failed = false, finished = false, outputSize = 0, errorSize = 0
    const chunks: Buffer[] = []
    let termTimer: ReturnType<typeof setTimeout> | undefined, hardTimer: ReturnType<typeof setTimeout> | undefined
    const child = spawn(command.bun, args, { cwd: command.cwd, env, shell: false, stdio: ["ignore", "pipe", "pipe"] })
    const clean = () => {
      clearTimeout(deadline); clearTimeout(termTimer); clearTimeout(hardTimer)
      signal.removeEventListener("abort", stop); process.off("exit", parentExit)
      process.off("SIGTERM", parentTerm); process.off("SIGINT", parentInt)
    }
    const parentExit = () => { if (!finished) child.kill("SIGKILL") }
    const parentTerm = () => {
      parentExit()
      if (process.listenerCount("SIGTERM") === 1) process.exit(143)
    }
    const parentInt = () => {
      parentExit()
      if (process.listenerCount("SIGINT") === 1) process.exit(130)
    }
    const stop = () => {
      if (finished || failed) return
      failed = true; chunks.length = 0
      child.kill("SIGTERM")
      termTimer = setTimeout(() => { if (!finished) child.kill("SIGKILL") }, 250)
      hardTimer = setTimeout(() => {
        if (finished) return
        clearTimeout(deadline); clearTimeout(termTimer)
        signal.removeEventListener("abort", stop)
        // Retain parent-exit/signal ownership until a real close, even after refusal.
        child.stdout.destroy(); child.stderr.destroy()
        // Do not remove a possibly-live child's snapshot or release ownership.
        reject(new PublishUnreaped())
      }, 1500)
    }
    const deadline = setTimeout(stop, timeoutMs)
    signal.addEventListener("abort", stop, { once: true }); process.once("exit", parentExit)
    process.on("SIGTERM", parentTerm); process.on("SIGINT", parentInt)
    child.stdout.on("data", (data: Buffer) => {
      if (finished || failed) return
      outputSize += data.byteLength
      if (outputSize > 1048576) stop(); else chunks.push(Buffer.from(data))
    })
    child.stderr.on("data", (data: Buffer) => {
      if (finished || failed) return
      errorSize += data.byteLength
      if (errorSize > 65536) stop() // Discard every byte; never log/reflect diagnostics.
    })
    child.on("error", stop)
    child.on("close", (code, sig) => {
      if (finished) return
      finished = true; clean()
      if (failed || signal.aborted || code !== 0 || sig !== null) { reject(new PublishFailed()); return }
      try { resolve(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))) }
      catch { reject(new PublishFailed()) }
    })
    if (signal.aborted) stop()
  })
}
