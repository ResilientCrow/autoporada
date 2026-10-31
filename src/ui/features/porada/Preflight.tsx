import Link from 'next/link';

import { formatDayMonth, formatTime } from '@/domain/cs';
import { instantToWallClock } from '@/domain/time';
import { porada } from '@/ui/copy';
import { Notice } from '@/ui/kit';

/** One line of the preflight list as `issues.preview` answers it. */
export interface FindingView {
  readonly code: keyof typeof porada.preflight.code | 'registry-new';
  readonly level: 'block' | 'warn' | 'info';
  /** The points or akce to look at. */
  readonly refs?: readonly {
    readonly id: string;
    readonly title: string;
    readonly due?: string;
    readonly of?: 'akce' | 'point';
  }[];
  /** `snapshot-invalid`: the fields that are wrong. */
  readonly paths?: readonly string[];
  /** `registry-new`: how many entries will be marked NOVÉ; `late-reports-expected`: late drafts not named. */
  readonly count?: number;
}

const LEVELS = ['block', 'warn', 'info'] as const;

type RefView = NonNullable<FindingView['refs']>[number];

/** Where a ref leads: an akce has its own page, a late report draft its editor, a point the review. */
const refHref = (code: FindingView['code'], ref: RefView): `/${string}` => {
  if (code === 'akce-waiting' || ref.of === 'akce') return `/akce/${ref.id}`;
  return ref.of === 'point' ? `/body/${ref.id}` : `/kontrola/${ref.id}`;
};

/** „do 23. 11. v 20.00“ for a ref that closes at an hour; empty for any other. */
function dueText(ref: RefView): string {
  if (ref.due === undefined) return '';
  const { date, time } = instantToWallClock(new Date(ref.due));
  return porada.preflight.due(`${formatDayMonth(date)}\u00a0v\u00a0${formatTime(time)}`);
}

function Finding({ finding }: { readonly finding: FindingView }) {
  const text =
    finding.code === 'registry-new'
      ? porada.preflight.newEntries(finding.count ?? 0)
      : porada.preflight.code[finding.code];
  return (
    <li className="space-y-1">
      <p>{text}</p>
      {finding.refs !== undefined && (
        <ul className="list-disc space-y-1 pl-6">
          {finding.refs.map((ref) => (
            <li key={ref.id}>
              <Link href={refHref(finding.code, ref)} prefetch={false} className="font-bold">
                {ref.title}
              </Link>
              {dueText(ref)}
            </li>
          ))}
        </ul>
      )}
      {finding.code === 'late-reports-expected' && (finding.count ?? 0) > 0 && (
        <p>{porada.preflight.hiddenDrafts(finding.count ?? 0)}</p>
      )}
      {finding.paths !== undefined && (
        <ul className="list-disc space-y-1 pl-6">
          {finding.paths.map((path) => (
            <li key={path}>
              <code>{path}</code>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * „Před vygenerováním“: what the headmaster should know about the document, blockers first.
 * Findings with refs link to the point or akce they are about.
 */
export function Preflight({ findings }: { readonly findings: readonly FindingView[] }) {
  return (
    <section aria-labelledby="predgenerovanim" className="space-y-4">
      <h2 id="predgenerovanim" className="text-xl">
        {porada.preflight.title}
      </h2>
      {findings.length === 0 && <p>{porada.preflight.none}</p>}
      {LEVELS.map((level) => {
        const group = findings.filter((finding) => finding.level === level);
        if (group.length === 0) return null;
        const list = (
          <ul className="space-y-3">
            {group.map((finding) => (
              <Finding key={finding.code} finding={finding} />
            ))}
          </ul>
        );
        return (
          <div key={level} className="space-y-2">
            <h3 className="font-bold">{porada.preflight.level[level]}</h3>
            {level === 'block' ? (
              <Notice tone="problem" live={false}>
                {list}
              </Notice>
            ) : (
              list
            )}
          </div>
        );
      })}
    </section>
  );
}
