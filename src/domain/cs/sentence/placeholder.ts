import { isSameDate, type CalDate, type WallTime } from '@/domain/time';

import {
  formatAgendaTimeRange,
  formatLongDate,
  formatDayMonthName,
  onWeekday,
  weekdayGenitive,
} from '../dates/format';
import type { Campus } from './opening';
import type { OrganizerRole } from './organizer';

const CAMPUS_LABEL: Readonly<Record<Exclude<Campus, 'jinde'>, string>> = {
  smichov: 'areál Smíchov',
  radlice: 'areál Radlice',
  'na-vidouli': 'areál Na Vidouli',
};

/** „areál Smíchov“ as the agenda writes it; „Jinde“ and no campus print nothing. */
export function campusLabel(campus: Campus | null | undefined): string | undefined {
  return campus && campus !== 'jinde' ? CAMPUS_LABEL[campus] : undefined;
}

export interface PlaceholderInput {
  readonly date: CalDate;
  /** Last day of a multi-day akce; the paragraph then names no time. */
  readonly endDate?: CalDate;
  readonly from?: WallTime;
  readonly campus?: Campus | null;
  readonly place?: string;
  readonly title: string;
  /** The author's words, quoted after „Akci organizovali:“, „Akci za školu koordinovali:“ or, with no role, „Akci zajišťovali:“. */
  readonly organizer?: string;
  /** What our person does (ADR 0063); null or left out is an item typed before the role existed. */
  readonly organizerRole?: OrganizerRole | null;
  /** The author's words, quoted after „Za Smíchovskou střední se zúčastnili:“. */
  readonly participants?: string;
}

/** The lead-in of the organizer sentence by role (ADR 0063); no role keeps the old wording. */
const ORGANIZER_LEAD: Readonly<Record<OrganizerRole | 'none', string>> = {
  organizes: 'Akci organizovali',
  coordinates: 'Akci za školu koordinovali',
  none: 'Akci zajišťovali',
};

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The author's words closed by a full stop, unless they close themselves. */
const closed = (text: string) => (/[.!?…]$/.test(text) ? text : `${text}.`);

/**
 * What the document says of an akce whose report was not handed in (ADR 0060, ADR 0049): „V úterý
 * 5. května 2026 od 14.00 hodin proběhla akce předání diplomů (areál Smíchov, Zasedací místnost).
 * Akci organizovali: …. Za Smíchovskou střední se zúčastnili: …. Zpráva o akci nebyla dodána.“ The
 * organizer sentence follows the role (ADR 0063): „Akci organizovali“, „Akci za školu
 * koordinovali“, and with no role „Akci zajišťovali“. A multi-day akce reads „Od pondělí
 * 11. května do středy 20. května 2026 proběhla akce …“, with no time. Only the dates are
 * inflected; the typed texts are quoted as they are, and an empty piece leaves its words out.
 */
export function placeholderParagraph(input: PlaceholderInput): string {
  const multiDay = input.endDate !== undefined && !isSameDate(input.date, input.endDate);
  let when: string;
  if (input.endDate && multiDay) {
    const end = input.endDate;
    const start =
      input.date.year === end.year
        ? `${weekdayGenitive(input.date)} ${formatDayMonthName(input.date)}`
        : `${weekdayGenitive(input.date)} ${formatLongDate(input.date)}`;
    when = `Od ${start} do ${weekdayGenitive(end)} ${formatLongDate(end)}`;
  } else {
    const time = input.from ? ` od ${formatAgendaTimeRange(input.from)}` : '';
    when = `${onWeekday(input.date, { capitalize: true })} ${formatLongDate(input.date)}${time}`;
  }
  const where = [campusLabel(input.campus), clean(input.place ?? '')].filter(Boolean).join(', ');
  const sentences = [`${when} proběhla akce ${clean(input.title)}${where ? ` (${where})` : ''}.`];
  const organizer = clean(input.organizer ?? '');
  if (organizer) {
    const lead = ORGANIZER_LEAD[input.organizerRole ?? 'none'];
    sentences.push(`${lead}: ${closed(organizer)}`);
  }
  const participants = clean(input.participants ?? '');
  if (participants) {
    sentences.push(`Za Smíchovskou střední se zúčastnili: ${closed(participants)}`);
  }
  sentences.push('Zpráva o akci nebyla dodána.');
  return sentences.join(' ');
}
