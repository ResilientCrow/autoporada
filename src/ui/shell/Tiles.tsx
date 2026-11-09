import type { Actor } from '@/domain/actor';
import { can } from '@/domain/policy';
import { cs } from '@/ui/copy';
import { NAV, navFor } from './nav';
import { NAV_LOOK, NavIcon } from './NavIcon';

/** One tone per tile: a light plate and a dark icon of the same hue (arch-ui). */
const TONE = {
  gold: 'bg-tile-gold text-tile-gold-ink',
  navy: 'bg-ink text-light',
  blue: 'bg-tile-blue text-tile-blue-ink',
  green: 'bg-tile-green text-tile-green-ink',
  teal: 'bg-tile-teal text-tile-teal-ink',
  violet: 'bg-tile-violet text-tile-violet-ink',
  rose: 'bg-tile-rose text-tile-rose-ink',
  slate: 'bg-wash text-ink ring-1 ring-sublight ring-inset',
} as const;

interface Tile {
  readonly href: string;
  readonly label: string;
  readonly icon: string;
  readonly tone: keyof typeof TONE;
  readonly count?: number;
}

/** Wording of the tiles, by the navigation entry they open. */
const LABEL: Record<string, string> = {
  '/body': 'Moje zprávy',
  '/akce': 'Akce',
  '/kontrola': 'Ke kontrole',
  '/kontrola/akce': 'Kontrola akcí',
  '/pridani': 'Přidat',
  '/registr': 'Seznamy studentů',
  '/porada': 'Porada',
  '/porada/archiv': 'Archiv',
  '/pristup': 'Žádost o přístup',
  '/nastaveni': 'Nastavení',
};
const TONES: readonly (keyof typeof TONE)[] = ['blue', 'green', 'violet', 'teal', 'rose', 'slate'];

/**
 * The home page's launcher (arch-ui): a tile per thing the viewer may do, with the count of what
 * waits on it in the corner. Built from the same policy-filtered navigation as the header.
 */
export function Tiles({
  actor,
  waiting,
  queue,
}: {
  readonly actor: Actor;
  /** Reports the viewer owes, shown on „Čeká na vás“. */
  readonly waiting: number;
  readonly queue: number | null;
}) {
  const tiles: Tile[] = [];
  if (waiting > 0)
    tiles.push({
      href: '#ceka',
      label: cs.shell.waiting,
      icon: 'bell',
      tone: 'gold',
      count: waiting,
    });
  if (can(actor, { action: 'point.create' }))
    tiles.push({ href: '/body/novy', label: 'Napsat zprávu', icon: 'pen', tone: 'blue' });
  if (can(actor, { action: 'future.create' }))
    tiles.push({ href: '/akce/novy', label: 'Nová akce', icon: 'calp', tone: 'green' });
  if (can(actor, { action: 'point.propose' }))
    tiles.push({ href: '/navrhy/novy', label: 'Návrh do pokynů', icon: 'flag', tone: 'rose' });
  navFor(actor, NAV)
    .filter((item) => item.href !== '/klasicke' && item.href !== '/pridani')
    .forEach((item, i) => {
      const special =
        item.href === '/kontrola'
          ? { tone: 'gold' as const, count: queue ?? 0 }
          : item.href === '/porada'
            ? { tone: 'navy' as const }
            : item.href === '/body'
              ? { tone: 'violet' as const, icon: 'doc' }
              : item.href === '/akce'
                ? { tone: 'rose' as const }
                : {};
      tiles.push({
        href: item.href,
        label: LABEL[item.href] ?? item.label,
        icon: NAV_LOOK[item.href]?.icon ?? 'doc',
        tone: TONES[i % TONES.length]!,
        ...special,
      });
    });
  return (
    <ul className="grid grid-cols-3 gap-x-2 gap-y-6 sm:grid-cols-4 sm:gap-x-4 lg:grid-cols-6">
      {tiles.map((t) => (
        <li key={t.href}>
          <a
            href={t.href}
            className="group flex flex-col items-center gap-3 rounded-brand px-1 py-2 text-center text-ink no-underline"
          >
            <span
              className={`relative flex size-19 items-center justify-center rounded-tile transition-transform group-hover:-translate-y-0.5 motion-reduce:transition-none sm:size-21 sm:rounded-tile-lg ${TONE[t.tone]}`}
            >
              <NavIcon name={t.icon} size={36} />
              {t.count ? (
                <span className="absolute -top-2 -right-2 flex h-7.5 min-w-7.5 items-center justify-center rounded-full border-3 border-light bg-accent px-2 text-sm font-bold text-ink">
                  {t.count}
                  <span className="sr-only">{cs.shell.waitingCount}</span>
                </span>
              ) : null}
            </span>
            <span className="text-sm leading-tight font-semibold sm:text-base">{t.label}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
