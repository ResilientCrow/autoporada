/** Stroke icons of the arch-ui shell and home tiles, on a 24 px grid. Decoration only. */
const PATHS: Record<string, string> = {
  home: 'M3 11l9-8 9 8M5 9.5V21h14V9.5',
  pen: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  cal: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  calp: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4M12 13v5M9.5 15.5h5',
  rev: 'M9 12l2 2 4-4M4 4h16v16H4z',
  revc: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4M9 15.5l2 2 4-4',
  plus: 'M12 5v14M5 12h14',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  book: 'M4 4h6a2 2 0 012 2v15a2 2 0 00-2-2H4zM20 4h-6a2 2 0 00-2 2v15a2 2 0 012-2h6z',
  stack: 'M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4',
  key: 'M14 10a4 4 0 10-3.5 4H12v2h2v2h3v-3l-3.4-3.4',
  gear: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4',
  bell: 'M6 16v-5a6 6 0 0112 0v5l2 2H4zM10 21h4',
  flag: 'M5 21V4h12l-2.5 4 2.5 4H5',
  doc: 'M14 3H6v18h12V7zM14 3v4h4',
};

export function NavIcon({ name, size = 20 }: { readonly name: string; readonly size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d={PATHS[name] ?? PATHS['doc']} />
    </svg>
  );
}

/** The icon and the short label of each navigation entry, by its href. */
export const NAV_LOOK: Record<string, { readonly icon: string; readonly short: string }> = {
  '/klasicke': { icon: 'home', short: 'Domů' },
  '/body': { icon: 'pen', short: 'Zprávy' },
  '/akce': { icon: 'cal', short: 'Akce' },
  '/kontrola': { icon: 'rev', short: 'Kontrola' },
  '/kontrola/akce': { icon: 'revc', short: 'Kontrola akcí' },
  '/pridani': { icon: 'plus', short: 'Přidat' },
  '/registr': { icon: 'list', short: 'Seznamy' },
  '/porada': { icon: 'book', short: 'Porada' },
  '/porada/archiv': { icon: 'stack', short: 'Archiv' },
  '/pristup': { icon: 'key', short: 'Přístup' },
  '/nastaveni': { icon: 'gear', short: 'Nastavení' },
};
