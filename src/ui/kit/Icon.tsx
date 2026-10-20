export type IconName = 'arrow' | 'check' | 'clock' | 'cross' | 'dot' | 'exclamation' | 'info';

/** One convention: a 16 px grid, filled shapes in currentColor, evenodd for holes. */
const SHAPES: Record<IconName, string> = {
  arrow: 'M8 1.5 6.9 2.6l4.6 4.6H1.5v1.6h10l-4.6 4.6L8 14.5 14.5 8z',
  check: 'M6.2 11.3 2.9 8 1.8 9.1l4.4 4.4 8-8-1.1-1.1z',
  clock:
    'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM7.25 4.5v4l2.9 1.7.75-1.3-2.4-1.4V4.5z',
  cross:
    'M3.4 2.3 2.3 3.4 6.9 8l-4.6 4.6 1.1 1.1L8 9.1l4.6 4.6 1.1-1.1L9.1 8l4.6-4.6-1.1-1.1L8 6.9z',
  dot: 'M8 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  exclamation: 'M7.1 2h1.8l-.4 7H7.5zM8 10.5a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z',
  info: 'M7.1 7h1.8v5H7.1zM8 3.3a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z',
};

/**
 * Decoration beside text, never the only carrier of meaning: hidden from
 * assistive technology, and drawn as SVG because axe cannot measure a glyph.
 */
export function Icon({ name }: { readonly name: IconName }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      className="inline-block size-4 shrink-0 align-text-bottom"
      fill="currentColor"
      fillRule="evenodd"
    >
      <path d={SHAPES[name]} />
    </svg>
  );
}
