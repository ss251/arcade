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
  /** Private full decision identity from the owner; never rendered or approval authority. */
  readonly decisionKey?: string | undefined
  readonly skillId: string
  readonly price: string
  readonly payTo: string
  readonly network: string
  /** Present only after the quote matched the hub's live ENS records, not listing metadata. */
  readonly ensName?: string | undefined
  /** Blocked reasons render the card as an explanation instead of an action. */
  readonly blocked?: string | undefined
  /**
   * The remedy for a blocked card, when one exists.
   *
   * `lib/wallet.ts` states the rule this satisfies: "the chain guard has to be an ACTION,
   * not a wall" — `wallet_addEthereumChain` adds and switches in a single prompt, so the
   * refusal can carry its own fix. Until this existed the card only *described* the remedy
   * ("connecting will offer to add and switch to it in one step") with nothing to click,
   * which is the worst of both: it named an action and then withheld it, on the one screen
   * where someone has already decided to pay.
   *
   * Absent when nothing can be done from here — no wallet installed at all — because a
   * button that cannot help is worse than prose that explains.
   */
  readonly onConnect?: (() => void) | undefined
  readonly connecting?: boolean | undefined
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
  decisionKey,
  skillId,
  price,
  payTo,
  network,
  ensName,
  blocked: reason,
  onConnect,
  connecting,
  onApprove,
  onDeny
}: ConfirmProps) => {
  const [progress, setProgress] = useState(0)
  const [decided, setDecided] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const spent = useRef(false)
  const blocked = reason ?? (connecting === true ? "Finish connecting your wallet before approving." : undefined)
  const identity = JSON.stringify([decisionKey, skillId, price, payTo, network, ensName, blocked, connecting])
  // Read on every tick as well as effect cleanup: an old closure cannot approve
  // between a changed render and its passive effect. Conservative cancellation
  // on callback replacement is intentional. A new decision needs a new card.
  const current = useRef({ identity, onApprove, onDeny })
  current.current = { identity, onApprove, onDeny }

  const stop = () => {
    if (timer.current !== undefined) clearInterval(timer.current)
    timer.current = undefined
    setProgress(0)
  }

  useEffect(() => {
    stop()
    const hidden = () => { if (document.visibilityState !== "visible") stop() }
    window.addEventListener("blur", stop)
    document.addEventListener("visibilitychange", hidden)
    return () => {
      if (timer.current !== undefined) clearInterval(timer.current)
      timer.current = undefined
      window.removeEventListener("blur", stop)
      document.removeEventListener("visibilitychange", hidden)
    }
  }, [identity, onApprove, onDeny])

  const start = () => {
    if (blocked !== undefined || spent.current || timer.current !== undefined || document.visibilityState !== "visible") return
    const captured = current.current, now = performance.now.bind(performance), began = now()
    if (!Number.isFinite(began) || began < 0 || began > Number.MAX_SAFE_INTEGER - HOLD_MS) return
    let last = began
    timer.current = setInterval(() => {
      const at = now(), latest = current.current
      if (spent.current || captured.identity !== latest.identity || captured.onApprove !== latest.onApprove ||
        captured.onDeny !== latest.onDeny || !Number.isFinite(at) || at < last || at > Number.MAX_SAFE_INTEGER ||
        document.visibilityState !== "visible") { stop(); return }
      last = at
      const pct = Math.min(1, (at - began) / HOLD_MS)
      setProgress(pct)
      if (pct >= 1) {
        stop()
        spent.current = true; setDecided(true)
        captured.onApprove()
      }
    }, 16)
  }

  const deny = () => {
    stop()
    if (spent.current) return
    spent.current = true; setDecided(true)
    onDeny()
  }

  const label = decided ? "decision recorded" : blocked === undefined ? `hold to pay ${price}` : "unavailable"

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

      {ensName === undefined ? null : <div className="ens-name" title={ensName}>{ensName}</div>}

      {/* The subject of the card. Mark at cap height beside it, not decorating it. */}
      <div className="price-block">
        <UsdcMark />
        <span className="price-big">{price}</span>
      </div>

      <dl className="confirm-facts">
        <div className="fact">
          <dt>
            pays{ensName === undefined ? "" : " · from ENS"}
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
          Your wallet signs in your browser. ARCADE hubs settle only after the result validates.
          If the outcome is unconfirmed, a signed authorization may remain valid — check the
          settlement record before retrying.
        </p>
      ) : (
        <p className="confirm-blocked">{blocked}</p>
      )}

      <p className="tool-note">Hold with a pointer, Space or Enter for 0.9 seconds. Releasing or leaving the card cancels.</p>

      <div className="confirm-actions">
        <button type="button" className="deny" onClick={deny} disabled={decided}>
          no
        </button>
        {blocked !== undefined && onConnect !== undefined ? (
          // Replaces the approve button rather than sitting beside it. There is exactly one
          // thing to do on a blocked card, and offering two primary actions where one is
          // inert is how someone ends up holding a button that was never going to fire.
          <button
            type="button"
            className="approve connect"
            onClick={onConnect}
            disabled={connecting === true}
          >
            <span className="approve-label">
              {connecting === true ? "check your wallet…" : "connect wallet"}
            </span>
          </button>
        ) : (
        <button
          type="button"
          className="approve"
          /*
           * `--p` is the ONLY statement of hold progress. The fill scales off it and the
           * inverted label clips off it, so the bar and the text it must stay legible
           * against cannot drift apart.
           */
          style={{ "--p": progress } as React.CSSProperties}
          disabled={blocked !== undefined || decided}
          onPointerDown={e => { if (e.isPrimary && e.button === 0) start() }}
          onPointerUp={stop}
          onPointerLeave={stop}
          onPointerCancel={stop}
          onBlur={stop}
          onClick={e => e.preventDefault()}
          onKeyDown={e => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault()
              if (!e.repeat && !e.altKey && !e.ctrlKey && !e.metaKey) start()
            } else stop()
          }}
          onKeyUp={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); stop() } }}
          aria-label={`Hold to approve paying ${price} for ${skillId}`}
        >
          <span className="approve-fill" aria-hidden="true" />
          <span className="approve-label">{label}</span>
          {/* Contrast device, not content — hence aria-hidden. */}
          <span className="approve-invert" aria-hidden="true">
            <span className="approve-label">{label}</span>
          </span>
        </button>
        )}
      </div>
    </div>
  )
}
