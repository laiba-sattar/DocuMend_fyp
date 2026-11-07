/**
 * IssueHoverCard — the small popover that appears over a highlighted word.
 *
 * It shows the same thing the matching card in the review panel does — the
 * message and the one-click fixes — right where the writer is already
 * looking, instead of making them find the card in the side panel.
 *
 * Hovering a highlighted word opens it, same as before. What changed is when
 * it closes: it used to close a short moment after the pointer left the word
 * *and* the card, which meant a real hand — slower and less exact than a
 * scripted test — could lose the card mid-way to a button before ever
 * clicking it. Word's own spelling menu does not have this problem because
 * it does not close on hover at all: once open, it stays until you actually
 * choose something or click elsewhere. This does the same — it opens on
 * hover and stays open regardless of where the pointer wanders, and closes
 * only when a fix is applied, "Ignore" or the × is clicked, or the writer
 * clicks anywhere outside the card.
 *
 *   const hover = useIssueHover(issuesRef); // issuesRef.current = engine.issues
 *   <... onHighlightHover={hover.handleHover} />
 *   <IssueHoverCard {...hover} onApply={...} onIgnore={...} />
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * `issuesRef` is a ref kept pointing at the latest `engine.issues` (via a
 * `useEffect` in the caller) rather than the array itself, because the
 * editor's extensions — and the `onHighlightHover` this hook returns — are
 * built once, in a `useMemo` with no dependencies; a plain closure over
 * `engine.issues` would only ever see the empty array from that first
 * render. `handleHover` and `close` are themselves stable across renders
 * (via `useCallback` with no dependencies) for the same reason: passed into
 * that one-time setup, a function that changed identity on every render
 * would still only ever run the version captured at mount.
 */
export function useIssueHover(issuesRef) {
  const [hovered, setHovered] = useState(null); // { issue, rect } | null

  /** Pass as `onHighlightHover` to buildExtensions(). Leaving the word (id === null) no longer closes the card — see the module doc comment for why. */
  const handleHover = useCallback((id, group, rect) => {
    if (!id) return;
    const issue = issuesRef.current.find((candidate) => candidate.id === id);
    if (issue) setHovered({ issue, rect });
  }, [issuesRef]);

  const close = useCallback(() => setHovered(null), []);

  // Click anywhere that is not the card itself closes it — the one thing
  // that still needs to dismiss a card nothing else has already closed.
  useEffect(() => {
    if (!hovered) return undefined;
    const onMouseDown = (event) => {
      if (!event.target.closest?.('.editor-hover-card')) close();
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [hovered, close]);

  return { hovered, handleHover, close };
}

function IssueHoverCard({ hovered, close, onApply, onIgnore }) {
  if (!hovered) return null;
  const { issue, rect } = hovered;

  const top = rect.bottom + 6;
  const maxLeft = Math.max(8, window.innerWidth - 320);
  const left = Math.min(Math.max(rect.left, 8), maxLeft);

  return (
    <div className="editor-hover-card" style={{ top, left }}>
      <div className="editor-hover-card-head">
        <span className="editor-hover-card-title"><AlertTriangle size={12} /> {issue.title}</span>
        <button type="button" className="editor-hover-card-close" onClick={close} aria-label="Close"><X size={12} /></button>
      </div>
      <p className="editor-hover-card-message">{issue.message}</p>
      {issue.repairs?.length > 0 && (
        <div className="editor-hover-card-actions">
          {issue.repairs.map((repair) => (
            <button type="button" key={repair.label} className="editor-hover-card-fix" onClick={() => onApply(issue, repair)}>
              {repair.label}
            </button>
          ))}
        </div>
      )}
      {onIgnore && (
        <button type="button" className="editor-hover-card-ignore" onClick={() => onIgnore(issue)}>Ignore</button>
      )}
    </div>
  );
}

export default IssueHoverCard;
