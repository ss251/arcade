/**
 * Refuse to serve the chat against a hub that isn't there.
 *
 * `apps/web` has one job — put a marketplace in front of a visitor — and exactly one input
 * that makes it possible: `ARCADE_HUB`. Its default is `http://localhost:8787`, which is
 * right on a laptop and is the one value that is CERTAINLY wrong inside a container, where
 * nothing is listening on 8787.
 *
 * That failure is quieter than the hub's equivalent rather than louder. Nothing is
 * listening, so the fetch refuses instead of reaching a wrong hub — no split-brain. But the
 * refusal lands in a tool result, the tool result lands in the model's context, and the
 * model narrates it. Every health check passes: SSR returns 200, the page renders, the chat
 * streams, the model answers. The only broken thing is the entire point of the app, and it
 * comes out as "I wasn't able to reach the marketplace just now" — which reads exactly like
 * a transient, and a judge has no way to tell it from one.
 *
 * The hub already refuses on this class of misconfiguration (`apps/hub/src/server.ts`,
 * `preflight`); this is the same guard for the service that didn't inherit it. Deployment
 * detects ITSELF from the platform's own variables rather than depending on someone
 * remembering a flag — an unset flag is the case a flag cannot detect.
 *
 * Exported as a pure function so the test exercises the guard rather than a copy of it.
 */

export interface PreflightResult {
  readonly onPlatform: boolean
  readonly problems: ReadonlyArray<string>
  readonly hub: string
}

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]

export const DEFAULT_HUB = "http://localhost:8787"

const isLocal = (url: string): boolean => {
  try {
    return LOCAL_HOSTS.includes(new URL(url).hostname)
  } catch {
    return false
  }
}

export const preflightWeb = (env: Record<string, string | undefined>): PreflightResult => {
  const onPlatform = Object.keys(env).some(
    (k) => k.startsWith("RAILWAY_") || k.startsWith("FLY_") || k.startsWith("RENDER_")
  )
  const hub = env["ARCADE_HUB"] ?? DEFAULT_HUB
  if (!onPlatform) return { onPlatform, problems: [], hub }

  const problems: Array<string> = []
  if (env["ARCADE_HUB"] === undefined || env["ARCADE_HUB"] === "") {
    problems.push(
      `ARCADE_HUB — unset, so this would fall back to ${DEFAULT_HUB}, and nothing listens ` +
        `on 8787 inside this container. The site would still render and the chat would ` +
        `still answer; every lookup would fail, and the model would report it as prose a ` +
        `visitor cannot distinguish from a transient. On Railway prefer the platform's own ` +
        `answer over a typed one: ARCADE_HUB=https://\${{ arcade-hub.RAILWAY_PUBLIC_DOMAIN }}`
    )
  } else if (isLocal(hub)) {
    problems.push(
      `ARCADE_HUB is ${hub}, which is a loopback address. A hosting platform was detected, ` +
        `so nothing is listening there — this is the laptop value shipped to production. ` +
        `Use the hub's public origin, or on Railway: ` +
        `ARCADE_HUB=https://\${{ arcade-hub.RAILWAY_PUBLIC_DOMAIN }}`
    )
  }

  if (env["ANTHROPIC_API_KEY"] === undefined || env["ANTHROPIC_API_KEY"] === "") {
    // NOT a refusal. Without it `/api/chat` already returns a 503 that names the variable
    // and says discovery still works through the hub's API — honest degradation of one
    // feature rather than a broken deployment, which is a different thing from pointing at
    // a hub that does not exist.
    problems.push(
      "__warn__ANTHROPIC_API_KEY is not set: the catalogue and receipts still work, but the " +
        "chat will answer every message with a 503."
    )
  }

  return { onPlatform, problems, hub }
}

/** Split the advisory entries out of `problems`. */
export const partition = (
  problems: ReadonlyArray<string>
): { readonly fatal: ReadonlyArray<string>; readonly warnings: ReadonlyArray<string> } => ({
  fatal: problems.filter((p) => !p.startsWith("__warn__")),
  warnings: problems.filter((p) => p.startsWith("__warn__")).map((p) => p.slice("__warn__".length))
})
