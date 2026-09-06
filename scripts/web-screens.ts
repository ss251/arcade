/** Finite, keyless read-only capture. Requires a trusted local Chrome and prebuilt web.
 * No implicit hub, shell child, profile reuse, model, wallet, paid call or dependency install.
 */
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import { parseScreenOptions, screenPages } from "./web-screens-policy.ts"

const args = process.argv.slice(2)
if (args.length === 1 && args[0] === "--help") {
  console.log("Usage: scripts/web-screens.sh --hub EXACT_ORIGIN --seller PUBLIC_ADDRESS --skill SKILL_ID --chrome /ABSOLUTE/TRUSTED_CHROME\nRead-only, prebuilt web required. Fresh temporary PNG/profile directory; no wallet or saved jobs. No automatic build or install.")
  process.exit(0)
}
const options = parseScreenOptions(args), root = fileURLToPath(new URL("..", import.meta.url))
const chrome = realpathSync(options.chrome)
accessSync(chrome, constants.X_OK)
const built = join(root, "apps/web/dist/server/server.js")
if (!existsSync(built)) throw new Error("Build web before capturing screenshots")
const out = mkdtempSync(join(tmpdir(), "arcade-web-screens-"))
for (const name of ["home", "tmp", "profile", "cache", "shots"]) mkdirSync(join(out, name), { mode: 0o700 })
const env = { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME: join(out, "home"), TMPDIR: join(out, "tmp"), XDG_CACHE_HOME: join(out, "cache") }
type Child = { name: string; process: Bun.Subprocess<"ignore", "pipe", "pipe">; stdoutBytes: number; stderrBytes: number }
const children: Child[] = [], drains: Promise<void>[] = [], frames: Record<string, unknown>[] = []
const stop = new AbortController(), parent = process.ppid
let stage = "startup", origin = "", cdpOrigin = "", success = false, lastCommand = "", failedCommand = "", failure = ""
let lastObservation: unknown
let serverReady: { origin: string; pid: number } | undefined
const alive = () => { if (stop.signal.aborted) throw new Error("Capture stopped") }
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const until = async (check: () => boolean | Promise<boolean>, ms: number) => {
  const deadline = performance.now() + ms
  while (!await check()) { alive(); if (performance.now() >= deadline) throw new Error("Capture deadline"); await sleep(50) }
  alive()
}
const spawn = (name: string, command: string[]) => {
  const child: Child = { name, process: Bun.spawn(command, { cwd: root, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" }), stdoutBytes: 0, stderrBytes: 0 }
  children.push(child)
  for (const key of ["stdout", "stderr"] as const) drains.push((async () => {
    const reader = child.process[key].getReader(), decoder = new TextDecoder()
    let carry = ""
    try {
      while (true) {
        const item = await reader.read(); if (item.done) break
        const count = key === "stdout" ? child.stdoutBytes += item.value.byteLength : child.stderrBytes += item.value.byteLength
        if (count > 262144) { stop.abort(); continue }
        if (name === "chrome" && key === "stderr") {
          const file = join(out, "chrome.stderr.log")
          writeFileSync(file, item.value, { flag: "a", mode: 0o600 })
        }
        if (name !== "web" || key !== "stdout") continue
        carry += decoder.decode(item.value, { stream: true })
        if (carry.length > 65536) { stop.abort(); carry = ""; continue }
        const lines = carry.split("\n"); carry = lines.pop()!
        for (const line of lines) {
          try {
            const value = JSON.parse(line)
            if (value.event === "screen-server-ready" && /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(value.origin) && value.pid === child.process.pid)
              serverReady = { origin: value.origin, pid: value.pid }
          } catch { /* Never echo raw child diagnostics. */ }
        }
      }
    } finally { reader.releaseLock() }
  })())
  return child
}
const exited = (child: Child) => child.process.exitCode !== null || child.process.signalCode !== null
const fuse = setTimeout(() => stop.abort(), 300000)
const watch = setInterval(() => { if (process.ppid !== parent) stop.abort() }, 500)
const interrupted = () => stop.abort()
process.once("SIGINT", interrupted); process.once("SIGTERM", interrupted)
const manifest = join(out, "capture.json"), startedAt = new Date().toISOString()
const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const evidence = { version: 1, startedAt, source: { hub: options.hub, seller: options.seller, skill: options.skill },
  builtServerSha256: hash(readFileSync(built)), supervisorPid: process.pid,
  scope: "Read-only public feeds in a fresh keyless profile. Buyer has no saved jobs; publish is passive. No live wallet, model or payment. Human must inspect all frames." }
writeFileSync(manifest, JSON.stringify({ ...evidence, status: "running" }, null, 2) + "\n", { flag: "wx", mode: 0o600 })
console.log(JSON.stringify({ event: "capture-started", output: out }))

let socket: WebSocket | undefined, serial = 0, session: string | undefined
let browserVersion: { product: string; revision: string } | undefined
const pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: () => void; timer: ReturnType<typeof setTimeout> }>()
function send(method: string, params: Record<string, unknown> = {}, attached = true): Promise<Record<string, unknown>> {
  alive()
  lastCommand = method
  return new Promise((resolve, reject) => {
    const id = ++serial, fail = () => reject(new Error("CDP unavailable"))
    const timer = setTimeout(() => { pending.delete(id); failure = "CDP command deadline"; fail() }, method === "Page.navigate" ? 35000 : 8000)
    pending.set(id, { resolve, reject: fail, timer })
    try { socket!.send(JSON.stringify({ id, method, params, ...(attached && session ? { sessionId: session } : {}) })) }
    catch { clearTimeout(timer); pending.delete(id); fail() }
  })
}
const evaluate = async (expression: string): Promise<unknown> => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails || !r.result || typeof r.result !== "object") throw new Error("Page inspection refused")
  return (r.result as { value?: unknown }).value
}
try {
  const web = spawn("web", [process.execPath, "--no-env-file", "--no-install", join(root, "scripts/web-screens-server.ts"), ...args])
  await until(() => { if (exited(web)) throw new Error("Web stopped"); return !!serverReady }, 15000)
  origin = serverReady!.origin
  stage = "chrome"
  const browser = spawn("chrome", [chrome, "--headless=new", "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0", "--user-data-dir=" + join(out, "profile"), "--renderer-process-limit=2",
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update",
    "--disable-sync", "--disable-extensions", "--disable-default-apps", "--disable-domain-reliability", "--no-pings",
    "--disable-features=Translate,MediaRouter", "--metrics-recording-only",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "about:blank"])
  const active = join(out, "profile/DevToolsActivePort")
  await until(() => { if (exited(browser)) throw new Error("Chrome stopped"); return existsSync(active) }, 15000)
  const [port, path] = readFileSync(active, "utf8").trim().split("\n")
  if (!port || !/^[1-9][0-9]{0,4}$/.test(port) || !path || !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(path)) throw new Error("CDP endpoint refused")
  cdpOrigin = "http://127.0.0.1:" + port
  socket = new WebSocket("ws://127.0.0.1:" + port + path)
  socket.addEventListener("message", event => {
    try {
      if (typeof event.data !== "string" || event.data.length > 32 * 1024 * 1024) { stop.abort(); return }
      const data = JSON.parse(event.data), p = pending.get(data.id)
      if (!p) return
      pending.delete(data.id); clearTimeout(p.timer)
      if (data.error || !data.result || typeof data.result !== "object") p.reject(); else p.resolve(data.result)
    } catch { stop.abort() }
  })
  socket.addEventListener("error", () => stop.abort())
  await until(() => socket!.readyState === WebSocket.OPEN, 5000)
  const version = await send("Browser.getVersion", {}, false)
  if (typeof version.product !== "string" || typeof version.revision !== "string" || version.product.length > 200 || version.revision.length > 200) throw new Error("CDP endpoint refused")
  browserVersion = { product: version.product, revision: version.revision }
  const target = await send("Target.createTarget", { url: "about:blank" }, false)
  if (typeof target.targetId !== "string") throw new Error("Missing target")
  const attached = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true }, false)
  if (typeof attached.sessionId !== "string") throw new Error("Missing session")
  session = attached.sessionId
  await send("Page.enable")
  stage = "renderer-ready"
  if (await evaluate("2+2") !== 4) throw new Error("Page inspection refused")
  await send("Browser.setDownloadBehavior", { behavior: "deny" }, false)
  await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__screenErrors=[];addEventListener('error',e=>window.__screenErrors.push(String(e.message).slice(0,200)));addEventListener('unhandledrejection',()=>window.__screenErrors.push('Unhandled rejection'));" })
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 })
  for (const scheme of ["light", "dark"]) {
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] })
    for (const page of screenPages(options)) {
      stage = page.name + "-" + scheme
      const url = origin + page.path
      const navigation = await send("Page.navigate", { url })
      if (navigation.errorText) throw new Error("Page navigation failed")
      await until(async () => (await evaluate("location.href===" + JSON.stringify(url) + "&&document.readyState==='complete'&&document.querySelector('main')!==null")) === true, 35000)
      await evaluate("document.fonts.ready.then(()=>true)")
      await sleep(150)
      const observed = await evaluate("({url:location.pathname+location.search,title:document.title,dark:matchMedia('(prefers-color-scheme: dark)').matches,paper:getComputedStyle(document.body).backgroundColor,width:innerWidth,documentWidth:document.documentElement.scrollWidth,text:document.body.innerText.slice(0,6000),errors:window.__screenErrors.slice(0,20),storageKeys:Object.keys(localStorage),wallet:typeof window.ethereum!=='undefined'})") as Record<string, unknown>
      lastObservation = observed
      if (observed.dark !== (scheme === "dark") || observed.width !== 1440 ||
        observed.paper !== (scheme === "dark" ? "rgb(22, 21, 19)" : "rgb(250, 249, 246)")) throw new Error("Actual scheme did not match")
      const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })
      if (typeof shot.data !== "string" || shot.data.length > 16 * 1024 * 1024) throw new Error("Screenshot unavailable")
      const bytes = Buffer.from(shot.data, "base64")
      if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("Not PNG")
      const file = stage + ".png"
      writeFileSync(join(out, "shots", file), bytes, { flag: "wx", mode: 0o600 })
      frames.push({ name: page.name, scheme, file, capturedAt: new Date().toISOString(), sha256: hash(bytes), observed })
      console.log(JSON.stringify({ event: "captured", frame: stage }))
    }
  }
  success = frames.length === 12
} catch (error) {
  failedCommand = lastCommand
  const safe = ["Capture stopped", "Capture deadline", "CDP unavailable", "Page inspection refused", "Web stopped", "Chrome stopped", "CDP endpoint refused", "Missing target", "Missing session", "Page navigation failed", "Actual scheme did not match", "Screenshot unavailable", "Not PNG"]
  if (!failure) failure = error instanceof Error && safe.includes(error.message) ? error.message : "Capture unavailable"
  console.error("Read-only screenshot capture failed at " + stage + "; inspect the owned capture manifest. No automatic retry.")
} finally {
  if (socket?.readyState === WebSocket.OPEN && !stop.signal.aborted) {
    try { await send("Browser.close", {}, false) } catch { /* Exact child cleanup follows. */ }
  }
  socket?.close()
  for (const p of pending.values()) { clearTimeout(p.timer); p.reject() }; pending.clear()
  const reaped: Record<string, unknown>[] = []
  for (const child of [...children].reverse()) {
    if (!exited(child)) child.process.kill("SIGTERM")
    await Promise.race([child.process.exited, sleep(3000)])
    if (!exited(child)) { child.process.kill("SIGKILL"); await Promise.race([child.process.exited, sleep(3000)]) }
    const done = exited(child)
    if (!done) success = false
    reaped.push({ name: child.name, pid: child.process.pid, reaped: done, exitCode: child.process.exitCode, signal: child.process.signalCode,
      stdoutBytes: child.stdoutBytes, stderrBytes: child.stderrBytes })
  }
  await Promise.race([Promise.allSettled(drains), sleep(1000)])
  clearTimeout(fuse); clearInterval(watch)
  process.removeListener("SIGINT", interrupted); process.removeListener("SIGTERM", interrupted)
  writeFileSync(manifest, JSON.stringify({ ...evidence, status: success ? "captured" : "failed", endedAt: new Date().toISOString(),
    stage, origin, cdpOrigin, browserVersion, lastCommand, failedCommand, failure, lastObservation, frames, cleanup: reaped, humanReview: "pending",
    localWrapperStopped: reaped.some(child => child.name === "web" && child.reaped === true) }, null, 2) + "\n", { mode: 0o600 })
  console.log(JSON.stringify({ event: "capture-stopped", output: out, frames: frames.length, success, cleanup: reaped }))
}
process.exit(success ? 0 : 1)
