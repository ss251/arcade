import { expect, test } from "bun:test"
import { startCircleCaptureListener } from "./circle-capture-listener.ts"
import { CAPTURE_DUMMY_SIGNATURE, readCircleCaptureArtifact } from "./capture-x402-header.ts"
import { readFileSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { connect } from "node:net"

const payer = "0x" + "1".repeat(40), payTo = "0x" + "2".repeat(40)
const rawSyntheticSignature = "0x" + "22".repeat(65)
const post = (url: string, headers: Record<string, string> = {}) =>
  fetch(url, { method: "POST", headers, body: "{}", signal: AbortSignal.timeout(3000) })
async function closedPort(endpoint: string) {
  const port = Number(new URL(endpoint).port)
  return new Promise<string>(resolve => {
    const socket = connect({ host: "127.0.0.1", port })
    const end = (outcome: string) => { socket.destroy(); resolve(outcome) }
    socket.setTimeout(1000, () => end("timeout"))
    socket.once("connect", () => end("still_listening"))
    socket.once("error", error => end((error as NodeJS.ErrnoException).code ?? "unknown"))
  })
}
function header(accepted: Record<string, unknown>) {
  return Buffer.from(JSON.stringify({ x402Version: 2, payload: { authorization: {
    from: payer, to: payTo, value: "10000", validAfter: "1000", validBefore: "2593600", nonce: "0x" + "a".repeat(64),
  }, signature: rawSyntheticSignature }, accepted })).toString("base64")
}
test("owned synthetic listener captures shape once, returns no bearer, and closes", async () => {
  const listener = await startCircleCaptureListener({ payer, payTo })
  try {
    expect(readdirSync(listener.directory).sort()).toEqual([".claim", "context.json"])
    const challenge = await post(listener.endpoint); expect(challenge.status).toBe(402)
    const body = await challenge.json() as { accepts: Record<string, unknown>[] }
    expect(body.accepts).toHaveLength(1)
    expect(body.accepts[0]).toMatchObject({ resource: listener.endpoint, payTo, amount: "10000", maxTimeoutSeconds: 604900 })
    // Deliberately preserve the simulated external client's30-day echo.
    const signed = await post(listener.endpoint, { "payment-signature": header({ ...body.accepts[0], maxTimeoutSeconds: 2592000 }) })
    expect(signed.status).toBe(200)
    expect(await signed.json()).toEqual({ captured: true, authenticated: false, settled: false })
    const result = await listener.finished
    expect(result).toMatchObject({ status: "captured", listenerClosed: true, clientAcknowledgement: "unconfirmed", clientIdentity: "unverified" })
    expect(result.artifact?.authenticated).toBe(false)
    expect(await closedPort(listener.endpoint)).toBe("ECONNREFUSED")
    const artifact = readCircleCaptureArtifact(listener.directory)
    expect(JSON.parse(artifact.fixtureJson).payload.signature).toBe(CAPTURE_DUMMY_SIGNATURE)
    expect(JSON.parse(artifact.fixtureJson).accepted.maxTimeoutSeconds).toBe(2592000)
    for (const name of readdirSync(listener.directory)) expect(readFileSync(join(listener.directory, name), "utf8")).not.toContain(rawSyntheticSignature)
  } finally { await listener.close(); rmSync(listener.directory, { recursive: true, force: true }) }
}, 7000)

const refused = /^circle_capture_listener_refused$/

test("successful capture also closes a separate incomplete owned connection", async () => {
  const listener = await startCircleCaptureListener({ payer, payTo })
  const socket = connect({ host: "127.0.0.1", port: Number(new URL(listener.endpoint).port) })
  const gone = new Promise<void>(resolve => { socket.on("error", () => {}); socket.once("close", () => resolve()) })
  try {
    await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject) })
    socket.write("POST /x/demo/usdc-flow-check HTTP/1.1\r\nHost: 127.0.0.1\r\n")
    const challenge = await post(listener.endpoint), body = await challenge.json() as { accepts: Record<string, unknown>[] }
    const response = await post(listener.endpoint, { "payment-signature": header(body.accepts[0]!) })
    expect(response.status).toBe(200); await response.text()
    expect(await listener.finished).toMatchObject({ status: "captured", listenerClosed: true, clientAcknowledgement: "unconfirmed" })
    await Promise.race([gone, new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(Error("owned socket not closed")), 1000); gone.then(() => clearTimeout(timer))
    })])
    expect(await closedPort(listener.endpoint)).toBe("ECONNREFUSED")
  } finally { socket.destroy(); await listener.close(); rmSync(listener.directory, { recursive: true, force: true }) }
}, 5000)
test("actual child never fabricates shutdown acknowledgement when the real stop acknowledgement is withheld", async () => {
  const { spawnSync } = await import("node:child_process")
  const script = `import{connect}from"node:net";import{rmSync}from"node:fs";
    const realServe=Bun.serve.bind(Bun);let stops=0,actualClosed=false;
    Bun.serve=opts=>{const server=realServe(opts);return{port:server.port,stop(force){stops++;server.stop(force).then(()=>{actualClosed=true});return new Promise(()=>{})}}};
    const h=await import(${JSON.stringify(join(import.meta.dir, "circle-capture-listener.ts"))});
    const started=performance.now(),listener=await h.startCircleCaptureListener({payer:${JSON.stringify(payer)},payTo:${JSON.stringify(payTo)},timeoutMs:50});
    try{const result=await listener.finished;
      const closed=await new Promise(resolve=>{const socket=connect({host:"127.0.0.1",port:Number(new URL(listener.endpoint).port)});
        const end=value=>{socket.destroy();resolve(value)};socket.once("connect",()=>end("still_listening"));socket.once("error",error=>end(error.code));socket.setTimeout(1000,()=>end("timeout"))});
      console.log(JSON.stringify({status:result.status,listenerClosed:result.listenerClosed,stops,actualClosed,closed,elapsed:performance.now()-started}));
    }finally{await listener.close();rmSync(listener.directory,{recursive:true,force:true})}`
  const child = spawnSync(process.execPath, ["--no-env-file", "--no-install", "-e", script], { env: {}, encoding: "utf8", timeout: 5000, maxBuffer: 4096 })
  expect(child.status).toBe(0); expect(child.stderr).toBe("")
  const result = JSON.parse(child.stdout)
  expect(result).toMatchObject({ status: "expired", listenerClosed: false, stops: 1, actualClosed: true, closed: "ECONNREFUSED" })
  expect(result.elapsed).toBeGreaterThanOrEqual(750); expect(result.elapsed).toBeLessThan(2500)
}, 6000)
for (const kind of ["wrong-path", "wrong-method", "repeated-challenge", "signed-first", "ambiguous", "malformed", "oversize"] as const)
  test("listener refuses " + kind + " and leaves no fixture or reusable listener", async () => {
    const listener = await startCircleCaptureListener({ payer, payTo, timeoutMs: 500 })
    try {
      let response: Response
      if (kind === "wrong-path") response = await post(listener.endpoint + "?secret=fixture")
      else if (kind === "wrong-method") response = await fetch(listener.endpoint, { signal: AbortSignal.timeout(3000) })
      else if (kind === "signed-first") response = await post(listener.endpoint, { "payment-signature": "fixture" })
      else if (kind === "oversize") response = await fetch(listener.endpoint, { method: "POST", body: "x".repeat(1025), signal: AbortSignal.timeout(3000) })
      else {
        const challenge = await post(listener.endpoint); expect(challenge.status).toBe(402); await challenge.text()
        response = kind === "repeated-challenge" ? await post(listener.endpoint) :
          await post(listener.endpoint, kind === "ambiguous" ? { "payment-signature": "fixture", "x-payment": "fixture" } :
            { "payment-signature": "UNTRUSTED_BEARER_FIXTURE" })
      }
      expect([400, 413]).toContain(response.status); const body = await response.text()
      expect(body).not.toContain("UNTRUSTED_BEARER_FIXTURE")
      const result = await listener.finished
      expect(["refused", "expired"]).toContain(result.status); expect(result.listenerClosed).toBe(true)
      expect(result.artifact).toBeUndefined(); expect(await closedPort(listener.endpoint)).toBe("ECONNREFUSED")
      expect(readdirSync(listener.directory).sort()).toEqual([".claim", "context.json"])
      for (const name of readdirSync(listener.directory)) expect(readFileSync(join(listener.directory, name), "utf8")).not.toContain("UNTRUSTED_BEARER_FIXTURE")
    } finally { await listener.close(); rmSync(listener.directory, { recursive: true, force: true }) }
  }, 5000)
