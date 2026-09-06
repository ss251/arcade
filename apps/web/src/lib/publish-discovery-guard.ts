/** Preloaded only by the fixed preview child. No IO on import. The CLI's actual
 * discovery may contact exactly its supplied HTTPS endpoint, with no redirect,
 * ambient credentials or fallback destination. Local document previews use no fetch. */
const fetchOriginal = globalThis.fetch
const target = process.env["ARCADE_PREVIEW_MCP_TARGET"]
globalThis.fetch = Object.assign((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  try {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (!target || url.href !== new URL(target).href || url.protocol !== "https:" ||
      url.username || url.password || url.search || url.hash) throw 0
    return fetchOriginal(input, { ...init, redirect: "error", credentials: "omit" })
  } catch { return Promise.reject(new Error("Preview discovery refused.")) }
}, { preconnect: () => { throw new Error("Preview discovery refused.") } })
