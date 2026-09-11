/** Small, neutral interface glyphs. Category glyphs illustrate catalog tags, never status. */
export function InterfaceIcon({ name }: { name: string }) {
  const path = name === "market" ? <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>
    : name === "chat" ? <><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3V6a2 2 0 0 1 1-2Z" /><path d="M8 9h9M8 13h6" /></>
    : name === "buyer" ? <><path d="M7 3h10l3 3v15l-4-2-4 2-4-2-4 2V6l3-3Z" /><path d="M8 8h8M8 12h8M8 16h4" /></>
    : name === "seller" ? <><path d="M4 9h16v12H4ZM3 9l2-6h14l2 6M9 21v-7h6v7" /><path d="M3 9c0 4 6 4 6 0 0 4 6 4 6 0 0 4 6 4 6 0" /></>
    : name === "search" ? <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>
    : name === "code" ? <><path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" /></>
    : name === "research" ? <><circle cx="11" cy="11" r="8" /><path d="m17 17 5 5M7 11h8M11 7v8" /></>
    : name === "data" ? <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0" /></>
    : <><path d="M12 2 2 7l10 5 10-5-10-5ZM2 12l10 5 10-5M2 17l10 5 10-5" /></>
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
}
