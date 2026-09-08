import { expect, test } from "bun:test"
import { Schema } from "effect"
import { PaymentPayload, authorizationOf, signatureOf, networkOf, decodeHeaderJson } from "../packages/payments/src/types.ts"
import { sanitizeCircleHeader, CAPTURE_DUMMY_SIGNATURE, createCircleCaptureStore, readCircleCaptureArtifact } from "./capture-x402-header.ts"
import { readFileSync, readdirSync, lstatSync, rmSync, writeFileSync, unlinkSync, symlinkSync, linkSync, chmodSync, mkdtempSync, realpathSync } from "node:fs"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"

const context = { endpoint: "http://127.0.0.1:8799/x/demo/usdc-flow-check", payer: "0x" + "1".repeat(40), payTo: "0x" + "2".repeat(40) }
// Deliberately synthetic and not a valid owner/CLI signature or captured fixture.
const syntheticHeader = () => ({ x402Version: 2, payload: { authorization: {
  from: context.payer, to: context.payTo, value: "10000", validAfter: "1000", validBefore: "2593600", nonce: "0x" + "a".repeat(64),
}, signature: "0x" + "22".repeat(65) }, accepted: { scheme: "exact", network: "eip155:5042002",
  amount: "10000", asset: "0x3600000000000000000000000000000000000000", payTo: context.payTo,
  resource: context.endpoint, description: "capture probe", mimeType: "application/json", maxTimeoutSeconds: 2592000,
  extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" } },
  resource: { url: context.endpoint, description: "capture probe", mimeType: "application/json" } })
const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64")
test("fresh private capture store persists only sanitized shape and supports unchanged readback", () => {
  const store = createCircleCaptureStore(context), input = syntheticHeader()
  try {
    expect(readdirSync(store.directory).sort()).toEqual([".claim", "context.json"])
    expect(lstatSync(store.directory).mode & 0o777).toBe(0o700)
    const artifact = store.capture("payment-signature", encoded(input))
    expect(readdirSync(store.directory).sort()).toEqual(["fixture.json", "context.json", "marker.json"].sort())
    const bytes = readFileSync(join(store.directory, "fixture.json"), "utf8")
    expect(bytes).not.toContain(input.payload.signature)
    expect(JSON.parse(bytes).payload.signature).toBe(CAPTURE_DUMMY_SIGNATURE)
    expect(artifact).toMatchObject({ authenticated: false, provenance: "supplied-header-shape-only", clientVersion: null })
    expect(readCircleCaptureArtifact(store.directory)).toEqual(artifact)
    expect(readFileSync(join(store.directory, "fixture.json"), "utf8")).toBe(bytes)
    for (const name of readdirSync(store.directory)) expect(lstatSync(join(store.directory, name)).mode & 0o777).toBe(0o600)
    expect(() => store.capture("payment-signature", encoded(input))).toThrow(/^circle_capture_artifact_refused$/)
  } finally { rmSync(store.directory, { recursive: true, force: true }) }
})
const captureRefusal = /^circle_capture_artifact_refused$/
const snapshotStore = (directory: string) => Object.fromEntries(readdirSync(directory).sort().map(name =>
  [name, { mode: lstatSync(join(directory, name)).mode, bytes: readFileSync(join(directory, name)).toString("base64") }]))
test("a rejected header consumes the one attempt without persisting raw header or error details", () => {
  for (const input of ["not-base64", encoded({ ...syntheticHeader(), secret: "UNTRUSTED_BEARER_FIXTURE" })]) {
    const store = createCircleCaptureStore(context)
    try {
      const before = snapshotStore(store.directory)
      expect(() => store.capture("payment-signature", input)).toThrow(captureRefusal)
      expect(snapshotStore(store.directory)).toEqual(before)
      expect(() => store.capture("payment-signature", encoded(syntheticHeader()))).toThrow(captureRefusal)
      expect(() => readCircleCaptureArtifact(store.directory)).toThrow(captureRefusal)
      expect(JSON.stringify(before)).not.toContain(input)
    } finally { rmSync(store.directory, { recursive: true, force: true }) }
  }
})
test("public context and options are snapshotted and no second reentrant capture starts", () => {
  const expected = { ...context }, events: string[] = []
  let store: ReturnType<typeof createCircleCaptureStore>
  const options = { afterFixtureSync() {
    events.push("fixture")
    expect(() => store.capture("x-payment", encoded(syntheticHeader()))).toThrow(captureRefusal)
  } }
  store = createCircleCaptureStore(expected, options)
  expected.endpoint = "https://invalid.example"; options.afterFixtureSync = () => { throw Error("mutated callback") }
  try {
    const result = store.capture("x-payment", encoded(syntheticHeader()))
    expect(result.context).toEqual(context); expect(events).toEqual(["fixture"])
    expect(Object.isFrozen(result.context)).toBe(true); expect(Object.isFrozen(store)).toBe(true)
  } finally { rmSync(store.directory, { recursive: true, force: true }) }
})
for (const phase of ["afterFixtureSync", "afterMarkerSync", "afterReleaseSync"] as const)
  test("cancellation at " + phase + " retains facts without retry or fabricated acknowledgement", () => {
    const controller = new AbortController()
    const store = createCircleCaptureStore(context, { signal: controller.signal, [phase]: () => controller.abort("PRIVATE_DIAGNOSTIC") })
    try {
      expect(() => store.capture("payment-signature", encoded(syntheticHeader()))).toThrow(captureRefusal)
      const names = readdirSync(store.directory).sort()
      expect(names).toEqual((phase === "afterFixtureSync" ? [".claim", "context.json", "fixture.json"] :
        phase === "afterMarkerSync" ? [".claim", "context.json", "fixture.json", "marker.json"] :
          ["context.json", "fixture.json", "marker.json"]).sort())
      const before = snapshotStore(store.directory)
      expect(JSON.stringify(before)).not.toContain("PRIVATE_DIAGNOSTIC")
      expect(() => store.capture("payment-signature", encoded(syntheticHeader()))).toThrow(captureRefusal)
      if (phase === "afterReleaseSync") expect(readCircleCaptureArtifact(store.directory).authenticated).toBe(false)
      else expect(() => readCircleCaptureArtifact(store.directory)).toThrow(captureRefusal)
      expect(snapshotStore(store.directory)).toEqual(before)
    } finally { rmSync(store.directory, { recursive: true, force: true }) }
  })
for (const delta of [5000, -1])
  test("monotonic phase checks refuse a capture clock jump of " + delta, () => {
    let time = Date.now()
    const store = createCircleCaptureStore(context, { now: () => time, afterFixtureSync: () => { time += delta } })
    try {
      expect(() => store.capture("payment-signature", encoded(syntheticHeader()))).toThrow(captureRefusal)
      expect(readdirSync(store.directory).sort()).toEqual([".claim", "context.json", "fixture.json"])
      expect(() => store.capture("payment-signature", encoded(syntheticHeader()))).toThrow(captureRefusal)
    } finally { rmSync(store.directory, { recursive: true, force: true }) }
  })
const tamperCases: Record<string, (directory: string) => void> = {
  symlink: directory => { unlinkSync(join(directory, "fixture.json")); symlinkSync("context.json", join(directory, "fixture.json")) },
  hardlink: directory => { unlinkSync(join(directory, "fixture.json")); linkSync(join(directory, "context.json"), join(directory, "fixture.json")) },
  mode: directory => chmodSync(join(directory, "fixture.json"), 0o644),
  directoryMode: directory => chmodSync(directory, 0o755),
  oversize: directory => writeFileSync(join(directory, "fixture.json"), "x".repeat(16385)),
  extra: directory => writeFileSync(join(directory, "extra"), "extra", { mode: 0o600 }),
  claim: directory => writeFileSync(join(directory, ".claim"), "pending", { mode: 0o600 }),
  context: directory => writeFileSync(join(directory, "context.json"), "{}\n"),
  hash: directory => writeFileSync(join(directory, "fixture.json"), readFileSync(join(directory, "fixture.json"), "utf8").replace('"10000"', '"10001"')),
  marker: directory => writeFileSync(join(directory, "marker.json"), readFileSync(join(directory, "marker.json"), "utf8").replace('"authenticated":false', '"authenticated":true')),
  invalidUtf8: directory => writeFileSync(join(directory, "marker.json"), Buffer.from([255])),
  rawSignatureRehashed: directory => {
    const fixture = JSON.parse(readFileSync(join(directory, "fixture.json"), "utf8"))
    fixture.payload.signature = syntheticHeader().payload.signature
    const text = JSON.stringify(fixture, null, 2) + "\n"
    writeFileSync(join(directory, "fixture.json"), text)
    const marker = JSON.parse(readFileSync(join(directory, "marker.json"), "utf8"))
    marker.fixtureHash = createHash("sha256").update(text).digest("hex")
    writeFileSync(join(directory, "marker.json"), JSON.stringify(marker) + "\n")
  },
}
for (const [name, tamper] of Object.entries(tamperCases))
  test("readback refuses " + name + " without rewriting or repairing it", () => {
    const store = createCircleCaptureStore(context)
    try {
      store.capture("payment-signature", encoded(syntheticHeader())); tamper(store.directory)
      const before = snapshotStore(store.directory)
      expect(() => readCircleCaptureArtifact(store.directory)).toThrow(captureRefusal)
      expect(snapshotStore(store.directory)).toEqual(before)
    } finally { rmSync(store.directory, { recursive: true, force: true }) }
  })
test("readback remains shape-only even after a coherent local rewrite of public metadata", () => {
  const store = createCircleCaptureStore(context)
  try {
    store.capture("payment-signature", encoded(syntheticHeader()))
    const fixture = JSON.parse(readFileSync(join(store.directory, "fixture.json"), "utf8"))
    fixture.payload.authorization.validBefore = "2593601"
    const text = JSON.stringify(fixture, null, 2) + "\n", marker = JSON.parse(readFileSync(join(store.directory, "marker.json"), "utf8"))
    marker.fixtureHash = createHash("sha256").update(text).digest("hex")
    writeFileSync(join(store.directory, "fixture.json"), text)
    writeFileSync(join(store.directory, "marker.json"), JSON.stringify(marker) + "\n")
    const before = snapshotStore(store.directory)
    expect(readCircleCaptureArtifact(store.directory)).toMatchObject({ authenticated: false, clientVersion: null, provenance: "supplied-header-shape-only" })
    expect(snapshotStore(store.directory)).toEqual(before)
  } finally { rmSync(store.directory, { recursive: true, force: true }) }
})
test("invalid context/options refuse before any temporary store is created and never invoke getters", () => {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "arcade-capture-invalid-test-")))
  try {
  const script = `let getters=0;
    const h=await import(${JSON.stringify(join(import.meta.dir, "capture-x402-header.ts"))});const c=${JSON.stringify(context)};
    const cases=[[{...c,secret:"fixture"},{}],[c,{get now(){getters++;throw Error("private")}}],[c,{signal:{}}],[c,{afterMarkerSync:3}],[c,{unknown:true}]];
    let refused=0;for(const[c,o]of cases){try{h.createCircleCaptureStore(c,o)}catch(e){if(e.message!=="circle_capture_artifact_refused")throw e;refused++}}
    console.log(JSON.stringify({getters,refused}));`
  const child = spawnSync(process.execPath, ["--no-env-file", "--no-install", "-e", script], { env: { TMPDIR: parent }, encoding: "utf8", timeout: 5000, maxBuffer: 4096 })
  expect(child.status).toBe(0); expect(child.stderr).toBe("")
  expect(JSON.parse(child.stdout)).toEqual({ getters: 0, refused: 5 })
  // Bun may create its own runtime cache; no capture-store path may be created.
  expect(readdirSync(parent).filter(name => name !== "bun")).toEqual([])
  } finally { rmSync(parent, { recursive: true, force: true }) }
})
for (const phase of ["afterContextSync", "afterFixtureSync", "afterMarkerSync", "afterReleaseSync"] as const)
  test("actual child exit at " + phase + " leaves only the reached sanitized private files", () => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), "arcade-capture-exit-test-")))
    try {
      const script = `
        const h=await import(${JSON.stringify(join(import.meta.dir, "capture-x402-header.ts"))});
        const store=h.createCircleCaptureStore(${JSON.stringify(context)},{${phase}:()=>process.exit(23)});
        store.capture("payment-signature",${JSON.stringify(encoded(syntheticHeader()))});throw Error("exit not reached");`
      const child = spawnSync(process.execPath, ["--no-env-file", "--no-install", "-e", script], { env: { TMPDIR: parent }, encoding: "utf8", timeout: 5000, maxBuffer: 4096 })
      expect(child.status).toBe(23); expect(child.signal).toBeNull(); expect(child.stdout).toBe(""); expect(child.stderr).toBe("")
      const dirs = readdirSync(parent).filter(name => name !== "bun"); expect(dirs).toHaveLength(1)
      expect(dirs[0]).toMatch(/^arcade-circle-capture-[A-Za-z0-9]+$/)
      const directory = join(parent, dirs[0]!), names = readdirSync(directory).sort()
      expect(names).toEqual((phase === "afterContextSync" ? [".claim", "context.json"] :
        phase === "afterFixtureSync" ? [".claim", "context.json", "fixture.json"] :
          phase === "afterMarkerSync" ? [".claim", "context.json", "fixture.json", "marker.json"] : ["context.json", "fixture.json", "marker.json"]).sort())
      expect(lstatSync(directory).mode & 0o777).toBe(0o700)
      for (const name of names) {
        expect(lstatSync(join(directory, name)).mode & 0o777).toBe(0o600)
        expect(readFileSync(join(directory, name), "utf8")).not.toContain(syntheticHeader().payload.signature)
      }
      if (phase === "afterReleaseSync") expect(readCircleCaptureArtifact(directory).authenticated).toBe(false)
      else expect(() => readCircleCaptureArtifact(directory)).toThrow(captureRefusal)
    } finally { rmSync(parent, { recursive: true, force: true }) }
  })
