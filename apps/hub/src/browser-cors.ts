/** Passive ordinary-job browser support. This policy grants no payment or job authority. */
const CONFIG_ERROR = "Browser transport configuration invalid"
const POST_HEADERS = ["accept", "content-type", "payment-signature", "x-payment"] as const
const READ_HEADERS = ["accept", "x-job-token"] as const
const FORBIDDEN = ["authorization", "proxy-authorization", "cookie", "x-arcade-session", "x-session-token", "x-arcade-hire-capability"]
const origin = (value: unknown): string => {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) throw Error(CONFIG_ERROR)
  try {
    const url = new URL(value)
    if (url.origin !== value || url.username || url.password ||
      !(url.protocol === "https:" || url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname))) throw Error(CONFIG_ERROR)
    return value
  } catch { throw Error(CONFIG_ERROR) }
}
const routeMethod = (url: URL): "POST" | "GET" | null => {
  if (url.search !== "") return null // Browser capabilities are header-only, never legacy token URLs.
  const paid = /^\/x\/(0x[0-9a-fA-F]{40})\/([a-z0-9][a-z0-9-]{1,63})$/.exec(url.pathname)
  if (paid !== null && !/^0x0{40}$/i.test(paid[1]!)) return "POST"
  return /^\/(?:jobs\/job_[A-Za-z0-9]{16,128}\/result|trees\/job_[A-Za-z0-9]{16,128})$/.test(url.pathname) ? "GET" : null
}
const vary = (headers: Headers, names: readonly string[]) => {
  const current = headers.get("vary")
  if (current?.split(",").some(x => x.trim() === "*")) return
  const parts = current === null ? [] : current.split(",").map(x => x.trim()).filter(Boolean)
  for (const name of names) if (!parts.some(x => x.toLowerCase() === name.toLowerCase())) parts.push(name)
  headers.set("vary", parts.join(", "))
}
const refused = (): Response => new Response(JSON.stringify({ error: "browser_forbidden" }), {
  status: 403, headers: { "content-type": "application/json", "cache-control": "private, no-store", vary: "Origin" } })
const discard = (req: Request) => { if (req.body !== null && !req.body.locked) void req.body.cancel().catch(() => {}) }

/** Capture configuration once, before any application layers, signer or listener. */
export const makeBrowserCors = (webValue: unknown, publicValue: unknown) => {
  const webOrigin = webValue === undefined ? null : origin(webValue)
  /*
   * The public origin stands on its own. It used to be derived only when a web origin was
   * also configured, so a hub with ARCADE_PUBLIC_URL set but ARCADE_WEB_ORIGIN unset fell
   * back to the raw request origin for the poll link it hands a paying buyer. Behind a
   * TLS-terminating proxy that origin is not the https host the buyer called, the buyer
   * SDK rightly refused the link as foreign, and a settled one-cent job on production was
   * paid for and never collected. Browser CORS still needs the web origin; the poll link
   * never did.
   */
  // A web origin without a public URL is still a configuration error: browser CORS cannot
  // hand out links it cannot name. A public URL alone is simply honored.
  const publicOrigin = publicValue !== undefined || webOrigin !== null ? origin(publicValue) : null
  return Object.freeze({ publicOrigin,
    async handle(req: Request, next: () => Promise<Response>): Promise<Response> {
      // Existing native CLI/runner/F protocols have no Origin and retain their own guards.
      if (!req.headers.has("origin")) return next()
      const deny = () => { discard(req); return refused() }
      if (webOrigin === null || req.headers.get("origin") !== webOrigin) return deny()
      const method = routeMethod(new URL(req.url)), preflight = req.method === "OPTIONS"
      if (method === null || FORBIDDEN.some(name => req.headers.has(name)) ||
        req.headers.has("access-control-request-private-network")) return deny()
      const allowed: readonly string[] = method === "POST" ? POST_HEADERS : READ_HEADERS
      if (preflight) {
        if (req.headers.get("access-control-request-method") !== method) return deny()
        const raw = req.headers.get("access-control-request-headers")
        if (raw !== null) {
          if (raw.length === 0 || raw.length > 1024) return deny()
          const names = raw.split(",").map(name => name.trim().toLowerCase())
          if (names.length > allowed.length || new Set(names).size !== names.length || names.some(name => !allowed.includes(name))) return deny()
        }
        // Actual authentication/payment headers cannot be smuggled into a preflight.
        if (["payment-signature", "x-payment", "x-job-token"].some(name => req.headers.has(name))) return deny()
        const response = new Response(null, { status: 204, headers: { "access-control-allow-origin": webOrigin,
          "access-control-allow-methods": method, "access-control-allow-headers": allowed.join(", "), "cache-control": "private, no-store" } })
        vary(response.headers, ["Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers"])
        discard(req); return response
      }
      if (req.method !== method || req.headers.has("access-control-request-method") || req.headers.has("access-control-request-headers")) return deny()
      // Inspect application authority fields; native browser/proxy-managed headers do
      // not enlarge the preflight's closed set and are not mistaken for custom grants.
      if (method === "POST") {
        if (req.headers.has("x-job-token") || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers.get("content-type") ?? "")) return deny()
        const primary = req.headers.get("payment-signature"), legacy = req.headers.get("x-payment")
        if ([primary, legacy].some(value => value !== null && (value.length === 0 || value.length > 16384)) ||
          primary !== null && legacy !== null && primary !== legacy) return deny()
      } else if (req.headers.has("payment-signature") || req.headers.has("x-payment") || req.headers.has("content-type")) return deny()
      let response: Response
      try { response = await next() }
      catch { response = new Response(JSON.stringify({ error: "ordinary_unavailable" }), { status: 503, headers: { "content-type": "application/json" } }) }
      // No clone, buffering, parsing or re-encoding of a successful handler's body.
      const headers = new Headers(response.headers)
      headers.set("access-control-allow-origin", webOrigin); headers.set("cache-control", "private, no-store")
      vary(headers, ["Origin"])
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
    }
  })
}
