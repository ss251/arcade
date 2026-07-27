import { useEffect, useRef, useState } from "react"

/**
 * The purchase confirmation. The one thing in this product a judge will photograph.
 *
 * ## Hold, don't click
 *
 * design-sauce Law 5 is asymmetric timing: slow where the user deliberates, snappy where
 * the system responds. A hold-to-approve on a card that spends real USDC is the correct
 * physical expression of that, not decoration — the deliberation is the point, and a button
 * that spends on a single click is indistinguishable from one that dismisses a tooltip.
 * 900ms linear while held; release and dismissal are ~200ms ease-out.
 *
 * ## It takes no new colour
 *
 * Blue is USDC, green is settled, red is not-settled. Spending a fourth semantic hue on
 * "this is important" would erode the three that carry money meaning — the same call as
 * refusing `--refuse` for the sandbox band. The card earns attention through weight, a
 * border and the hold itself.
 *
 * ## Everything on it is measured
 *
 * Price, payee and network come from the signing request the server derived from the
 * approved arguments (T-EXEC-005), so every figure here is mono. There is no seller prose
 * on this card at all: a purchase confirmation is the last place a stranger's words should
 * be able to influence a decision, and the model's summary lives in the message above it.
 */

export interface ConfirmProps {
  readonly skillId: string
  readonly price: string
  readonly payTo: string
  readonly network: string
  /** Blocked reasons render the card as an explanation instead of an action. */
  readonly blocked?: string | undefined
  readonly onApprove: () => void
  readonly onDeny: () => void
}

const HOLD_MS = 900

const short = (addr: string): string =>
  addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr

export const Confirm = ({
  skillId,
  price,
  payTo,
  network,
  blocked,
  onApprove,
  onDeny
}: ConfirmProps) => {
  const [progress, setProgress] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const stop = () => {
    if (timer.current !== undefined) clearInterval(timer.current)
    timer.current = undefined
    setProgress(0)
  }

  // Teardown on unmount as well as on release: a card that disappears mid-hold must not
  // leave an interval that fires `onApprove` for a purchase nobody is looking at.
  useEffect(() => stop, [])

  const start = () => {
    if (blocked !== undefined || timer.current !== undefined) return
    const began = Date.now()
    timer.current = setInterval(() => {
      const pct = Math.min(1, (Date.now() - began) / HOLD_MS)
      setProgress(pct)
      if (pct >= 1) {
        stop()
        onApprove()
      }
    }, 16)
  }

  return (
    <div className="confirm" role="group" aria-label={`Confirm purchase of ${skillId}`}>
      <div className="confirm-head">
        <span className="confirm-what">buy</span>
        <span className="tool-id">{skillId}</span>
        <span className="usdc">{price}</span>
      </div>

      <dl className="confirm-facts">
        <div>
          <dt>pays</dt>
          <dd className="measured" title={payTo}>
            {short(payTo)}
          </dd>
        </div>
        <div>
          <dt>network</dt>
          <dd className="measured">{network}</dd>
        </div>
      </dl>

      {blocked === undefined ? (
        <p className="confirm-law">
          Your wallet signs this in your browser. Nothing is charged unless the result
          validates — a refusal or timeout leaves your balance untouched.
        </p>
      ) : (
        <p className="confirm-blocked">{blocked}</p>
      )}

      <div className="confirm-actions">
        <button type="button" className="deny" onClick={onDeny}>
          no
        </button>
        <button
          type="button"
          className="approve"
          disabled={blocked !== undefined}
          onPointerDown={start}
          onPointerUp={stop}
          onPointerLeave={stop}
          onPointerCancel={stop}
          aria-label={`Hold to approve paying ${price} for ${skillId}`}
        >
          <span
            className="approve-fill"
            style={{ transform: `scaleX(${progress})` }}
            aria-hidden="true"
          />
          <span className="approve-label">
            {blocked === undefined ? `hold to pay ${price}` : "unavailable"}
          </span>
        </button>
      </div>
    </div>
  )
}