test("actual historical readback child has no key, subprocess or network capability and changes no bytes", () => {
  const store = createCircleCaptureStore(context)
  try {
    store.capture("payment-signature", encoded(syntheticHeader())); const before = snapshotStore(store.directory)
    const script = `import{mock}from"bun:test";let forbidden=0;const deny=()=>{forbidden++;throw Error("forbidden")};
      globalThis.fetch=deny;Bun.serve=deny;Bun.spawn=deny;Bun.spawnSync=deny;
      const cp=await import("node:child_process");mock.module("node:child_process",()=>({...cp,spawn:deny,spawnSync:deny,exec:deny,execSync:deny,execFile:deny,execFileSync:deny}));
      const h=await import(${JSON.stringify(join(import.meta.dir, "capture-x402-header.ts"))});const a=h.readCircleCaptureArtifact(${JSON.stringify(store.directory)});
      console.log(JSON.stringify({forbidden,authenticated:a.authenticated,clientVersion:a.clientVersion}));`
    const child = spawnSync(process.execPath, ["--no-env-file", "--no-install", "-e", script], { env: {}, encoding: "utf8", timeout: 5000, maxBuffer: 4096 })
    expect(child.status).toBe(0); expect(child.stderr).toBe("")
    expect(JSON.parse(child.stdout)).toEqual({ forbidden: 0, authenticated: false, clientVersion: null })
    expect(snapshotStore(store.directory)).toEqual(before)
  } finally { rmSync(store.directory, { recursive: true, force: true }) }
})
test("synthetic I2 header becomes shape-only non-bearer text accepted by the unchanged decoder", () => {
  const input = syntheticHeader(), before = JSON.stringify(input)
  const result = sanitizeCircleHeader("payment-signature", encoded(input), context)
  expect(result).toMatchObject({ headerName: "payment-signature", signatureScrubbed: true, authenticated: false, provenance: "supplied-header-shape-only" })
  expect(result.fixtureJson).not.toContain(input.payload.signature)
  const fixture = JSON.parse(result.fixtureJson), parsed = Schema.decodeUnknownSync(PaymentPayload)(fixture)
  expect(signatureOf(parsed)).toBe(CAPTURE_DUMMY_SIGNATURE)
  expect(authorizationOf(parsed)).toEqual(input.payload.authorization)
  expect(networkOf(parsed)).toBe("eip155:5042002"); expect(parsed.accepted.maxTimeoutSeconds).toBe(2592000)
  expect(Schema.decodeUnknownSync(PaymentPayload)(decodeHeaderJson(encoded(fixture)))).toEqual(parsed)
  expect(JSON.stringify(input)).toBe(before); expect(Object.isFrozen(result)).toBe(true)
})

