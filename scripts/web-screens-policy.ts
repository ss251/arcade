/** Pure scope for the read-only screenshot utility. No import-time IO. */
export interface ScreenOptions { readonly hub: string; readonly seller: string; readonly skill: string; readonly chrome: string }
const bad = (): never => { throw new Error("Invalid screenshot options") }
export function parseScreenOptions(args: readonly string[]): Readonly<ScreenOptions> {
  const values: Record<string, string> = Object.create(null)
  if (args.length !== 8) return bad()
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1]
    if (!key || !["--hub", "--seller", "--skill", "--chrome"].includes(key) ||
      Object.hasOwn(values, key) || !value || value.length > 4096 || /[\x00-\x1f\x7f]/.test(value)) return bad()
    values[key] = value
  }
  const hub = values["--hub"]!, seller = values["--seller"]!, skill = values["--skill"]!, chrome = values["--chrome"]!
  try {
    const u = new URL(hub)
    if (hub.length > 2048 || u.origin !== hub || u.username || u.password || /[\s\\%?#]/.test(hub) ||
      !(u.protocol === "https:" || u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))) return bad()
  } catch { return bad() }
  if (!/^0x[0-9a-fA-F]{40}$/.test(seller) || /^0x0{40}$/i.test(seller) ||
    !/^[a-z0-9][a-z0-9-]{1,63}$/.test(skill) || !chrome.startsWith("/") || chrome.includes("\\")) return bad()
  return Object.freeze({ hub, seller, skill, chrome })
}
export const screenPages = (o: ScreenOptions) => Object.freeze([
  { name: "market", path: "/" }, { name: "skill", path: "/skill/" + o.skill },
  { name: "seller", path: "/seller?address=" + o.seller }, { name: "buyer", path: "/buyer" },
  { name: "publish", path: "/publish" }, { name: "chat", path: "/chat" }
].map(page => Object.freeze(page)))
export function screenUpstream(request: Request, o: ScreenOptions): boolean {
  const u = new URL(request.url)
  let foreignHeader = false
  request.headers.forEach((_value, key) => { if (key !== "accept") foreignHeader = true })
  if (request.method !== "GET" || u.origin !== o.hub || u.username || u.password || u.hash ||
    foreignHeader) return false
  if (u.search) return u.pathname === "/listings/" + o.skill + "/receipts" && u.search === "?limit=20"
  return ["/listings", "/stats", "/listings/" + o.skill, "/sellers/" + o.seller + "/summary"].includes(u.pathname) ||
    /^\/names\/[a-z0-9][a-z0-9.-]{0,247}\.eth$/.test(u.pathname)
}
export const screenLocalPath = (path: string, o: ScreenOptions): boolean =>
  screenPages(o).some(p => p.path === path) || /^\/assets\/[a-zA-Z0-9_.-]+\.(?:js|css|svg|png|woff2?)$/.test(path)
