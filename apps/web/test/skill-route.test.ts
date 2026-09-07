import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { connect } from "node:net"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

type Origins = { web: string; hub: string }
type Reads = { detail: number; receipts: number; names: number; other: number }
const direct: Reads = { detail: 1, receipts: 1, names: 0, other: 0 }
const resolved: Reads = { ...direct, names: 1 }
const onlyName: Reads = { detail: 0, receipts: 0, names: 1, other: 0 }
const none: Reads = { detail: 0, receipts: 0, names: 0, other: 0 }
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
async function bounded<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([work, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Error("Owned H8 fixture deadline")), ms)
  })]) } finally { clearTimeout(timer) }
}
/** One deadline includes the headers and complete body; never logs response bytes or private fixtures. */
async function read(url: string): Promise<{ status: number; body: string }> {
  const controller = new AbortController()
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  const work = (async () => {
    const response = await fetch(url, { signal: controller.signal, redirect: "error", credentials: "omit" })
    if (response.body === null) throw Error("Owned H8 response unavailable")
    reader = response.body.getReader()
    const chunks: Uint8Array[] = []; let size = 0
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 1_048_576) throw Error("Owned H8 response too large")
      chunks.push(chunk.value)
    }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return { status: response.status, body: new TextDecoder("utf-8", { fatal: true }).decode(bytes) }
  })()
  try { return await bounded(work, 15_000) }
  finally {
    controller.abort()
    if (reader) { await bounded(reader.cancel().catch(() => {}), 500).catch(() => {}); reader.releaseLock() }
  }
}
const privateBytes = /PRIVATE_|job_PRIVATE|ses_PRIVATE|x-job-token|x-session-token/
const scripts = (html: string) => [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).join("\n")