test("legacy header name retains v2 nesting without inventing a client-version or payment proof", () => {
  const result = sanitizeCircleHeader("x-payment", encoded(syntheticHeader()), context)
  expect(result.headerName).toBe("x-payment"); expect(result.authenticated).toBe(false)
  expect(result.provenance).toBe("supplied-header-shape-only")
  expect(JSON.parse(result.fixtureJson).payload.signature).toBe(CAPTURE_DUMMY_SIGNATURE)
})
test("optional public fields stay absent rather than being fabricated by schema defaults", () => {
  const { resource: _resource, ...input } = syntheticHeader()
  const { description: _description, mimeType: _mime, extra: _extra, ...accepted } = input.accepted
  const result = sanitizeCircleHeader("payment-signature", encoded({ ...input, accepted }), context)
  const fixture = JSON.parse(result.fixtureJson)
  expect(Object.hasOwn(fixture, "resource")).toBe(false)
  expect(Object.hasOwn(fixture.accepted, "description")).toBe(false)
  expect(Object.hasOwn(fixture.accepted, "mimeType")).toBe(false)
  expect(Object.hasOwn(fixture.accepted, "extra")).toBe(false)
  expect(() => Schema.decodeUnknownSync(PaymentPayload)(fixture)).not.toThrow()
})
for (const extra of [{}, { name: "USDC", version: "2" },
  { name: "USDC", version: "2", feeSplitter: context.payTo, feeSplitterVersion: 2 },
  { name: "USDC", version: "2", assetTransferMethod: "eip3009" }])
  test("known public Arc metadata survives sanitization without a payment admission claim: " + JSON.stringify(extra), () => {
    const input = syntheticHeader(); input.accepted.maxTimeoutSeconds = 1
    const result = sanitizeCircleHeader("payment-signature", encoded({ ...input, accepted: { ...input.accepted, extra } }), context)
    expect(JSON.parse(result.fixtureJson).accepted.extra).toEqual(extra)
    expect(JSON.parse(result.fixtureJson).accepted.maxTimeoutSeconds).toBe(1)
  })
