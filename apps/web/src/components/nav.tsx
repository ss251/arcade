import { ArcadeWordmark } from "./marks.tsx"
import { InterfaceIcon } from "./interface-icon.tsx"

export type NavHere = "market" | "chat" | "seller" | "buyer" | "publish"

const sections: ReadonlyArray<readonly [NavHere, string, string]> = [
  ["market", "/", "Explore"],
  ["chat", "/chat", "Assistant"],
  ["buyer", "/buyer", "My jobs"],
  ["seller", "/seller", "Seller studio"]
]

/** Ordinary links work before hydration and keep navigation outside payment authority. */
export function Nav({ here }: { readonly here: NavHere }) {
  return (
    <header className="nav">
      <a className="mark" href="/" aria-label="ARCADE home"><ArcadeWordmark height={28} /><span className="visually-hidden">ARCADE</span></a>
      <nav aria-label="Sections">
        {sections.map(([section, href, label]) => (
          <a key={section} href={href} className={`nav-item${(section === here || section === "seller" && here === "publish") ? " is-here" : ""}`}
            aria-current={(section === here || section === "seller" && here === "publish") ? (here === "publish" ? "location" : "page") : undefined}><InterfaceIcon name={section} /><span>{label}</span></a>
        ))}
      </nav>
      <div className="nav-context"><span className="nav-network">Arc Testnet</span><p>Pay per successful call.</p></div>
    </header>
  )
}
