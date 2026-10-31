import {
  formatDayMonth,
  formatLongDate,
  formatTime,
  typographizeText,
  weekdayName,
} from '@/domain/cs';
import { instantToWallClock, type CalDate } from '@/domain/time';

import { frame, type Body } from './frame';

/**
 * Mails are plain text and carry no personal data: the subjects are constants
 * and the only variables are the app origin, one date and counts (ADR 0016, 0020). The sentences that
 * say what the access screens say are the screens' words
 * (test/arch/notify-copy.test.ts compares them byte for byte). Non-breaking
 * spaces are written as escapes, as in src/ui/copy.
 */
export const TEMPLATE_NAMES = [
  'access.approved',
  'access.rejected',
  'access.blocked',
  'access.granted',
  'mail.check',
  'point.returned',
  'point.approved',
  'point.rejected',
  'report.prompt',
  'reminder.soft',
  'reminder.hard',
  'reviewer.digest',
  'headmaster.summary',
  'issue.moved',
  'report.ended',
  'report.last-call',
] as const;
export type TemplateName = (typeof TEMPLATE_NAMES)[number];

/** The variables each template takes. */
export interface TemplateViews {
  'access.approved': Record<string, never>;
  /** The Prague day from which a new request can be made. */
  'access.rejected': { readonly retryFrom: CalDate };
  'access.blocked': Record<string, never>;
  'access.granted': Record<string, never>;
  'mail.check': Record<string, never>;
  'point.returned': Record<string, never>;
  'point.approved': Record<string, never>;
  'point.rejected': Record<string, never>;
  'report.prompt': Record<string, never>;
  /** The meeting the deadline is for. */
  'reminder.soft': { readonly meetingDate: CalDate };
  'reminder.hard': { readonly meetingDate: CalDate };
  /** What came in for a reviewer since their last digest; a headmaster's access requests too. One of them is above zero. */
  'reviewer.digest': { readonly submitted: number; readonly accessRequests: number };
  /** The meeting whose deadline has passed, and where its points stand. */
  'headmaster.summary': {
    readonly meetingDate: CalDate;
    readonly approved: number;
    readonly pending: number;
    readonly returned: number;
  };
  /** The porada that was moved and the deadline it now has. */
  'issue.moved': { readonly meetingDate: CalDate; readonly deadlineAt: Date };
  /** The close of a late report and the porada it goes to. */
  'report.ended': { readonly due: Date; readonly meetingDate: CalDate };
  'report.last-call': { readonly due: Date; readonly meetingDate: CalDate };
}

interface RenderedMail {
  readonly subject: string;
  readonly text: string;
}

interface Template {
  readonly subject: string;
  readonly body: Body;
}

