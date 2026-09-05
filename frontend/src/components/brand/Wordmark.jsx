/**
 * The Hunterstellar wordmark, as live type.
 *
 * This replaces two SVG files that together weighed 1.13 MB, not because they
 * were bitmaps, but because a distressed wordmark had been traced into
 * hundreds of thousands of micro-segments. The same look comes from the real
 * Bebas Neue glyphs plus a noise overlay, at zero bytes of asset, and it stays
 * selectable, scalable and recolourable.
 *
 * `width` is kept as the API because call sites pass it, but it now drives the
 * font size rather than an <img> box. Bebas averages ~0.42em of advance per
 * character, so 13 characters occupy roughly 5.46em.
 */

const GLYPH_ADVANCE = 5.46

export function Wordmark({
  width = 240,
  showVersion = true,
  tone = 'brand', // 'brand' | 'ink' | 'void'
  className = '',
}) {
  const fontSize = Math.round(width / GLYPH_ADVANCE)

  const toneClass =
    tone === 'void'
      ? 'text-void-gold'
      : tone === 'ink'
        ? 'text-text-primary'
        : 'text-rust'

  return (
    <div
      className={`flex items-baseline gap-2 select-none ${className}`}
      style={{ width }}
      role="img"
      aria-label={showVersion ? 'Hunterstellar 2.0' : 'Hunterstellar'}
    >
      <span
        aria-hidden="true"
        className={`display-grunge leading-none ${toneClass}`}
        style={{ fontSize }}
      >
        Hunterstellar
      </span>
      {showVersion && (
        <span
          aria-hidden="true"
          className="font-mono text-text-secondary leading-none tracking-[0.12em]"
          // Deliberately proportional to the wordmark. The version suffix used
          // to be a hardcoded 4rem, so it dwarfed the mark at small sizes.
          style={{ fontSize: Math.max(10, Math.round(fontSize * 0.32)) }}
        >
          2.0
        </span>
      )}
    </div>
  )
}

export default Wordmark
