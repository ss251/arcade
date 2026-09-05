export type NavHere = "market" | "chat" | "seller" | "buyer" | "publish"

const sections: ReadonlyArray<readonly [NavHere, string]> = [
  ["market", "/"],
  ["chat", "/chat"],
  ["seller", "/seller"],
  ["buyer", "/buyer"],
  ["publish", "/publish"]
]

/** Ordinary links work before hydration and keep navigation outside payment authority. */
export function Nav({ here }: { readonly here: NavHere }) {
  return (
    <header className="nav">
      <a className="mark" href="/" aria-label="ARCADE home">ARCADE</a>
      <nav aria-label="Sections">
        {sections.map(([section, href]) => (
          <a key={section} href={href} className={`nav-item${section === here ? " is-here" : ""}`}
            aria-current={section === here ? "page" : undefined}>{section}</a>
        ))}
      </nav>
    </header>
  )
}
