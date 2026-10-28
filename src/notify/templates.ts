import { formatLongDate, typographizeText } from '@/domain/cs';
import type { CalDate } from '@/domain/time';

import { frame, type Body } from './frame';

/**
 * Mails are plain text and carry no personal data: the subjects are constants
 * and the only variables are the app origin and one date (ADR 0016, 0020). The sentences that
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
