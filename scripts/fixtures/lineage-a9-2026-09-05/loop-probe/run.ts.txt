#!/usr/bin/env bun
import { HireRefused, hire as defaultHire, type Hired } from "@arcade/buyer/hire"

interface LoopProbeInput {
  readonly address?: string
}

interface LoopProbeOutput {
  readonly ok: boolean
  readonly hired: ReadonlyArray<string>
}

interface LoopProbeEnvelope {
  readonly output: LoopProbeOutput
  readonly stopReason: "end_turn" | "refusal" | "error"
  readonly error?: string
}

type Hire = (skillId: string, input: unknown, options?: { readonly maxAmountUsd?: number }) => Promise<Hired>

const refusal = (message: string, hired: ReadonlyArray<string> = []): LoopProbeEnvelope => ({
  output: { ok: false, hired },
  stopReason: "refusal",
  error: message
})

/**
 * Buy one useful child, then prove that the hub refuses a cycle before payment.
 *
 * The injected function keeps the evidence path unit-testable without a funded wallet.
 * Production uses the runner-owned hire broker through `@arcade/buyer/hire`.
 */
export const runLoopProbe = async (
  input: LoopProbeInput,
  hire: Hire = defaultHire
): Promise<LoopProbeEnvelope> => {
  const address = input.address
  if (typeof address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return refusal("address must be a 0x-prefixed 40-hex-character EVM address")
  }

  const hired: Array<string> = []
  let note: Hired
  try {
    note = await hire("wallet-risk-note", { address }, { maxAmountUsd: 0.15 })
  } catch (error) {
    return refusal(`wallet-risk-note hire failed: ${String((error as Error)?.message ?? error)}`)
  }

  if (!note.settled) {
    return refusal("wallet-risk-note did not settle", hired)
  }
  hired.push(`wallet-risk-note settled (${note.jobId})`)

  try {
    await hire("loop-probe", { address }, { maxAmountUsd: 0.3 })
    return refusal("loop-probe self-hire unexpectedly succeeded", hired)
  } catch (error) {
    if (!(error instanceof HireRefused)) {
      return {
        output: { ok: false, hired },
        stopReason: "error",
        error: `loop-probe self-hire failed unexpectedly: ${String((error as Error)?.message ?? error)}`
      }
    }
    if (!error.message.includes("lineage_cycle")) {
      return refusal(`loop-probe self-hire returned the wrong refusal: ${error.message}`, hired)
    }
    hired.push(`loop-probe refused: ${error.message}`)
  }

  return { output: { ok: true, hired }, stopReason: "end_turn" }
}

if (import.meta.main) {
  const main = async (): Promise<void> => {
    try {
      const raw = await Bun.stdin.text()
      const payload = JSON.parse(raw) as { readonly input?: LoopProbeInput }
      process.stdout.write(JSON.stringify(await runLoopProbe(payload.input ?? {})))
    } catch (error) {
      process.stdout.write(
        JSON.stringify({
          output: { ok: false, hired: [] },
          stopReason: "error",
          error: `invalid loop-probe request: ${String((error as Error)?.message ?? error)}`
        } satisfies LoopProbeEnvelope)
      )
    }
  }

  void main()
}
