import { formatLongDate, typographizeText } from '@/domain/cs';
import type { CalDate } from '@/domain/time';

import { frame, type Body } from './frame';

/**
 * Mails are plain text and carry no personal data: the subjects are constants
 * and the only variables are the app origin and one date. The sentences that
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
      signInLink: true,
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
      signInLink: true,
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