describe("actual H8 Start route through the bounded H4 client", () => {
  let child: ChildProcessWithoutNullStreams | undefined, origins: Origins | undefined, closed = false
  let exitCode: number | null = null, exitSignal: NodeJS.Signals | null = null
  let exited: Promise<void> | undefined, startupError = false, output = ""
  const capture = (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-65_536)
    const line = /\[h8-origins\] (\{[^\n]{1,256}\})/.exec(output)?.[1]
    if (!line) return
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>
      if (Object.keys(parsed).sort().join(",") === "hub,web" && [parsed.web, parsed.hub].every(origin =>
        typeof origin === "string" && /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(origin) && Number(new URL(origin).port) <= 65535)) {
        origins = parsed as Origins
      }
    } catch { startupError = true }
  }
  async function stop() {
    if (!child || !exited) return
    if (!closed) child.kill("SIGTERM")
    try { await bounded(exited, 3500) }
    catch { if (!closed) child.kill("SIGKILL"); await bounded(exited, 1500) }
    expect(closed).toBe(true)
    expect(exitCode).toBe(0); expect(exitSignal).toBeNull()
    if (origins) for (const origin of Object.values(origins)) {
      const code = await new Promise<string>(resolve => {
        const socket = connect({ host: "127.0.0.1", port: Number(new URL(origin).port) })
        socket.setTimeout(1000, () => { socket.destroy(); resolve("timeout") })
        socket.once("connect", () => { socket.destroy(); resolve("still_listening") })
        socket.once("error", (error: NodeJS.ErrnoException) => { socket.destroy(); resolve(error.code ?? "unknown") })
      })
      expect(code).toBe("ECONNREFUSED")
    }
  }
  beforeAll(async () => {
    child = spawn("bun", ["--no-env-file", "apps/web/test/fixtures/skill-server.ts"], {
      cwd: new URL("../../..", import.meta.url).pathname,
      env: { PATH: process.env["PATH"] ?? "", ARCADE_NETWORK: "arc-testnet" }, stdio: "pipe"
    })
    child.stdin.end()
    exited = new Promise<void>(resolve => {
      child!.once("close", (code, signal) => { closed = true; exitCode = code; exitSignal = signal; resolve() })
      child!.once("error", () => { startupError = true })
    })
    child.stdout.on("data", capture); child.stderr.on("data", capture)
    try {
      await bounded((async () => {
        while (!origins && !closed && !startupError) await delay(20)
        if (!origins || closed || startupError) throw Error("Owned H8 fixture did not start")
      })(), 15_000)
    } catch (error) { await stop(); throw error }
  }, 22_000)
  afterAll(stop, 7000)

  async function page(mode: string, name = "diff-triage", expected: Reads = direct) {
    if (!origins) throw Error("Owned H8 fixture unavailable")
    const reset = await read(`${origins.hub}/__fixture?mode=${encodeURIComponent(mode)}`)
    expect(reset.status).toBe(200)
    const response = await read(`${origins.web}/skill/${encodeURIComponent(name)}`)
    expect(response.status).toBe(200)
    // This checks all SSR bytes, including the actual Start hydration serialization, not only visible JSX.
    expect(response.body).not.toMatch(privateBytes)
    expect(scripts(response.body)).not.toMatch(privateBytes)
    const control = await read(`${origins.hub}/__fixture`)
    expect(control.status).toBe(200)
    expect(JSON.parse(control.body).reads).toEqual(expected)
    return response.body
  }

  it("projects real detail, identity and flat descendants without leaking Start-serialized private canary IDs", async () => {
    const html = await page("ok")
    expect(html).toContain("Diff Triage")
    expect(html).toContain('aria-label="Settlement evidence"')
    expect(html).toContain("recorded-child"); expect(html).toContain("recorded-grandchild")
    expect(scripts(html)).toContain("payTestHistory")
    expect(scripts(html)).toContain("recorded-grandchild")
    expect(html).not.toContain('<script>SCHEMA_ESCAPE_PROBE</script>')
    expect(html).not.toContain('<img src=x onerror=SCHEMA_ESCAPE_PROBE>')
    expect(html).not.toContain('aria-label="Receipt tree"')
    expect(html).not.toContain("tree-edge")
    const links = [...html.matchAll(/\bhref="([^"]+)"/g)].map(match => match[1]!)
    expect(links.filter(url => url.startsWith("https://testnet.arcscan.app/tx/"))).toEqual([`https://testnet.arcscan.app/tx/0x${"a".repeat(64)}`])
    expect(links.some(url => url.includes("agent-registration.json") || url.includes("11111111-2222-3333-4444-555555555555"))).toBe(false)
  })

  it("retains independently available detail or receipts and never turns outages into an empty result", async () => {
    const noReceipts = await page("receipts-down")
    expect(noReceipts).toContain("Diff Triage"); expect(scripts(noReceipts)).toContain("receipts_unavailable")
    expect(noReceipts).toContain("Recent records unavailable."); expect(noReceipts).not.toContain("No recent records returned.")
    const noDetail = await page("detail-down")
    expect(noDetail).not.toContain("Diff Triage"); expect(noDetail).toContain("recorded-grandchild")
    expect(noDetail).toContain("Listing unavailable")
    expect(scripts(noDetail)).toContain("listing_unavailable")
    const neither = await page("both-down")
    expect(scripts(neither)).toContain("listing_unavailable"); expect(scripts(neither)).toContain("receipts_unavailable")
    expect(neither).not.toContain("No such listing")
  })

  it("preserves declared rail labels through H4 and the real Start serialization", async () => {
    const html = await page("rails")
    expect(html).toContain("Accepts (declared): gateway · exact · escrow")
    expect(html).toContain("does not offer browser escrow purchases")
    expect(html).toContain("not current payment availability")
  })

  it("preserves actual hub escrow projections through Start without private material or inferred movement", async () => {
    const html = await page("escrow")
    for (const state of ["settled", "refunded", "uncertain"]) expect(html.replace(/<!-- -->/g, "")).toContain(`Hub reports escrow ${state}`)
    expect(html.replace(/<!-- -->/g, "")).toContain("Reported principal refund $0.12")
    expect(html).toContain("No terminal movement established")
    expect(html).toContain("A quote is not a transfer")
    expect(html).not.toMatch(/job_[ab]{32}|requestHash|0x5555555555555555555555555555555555555555/)
    const links = [...html.matchAll(/\bhref="([^"]+)"/g)].map(match => match[1]!)
    expect(links.filter(url => url.includes("/tx/"))).toEqual([`https://testnet.arcscan.app/tx/0x${"7".repeat(64)}`, `https://testnet.arcscan.app/tx/0x${"8".repeat(64)}`])
    expect(links.filter(url => url.includes("/address/"))).toEqual(Array(3).fill(`https://testnet.arcscan.app/address/0x${"6".repeat(40)}`))
    const malformed = await page("escrow-malformed")
    expect(malformed).toContain("Escrow evidence unavailable")
    expect(malformed).not.toMatch(/href="[^\"]+\/(tx|address)\/|Hub reports escrow settled|Reported principal refund/)
    expect(malformed).not.toContain("Recent records unavailable.")
  })

  it("distinguishes empty receipts and absent versus empty pay-test history", async () => {
    const empty = await page("empty-receipts")
    expect(empty).not.toContain("recorded-grandchild"); expect(scripts(empty)).not.toContain("receipts_unavailable")
    expect(empty).toContain("No recent records returned."); expect(empty).not.toContain("Recent records unavailable.")
    const absent = await page("absent-history"), historyEmpty = await page("empty-history")
    expect(scripts(absent)).not.toContain("payTestHistory")
    expect(scripts(historyEmpty)).toContain("payTestHistory")
    expect(absent).toContain("Pay-test history unavailable.")
    expect(historyEmpty).toContain("No recorded pay-test history returned.")
    expect(absent).not.toContain("has not had its turn"); expect(historyEmpty).not.toContain("Never pay-tested")
  })

  it("keeps unknown, stale and unverified ERC-8004 counts distinct from observed zero", async () => {
    for (const mode of ["unknown-evidence", "stale-evidence", "unverified-evidence"]) {
      const html = await page(mode)
      expect(scripts(html)).not.toContain("validationPasses")
      expect(scripts(html)).not.toContain("settlementFeedback")
      expect(html).toContain("Validation count unavailable"); expect(html).toContain("Feedback count unavailable")
      expect(html).not.toContain("not registered")
    }
    const zero = await page("zero-evidence")
    expect(scripts(zero)).toContain("validationPasses"); expect(scripts(zero)).toContain("settlementFeedback")
    expect(zero).toContain("0 of 0 matching answered validations passed"); expect(zero).toContain("0 matching feedback records")
  })

  it("refuses invalid route names before any hub IO", async () => {
    for (const name of ["bad name", "BAD.eth", "a".repeat(65)]) {
      const html = await page("ok", name, none)
      expect(scripts(html)).toContain("invalid_name")
      expect(html).toContain("Invalid listing name.")
    }
  })

  it("resolves valid ENS once and preserves typed expiry separately from lookup outage", async () => {
    const ok = await page("ens-ok", "triage.arcade.eth", resolved)
    expect(ok).toContain("Diff Triage"); expect(ok).toContain("triage.arcade.eth")
    const expired = await page("ens-expired", "triage.arcade.eth", onlyName)
    expect(scripts(expired)).toContain("name_expired"); expect(scripts(expired)).not.toContain("name_unavailable")
    expect(expired).toContain("The hub reports this name expired.")
    const unavailable = await page("ens-down", "triage.arcade.eth", onlyName)
    expect(scripts(unavailable)).toContain("name_unavailable"); expect(scripts(unavailable)).not.toContain("name_expired")
    expect(unavailable).toContain("Name resolution unavailable.")
    expect(expired).not.toContain("runner stopped renewing")
  })

  it("suppresses an ENS/detail seller mismatch and rejects a wrong skill at the actual H4 decoder", async () => {
    const sellerMismatch = await page("ens-seller-mismatch", "triage.arcade.eth", resolved)
    expect(scripts(sellerMismatch)).toContain("name_mismatch")
    expect(sellerMismatch).toContain("Name and listing evidence do not match.")
    expect(sellerMismatch).not.toContain("Diff Triage"); expect(sellerMismatch).toContain("recorded-grandchild")
    const skillMismatch = await page("ens-skill-mismatch", "triage.arcade.eth", resolved)
    expect(scripts(skillMismatch)).toContain("listing_unavailable")
    expect(skillMismatch).not.toContain("Diff Triage")
  })

  it("refuses a redirect before any outside fetch while preserving independent receipts", async () => {
    const html = await page("redirect")
    expect(scripts(html)).toContain("listing_unavailable"); expect(html).toContain("recorded-grandchild")
    expect(html).not.toContain("example.invalid")
  })

  it("decodes maximum uint256 price and bounded long public schema text for the owned visual fixture", async () => {
    const html = await page("long")
    expect(html).toContain("D".repeat(32)); expect(html).toContain("bounded-schema-line-")
    expect(html).toContain("115792089237316195423570985008687907853269984665640564039457584007913129.639935")
    expect(scripts(html)).not.toContain("listing_unavailable")
  })
})
