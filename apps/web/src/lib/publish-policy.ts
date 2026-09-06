/** Pure syntax/request gates only. Filesystem containment and listener binding
 * must also be proven by the owning local runtime before it starts a child. */
export interface PublishTarget { readonly target: string; readonly kind: "directory" | "openapi" | "mcp" }
export const capturePublishTarget = (input: unknown): PublishTarget => {
  try {
    if (input === null || typeof input !== "object" || Array.isArray(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input)) || Reflect.ownKeys(input).length !== 1) throw 0
    const d = Object.getOwnPropertyDescriptor(input, "target")
    if (!d?.enumerable || !("value" in d)) throw 0
    const target: unknown = d.value
    if (typeof target !== "string" || target.length < 1 || target.length > 1024 || /[\s\\%?#]/.test(target)) throw 0
    if (target.startsWith("mcp://")) {
      const tail = target.slice(6)
      if (!tail || !/^[A-Za-z0-9._:/-]+$/.test(tail) || tail.startsWith("/") || tail.includes("://") ||
        tail.split("/").slice(1).some(part => part === "." || part === "..")) throw 0
      const url = new URL("https://" + tail)
      if (!url.hostname || url.username || url.password || url.search || url.hash) throw 0
      return { target, kind: "mcp" }
    }
    const relative = target.startsWith("./") ? target.slice(2) : target
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(relative) ||
      relative.split("/").some(part => !part || part.startsWith(".")) || /\.ya?ml$/i.test(relative)) throw 0
    return { target, kind: /\.json$/i.test(relative) ? "openapi" : "directory" }
  } catch { throw new Error("Invalid preview target") }
}

export const publishOnPlatform = (env: Record<string, string | undefined>): boolean =>
  Object.keys(env).some(key => /^(RAILWAY_|FLY_|RENDER_)/.test(key) ||
    ["VERCEL", "NETLIFY", "AWS_LAMBDA_FUNCTION_NAME", "K_SERVICE", "DYNO"].includes(key))

export const localPublishRequestAllowed = (request: Request, env: Record<string, string | undefined>): boolean => {
  try {
    if (env["ARCADE_PUBLISH_LOCAL"] !== "1" || publishOnPlatform(env) || request.method !== "POST") return false
    const url = new URL(request.url)
    if (url.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.username || url.password || url.hash || request.headers.get("host") !== url.host ||
      request.headers.get("origin") !== url.origin) return false
    for (const [name] of request.headers) if (name === "forwarded" || name.startsWith("x-forwarded-")) return false
    const site = request.headers.get("sec-fetch-site")
    return site === null || site === "same-origin"
  } catch { return false }
}
