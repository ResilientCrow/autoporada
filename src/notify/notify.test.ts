import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { typographizeText } from '@/domain/cs';
import { calDate } from '@/domain/time';

import { renderMail, TEMPLATE_NAMES, type TemplateName } from './index';

const NB = '\u00A0';
const ORIGIN = 'https://autoporada.example';
const LINK = `${ORIGIN}/prihlaseni`;
const GREETING = 'Dobrý den,';
const FOOTER = 'Tuto zprávu poslala aplikace Autoporada automaticky. Neodpovídejte na ni prosím.';

const RETRY_FROM = calDate(2026, 10, 31);

/** The views each template needs; a new template name is a compile error until it has one. */
const VIEWS = {
  'access.approved': {},
  'access.rejected': { retryFrom: RETRY_FROM },
  'access.blocked': {},
  'access.granted': {},
  'mail.check': {},
} satisfies Record<TemplateName, object>;

function render(name: TemplateName) {
  return renderMail(name, VIEWS[name] as never, ORIGIN);
}

/** greeting, blank line, the body as given, blank line, footer, final newline */
const letter = (body: string) => `${GREETING}\n\n${body}\n\n${FOOTER}\n`;

const EXPECTED: Record<TemplateName, { subject: string; text: string }> = {
  'access.approved': {
    subject: 'Autoporada: přístup byl schválen',
    text: letter(
      `vedení školy schválilo vaši žádost o${NB}přístup do Autoporady. Přihlaste se prosím znovu.\n\n${LINK}`,
    ),
  },
  'access.rejected': {
    subject: `Autoporada: žádost o${NB}přístup byla zamítnuta`,
    text: letter(
      `vedení školy vaši žádost o${NB}přístup do Autoporady zamítlo. Novou žádost lze podat od 31.${NB}října 2026. Pokud jde podle vás o${NB}omyl, obraťte se přímo na vedení školy.`,
    ),
  },
  'access.blocked': {
    subject: `Autoporada: další žádosti o${NB}přístup nelze podat`,
    text: letter(
      `vedení školy vaši žádost o${NB}přístup do Autoporady neschválilo a${NB}další žádosti už nelze podat. Pokud přístup potřebujete, obraťte se prosím přímo na vedení školy.`,
    ),
  },
  'access.granted': {
    subject: 'Autoporada: byl vám přidělen přístup',
    text: letter(
      `vedení školy vám přidělilo přístup do Autoporady. Přihlaste se prosím znovu.\n\n${LINK}`,
    ),
  },
  'mail.check': {
    subject: 'Autoporada: zkušební zpráva',
    text: letter(
      'tuto zprávu poslala Autoporada na žádost správce, aby ověřil odesílání e-mailů. Nemusíte nic dělat.',
    ),
  },
};

describe('renderMail', () => {
  it('has a template for every name, in this order', () => {
    expect(TEMPLATE_NAMES).toEqual(Object.keys(EXPECTED));
  });

  it.each(TEMPLATE_NAMES)('%s: exact subject and text', (name) => {
    expect(render(name)).toEqual(EXPECTED[name]);
  });

  it.each(TEMPLATE_NAMES)('%s: every subject and paragraph is already typeset', (name) => {
    const { subject, text } = render(name);
    expect(typographizeText(subject)).toBe(subject);
    for (const paragraph of text.split('\n\n')) {
      expect(typographizeText(paragraph)).toBe(paragraph);
    }
  });

  it.each(TEMPLATE_NAMES)('%s: one short subject line, no placeholder leftovers', (name) => {
    const { subject, text } = render(name);
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject.length).toBeLessThanOrEqual(78);
    for (const part of [subject, text]) {
      expect(part).not.toMatch(/[{}]|undefined|NaN|null/);
    }
    expect(text).not.toContain('\r');
    expect(text.endsWith('\n')).toBe(true);
  });

  it.each(TEMPLATE_NAMES)('%s: links go only to the app origin', (name) => {
    const links = render(name).text.match(/https?:\/\/\S*/g) ?? [];
    for (const link of links) expect(link.startsWith(`${ORIGIN}/`)).toBe(true);
  });

  it('links the sign-in page where the person must sign in again', () => {
    for (const name of ['access.approved', 'access.granted'] as const) {
      expect(render(name).text).toContain(`\n${LINK}\n`);
    }
    for (const name of ['access.rejected', 'access.blocked', 'mail.check'] as const) {
      expect(render(name).text).not.toContain('http');
    }
  });

  it('puts the date a new request is possible into the rejection', () => {
    const text = renderMail('access.rejected', { retryFrom: calDate(2027, 1, 5) }, ORIGIN).text;
    expect(text).toContain(`podat od 5.${NB}ledna 2027.`);
  });

  it('never lets an origin or a date break the subject into lines', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.integer({ min: 1900, max: 9999 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        (origin, year, month, day) => {
          const view = { retryFrom: calDate(year, month, day) };
          for (const name of TEMPLATE_NAMES) {
            const { subject } = renderMail(
              name,
              name === 'access.rejected' ? view : ({} as never),
              origin,
            );
            expect(subject).not.toMatch(/[\r\n]/);
          }
        },
      ),
    );
  });
});