test("uint authorization times are preserved without imposing or widening a production lifetime policy", () => {
  const input = syntheticHeader()
  input.payload.authorization.validAfter = "0"; input.payload.authorization.validBefore = ((1n << 256n) - 1n).toString()
  const result = sanitizeCircleHeader("payment-signature", encoded(input), context)
  expect(JSON.parse(result.fixtureJson).payload.authorization).toEqual(input.payload.authorization)
  expect(JSON.parse(result.fixtureJson).accepted.maxTimeoutSeconds).toBe(2592000)
})
test("unknown nested bearer fields cannot survive a one-field signature scrub", () => {
  const input = syntheticHeader(), marker = "UNTRUSTED_BEARER_FIXTURE"
  const variants = [
    { ...input, signature: marker },
    { ...input, unexpected: { authorization: { signature: marker } } },
    { ...input, payload: { ...input.payload, bearer: marker } },
    { ...input, payload: { ...input.payload, authorization: { ...input.payload.authorization, signature: marker } } },
    { ...input, accepted: { ...input.accepted, authorization: { signature: marker } } },
    { ...input, accepted: { ...input.accepted, extra: { ...input.accepted.extra, credential: marker } } },
    { ...input, resource: { ...input.resource, token: marker } },
    { ...input, accepted: { ...input.accepted, description: marker } },
    { ...input, resource: { ...input.resource, description: marker } },
    { ...input, accepted: { ...input.accepted, resource: context.endpoint + "?token=" + marker } },
    { ...input, resource: { ...input.resource, url: context.endpoint + "#" + marker } },
  ]
  for (const value of variants) {
    let message = ""
    try { sanitizeCircleHeader("payment-signature", encoded(value), context) } catch (error) { message = (error as Error).message }
    expect(message).toBe("circle_capture_header_refused"); expect(message).not.toContain(marker)
  }
})
test("binding and type failures refuse rather than rewriting a captured dialect to fit the decoder", () => {
  const input = syntheticHeader(), auth = input.payload.authorization
  const variants: unknown[] = [
    null, [], {}, { ...input, x402Version: 1 }, { x402Version: 2, ...auth, signature: input.payload.signature },
    { ...input, payload: { ...input.payload, signature: "0x" + "22".repeat(64) } },
    { ...input, payload: { ...input.payload, signature: "secret" } },
    ...[{ from: context.payTo }, { to: context.payer }, { value: "10001" }, { validAfter: "01" },
      { validAfter: "-1" }, { validBefore: "1000" }, { validBefore: (1n << 256n).toString() },
      { validBefore: "9".repeat(79) }, { nonce: "0x1234" }, { nonce: {} }]
      .map(patch => ({ ...input, payload: { ...input.payload, authorization: { ...auth, ...patch } } })),
    ...[{ network: "eip155:8453" }, { scheme: "erc8183" }, { amount: "10001" }, { asset: context.payer },
      { payTo: context.payer }, { resource: "http://localhost:8799/x/demo/usdc-flow-check" }, { maxTimeoutSeconds: 0 },
      { maxTimeoutSeconds: 1.5 }, { maxTimeoutSeconds: Number.MAX_SAFE_INTEGER + 1 }, { mimeType: "text/plain" }]
      .map(patch => ({ ...input, accepted: { ...input.accepted, ...patch } })),
    ...[{ name: "USDC", version: "1" }, { name: "USDC", version: "2", feeSplitter: context.payer, feeSplitterVersion: 2 },
      { name: "USDC", version: "2", feeSplitterVersion: 2 }, { name: "USDC", version: "2", assetTransferMethod: "permit2" },
      { ...input.accepted.extra, verifyingContract: context.payTo }, { ...input.accepted.extra, feeSplitter: context.payTo },
      { ...input.accepted.extra, version: "2" }, { name: { signature: "secret" } }, null, []]
      .map(extra => ({ ...input, accepted: { ...input.accepted, extra } })),
    { ...input, resource: null }, { ...input, resource: { ...input.resource, mimeType: "text/html" } },
  ]
  for (const value of variants) expect(() => sanitizeCircleHeader("payment-signature", encoded(value), context)).toThrow(/^circle_capture_header_refused$/)
})
test("raw duplicate keys, noncanonical JSON/base64, malformed UTF-8 and byte overflow never become a fixture", () => {
  const text = JSON.stringify(syntheticHeader()), raw = (text: string) => Buffer.from(text).toString("base64")
  const variants: unknown[] = ["", "not base64", encoded(syntheticHeader()) + ",ignored", encoded(syntheticHeader()) + "\n",
    raw(text.replace('"x402Version":2', '"x402Version":1,"x402Version":2')), raw(text + "\n"), raw(" " + text), raw(text + text),
    raw("{"), raw('{"__proto__":{"signature":"fixture"}}'), Buffer.from([0xff, 0xfe]).toString("base64"),
    raw(" ".repeat(16385)), "A".repeat(32772), null, {}, 1]
  for (const header of variants) expect(() => sanitizeCircleHeader("payment-signature", header, context)).toThrow(/^circle_capture_header_refused$/)
  const base64 = encoded(syntheticHeader())
  if (base64.endsWith("=")) expect(() => sanitizeCircleHeader("payment-signature", base64.replace(/=+$/, ""), context)).toThrow()
})
test("explicit public capture context has no environment, remote URL, getter or extra-field fallback", () => {
  const input = encoded(syntheticHeader()); let getters = 0
  const variants: unknown[] = [null, {}, { ...context, endpoint: "https://example.org/x/demo/usdc-flow-check" },
    { ...context, endpoint: context.endpoint + "?token=fixture" }, { ...context, endpoint: context.endpoint.replace(":8799", ":0") },
    { ...context, endpoint: context.endpoint.replace(":8799", ":65536") }, { ...context, endpoint: context.endpoint.replace(":8799", ":08799") },
    { ...context, endpoint: context.endpoint.replace("127.0.0.1", "localhost") }, { ...context, endpoint: context.endpoint + "/" },
    { ...context, payer: "0x" + "0".repeat(40) }, { ...context, payer: context.payTo }, { ...context, payTo: context.payer },
    { ...context, secret: "fixture" }, { ...context, get payer() { getters++; throw new Error("getter diagnostic") } }]
  for (const value of variants) expect(() => sanitizeCircleHeader("payment-signature", input, value)).toThrow(/^circle_capture_header_refused$/)
  expect(getters).toBe(0)
  for (const name of ["authorization", "PAYMENT-SIGNATURE", "", null, {}]) expect(() => sanitizeCircleHeader(name, input, context)).toThrow()
})
test("actual no-capability child imports and sanitizes without a listener, subprocess or network", async () => {
  const { spawnSync } = await import("node:child_process"), { resolve } = await import("node:path")
  const script = `import{mock}from"bun:test";let forbidden=0;const deny=()=>{forbidden++;throw Error("forbidden capability")};
    globalThis.fetch=deny;Bun.serve=deny;Bun.spawn=deny;Bun.spawnSync=deny;
    const cp=await import("node:child_process");mock.module("node:child_process",()=>({...cp,spawn:deny,spawnSync:deny,exec:deny,execSync:deny,execFile:deny,execFileSync:deny}));
    const h=await import(${JSON.stringify(resolve(import.meta.dir, "capture-x402-header.ts"))});
    const result=h.sanitizeCircleHeader("payment-signature",${JSON.stringify(encoded(syntheticHeader()))},${JSON.stringify(context)});
    console.log(JSON.stringify({forbidden,authenticated:result.authenticated,signatureScrubbed:result.signatureScrubbed}));`
  const child = spawnSync(process.execPath, ["--no-env-file", "--no-install", "-e", script], { env: { PATH: "" }, encoding: "utf8", timeout: 5000, maxBuffer: 4096 })
  expect(child.status).toBe(0); expect(child.stderr).toBe("")
  expect(JSON.parse(child.stdout)).toEqual({ forbidden: 0, authenticated: false, signatureScrubbed: true })
})
test("native capture CLI is inert and refuses activation or arbitrary output flags before any listener", async () => {
  const { spawnSync } = await import("node:child_process"), { resolve } = await import("node:path")
  const run = (args: string[]) => spawnSync(process.execPath, ["--no-env-file", "--no-install", resolve(import.meta.dir, "capture-x402-header.ts"), ...args],
    { env: { PATH: "", PORT: "8799", CAPTURE_PAY_TO: context.payTo, CAPTURE_OUT: "/private/fixture" }, encoding: "utf8", timeout: 5000, maxBuffer: 4096 })
  const idle = run([]); expect(idle.status).toBe(1); expect(idle.stderr).toBe("")
  expect(JSON.parse(idle.stdout)).toEqual({ liveCapture: "NOT_RUN", captureEnabled: false, writes: false })
  const help = run(["--help"]); expect(help.status).toBe(0); expect(help.stdout).toContain("No capture listener")
  for (const args of [["--live"], ["--capture"], ["--out", "/private/fixture"], ["--help", "--live"]]) {
    const child = run(args); expect(child.status).toBe(2); expect(child.stdout).toBe("")
    expect(child.stderr.trim()).toBe("circle_capture_arguments_invalid")
  }
})
