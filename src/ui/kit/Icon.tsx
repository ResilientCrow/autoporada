export type IconName =
  | 'arrow'
  | 'back'
  | 'check'
  | 'chevron'
  | 'clock'
  | 'cross'
  | 'dot'
  | 'download'
  | 'exclamation'
  | 'info'
  | 'menu';

/** One convention: a 16 px grid, filled shapes in currentColor, evenodd for holes. */
const SHAPES: Record<IconName, string> = {
  arrow: 'M8 1.5 6.9 2.6l4.6 4.6H1.5v1.6h10l-4.6 4.6L8 14.5 14.5 8z',
  back: 'M8 1.5 9.1 2.6 4.5 7.2h10v1.6h-10l4.6 4.6L8 14.5 1.5 8z',
  check: 'M6.2 11.3 2.9 8 1.8 9.1l4.4 4.4 8-8-1.1-1.1z',
  chevron: 'M5.5 2.5 4.4 3.6 8.8 8l-4.4 4.4 1.1 1.1L11 8z',
  clock:
    'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM7.25 4.5v4l2.9 1.7.75-1.3-2.4-1.4V4.5z',
  cross:
    'M3.4 2.3 2.3 3.4 6.9 8l-4.6 4.6 1.1 1.1L8 9.1l4.6 4.6 1.1-1.1L9.1 8l4.6-4.6-1.1-1.1L8 6.9z',
  dot: 'M8 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  download: 'M7.2 1.5h1.6v6.9l2.2-2.2 1.1 1.1L8 11.5 3.9 7.3l1.1-1.1 2.2 2.2zM2 12.5h12V14H2z',
  exclamation: 'M7.1 2h1.8l-.4 7H7.5zM8 10.5a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z',
  info: 'M7.1 7h1.8v5H7.1zM8 3.3a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z',
  menu: 'M2 3.5h12V5H2zM2 7.25h12v1.5H2zM2 11h12v1.5H2z',
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
