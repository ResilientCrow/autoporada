import { formatClose, formatDayMonth, formatNumericDate } from '@/domain/cs';
import { parseIsoDate } from '@/domain/time';
import { porada } from '@/ui/copy';
import { ItemLink, Notice } from '@/ui/kit';

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
  /** `earlier-open`: the porada to generate or drop first, as ISO dates. */
  readonly earlier?: { readonly monday: string; readonly meetingDate: string };
  /** `snapshot-invalid`: the fields that are wrong. */
  readonly paths?: readonly string[];
  /** `registry-new`: how many entries will be marked NOVÉ; `late-reports-expected`: late drafts not named. */
  readonly count?: number;
}

const LEVELS = ['block', 'warn', 'info'] as const;

type RefView = NonNullable<FindingView['refs']>[number];

/**
 * Where a ref leads: an akce has its own page, a late report draft its editor, a point the review.
 * An akce whose report is missing leads to the porada's „Chybějící zprávy“, which only the
 * headmaster (`editMonday`) may open; for a reader who cannot, there is no link (null).
 */
const refHref = (
  code: FindingView['code'],
  ref: RefView,
  editMonday: string | null,
): `/${string}` | null => {
  if (code === 'reports-missing') {
    return editMonday === null ? null : `/porada/${editMonday}/zpravy`;
  }
  if (code === 'akce-waiting' || ref.of === 'akce') return `/akce/${ref.id}`;
  return ref.of === 'point' ? `/body/${ref.id}` : `/kontrola/${ref.id}`;
};

/** „do 23. 11. v 20:00“ for a ref that closes at an hour; empty for any other. A 00:00 cap is 23:59 the day before. */
function dueText(ref: RefView): string {
  if (ref.due === undefined) return '';
  const { date, time } = formatClose(new Date(ref.due));
  return porada.preflight.due(`${formatDayMonth(date)}\u00a0v\u00a0${time}`);
}

/** `earlier-open`: the workspace of the porada to generate or drop first, by its meeting date. */
function EarlierLink({ earlier }: { readonly earlier: NonNullable<FindingView['earlier']> }) {
  return (
    <p>
      <ItemLink href={`/porada/${earlier.monday}`}>
        {porada.preflight.earlier(formatNumericDate(parseIsoDate(earlier.meetingDate)))}
      </ItemLink>
    </p>
  );
}

function Finding({
  finding,
  editMonday,
}: {
  readonly finding: FindingView;
  readonly editMonday: string | null;
}) {
  const text =
    finding.code === 'registry-new'
      ? porada.preflight.newEntries(finding.count ?? 0)
      : porada.preflight.code[finding.code];
  return (
    <li className="space-y-1">
      <p>{text}</p>
      {finding.earlier !== undefined && <EarlierLink earlier={finding.earlier} />}
      {finding.refs !== undefined && (
        <ul className="list-disc space-y-1 pl-6">
          {finding.refs.map((ref) => {
            const href = refHref(finding.code, ref, editMonday);
            return (
              <li key={ref.id}>
                {href === null ? ref.title : <ItemLink href={href}>{ref.title}</ItemLink>}
                {dueText(ref)}
              </li>
            );
          })}
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
 * Findings with refs link to the point or akce they are about; the missing reports, to their page.
 */
export function Preflight({
  findings,
  editMonday,
}: {
  readonly findings: readonly FindingView[];
  /** The Monday of the porada when the reader may edit it: the missing reports then link to its page. */
  readonly editMonday: string | null;
}) {
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
              <Finding key={finding.code} finding={finding} editMonday={editMonday} />
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
