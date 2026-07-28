import { useEffect, useRef, useState } from "react"
import { ArcMark, UsdcMark } from "./marks.tsx"

/**
 * The purchase confirmation. The one thing in this product a judge will photograph.
 *
 * ## Hold, don't click
 *
 * design-sauce Law 5 is asymmetric timing: slow where the user deliberates, snappy where
 * the system responds. A hold-to-approve on a card that spends real USDC is the correct
 * physical expression of that, not decoration — a button that spends on a single click is
 * indistinguishable from one that dismisses a tooltip. 900ms linear while held; release and
 * dismissal are ~200ms ease-out.
 *
 * ## The price is the subject
 *
 * It used to be 17px in a 13px header row — a table cell. It is now its own block at 32px
 * against 11px labels, which is the ratio every wallet confirmation uses, because the amount
 * is the thing being decided about and everything else is context for it.
 *
 * ## The address is weighted, not truncated
 *
 * MEASURED, because demoting 32 of 42 characters to `--slate` was the one change here that
 * could have hurt a security-critical element. On the card surface the ends read 16.44:1
 * light / 13.63:1 dark and the demoted middle 5.39:1 / 5.77:1 — both middles clear AA text
 * at 4.5:1. **This row now depends on `--slate` staying above that**, which was not true of
 * anything else using it, so changing that token means re-measuring here.
 *
 * This card's job is letting someone verify who gets their money, so showing more of the
 * string beats showing less. The full 42 characters render, with the first six and last four
 * bold and the middle demoted — the eye checks the ends against another source, and hiding
 * the middle removes the option of checking anything else.
 *
 * ## It takes no new colour
 *
 * Blue is USDC, green is settled, red is not-settled. The card earns attention through
 * surface, scale and the hold. The two brand marks are self-contained objects, which is a
 * different category from a semantic hue.
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
const COPIED_MS = 1200

/**
 * Copy, with the failure path taken seriously.
 *
 * `navigator.clipboard` is undefined on a non-secure origin, and `writeText` can reject. A
 * copy affordance that says "copied" when nothing was copied is worse than none at all on
 * this card specifically — someone would paste a stale address and send money to it.
 */
const CopyButton = ({ value, label }: { value: string; label: string }) => {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle")
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Same class of leak the hold interval guards against: a card dismissed mid-timeout must
  // not leave a setState pointed at an unmounted component.
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = () => {
    const done = (s: "copied" | "failed") => {
      setState(s)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setState("idle"), COPIED_MS)
    }
    if (navigator.clipboard?.writeText === undefined) return done("failed")
    navigator.clipboard.writeText(value).then(() => done("copied"), () => done("failed"))
  }

  return (
    <span className="copy-wrap">
      <button type="button" className="copy" onClick={copy} aria-label={`Copy ${label}`}>
        {state === "copied" ? "✓" : state === "failed" ? "!" : "⧉"}
      </button>
      <span className="copy-said" aria-live="polite">
        {state === "copied" ? "copied" : state === "failed" ? "couldn’t copy" : ""}
      </span>
    </span>
  )
}

/** First six and last four carry the verification; the middle is demoted, never hidden. */
const Address = ({ value }: { value: string }) => (
  <span className="addr" title={value}>
    <b>{value.slice(0, 6)}</b>
    <span className="addr-mid">{value.slice(6, -4)}</span>
    <b>{value.slice(-4)}</b>
  </span>
)

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

  const label = blocked === undefined ? `hold to pay ${price}` : "unavailable"

  return (
    <div className="confirm" role="group" aria-label={`Confirm purchase of ${skillId}`}>
      {/*
        The purchase is already a four-node graph — discover → quote → approve → settle — and
        every other surface renders it as prose. This card IS node three, so saying so costs a
        constant and no new state, and it is the one element that says the product is a graph
        rather than a form.
      */}
      <div className="steps" aria-label="Step 3 of 4: approve">
        <span className="step-ticks" aria-hidden="true">
          <i className="done" />
          <i className="done" />
          <i className="now" />
          <i />
        </span>
        <span className="step-said">step 3 of 4 · approve</span>
      </div>

      <div className="confirm-head">
        <span className="confirm-what">buy</span>
        <span className="tool-id">{skillId}</span>
      </div>

      {/* The subject of the card. Mark at cap height beside it, not decorating it. */}
      <div className="price-block">
        <UsdcMark />
        <span className="price-big">{price}</span>
      </div>

      <dl className="confirm-facts">
        <div className="fact">
          <dt>
            pays
            <CopyButton value={payTo} label="the payout address" />
          </dt>
          <dd>
            <Address value={payTo} />
          </dd>
        </div>
        <div className="fact">
          <dt>network</dt>
          <dd className="net">
            <ArcMark />
            <span className="measured">{network}</span>
          </dd>
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
          /*
           * `--p` is the ONLY statement of hold progress. The fill scales off it and the
           * inverted label clips off it, so the bar and the text it must stay legible
           * against cannot drift apart.
           */
          style={{ "--p": progress } as React.CSSProperties}
          disabled={blocked !== undefined}
          onPointerDown={start}
          onPointerUp={stop}
          onPointerLeave={stop}
          onPointerCancel={stop}
          aria-label={`Hold to approve paying ${price} for ${skillId}`}
        >
          <span className="approve-fill" aria-hidden="true" />
          <span className="approve-label">{label}</span>
          {/* Contrast device, not content — hence aria-hidden. */}
          <span className="approve-invert" aria-hidden="true">
            <span className="approve-label">{label}</span>
          </span>
        </button>
      </div>
    </div>
  )
}
