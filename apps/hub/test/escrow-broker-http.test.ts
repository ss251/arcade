import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import { EscrowProviderRequest, hashJson, helloDigest } from "@arcade/core"
import { escrowActionContext, escrowBytes32, escrowContextToWire, setBudgetAuthorization, submitAuthorization } from "@arcade/payments"
import { fixture, provider } from "../../../packages/payments/test/fixtures/erc8183-action.ts"
const ROOT = fileURLToPath(new URL("../../..", import.meta.url)), jobId = "job_" + "b".repeat(32)
const waitFor = async (check: () => boolean, label: string) => {
  const end = Date.now() + 3000
  while (Date.now() < end) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 10)) }
  throw Error("Owned escrow fixture timed out: " + label)
}
const stop = async (child: ChildProcessWithoutNullStreams) => {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>(resolve => { const timer = setTimeout(() => child.kill("SIGKILL"), 1500)
    child.once("close", () => { clearTimeout(timer); resolve() }); child.kill("SIGTERM") })
}
async function setup() {
  const f = await fixture("budget"), context = escrowActionContext({ ...f.context, call: { ...f.context.call, inputHash: hashJson({}) } })
  const child = spawn("bun", ["--no-env-file", "--preload", "./apps/hub/test/fixtures/escrow-broker-preload.ts", "apps/hub/src/server.ts"], {
    cwd: ROOT, env: { PATH: process.env["PATH"] ?? "", PORT: "0", ARCADE_RAIL: "test", ARCADE_CHAIN_CHECK: "0",
      ARCADE_NETWORK: "arc-testnet", ARCADE_HUB_SECRET: "escrow-fixture-only" } })
  let output = "", base = ""
  const sockets: WebSocket[] = [], records = new Map<string, { ok: boolean; status?: string }>()
  const record = (part: Buffer) => {
    output = (output + String(part)).slice(-200000)
    const port = /\[escrow-test-port\] (\d+)/.exec(output)?.[1]; if (port) base = `http://127.0.0.1:${port}`
    for (const line of output.slice(0, output.lastIndexOf("\n")).split("\n")) if (line.startsWith("[escrow-control] ")) {
      const data = JSON.parse(line.slice(17)); records.set(data.id, data)
    }
  }
  child.stdout.on("data", record); child.stderr.on("data", record)
  const close = async () => { for (const ws of sockets) ws.close(); await stop(child) }
  try { await waitFor(() => !!base, "hub start") } catch (error) { await close(); throw error }
  const connect = async () => {
    const ws = new WebSocket(base.replace("http:", "ws:") + "/ws"), messages: Array<Record<string, unknown>> = []
    sockets.push(ws); ws.addEventListener("message", event => messages.push(JSON.parse(String(event.data))))
    await waitFor(() => ws.readyState === WebSocket.OPEN, "socket open")
    return { ws, messages }
  }
  const hello = async (client: Awaited<ReturnType<typeof connect>>, runnerId: string, skills = ["skill"]) => {
    const before = client.messages.length, nonce = `${Date.now()}-${crypto.randomUUID()}`, seller = provider.address
    const signature = await provider.signMessage({ message: helloDigest({ runnerId, seller, nonce, skillIds: skills }) })
    client.ws.send(JSON.stringify({ _tag: "Hello", runnerId, seller, nonce, signature, maxConcurrency: 2, agentVersion: "escrow-test",
      listings: skills.map(id => ({ id, version: "1.0.0", serviceName: id, description: "Owned escrow socket fixture", tags: [],
        price: "$0.30", bounds: { timeoutSec: 60 }, inputSchema: { type: "object" }, outputSchema: { type: "object" }, rails: ["erc8183"] })) }))
    await waitFor(() => client.messages.slice(before).some(m => m._tag === "Ack"), "signed Hello")
    expect(client.messages.slice(before).find(m => m._tag === "Ack")).toMatchObject({ ok: true })
  }
  const control = (operation: unknown, dispatch = false) => {
    const id = crypto.randomUUID()
    child.stdin.write(JSON.stringify({ id, op: dispatch ? "dispatch" : "authorize", context: escrowContextToWire(context), operation, hubJobId: jobId }) + "\n")
    return { done: () => records.has(id), result: async () => { await waitFor(() => records.has(id), "control result"); return records.get(id)! } }
  }
  const reply = async (raw: unknown) => {
    const request = Schema.decodeUnknownSync(EscrowProviderRequest)(raw), c = context.call
    const base = { chainId: c.chainId, escrow: c.escrow, signer: c.provider, jobId: context.jobId, nonce: 2n, deadline: 1600n }
    const typed = request._tag === "EscrowBudgetRequest" ? setBudgetAuthorization({ ...base, token: c.token, amount: c.amount }, 1000) :
      submitAuthorization({ ...base, deliverable: escrowBytes32(request.outputHash, false) }, 1000)
    return { _tag: request._tag === "EscrowBudgetRequest" ? "EscrowBudgetSigned" : "EscrowSubmitSigned", requestId: request.requestId,
      escrow: c.escrow, jobId: context.jobId.toString(), nonce: "2", deadline: "1600", signature: await provider.signTypedData(typed) }
  }
  const processed = () => (output.match(/\[escrow-message-done\]/g) ?? []).length
  const send = async (client: Awaited<ReturnType<typeof connect>>, message: unknown) => {
    const before = processed(); client.ws.send(JSON.stringify(message)); await waitFor(() => processed() > before, "message handler")
  }
  return { close, connect, hello, control, reply, send, output: () => output }
}
describe("actual hub escrow WebSocket authentication", () => {
  it("drops unauthenticated/other-socket signatures; retains submit owner after result and same-socket refresh", async () => {
    const h = await setup()
    try {
      const owner = await h.connect(); await h.hello(owner, "escrow_owner")
      const other = await h.connect(); await h.hello(other, "escrow_other", [])
      const anonymous = await h.connect(), budget = h.control({ kind: "budget" })
      await waitFor(() => owner.messages.some(m => m._tag === "EscrowBudgetRequest"), "budget request")
      const reply = await h.reply(owner.messages.find(m => m._tag === "EscrowBudgetRequest"))
      await h.send(anonymous, reply); expect(budget.done()).toBe(false)
      await h.send(other, reply); expect(budget.done()).toBe(false)
      await h.send(owner, reply); expect(await budget.result()).toEqual(expect.objectContaining({ ok: true }))
      const work = h.control({}, true)
      await waitFor(() => owner.messages.some(m => m._tag === "JobAssignment"), "assignment")
      expect(owner.messages.find(m => m._tag === "JobAssignment")).toHaveProperty("escrow")
      await h.send(owner, { _tag: "JobResult", jobId, outcome: { status: "succeeded", output: { ok: true }, startedAtMs: 1000000, finishedAtMs: 1000001 } })
      expect(await work.result()).toMatchObject({ ok: true, status: "succeeded" })
      await h.hello(owner, "escrow_owner", [])
      const submit = h.control({ kind: "submit", outputHash: hashJson({ ok: true }) })
      await waitFor(() => owner.messages.some(m => m._tag === "EscrowSubmitRequest"), "submit request")
      await h.send(owner, await h.reply(owner.messages.find(m => m._tag === "EscrowSubmitRequest")))
      expect(await submit.result()).toMatchObject({ ok: true })
      expect(other.messages.some(m => m._tag === "EscrowSubmitRequest")).toBe(false)
      expect(h.output()).not.toContain("external network")
    } finally { await h.close() }
  }, 15000)
  it("a replacement with the same authenticated runner ID cannot inherit pending or completed escrow authority", async () => {
    const h = await setup()
    try {
      const owner = await h.connect(); await h.hello(owner, "escrow_owner")
      const work = h.control({}, true)
      await waitFor(() => owner.messages.some(m => m._tag === "JobAssignment"), "assignment")
      await h.send(owner, { _tag: "JobResult", jobId, outcome: { status: "succeeded", output: { ok: true }, startedAtMs: 1000000, finishedAtMs: 1000001 } })
      expect(await work.result()).toMatchObject({ ok: true })
      const pending = h.control({ kind: "submit", outputHash: hashJson({ ok: true }) })
      await waitFor(() => owner.messages.some(m => m._tag === "EscrowSubmitRequest"), "submit request")
      const reply = await h.reply(owner.messages.find(m => m._tag === "EscrowSubmitRequest"))
      const replacement = await h.connect(); await h.hello(replacement, "escrow_owner")
      expect(await pending.result()).toMatchObject({ ok: false })
      await h.send(replacement, reply)
      expect(await h.control({ kind: "submit", outputHash: hashJson({ ok: true }) }).result()).toMatchObject({ ok: false })
      expect(replacement.messages.some(m => m._tag === "EscrowSubmitRequest")).toBe(false)
    } finally { await h.close() }
  }, 15000)
})
