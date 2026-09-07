/** Owned offline export page. Inert on import; no browser automation or remote fetch. */
import { createHash, randomBytes } from "node:crypto"
import { readFileSync, writeFileSync, mkdtempSync, lstatSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve, join } from "node:path"

export const BUNDLE_SHA256 = "da9c363071afbe79e06807bd1e67dbacc1123187db7b99e2608dd4a1a9567e94"
export const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")
export type RenderInput = { name: string; kind: "scene" | "mermaid"; source: string }
const MAX_RESULT = 12 * 1024 * 1024
const names = new Set(["architecture", "architecture-dark", "architecture-flow", "escrow-flow", "delegate-flow"])

export function renderInputs(root: string): RenderInput[] {
  const read = (path: string) => {
    const p = join(root, path), stat = lstatSync(p)
    if (!stat.isFile() || stat.size > 512 * 1024) throw Error("render_input_invalid")
    return readFileSync(p, "utf8")
  }
  const inputs: RenderInput[] = ["architecture", "architecture-dark"].map(name => ({ name, kind: "scene", source: read(`docs/${name}.excalidraw`) }))
  inputs.push({ name: "architecture-flow", kind: "mermaid", source: read("docs/architecture.mmd") })
  const fences = [...read("docs/architecture.md").matchAll(/^```mermaid\r?\n([\s\S]*?)^```\s*$/gm)]
  if (fences.length !== 2) throw Error("render_mermaid_count_invalid")
  inputs.push(...fences.map((f, i): RenderInput => ({ name: i === 0 ? "escrow-flow" : "delegate-flow", kind: "mermaid", source: f[1]! })))
  return inputs
}

export function validateRender(value: unknown): { svg: string; png: Buffer; width: number; height: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("render_result_invalid")
  const v = value as Record<string, unknown>
  if (Object.keys(v).sort().join() !== "png,svg" || typeof v.svg !== "string" || typeof v.png !== "string" ||
      v.svg.length > 2 * 1024 * 1024 || !v.svg.startsWith("<svg") || !v.svg.includes("</svg>") ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(v.png) || v.png.length > MAX_RESULT) throw Error("render_result_invalid")
  const png = Buffer.from(v.png.slice("data:image/png;base64,".length), "base64")
  if (png.length < 33 || png.toString("hex", 0, 8) !== "89504e470d0a1a0a" || png.toString("ascii", 12, 16) !== "IHDR") throw Error("render_png_invalid")
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20)
  if (width !== 2000 || height < 1 || height > 6000) throw Error("render_dimensions_invalid")
  // This is a bounded transport/header check, not independent full PNG decoding.
  return { svg: v.svg, png, width, height }
}

const controls = (token: string) => `<section id="controls" style="padding:20px;background:#fff;color:#1e1e1e;font:16px Helvetica">
<h1>ARCADE · offline diagram export</h1><p>Owned loopback page. No wallet or production connection.</p>
<button id="render">Render all five diagrams</button> <button id="finish">Stop server</button>
<p id="progress" role="status">Waiting for renderer readiness.</p><div id="previews"></div></section>
<script>
const endpoint=p=>new URL(p,location.origin).href;
document.getElementById('render').onclick=async function(){
 this.disabled=true;const status=document.getElementById('progress');
 try {
  if(document.getElementById('status').textContent!=='ready')throw Error('bundle_not_ready');
  const response=await fetch(endpoint('/inputs'));if(!response.ok)throw Error('input_read_failed');
  const inputs=await response.json();
  for(const input of inputs){
   status.textContent='Rendering '+input.name;
   const svg=input.kind==='scene'?await window.__excalidrawToSvg(input.source):await window.__renderMermaid(input.name,input.source);
   const png=await window.__rasterize(svg,2000);
   const result=await fetch(endpoint('/result/'+input.name),{method:'POST',headers:{'content-type':'application/json','x-render-token':'${token}'},body:JSON.stringify({svg,png})});
   if(!result.ok)throw Error('result_refused');
   const label=document.createElement('h2');label.textContent=input.name;
   const image=document.createElement('img');image.alt=input.name;image.src=png;image.style.cssText='display:block;width:100%;max-width:1400px;height:auto';
   document.getElementById('previews').append(label,image);
  }
  status.textContent='Complete: five SVG and PNG pairs saved. Inspect before accepting.';
 }catch(e){status.textContent='Render failed: '+String(e).slice(0,200);}
};
document.getElementById('finish').onclick=async()=>{const r=await fetch(endpoint('/finish'),{method:'POST',headers:{'x-render-token':'${token}'}});document.getElementById('progress').textContent=r.ok?'Server stopped.':'Stop refused.';};
</script>`