const TEMPLATES: { [T in TemplateName]: (view: TemplateViews[T]) => Template } = {
  'access.approved': () => ({
    subject: 'Autoporada: přístup byl schválen',
    body: {
      paragraphs: [
        'vedení školy schválilo vaši žádost o\u00A0přístup do Autoporady. Přihlaste se prosím znovu.',
      ],
      link: '/prihlaseni',
    },
  }),
  'access.rejected': ({ retryFrom }) => ({
    subject: 'Autoporada: žádost o\u00A0přístup byla zamítnuta',
    body: {
      paragraphs: [
        `vedení školy vaši žádost o\u00A0přístup do Autoporady zamítlo. Novou žádost lze podat od ${typographizeText(formatLongDate(retryFrom))}. Pokud jde podle vás o\u00A0omyl, obraťte se přímo na vedení školy.`,
      ],
    },
  }),
  'access.blocked': () => ({
    subject: 'Autoporada: další žádosti o\u00A0přístup nelze podat',
    body: {
      paragraphs: [
        'vedení školy vaši žádost o\u00A0přístup do Autoporady neschválilo a\u00A0další žádosti už nelze podat. Pokud přístup potřebujete, obraťte se prosím přímo na vedení školy.',
      ],
    },
  }),
  'access.granted': () => ({
    subject: 'Autoporada: byl vám přidělen přístup',
    body: {
      paragraphs: ['vedení školy vám přidělilo přístup do Autoporady. Přihlaste se prosím znovu.'],
      link: '/prihlaseni',
    },
  }),
  'mail.check': () => ({
    subject: 'Autoporada: zkušební zpráva',
    body: {
      paragraphs: [
        'tuto zprávu poslala Autoporada na žádost správce, aby ověřil odesílání e-mailů. Nemusíte nic dělat.',
      ],
    },
  }),
  // A decision on a point goes to its author, without the title or the note: both are in the app.
  // Subjects and the lower-case opening after „Dobrý den,“ follow the access mails.
  'point.returned': () => ({
    subject: 'Autoporada: bod byl vrácen k\u00A0úpravě',
    body: {
      paragraphs: [
        'váš bod pro poradu vedení byl vrácen k\u00A0úpravě. Poznámku kontroly najdete v\u00A0aplikaci:',
      ],
      link: '/body',
    },
  }),
  'point.approved': () => ({
    subject: 'Autoporada: bod byl schválen',
    body: { paragraphs: ['váš bod pro poradu vedení byl schválen.'], link: '/body' },
  }),
  'point.rejected': () => ({
    subject: 'Autoporada: bod nebyl přijat',
    body: {
      paragraphs: ['váš bod pro poradu vedení nebyl přijat. Důvod najdete v\u00A0aplikaci:'],
      link: '/body',
    },
  }),
  // The akce is not named: its title is in the app, where /body lists what is waiting for a report.
  'report.prompt': () => ({
    subject: 'Autoporada: napište zprávu z\u00A0akce',
    body: {
      paragraphs: [
        'akce, kterou jste zapsali do přehledu, proběhla. Zprávu do porady můžete napsat v\u00A0aplikaci:',
      ],
      link: '/body',
    },
  }),
  // The soft one can be switched off in the profile (D8); the hard one cannot, as it is about the reader's own work.
  'reminder.soft': ({ meetingDate }) => ({
    subject: 'Autoporada: uzávěrka porady se blíží',
    body: {
      paragraphs: [
        `uzávěrka porady z\u00A0${typographizeText(formatLongDate(meetingDate))} je za dva dny.`,
      ],
      link: '/body',
      after: ['Připomínky můžete vypnout v\u00A0profilu.'],
    },
  }),
  'reminder.hard': ({ meetingDate }) => ({
    subject: 'Autoporada: dnes je uzávěrka porady',
    body: {
      paragraphs: [
        `máte rozpracovaný nebo vrácený bod pro poradu z\u00A0${typographizeText(formatLongDate(meetingDate))}. Uzávěrka je dnes.`,
      ],
      link: '/body',
    },
  }),
  // Counts, not titles or names (D3 (a)); a count of zero is left out. The colon keeps every noun clear of the number.
  // "Položky" are points and akce alike, so the subject is neutral too. Requests alone go to the page that decides them.
  'reviewer.digest': ({ submitted, accessRequests }) => {
    const counts: (readonly [string, number])[] = [];
    if (submitted > 0) counts.push(['položky ke kontrole', submitted]);
    if (accessRequests > 0) counts.push(['žádosti o\u00A0přístup', accessRequests]);
    return {
      subject: 'Autoporada: novinky ke kontrole',
      body: {
        paragraphs: counts.map(([what, n], i) => `${i === 0 ? 'nové' : 'Nové'} ${what}: ${n}.`),
        link: submitted > 0 ? '/kontrola' : '/uzivatele',
      },
    };
  },
  // Counts, never titles or names (D3 (a)); the colons keep every noun clear of its number.
  'headmaster.summary': ({ meetingDate, approved, pending, returned }) => ({
    subject: 'Autoporada: uzávěrka porady proběhla',
    body: {
      paragraphs: [
        `uzávěrka porady z\u00A0${typographizeText(formatLongDate(meetingDate))} proběhla. Schváleno: ${approved}, čeká na kontrolu: ${pending}, vráceno k\u00A0úpravě: ${returned}.`,
      ],
      link: '/kontrola',
    },
  }),
  // A date and a time, no names (D21); sent only when the deadline came earlier, so the reader has less time.
  'issue.moved': ({ meetingDate, deadlineAt }) => {
    const { date, time } = instantToWallClock(deadlineAt);
    return {
      subject: `Autoporada: porada se přesouvá na ${typographizeText(formatLongDate(meetingDate))}`,
      body: {
        paragraphs: [
          `porada se přesouvá na ${typographizeText(formatLongDate(meetingDate))}. Uzávěrka je dřív: ${weekdayName(date)} ${formatDayMonth(date)} v\u00A0${formatTime(time)}.`,
        ],
        link: '/body',
      },
    };
  },
  // The akce is not named (ADR 0016): a date, a time and the porada.
  'report.ended': ({ due, meetingDate }) => {
    const { date, time } = instantToWallClock(due);
    const when = `${formatDayMonth(date)} v\u00A0${formatTime(time)}`;
    return {
      subject: `Autoporada: akce skončila, zprávu odevzdejte do ${when}`,
      body: {
        paragraphs: [
          `akce, kterou jste zapsali do přehledu, skončila. Zprávu odevzdejte do ${when}, půjde na poradu z\u00A0${typographizeText(formatLongDate(meetingDate))}.`,
        ],
        link: '/body',
      },
    };
  },
  // An hour before the close of a late report that is still not handed in; no title, no name.
  'report.last-call': ({ due, meetingDate }) => {
    const { date, time } = instantToWallClock(due);
    const when = `${formatDayMonth(date)} v\u00A0${formatTime(time)}`;
    return {
      subject: `Autoporada: poslední hodina na zprávu (do ${when})`,
      body: {
        paragraphs: [
          `zpráva z\u00A0akce, kterou jste zapsali do přehledu, ještě není odevzdaná. Odevzdejte ji do ${when}, půjde na poradu z\u00A0${typographizeText(formatLongDate(meetingDate))}.`,
        ],
        link: '/body',
      },
    };
  },
};

/** Renders one mail. `origin` is the validated app origin, without a trailing slash. */
export function renderMail<T extends TemplateName>(
  name: T,
  view: TemplateViews[T],
  origin: string,
): RenderedMail {
  const { subject, body } = TEMPLATES[name](view);
  return { subject, text: frame(origin, body) };
}
