/**
 * Renders text and softly highlights any [bracketed placeholder] so it's obvious
 * what still needs real content. Once you replace the brackets, the highlight disappears.
 */
export function Editable({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\[[^\]]+\])/g)
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.startsWith('[') && p.endsWith(']') ? (
          <span key={i} className="placeholder-mark" title="Placeholder — edit in src/data">
            {p.slice(1, -1)}
          </span>
        ) : (
          p
        ),
      )}
    </span>
  )
}

export const isPlaceholder = (s: string) => /^\[.*\]$/.test(s.trim()) || s.trim() === ''