export function startDiagramRenderer(bundle: string, inputs: RenderInput[], durationMs = 600_000) {
  if (inputs.length !== names.size || new Set(inputs.map(i => i.name)).size !== names.size || inputs.some(i => !names.has(i.name))) throw Error("render_inputs_invalid")
  if (!Number.isInteger(durationMs) || durationMs < 100 || durationMs > 600_000) throw Error("render_deadline_invalid")
  const out = mkdtempSync(join(tmpdir(), "arcade-diagram-render-")), token = randomBytes(24).toString("hex")
  const results: Record<string, { svgSha256: string; pngSha256: string; width: number; height: number }> = {}
  // Bundled JS contains literal </body> strings (DOMPurify). Only insert at
  // the final document boundary; first-match replacement corrupts that script.
  const html = bundle.replace('<base href="https://gstack-render.localhost/">', '<base href="/">').replace(/<\/body>\s*<\/html>\s*$/, () => controls(token) + "</body></html>")
  let origin = "", stopped = false, finishing = false
  const stop = () => { if (!stopped) { stopped = true; clearTimeout(timer); server.stop(true) } }
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, maxRequestBodySize: MAX_RESULT,
    fetch: async request => {
      const url = new URL(request.url)
      if (url.origin !== origin) return new Response("refused", { status: 403 })
      const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src data:; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'" }
      const reply = (body: string, status = 200) => new Response(body, { status, headers })
      if (request.method === "GET" && url.pathname === "/") return new Response(html, { headers: { ...headers, "content-type": "text/html; charset=utf-8" } })
      if (request.method === "GET" && url.pathname === "/inputs") return new Response(JSON.stringify(inputs), { headers: { ...headers, "content-type": "application/json" } })
      if (request.method !== "POST" || request.headers.get("origin") !== origin || request.headers.get("x-render-token") !== token) return reply("refused", 403)
      if (finishing) return reply("already_finishing", 409)
      if (url.pathname === "/finish") {
        finishing = true
        writeFileSync(join(out, "manifest.json"), JSON.stringify({ bundleSha256: sha256(bundle), inputs: inputs.map(i => ({ name: i.name, sha256: sha256(i.source) })), results, complete: Object.keys(results).length === names.size }, null, 2) + "\n", { flag: "wx", mode: 0o600 })
        setTimeout(stop, 50)
        return reply("stopped")
      }
      const name = url.pathname.slice("/result/".length)
      if (!url.pathname.startsWith("/result/") || !names.has(name) || results[name]) return reply("result_refused", 409)
      try {
        const body = await request.text()
        if (Buffer.byteLength(body) > MAX_RESULT) return reply("result_too_large", 413)
        const result = validateRender(JSON.parse(body))
        // Names are closed; outputs only enter a fresh owned directory, never source docs.
        writeFileSync(join(out, name + ".svg"), result.svg, { flag: "wx", mode: 0o600 })
        writeFileSync(join(out, name + ".png"), result.png, { flag: "wx", mode: 0o600 })
        results[name] = { svgSha256: sha256(result.svg), pngSha256: sha256(result.png), width: result.width, height: result.height }
        return reply("saved")
      } catch { return reply("render_result_invalid", 400) }
    }
  })
  origin = `http://127.0.0.1:${server.port}`
  const timer = setTimeout(() => { console.error("render_deadline_reached"); stop() }, durationMs)
  return { url: origin, out, stop, results }
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2)
    if (args.length !== 2 || args[0] !== "--bundle") throw Error("usage: bun --no-env-file scripts/render-diagram.ts --bundle PATH_TO_PINNED_HTML")
    const path = resolve(args[1]!), stat = lstatSync(path)
    if (!stat.isFile() || stat.size !== 9645479) throw Error("render_bundle_invalid")
    const bundle = readFileSync(path, "utf8")
    if (sha256(bundle) !== BUNDLE_SHA256) throw Error("render_bundle_pin_mismatch")
    const renderer = startDiagramRenderer(bundle, renderInputs(resolve(import.meta.dir, "..")))
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, renderer.stop)
    console.log(JSON.stringify({ url: renderer.url, out: renderer.out, pid: process.pid, deadlineSeconds: 600, bundleSha256: BUNDLE_SHA256 }))
  } catch { console.error("diagram_render_start_refused: check arguments, input files and pinned bundle"); process.exitCode = 1 }
}