test("legacy header can capture shape without a version or payment claim", async () => {
  const listener = await startCircleCaptureListener({ payer, payTo })
  try {
    const challenge = await post(listener.endpoint), body = await challenge.json() as { accepts: Record<string, unknown>[] }
    const response = await post(listener.endpoint, { "x-payment": header(body.accepts[0]!) })
    expect(response.status).toBe(200); await response.text()
    const result = await listener.finished
    expect(result.artifact?.headerName).toBe("x-payment")
    expect(result.artifact?.clientVersion).toBeNull(); expect(result.listenerClosed).toBe(true)
    expect(await listener.close()).toEqual(result); expect(await closedPort(listener.endpoint)).toBe("ECONNREFUSED")
  } finally { await listener.close(); rmSync(listener.directory, { recursive: true, force: true }) }
})
for (const reason of ["expired", "cancelled"] as const)
  test("owned idle listener " + reason + " within its deadline with only its pending public claim", async () => {
    const controller = new AbortController()
    const started = performance.now(), listener = await startCircleCaptureListener({ payer, payTo, timeoutMs: 100, signal: controller.signal })
    try {
      if (reason === "cancelled") controller.abort("PRIVATE_DIAGNOSTIC")
      const result = await listener.finished
      expect(result).toMatchObject({ status: reason, listenerClosed: true, clientAcknowledgement: "unconfirmed", clientIdentity: "unverified" })
      expect(performance.now() - started).toBeLessThan(2000)
      expect(await closedPort(listener.endpoint)).toBe("ECONNREFUSED")
      expect(readdirSync(listener.directory).sort()).toEqual([".claim", "context.json"])
      expect(await listener.close()).toEqual(result)
    } finally { await listener.close(); rmSync(listener.directory, { recursive: true, force: true }) }
  })
