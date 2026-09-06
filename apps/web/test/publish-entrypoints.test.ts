import { expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { connect } from "node:net"

const root = new URL("../../..", import.meta.url).pathname
const run = (source: string, env: Record<string, string> = {}) => spawnSync("bun", ["--no-env-file", "--no-install", "-e", source], {
  cwd: root, env: { PATH: process.env["PATH"] ?? "", ...env }, encoding: "utf8", timeout: 12000, maxBuffer: 32768
})

it("resolves the actual Vite config to loopback and refuses unsafe overrides before binding", () => {
  const resolve = 'import {resolveConfig} from "./apps/web/node_modules/vite/dist/node/index.js";'
  for (const [overrides, ok] of [[{}, true], [{ server: { host: "0.0.0.0" } }, false],
    [{ server: { middlewareMode: true } }, false], [{ preview: { host: "::" } }, false]] as const) {
    const result = run(resolve + 'try{const c=await resolveConfig({root:"apps/web",envDir:false,configFile:"apps/web/vite.config.ts",...' +
      JSON.stringify(overrides) + '},"serve");console.log(JSON.stringify({server:c.server.host,preview:c.preview.host}));}catch{console.log("REFUSED");process.exitCode=2}',
      { ARCADE_PUBLISH_LOCAL: "1" })
    expect(result.status).toBe(ok ? 0 : 2)
    expect(result.stdout.trim()).toBe(ok ? '{"server":"127.0.0.1","preview":"127.0.0.1"}' : "REFUSED")
  }
}, 55000)

it("preloaded discovery allows only the exact endpoint and disallows redirects and credentials", () => {
  const result = run(`let calls=[];globalThis.fetch=async(input,init)=>{calls.push({url:String(input),redirect:init.redirect,credentials:init.credentials});return new Response("fixture")};
    await import("./apps/web/src/lib/publish-discovery-guard.ts");
    try{fetch.preconnect("https://fixture.example/mcp");throw Error("unexpected preconnect")}catch(e){if(e.message!=="Preview discovery refused.")throw e}
    await fetch("https://fixture.example/mcp");
    for(const target of ["https://other.example/mcp","https://fixture.example/mcp?key=PRIVATE_FIXTURE","http://fixture.example/mcp"]){
      try{await fetch(target);throw Error("unexpected acceptance")}catch(e){if(e.message!=="Preview discovery refused.")throw e}
    }console.log(JSON.stringify(calls));`, { ARCADE_PREVIEW_MCP_TARGET: "https://fixture.example/mcp" })
  expect(result.status).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual([{ url: "https://fixture.example/mcp", redirect: "error", credentials: "omit" }])
})

it("local-file preview preload blocks every fetch without a live request", () => {
  const result = run('globalThis.fetch=()=>{throw Error("NETWORK_CALLED")};await import("./apps/web/src/lib/publish-discovery-guard.ts");try{await fetch("https://fixture.example");process.exitCode=1}catch(e){console.log(e.message)}')
  expect(result.status).toBe(0); expect(result.stdout.trim()).toBe("Preview discovery refused.")
})

it("the production entry wiring binds a real Bun loopback socket and closes it", async () => {
  const owned = mkdtempSync(join(tmpdir(), "arcade-publish-entry-test-")), entry = join(owned, "server.ts")
  try {
    // Exact production entry, substituting only built SSR (which is absent on a
    // clean checkout) and resolving its two source imports from this fixture file.
    const source = readFileSync(join(root, "apps/web/server.ts"), "utf8")
      .replace('import handler from "./dist/server/server.js"', 'const handler={fetch:()=>new Response("fixture")}')
      .replace('"./src/preflight.ts"', JSON.stringify(join(root, "apps/web/src/preflight.ts")))
      .replace('"./src/lib/publish-binding.ts"', JSON.stringify(join(root, "apps/web/src/lib/publish-binding.ts")))
    writeFileSync(entry, source)
    const result = run('const serve=Bun.serve;Bun.serve=(options)=>{const server=serve(options);console.log("BIND "+JSON.stringify({hostname:server.hostname,port:server.port,pid:process.pid}));setTimeout(()=>server.stop(true),30);return server};await import(' + JSON.stringify(entry) + ')',
      { ARCADE_PUBLISH_LOCAL: "1", PORT: "0", HOME: owned })
    expect(result.status).toBe(0)
    const line = result.stdout.split("\n").find(line => line.startsWith("BIND "))
    expect(line).toBeDefined()
    const state = JSON.parse(line!.slice(5))
    expect(state.hostname).toBe("127.0.0.1")
    expect(() => process.kill(state.pid, 0)).toThrow()
    const refused = await new Promise<boolean>(resolve => {
      const socket = connect({ host: "127.0.0.1", port: state.port })
      socket.setTimeout(1000)
      socket.once("connect", () => { socket.destroy(); resolve(false) })
      socket.once("timeout", () => { socket.destroy(); resolve(false) })
      socket.once("error", error => { socket.destroy(); resolve("code" in error && error.code === "ECONNREFUSED") })
    })
    expect(refused).toBe(true)
  } finally { rmSync(owned, { recursive: true, force: true }) }
})
