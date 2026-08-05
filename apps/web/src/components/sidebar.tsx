import type { Conversation } from "../lib/history.ts"
import { ago } from "../lib/history.ts"

/**
 * Past conversations.
 *
 * ## It says where the transcripts are, once, at the bottom
 *
 * "stored in this browser" is a small line under the list rather than a tooltip or nothing
 * at all, because on a product whose entire pitch is that it custodies nothing, where the
 * transcript lives is a claim worth making in the open. It is also the honest warning that
 * this history does not follow anyone to another device.
 *
 * ## Deleting is per-row and immediate, with no confirmation
 *
 * A confirm dialog for discarding a local chat transcript would be ceremony over something
 * cheap and private. The rule this product applies to money — ask before spending — does not
 * transfer to a list of one's own notes.
 *
 * ## Open-but-empty says so in one line
 *
 * Collapsed, a first-time visitor sees only the toggle — no panel, nothing to explain. But
 * somebody who OPENS it has asked a question, and answering with 244px of blank panel reads
 * as a loading state that never resolves. One quiet line is the whole answer; anything more
 * would be a second empty state competing with the chat's own.
 */
export interface SidebarProps {
  readonly conversations: ReadonlyArray<Conversation>
  readonly currentId: string
  readonly onOpen: (id: string) => void
  readonly onNew: () => void
  readonly onDelete: (id: string) => void
  /** Collapsed state is the caller's, so the layout column can react to it. */
  readonly open: boolean
  readonly onToggle: () => void
}

export const Sidebar = ({
  conversations,
  currentId,
  onOpen,
  onNew,
  onDelete,
  open,
  onToggle
}: SidebarProps) => (
  <aside className={`side${open ? " is-open" : ""}`} aria-label="Conversations">
    <div className="side-top">
      <button
        type="button"
        className="side-toggle"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? "Hide conversations" : "Show conversations"}
        title={open ? "Hide conversations" : "Show conversations"}
      >
        {/* Two bars and a panel edge: a sidebar glyph, not a hamburger, because this
            toggles a named region rather than opening a menu. */}
        <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
          <rect x="1" y="2" width="13" height="11" rx="2" fill="none" stroke="currentColor" />
          <line x1="5.5" y1="2" x2="5.5" y2="13" stroke="currentColor" />
        </svg>
      </button>
      {open ? (
        <button type="button" className="side-new" onClick={onNew}>
          new chat
        </button>
      ) : null}
    </div>

    {open ? (
      conversations.length === 0 ? (
        <p className="side-empty">
          No past conversations. They are kept in this browser, never on our servers.
        </p>
      ) : (
        <>
          <ul className="side-list">
            {conversations.map((c) => (
              <li key={c.id} className={c.id === currentId ? "is-current" : undefined}>
                <button type="button" className="side-row" onClick={() => onOpen(c.id)}>
                  <span className="side-title">{c.title}</span>
                  <span className="side-when">{ago(c.updatedAtMs)}</span>
                </button>
                <button
                  type="button"
                  className="side-del"
                  onClick={() => onDelete(c.id)}
                  aria-label={`Delete “${c.title}”`}
                  title="Delete"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <p className="side-foot">stored in this browser</p>
        </>
      )
    ) : null}
  </aside>
)