test("stalled owned TCP request cannot keep the listener alive after expiry", async () => {
  const listener = await startCircleCaptureListener({ payer, payTo, timeoutMs: 150 })
  const socket = connect({ host: "127.0.0.1", port: Number(new URL(listener.endpoint).port) })
  const gone = new Promise<void>(resolve => { socket.on("error", () => {}); socket.once("close", () => resolve()) })
  try {
    await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject) })
    socket.write("POST /x/demo/usdc-flow-check HTTP/1.1\r\nHost: 127.0.0.1\r\n")
    const result = await listener.finished; expect(result).toMatchObject({ status: "expired", listenerClosed: true })
    await Promise.race([gone, new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(Error("owned socket not closed")), 1500); gone.then(() => clearTimeout(timer))
    })])
    expect(await closedPort(listener.endpoint)).toBe("ECONNREFUSED")
    expect(readdirSync(listener.directory).sort()).toEqual([".claim", "context.json"])
  } finally { socket.destroy(); await listener.close(); rmSync(listener.directory, { recursive: true, force: true }) }
}, 4000)
test("invalid options invoke no getters or listener binding, and imported library/CLI cannot activate", async () => {
  const { spawnSync } = await import("node:child_process")
  const script = `let bindings=0,getters=0;Bun.serve=()=>{bindings++;throw Error("unexpected binding")};
    const h=await import(${JSON.stringify(join(import.meta.dir, "circle-capture-listener.ts"))});
    const c={payer:${JSON.stringify(payer)},payTo:${JSON.stringify(payTo)}};
    const controller=new AbortController();controller.abort();
    const cases=[null,{}, {...c,host:"0.0.0.0"},{...c,payTo:c.payer},{...c,payer:"0x"+"0".repeat(40)},
      {...c,timeoutMs:0},{...c,timeoutMs:30001},{...c,timeoutMs:null},{...c,signal:controller.signal},
      {...c,get payer(){getters++;throw Error("PRIVATE_DIAGNOSTIC")}}];
    let refused=0;for(const value of cases){try{await h.startCircleCaptureListener(value)}catch(e){if(e.message!=="circle_capture_listener_refused")throw e;refused++}}
    console.log(JSON.stringify({bindings,getters,refused}));`
  const child = spawnSync(process.execPath, ["--no-env-file", "--no-install", "-e", script], { env: {}, encoding: "utf8", timeout: 5000, maxBuffer: 4096 })
  expect(child.status).toBe(0); expect(child.stderr).toBe("")
  expect(JSON.parse(child.stdout)).toEqual({ bindings: 0, getters: 0, refused: 10 })
  for (const args of [[], ["--live"], ["--capture"], ["--out", "/private/fixture"]]) {
    const cli = spawnSync(process.execPath, ["--no-env-file", "--no-install", join(import.meta.dir, "circle-capture-listener.ts"), ...args],
      { env: { PORT: "8799", CAPTURE_PAY_TO: payTo }, encoding: "utf8", timeout: 5000, maxBuffer: 4096 })
    expect(cli.status).toBe(2); expect(cli.stdout).toBe(""); expect(cli.stderr.trim()).toBe("circle_capture_listener_library_only")
  }
}, 7000)
