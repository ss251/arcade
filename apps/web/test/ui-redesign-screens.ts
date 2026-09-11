/** Finite offline UI review. Actual Start routes + owned synthetic hub + fresh headless Chrome.
 * Run from repo root: bun --no-env-file apps/web/test/ui-redesign-screens.ts [--quick] [--output apps/web/evidence/ui-polish]
 * Never connects a real wallet or model. Explicit approval uses a public offline test key
 * against a signature-verifying synthetic loopback hub; no chain request is possible.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"

const root = fileURLToPath(new URL("../../..", import.meta.url))
const approvalReview = process.argv.includes("--approval-review")
const approvalOnly = process.argv.includes("--approval-only")
const chatReview = process.argv.includes("--chat-review")
const chatOnly = approvalReview || approvalOnly || chatReview
const reviewPair = process.argv.includes("--review-pair")
const smoke = process.argv.includes("--journey-smoke") || reviewPair || chatOnly
const outputIndex = process.argv.indexOf("--output")
if (outputIndex >= 0 && (!process.argv[outputIndex + 1] || process.argv[outputIndex + 1]!.startsWith("--"))) throw Error("--output requires a directory")
const outputBase = outputIndex < 0 ? join(root, "apps/web/evidence/ui-redesign") : resolve(root, process.argv[outputIndex + 1]!)
const output = join(outputBase, chatReview ? "chat-review" : approvalOnly ? "approval-proof" : approvalReview ? "approval-review" : smoke ? reviewPair ? "iteration-pair" : "fixture-smoke" : ""), scratch = mkdtempSync(join(tmpdir(), "arcade-ui-review-"))
mkdirSync(output, { recursive: true }); mkdirSync(join(scratch, "home")); mkdirSync(join(scratch, "profile"))
for (const name of ["fixture", "chrome"]) for (const stream of ["stdout", "stderr"]) writeFileSync(join(output, `${name}.${stream}.log`), "")
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if (!existsSync(chrome)) throw Error("Trusted local headless Chrome is unavailable")
const quick = process.argv.includes("--quick")
const accessibility = process.argv.includes("--accessibility")
const env = { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME: join(scratch, "home"), TMPDIR: scratch }
const children: { name: string; process: Bun.Subprocess<"ignore", "pipe", "pipe"> }[] = []
const drains: Promise<void>[] = [], frames: Record<string, unknown>[] = [], errors: string[] = [], consoleErrors: string[] = []
let ready: { web: string; hub: string; seller: string; buyer: string; usdc: string } | undefined, socket: WebSocket | undefined, session = "", serial = 0, stopped = false
const parent = process.ppid
const sourceFingerprint = () => {
  const source = join(root, "apps/web/src"), digest = createHash("sha256")
  for (const path of readdirSync(source, { recursive: true }).filter(path => /\.(?:ts|tsx|css|svg)$/.test(path)).sort()) {
    digest.update(path); digest.update(readFileSync(join(source, path)))
  }
  return digest.digest("hex")
}
let sourceBefore = ""
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const until = async (check: () => boolean | Promise<boolean>, ms = 30_000) => {
  const end = Date.now() + ms
  while (!await check()) { if (stopped || Date.now() > end) throw Error("UI review deadline"); await pause(80) }
}
const spawn = (name: string, args: string[]) => {
  const child = { name, process: Bun.spawn(args, { cwd: root, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" }) }; children.push(child)
  for (const stream of ["stdout", "stderr"] as const) drains.push((async () => {
    const reader = child.process[stream].getReader(), decoder = new TextDecoder(); let carry = "", count = 0
    while (true) {
      const next = await reader.read(); if (next.done) break
      count += next.value.byteLength; if (count > 2_000_000) { stopped = true; continue }
      const text = decoder.decode(next.value, { stream: true }); writeFileSync(join(output, name + "." + stream + ".log"), text, { flag: "a" })
      carry += text; const lines = carry.split("\n"); carry = lines.pop()!
      for (const line of lines) try { const data = JSON.parse(line); if (data.event === "visual-fixture-ready") ready = data } catch { /* Tool diagnostics remain in local log. */ }
    }
  })())
  return child.process
}
const pending = new Map<number, { resolve: (value: Record<string, any>) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
function send(method: string, params: Record<string, unknown> = {}, attached = true): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(Error("CDP timeout: " + method)) }, 40_000)
    pending.set(id, { resolve, reject, timer }); socket!.send(JSON.stringify({ id, method, params, ...(attached && session ? { sessionId: session } : {}) }))
  })
}
async function evaluate(expression: string): Promise<any> {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw Error("Browser evaluation: " + JSON.stringify(result.exceptionDetails).slice(0, 600))
  return result.result?.value
}
async function capture(name: string, width: number, scheme: string) {
  await evaluate("document.fonts.ready.then(() => true)")
  await pause(250)
  const observed = await evaluate(`(() => {
    const over = [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed' && !el.closest('svg') && getComputedStyle(el).visibility !== 'hidden'; });
    const prompt = document.querySelector('.prompt'), promptStyle = prompt && getComputedStyle(prompt);
    const promptMetrics = prompt && {clientHeight:prompt.clientHeight, lineHeight:parseFloat(promptStyle.lineHeight), padding:parseFloat(promptStyle.paddingTop)+parseFloat(promptStyle.paddingBottom)};
    return { pathname: location.pathname, scheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, rootFontSize: getComputedStyle(document.documentElement).fontSize, width: innerWidth, documentWidth: document.documentElement.scrollWidth, title: document.title, text: document.body.innerText.slice(0, 18000), overflow: over.slice(0, 20).map(el => ({ tag: el.tagName, class: el.className, width: el.getBoundingClientRect().width, right: el.getBoundingClientRect().right })), errors: window.__screenErrors, walletRequests: window.__walletRequests, paper: getComputedStyle(document.body).backgroundColor, approvalRect:document.querySelector('button.approve')?.getBoundingClientRect().toJSON(), composerRect:document.querySelector('.composer')?.getBoundingClientRect().toJSON(), promptMetrics };
  })()`)
  if (observed.width !== width || observed.scheme !== scheme) throw Error("Viewport or scheme mismatch")
  if (observed.promptMetrics && observed.promptMetrics.clientHeight < observed.promptMetrics.lineHeight + observed.promptMetrics.padding - 1) throw Error("Composer clips its first text line at the current font size")
  const file = `${name}-${width}-${scheme}.png`, fullFile = `${name}-${width}-${scheme}-full.png`
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })
  writeFileSync(join(output, file), Buffer.from(shot.data, "base64"))
  const metrics = await send("Page.getLayoutMetrics"), height = Math.min(9000, Math.ceil(metrics.cssContentSize.height))
  const full = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } })
  writeFileSync(join(output, fullFile), Buffer.from(full.data, "base64"))
  frames.push({ name, width, scheme, file, fullFile, observed, consoleErrors: consoleErrors.splice(0) })
  console.log(JSON.stringify({ event: "ui-frame", file, fullFile, overflow: observed.documentWidth > width, errors: observed.errors }))
}
async function click(selector: string) {
  await until(async () => await evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});return !!el&&!el.disabled;})()`))
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`)
  await pause(150)
  const point = await evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)}),r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return{x,y,hit:hit===el||el.contains(hit)};})()`)
  if (!point.hit) throw Error("Pointer target is covered: " + selector)
  await send("Input.dispatchMouseEvent", {type:"mouseMoved",x:point.x,y:point.y})
  await send("Input.dispatchMouseEvent", {type:"mousePressed",x:point.x,y:point.y,button:"left",buttons:1,clickCount:1})
  await send("Input.dispatchMouseEvent", {type:"mouseReleased",x:point.x,y:point.y,button:"left",buttons:0,clickCount:1})
}
async function enterText(selector: string, value: string) {
  await click(selector)
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`)
  await send("Input.insertText", {text:value})
  await pause(100)
}
async function chooseOption(selector: string, value: string) {
  await evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  await pause(100)
}
async function captureControlStates(selector: string, name: string, width: number, scheme: string) {
  await until(async () => await evaluate(`!!document.querySelector(${JSON.stringify(selector)})&&!document.querySelector(${JSON.stringify(selector)}).disabled`))
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'});document.querySelector(${JSON.stringify(selector)}).focus({preventScroll:true})`)
  await send("Input.dispatchMouseEvent", {type:"mouseMoved",x:width-2,y:2})
  for (const modifiers of [0,8]) {
    await send("Input.dispatchKeyEvent", {type:"keyDown",key:"Tab",code:"Tab",windowsVirtualKeyCode:9,modifiers})
    await send("Input.dispatchKeyEvent", {type:"keyUp",key:"Tab",code:"Tab",windowsVirtualKeyCode:9,modifiers})
  }
  if (!await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(selector)})&&document.activeElement.matches(':focus-visible')`)) throw Error("Keyboard focus did not return to the reviewed control")
  await capture(name+"-focus",width,scheme)
  await evaluate("document.activeElement.blur()")
  const point = await evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)}),r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el||el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};})()`)
  if (!point.hit) throw Error("Reviewed control is covered")
  await send("Input.dispatchMouseEvent", {type:"mouseMoved",x:point.x,y:point.y})
  await capture(name+"-hover",width,scheme)
  await send("Input.dispatchMouseEvent", {type:"mousePressed",x:point.x,y:point.y,button:"left",buttons:1,clickCount:1})
  if (!await evaluate(`document.querySelector(${JSON.stringify(selector)}).matches(':active')`)) throw Error("Reviewed control did not receive pointer-down")
  await capture(name+"-pressed",width,scheme)
  await send("Input.dispatchMouseEvent", {type:"mouseReleased",x:point.x,y:point.y,button:"left",buttons:0,clickCount:1})
  await until(async () => await evaluate(`!document.querySelector(${JSON.stringify(selector)}).disabled`))
}
const stop = () => { stopped = true }
const fuse = setTimeout(stop, 550_000), watch = setInterval(() => { if (process.ppid !== parent) stop() }, 500)
process.once("SIGINT", stop); process.once("SIGTERM", stop)
let success = false, fixtureProof: Record<string, unknown> | null = null
try {
  const web = spawn("fixture", [process.execPath, "--no-env-file", "--no-install", join(root, "apps/web/test/fixtures/ui-redesign-server.ts")])
  await until(() => { if (web.exitCode !== null) throw Error("Fixture exited"); return !!ready }, 90_000)
  sourceBefore = sourceFingerprint()
  const browser = spawn("chrome", [chrome, "--headless=new", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", "--user-data-dir=" + join(scratch, "profile"),
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--disable-default-apps",
    "--disable-domain-reliability", "--no-pings", "--password-store=basic", "--use-mock-keychain", "--renderer-process-limit=2", "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--disable-features=Translate,MediaRouter", "--metrics-recording-only", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", ready!.web])
  const active = join(scratch, "profile/DevToolsActivePort")
  await until(() => { if (browser.exitCode !== null) throw Error("Chrome exited"); return existsSync(active) })
  const [port] = readFileSync(active, "utf8").trim().split("\n")
  let pageSocket = ""
  let loggedTargets = false
  await until(async () => {
    let targets: {type:string;url:string;webSocketDebuggerUrl:string}[]
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as typeof targets }
    catch { return false } // DevToolsActivePort can precede its loopback listener by a few milliseconds.
    if (!loggedTargets) { console.log(JSON.stringify({event:"chrome-initial-targets",targets:targets.map(item=>({type:item.type,url:item.url}))})); loggedTargets=true }
    pageSocket = targets.find(item => item.type === "page" && item.url.startsWith(ready!.web))?.webSocketDebuggerUrl ?? ""
    return !!pageSocket
  })
  socket = new WebSocket(pageSocket)
  socket.addEventListener("message", event => {
    const data = JSON.parse(String(event.data)), request = pending.get(data.id)
    if (request) { clearTimeout(request.timer); pending.delete(data.id); if (data.error) request.reject(Error(JSON.stringify(data.error))); else request.resolve(data.result) }
    else if (data.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(data.params.type)) consoleErrors.push(data.params.args.map((arg: any) => arg.value ?? arg.description).join(" ").slice(0, 800))
    else if (data.method === "Runtime.exceptionThrown") consoleErrors.push(JSON.stringify(data.params.exceptionDetails).slice(0, 800))
  })
  await until(() => socket!.readyState === WebSocket.OPEN)
  console.log(JSON.stringify({event:"chrome-page-socket-ready"}))
  await send("Runtime.runIfWaitingForDebugger")
  await send("Page.enable"); await send("Runtime.enable"); await send("Browser.setDownloadBehavior", { behavior: "deny" }, false)
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__screenErrors=[];window.__walletRequests=[];
    addEventListener('error',e=>window.__screenErrors.push(String(e.message)));
    addEventListener('unhandledrejection',e=>window.__screenErrors.push(String(e.reason)));
    Object.defineProperty(window,'ethereum',{value:Object.freeze({on(){},removeListener(){},async request({method,params}){window.__walletRequests.push(method);if(method==='eth_chainId')return '0x4cef52';if(method==='eth_accounts'||method==='eth_requestAccounts')return [${JSON.stringify(ready!.buyer)}];if(method==='eth_call'){if(window.__walletFail)throw Error('Synthetic balance unavailable');if(params?.[0]?.to?.toLowerCase()!==${JSON.stringify(ready!.usdc.toLowerCase())}||params?.[0]?.data!==${JSON.stringify('0x70a08231'+ready!.buyer.toLowerCase().slice(2).padStart(64,'0'))}||params?.[1]!=='latest')throw Error('Offline fixture refuses nonbalance RPC');return '0x0000000000000000000000000000000000000000000000000000000000bc614e';}if(method==='eth_signTypedData_v4'){const r=await fetch('/__visual-sign',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({account:params[0],typedData:JSON.parse(params[1])})});if(!r.ok)throw Error('Offline test signature refused');return(await r.json()).signature;}throw Error('Offline visual fixture refuses RPC');}})});
  ` })
  for (const width of chatReview ? [834,1440] : reviewPair ? [390,1440] : quick || accessibility || smoke ? [390] : [390, 834, 1440]) for (const scheme of chatReview ? [width === 834 ? "light" : "dark"] : chatOnly ? ["light","dark"] : reviewPair ? [width === 390 ? "light" : "dark"] : quick || accessibility || smoke ? ["light"] : ["light", "dark"]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : width === 834 ? 1112 : 1000, mobile: false, deviceScaleFactor: 1 })
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: accessibility ? "reduce" : "no-preference" }] })
    for (const page of [{ name: "market", path: "/" }, { name: "skill", path: "/skill/diff-triage" }, { name: "buyer", path: "/buyer" },
      { name: "seller", path: "/seller?address=" + ready!.seller }, { name: "publish", path: "/publish" }, { name: "chat", path: "/chat" }]) {
      if (chatOnly && page.name !== "chat") continue
      if (accessibility && !["market", "chat"].includes(page.name)) continue
      consoleErrors.length = 0
      if (page.name === "skill") await click("a[href='/skill/diff-triage']")
      else await send("Page.navigate", { url: ready!.web + page.path })
      await until(async () => await evaluate("document.readyState==='complete'&&document.querySelector('main')!==null"))
      await pause(500)
      if (accessibility && page.name === "market") {
        // Prove the SSR page has interactive client state before mutating root type size.
        // Otherwise the test's style attribute itself can cause a hydration warning.
        await enterText(".market-search input", "__visual_hydration_probe__")
        await until(async () => await evaluate("document.querySelectorAll('.listing-card').length===0&&!!document.querySelector('.empty-state button')"))
        await click(".empty-state button")
        await until(async () => await evaluate("document.querySelectorAll('.listing-card').length===4&&document.querySelector('.market-search input').value===''") )
        await evaluate("window.scrollTo(0,0)")
      }
      if (accessibility) await evaluate("document.documentElement.style.fontSize='200%'")
      if (page.name === "market") await evaluate(`localStorage.setItem('arcade.jobs.v1',JSON.stringify([
        {jobId:'job_${"4".repeat(32)}',token:'${"b".repeat(32)}',skillId:'diff-triage',priceAtomic:'120000',createdAtMs:${Date.now() - 3_600_000},hubOrigin:${JSON.stringify(ready!.hub)},realm:'ordinary'},
        {jobId:'job_${"5".repeat(32)}',token:'${"a".repeat(32)}',skillId:'research-brief',priceAtomic:'80000',createdAtMs:${Date.now() - 86_400_000},hubOrigin:${JSON.stringify(ready!.hub)},realm:'ordinary'}]))`)
      if (page.name === "buyer") { await until(async () => await evaluate("!!document.querySelector('.buyer-job')")); await click(".buyer-job"); await evaluate("window.scrollTo(0,0)") }
      await capture(page.name + (accessibility ? "-large-type" : ""), width, scheme)
      if (page.name === "market" && accessibility) {
        await evaluate("document.querySelector('.market-toolbar').scrollIntoView({block:'start',behavior:'instant'});window.scrollBy(0,-document.querySelector('.nav').getBoundingClientRect().height-16)")
        await capture("market-controls-large-type",width,scheme)
      }
      if (page.name === "market" && !accessibility) {
        const before = await (await fetch(ready!.hub + "/__visual-state")).json() as Record<string, number>
        const cards = () => evaluate("[...document.querySelectorAll('.listing-card .card-title')].map(el=>el.innerText)")
        await enterText(".market-search input", "research")
        if (JSON.stringify(await cards()) !== '["Research Brief"]') throw Error("Catalog search did not filter names and descriptions")
        await enterText(".market-search input", "fixture-no-such-skill")
        await until(async () => (await cards()).length === 0)
        await capture("market-no-results",width,scheme)
        await click(".empty-state button")
        if ((await cards()).length !== 4) throw Error("No-result reset did not restore catalog")
        await chooseOption(".market-sort select", "price-high")
        if ((await cards())[0] !== "Diff Triage") throw Error("High-price sort is incorrect")
        await chooseOption(".market-sort select", "price-low")
        if ((await cards())[0] !== "Schema Check") throw Error("Low-price sort is incorrect")
        for (const [sort,first] of [["settlement-rate","Diff Triage"],["latency","Schema Check"],["evidence","Diff Triage"]]) {
          await chooseOption(".market-sort select",sort!)
          const sorted = await cards()
          if (sorted[0] !== first || sorted.at(-1) !== "Test Writer") throw Error("Measured sort did not preserve unknown-last behavior: " + sort)
        }
        await evaluate("[...document.querySelectorAll('button.filter-chip')].find(el=>el.textContent.trim()==='code').click()")
        if ((await cards()).length !== 2) throw Error("Code tag did not select two matching skills")
        await click(".market-reset")
        await click(".market-filters summary")
        await enterText(".market-price-range input[placeholder='No minimum']", "0.06")
        await enterText(".market-price-range input[placeholder='No maximum']", "0.08")
        if (JSON.stringify((await cards()).sort()) !== '["Research Brief","Test Writer"]') throw Error("Exact inclusive price range is incorrect")
        await evaluate("document.querySelector('.market-toolbar').scrollIntoView({block:'start'})")
        await capture("market-filtered",width,scheme)
        await click(".market-reset")
        await click(".market-filters summary")
        const activityBefore = await (await fetch(ready!.hub + "/__visual-state")).json() as Record<string,number>
        await click(".market-activity button")
        await until(async () => (await (await fetch(ready!.hub + "/__visual-state")).json() as Record<string,number>).receiptReads === activityBefore.receiptReads! + 1)
        await until(async () => await evaluate("!document.querySelector('.market-activity button').disabled"))
        await evaluate("document.querySelector('.market-activity').scrollIntoView({block:'start'})")
        await capture("market-activity",width,scheme)
        const after = await (await fetch(ready!.hub + "/__visual-state")).json() as Record<string,number>
        if (["quotes","modelCalls","purchases","signatures"].some(key=>after[key]!==before[key])) throw Error("Discovery control caused payment or model activity")
        frames.at(-1)!.discoveryVerification = {search:true,emptyReset:true,priceSort:true,tagFilter:true,exactPriceRange:true,explicitActivityReads:1,automaticPaidActivity:0}
        await evaluate("window.scrollTo(0,0)")
      }
      if (page.name === "skill") {
        const before = await (await fetch(ready!.hub + "/__visual-state")).json() as {quotes: number; modelCalls: number; purchases: number; signatures: number}
        await enterText(".skill-try-input", "{bad json")
        if (!await evaluate("document.querySelector('.skill-try form button[type=submit]').disabled")) throw Error("Invalid example input was allowed to continue")
        const draft = JSON.stringify({diff:"--- a/example.ts\n+++ b/example.ts\n- return null\n+ return value"},null,2)
        await enterText(".skill-try-input",draft)
        await capture("skill-input",width,scheme)
        await click(".skill-example summary")
        await click(".skill-api summary")
        await evaluate("document.querySelector('.skill-api').scrollIntoView({block:'start'})")
        await capture("skill-api",width,scheme)
        await click(".skill-try form button[type=submit]")
        await until(async () => await evaluate("location.pathname==='/chat'&&document.querySelector('.prompt')?.value.includes('diff-triage')"))
        await until(async () => await evaluate("document.querySelector('.prompt').value.includes('example.ts')&&sessionStorage.getItem('arcade:skill-draft:v1:diff-triage')===null"), 5000)
        await capture("chat-context", width, scheme)
        await send("Page.navigate", {url:ready!.web + "/chat"})
        await until(async () => await evaluate("!!document.querySelector('.chat-suggestions button')"))
        await click(".chat-suggestions button")
        const observed = await evaluate("({focused:document.activeElement===document.querySelector('.prompt'),text:document.querySelector('.prompt').value,approval:!!document.querySelector('.confirm')})")
        const after = await (await fetch(ready!.hub + "/__visual-state")).json() as typeof before
        if (!observed.focused || !observed.text.startsWith("Help me find") || observed.approval || ["quotes", "modelCalls", "purchases", "signatures"].some(key => after[key as keyof typeof before] !== before[key as keyof typeof before])) throw Error("Skill context or suggestion caused unintended activity")
        frames.at(-1)!.contextVerification = { listingInput: true, invalidInputBlocked: true, oneShotDraft: true, prefilled: true, suggestionFocused: observed.focused, autoCalls: 0, autoQuotes: 0, autoSignatures: 0 }
      }
      if (page.name === "buyer") {
        if (await evaluate("window.__walletRequests.length!==0")) throw Error("Wallet was read automatically on buyer mount")
        if (width === 1440 && scheme === "dark") {
          await captureControlStates(".buyer-job","buyer-job",width,scheme)
          await captureControlStates(".buyer-recovery > .section-heading button","buyer-action",width,scheme)
        }
        await click(".wallet-overview button")
        await until(async () => await evaluate("!!document.querySelector('.wallet-amount')"))
        await evaluate("document.querySelector('.wallet-overview').scrollIntoView({block:'start'})")
        await capture("buyer-wallet",width,scheme)
        if (!await evaluate("document.querySelector('.wallet-amount').textContent.includes('12.345678')")) throw Error("Synthetic six-decimal USDC balance was not displayed")
        await click(".wallet-overview button")
        await until(async () => await evaluate("window.__walletRequests.filter(method=>method==='eth_call').length===2&&!!document.querySelector('.wallet-amount')"))
        if (!await evaluate("window.__walletRequests.filter(method=>method==='eth_requestAccounts').length===1&&!window.__walletRequests.some(method=>method.startsWith('eth_sign'))")) throw Error("Balance refresh requested connection or signing again")
        await evaluate("window.__walletFail=true")
        await click(".wallet-overview button")
        await until(async () => await evaluate("document.querySelector('.wallet-status').innerText.includes('Could not read')"))
        await capture("buyer-wallet-unavailable",width,scheme)
        frames.at(-1)!.walletVerification = {synthetic:true,mountRequests:0,explicitBalanceReads:3,refreshConnectionRequests:0,signatures:0,failureShowsUnknown:true}
        await evaluate("window.__walletFail=false")
        await click(".buyer-recovery > .section-heading button")
        await until(async () => await evaluate("!!document.querySelector('.buyer-recovery .result-readable')"))
        await evaluate("document.querySelector('.buyer-recovery').scrollIntoView({block:'start'})")
        await capture("buyer-result", width, scheme)
        await click(".buyer-tree-section button")
        await until(async () => await evaluate("!!document.querySelector('.buyer-tree-section .tree-viewport')"))
        await evaluate("document.querySelector('.buyer-tree-section').scrollIntoView({block:'start'})")
        await capture("buyer-tree", width, scheme)
        await evaluate("[...document.querySelectorAll('[aria-label=\"Receipt view\"] button')].find(el=>el.innerText==='List').click()")
        await until(async () => await evaluate("document.querySelectorAll('.buyer-tree-section .tree-list > li').length===3&&document.querySelector('.buyer-tree-section .tree-list > li').classList.contains('is-root')&&!document.querySelector('.buyer-tree-section .tree-viewport')"))
        await capture("buyer-tree-list",width,scheme)
        await evaluate("[...document.querySelectorAll('[aria-label=\"Receipt view\"] button')].find(el=>el.innerText==='Diagram').click()")
        await until(async () => await evaluate("!!document.querySelector('.buyer-tree-section .tree-viewport')&&!document.querySelector('.buyer-tree-section .tree-list')"))
        frames.at(-1)!.treeToggleVerification = {listCalls:3,diagramRestored:true}
        {
          await fetch(ready!.hub + "/__visual-state?result=fail")
          await click(".buyer-recovery > .section-heading button")
          await until(async () => await evaluate("!!document.querySelector('[aria-label=\"Recovered result\"] .state-panel')"))
          await evaluate("document.querySelector('.buyer-recovery').scrollIntoView({block:'start'})")
          await capture("buyer-unavailable", width, scheme)
          await fetch(ready!.hub + "/__visual-state?result=normal")
        }
        const saved = await evaluate("localStorage.getItem('arcade.jobs.v1')")
        await evaluate("localStorage.removeItem('arcade.jobs.v1')")
        await send("Page.navigate", { url: ready!.web + "/buyer" })
        await until(async () => await evaluate("document.readyState==='complete'&&document.querySelector('.buyer-page')!==null&&!document.querySelector('.buyer-job')"))
        await capture("buyer-empty", width, scheme)
        await evaluate("localStorage.setItem('arcade.jobs.v1'," + JSON.stringify(saved) + ")")
      }
      if (page.name === "seller") {
        await send("Page.navigate", { url: ready!.web + "/seller" })
        await until(async () => await evaluate("document.readyState==='complete'&&document.querySelector('.seller-page')!==null"))
        await capture("seller-start", width, scheme)
      }
      if (page.name === "publish") {
        await until(async () => await evaluate("!!document.querySelector('.publish-page form button[type=submit]')"))
        await click(".publish-page form button[type=submit]")
        await until(async () => await evaluate("!!document.querySelector('.publish-result')"))
        await evaluate("window.scrollTo(0,0)")
        await capture("publish-preview", width, scheme)
      }
      if (page.name === "chat") {
        await until(async () => await evaluate("!!document.querySelector('.prompt:not(:disabled)')"))
        if (chatReview) {
          await click(".chat-suggestions button")
          await until(async () => await evaluate("document.querySelector('.prompt').value.startsWith('Help me find')"))
          await evaluate("document.querySelector('.prompt').select()")
        }
        await click(".prompt"); await send("Input.insertText", { text: "Review my code change with Diff Triage." }); await click(".send")
        await until(async () => await evaluate("!!document.querySelector('button.approve:not(:disabled)')"))
        const scrollMetrics = () => evaluate("(() => {const viewport=document.querySelector('.viewport');return {windowY:scrollY,card:document.querySelector('.confirm').getBoundingClientRect().toJSON(),amount:document.querySelector('.confirm .price-big').getBoundingClientRect().toJSON(),viewport:viewport.getBoundingClientRect().toJSON(),nav:document.querySelector('.nav').getBoundingClientRect().toJSON(),scrollTop:viewport.scrollTop,scrollHeight:viewport.scrollHeight,clientHeight:viewport.clientHeight,autoscrolling:[...document.querySelectorAll('[data-autoscrolling]')].map(el=>el.getAttribute('data-autoscrolling'))};})()")
        await pause(1000)
        const firstShow = await scrollMetrics()
        let framing: Record<string,unknown> | undefined
        if (approvalReview) {
          framing = {initial:firstShow}
          await capture("chat-approval-initial",width,scheme)
          framing.beforeNative = await scrollMetrics()
          await evaluate("document.querySelector('.confirm').scrollIntoView({block:'start',behavior:'instant'})")
          await pause(250); framing.afterNative=await scrollMetrics()
          await evaluate("(() => {window.scrollTo(0,0);const viewport=document.querySelector('.viewport'),card=document.querySelector('.confirm');viewport.scrollTop+=card.getBoundingClientRect().top-viewport.getBoundingClientRect().top;})()")
          await pause(500); framing.afterInner=await scrollMetrics()
        } else {
          const navOverlapsCard = firstShow.nav.right > firstShow.card.left && firstShow.nav.left < firstShow.card.right
          const visibleTop = Math.max(firstShow.viewport.top, navOverlapsCard ? firstShow.nav.bottom : 0)
          if (firstShow.card.top < visibleTop - 1 || firstShow.card.top >= firstShow.viewport.bottom || !accessibility && firstShow.amount.bottom > firstShow.viewport.bottom) {
            throw Error("Approval first-show clipped its header behind navigation or its amount before any harness scrolling")
          }
        }
        await capture("chat-approval" + (accessibility ? "-large-type" : ""), width, scheme)
        frames.at(-1)!.firstShowVerification=firstShow
        if (framing) frames.at(-1)!.framingVerification=framing
        // Capture the actual pointer-down state, then cancel well before the 900ms hold.
        // This first gesture is cancellation evidence; the separate full hold below is explicit.
        await evaluate("document.querySelector('button.approve').scrollIntoView({block:'center',behavior:'instant'})")
        await pause(150)
        const button = await evaluate("(() => {const el=document.querySelector('button.approve');const r=el.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:document.elementFromPoint(x,y)?.closest('button.approve')===el};})()")
        if (!button.hit) throw Error("Approval control is occluded after scrolling into view")
        await send("Input.dispatchMouseEvent", { type: "mousePressed", x: button.x, y: button.y, button: "left", clickCount: 1 })
        await pause(160)
        const activeHold = await evaluate("Number(document.querySelector('button.approve').style.getPropertyValue('--p'))")
        if (!(activeHold > 0 && activeHold < 1)) throw Error("Pointer-down did not start actual hold progress")
        const held = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: button.x, y: button.y, button: "left", clickCount: 1 })
        const heldFile = `chat-approval-holding${accessibility ? "-large-type" : ""}-${width}-${scheme}.png`
        writeFileSync(join(output, heldFile), Buffer.from(held.data, "base64"))
        await pause(220)
        const hold = await evaluate("({progress:document.querySelector('button.approve')?.style.getPropertyValue('--p'),walletRequests:window.__walletRequests,enabled:!!document.querySelector('button.approve:not(:disabled)')})")
        if (!hold.enabled || Number(hold.progress) > 0 || hold.walletRequests.some((method: string) => !["eth_chainId", "eth_accounts", "eth_requestAccounts"].includes(method))) throw Error("Canceled hold did not remain unsigned")
        frames.at(-1)!.holdVerification = { file: heldFile, pointerHoldMs: 160, activeProgress:activeHold, canceled: true, observed: hold }
        if (!accessibility) {
          const before = await (await fetch(ready!.hub + "/__visual-state?result=hold")).json() as { purchases: number; signatures: number }
          const point = await evaluate("(() => {const el=document.querySelector('button.approve');el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()")
          await send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 })
          await pause(1050)
          await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 })
          await until(async () => (await (await fetch(ready!.hub + "/__visual-state")).json() as {held: number}).held > 0)
          await evaluate("document.querySelector('.purchase-outcome').scrollIntoView({block:'start',behavior:'instant'})")
          await capture("chat-working", width, scheme)
          await fetch(ready!.hub + "/__visual-state?result=normal")
          await until(async () => await evaluate("!!document.querySelector('.purchase-outcome .result-readable')"))
          await evaluate("document.querySelector('.purchase-outcome').scrollIntoView({block:'start',behavior:'instant'})")
          await capture("chat-result", width, scheme)
          const after = await (await fetch(ready!.hub + "/__visual-state")).json() as { purchases: number; signatures: number }
          if (after.purchases !== before.purchases + 1 || after.signatures !== before.signatures + 1) throw Error("Synthetic purchase was not exactly once")
          frames.at(-1)!.purchaseVerification = { synthetic: true, newSignatures: after.signatures - before.signatures, acceptedCalls: after.purchases - before.purchases }
        }
      }
    }
    if (!accessibility && !chatOnly) {
      await fetch(ready!.hub + "/__visual-state?market=fail")
      await send("Page.navigate", { url: ready!.web + "/" })
      await until(async () => await evaluate("document.readyState==='complete'&&document.querySelector('main')!==null"))
      await pause(500)
      await capture("market-unavailable", width, scheme)
      await fetch(ready!.hub + "/__visual-state?market=normal")
      await send("Page.navigate", {url:ready!.web + "/fixture-page-does-not-exist"})
      await until(async () => await evaluate("document.readyState==='complete'&&!!document.querySelector('.route-state')"))
      await capture("route-not-found",width,scheme)
    }
  }
  if (frames.some(frame => {const observed=frame.observed as {errors:string[];documentWidth:number;width:number};return observed.errors.length > 0 || observed.documentWidth > observed.width})) throw Error("Rendered page has a runtime error or document-level horizontal overflow")
  fixtureProof = await (await fetch(ready!.hub + "/__visual-state")).json() as Record<string, unknown>
  if (fixtureProof.refused !== 0) throw Error("Fixture refused an unexpected network request; inspect fixture diagnostics")
  success = true
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error)); console.error(errors.at(-1))
  if (socket?.readyState === WebSocket.OPEN) try {
    writeFileSync(join(output, "failure-state.json"), JSON.stringify(await evaluate("({text:document.body.innerText,url:location.href,buttons:[...document.querySelectorAll('button')].map(el=>({text:el.innerText,disabled:el.disabled,rect:el.getBoundingClientRect().toJSON()}))})"), null, 2))
    const shot = await send("Page.captureScreenshot", {format:"png",captureBeyondViewport:false})
    writeFileSync(join(output,"failure.png"), Buffer.from(shot.data,"base64"))
  } catch { /* Preserve the original failure if the renderer itself is unavailable. */ }
}
finally {
  socket?.close()
  for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error("Capture closed")) }
  pending.clear()
  for (const child of children.reverse()) {
    if (child.process.exitCode === null) child.process.kill("SIGTERM")
    await Promise.race([child.process.exited, pause(3000)])
    if (child.process.exitCode === null) { child.process.kill("SIGKILL"); await child.process.exited }
  }
  await Promise.allSettled(drains)
  rmSync(scratch, {recursive:true,force:true})
  clearTimeout(fuse); clearInterval(watch)
  const sourceAfter = sourceFingerprint()
  if (sourceBefore !== sourceAfter) { success = false; errors.push("Web source changed during capture; recapture after source is stable") }
  writeFileSync(join(output, accessibility ? "capture-accessibility.json" : "capture.json"), JSON.stringify({ status: success ? "captured" : "failed", capturedAt: new Date().toISOString(),
    source: "Actual Start routes with synthetic loopback hub. Public offline test-key signing after explicit hold; no real wallet, model, funds, chain request or chain verification.",
    sourceBefore, sourceAfter, sourceStable: sourceBefore === sourceAfter, fixtureProof,
    stylesheetSha256: createHash("sha256").update(readFileSync(join(root, "apps/web/src/styles.css"))).digest("hex"), errors, frames }, null, 2) + "\n")
  writeFileSync(join(output, accessibility ? "README-accessibility.md" : "README.md"), ["# ARCADE UI redesign — rendered evidence", "",
    "Captured in a fresh headless Google Chrome profile against the actual TanStack Start dev server. All hub facts, saved jobs, and model messages are synthetic loopback fixtures. These images are visual evidence, not evidence of chain settlement. After an explicit complete hold, the fixture uses the repo's public offline test key (0x01 repeated 32 times; never fund) to exercise the actual purchase-run callbacks against a synthetic signature-verifying hub. Wallet-balance frames use a synthetic 12.345678 USDC response, strictly for the configured balanceOf call; this is not a real balance. No live provider, funds, model, chain RPC, or ambient key is available.", "",
    `Reproduce from the repository root: \`bun --no-env-file apps/web/test/ui-redesign-screens.ts --output ${JSON.stringify(outputBase)}${accessibility ? " --accessibility" : chatReview ? " --chat-review" : approvalOnly ? " --approval-only" : approvalReview ? " --approval-review" : reviewPair ? " --review-pair" : smoke ? " --journey-smoke" : quick ? " --quick" : ""}\`. The runner owns and stops Vite, the fixture hub, and Chrome. It uses existing dependencies and does not load environment files.`, "",
    "Viewport widths are 390, 834, and 1440 CSS pixels at 1× in both system schemes. Each route has an initial viewport image and a `-full` image. Chat remains a real internally scrolling surface. Approval is first captured spontaneously after the stream settles, without scrolling it into place; the runner rejects a clipped header or amount. It also has a `-holding` image; the first gesture must hit the control and produce nonzero progress, then release before approval, return to zero progress, and remain unsigned. A separate completed hold then runs the real callback chain: quote, one test signature, one accepted synthetic call, waiting, and result. `purchaseVerification` records exactly-once counts. The reduced-motion / 200% root-font pass stops after the canceled hold.", "",
    "`publish` is the enabled local preview form; `publish-preview` is its canonical synthetic result. No publishing CLI is invoked. `buyer` contains two synthetic saved jobs and an explicitly selected recovery panel. `capture.json` records rendered text, browser exceptions, console errors, horizontal geometry, scheme, and the stylesheet hash.", "",
    `Capture status: **${success ? "completed" : "failed"}**. Human visual review remains a separate step.`, "",
    "| Route / state | Width | Scheme | Viewport | Full page |", "| --- | ---: | --- | --- | --- |",
    ...frames.map(frame => `| ${frame.name} | ${frame.width} | ${frame.scheme} | [PNG](${frame.file}) | [PNG](${frame.fullFile}) |`), ""
  ].join("\n"))
  console.log(JSON.stringify({ event: "ui-review-complete", success, frames: frames.length, output }))
}
process.exit(success ? 0 : 1)
