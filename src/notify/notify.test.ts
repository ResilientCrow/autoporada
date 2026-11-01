import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { typographizeText } from '@/domain/cs';
import { calDate } from '@/domain/time';

import { renderMail, TEMPLATE_NAMES, type TemplateName } from './index';

const NB = '\u00A0';
const ORIGIN = 'https://autoporada.example';
const LINK = `${ORIGIN}/prihlaseni`;
const POINTS = `${ORIGIN}/body`;
const REVIEW = `${ORIGIN}/kontrola`;
const USERS = `${ORIGIN}/uzivatele`;
const BODY = `${ORIGIN}/body`;
const GREETING = 'Dobrý den,';
const FOOTER = 'Tuto zprávu poslala aplikace Autoporada automaticky. Neodpovídejte na ni prosím.';

const RETRY_FROM = calDate(2026, 10, 31);
const MEETING = calDate(2026, 10, 26);
const COUNTS = { submitted: 3, accessRequests: 1, approved: 4, pending: 2, returned: 1 };

/** The views each template needs; a new template name is a compile error until it has one. */
const VIEWS = {
  'access.approved': {},
  'access.rejected': { retryFrom: RETRY_FROM },
  'access.blocked': {},
  'access.granted': {},
  'mail.check': {},
  'point.returned': {},
  'point.approved': {},
  'point.rejected': {},
  'report.prompt': {},
  'reminder.soft': { meetingDate: MEETING },
  'reminder.hard': { meetingDate: MEETING },
  'reviewer.digest': { submitted: 4, accessRequests: 2 },
  'headmaster.summary': {
    meetingDate: MEETING,
    approved: 5,
    pending: 2,
    returned: 1,
    lateExpected: 0,
    lastLateDue: null,
  },
  'headmaster.late-summary': { meetingDate: MEETING, handedIn: 3, missing: 1 },
  'issue.moved': { meetingDate: MEETING, deadlineAt: new Date('2026-11-23T19:00:00Z') },
  'report.ended': { meetingDate: MEETING, due: new Date('2026-11-23T19:00:00Z') },
  'report.last-call': { meetingDate: MEETING, due: new Date('2026-11-23T19:00:00Z') },
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
  'point.returned': {
    subject: `Autoporada: bod byl vrácen k${NB}úpravě`,
    text: letter(
      `váš bod pro poradu vedení byl vrácen k${NB}úpravě. Poznámku kontroly najdete v${NB}aplikaci:\n\n${POINTS}`,
    ),
  },
  'point.approved': {
    subject: 'Autoporada: bod byl schválen',
    text: letter(`váš bod pro poradu vedení byl schválen.\n\n${POINTS}`),
  },
  'point.rejected': {
    subject: 'Autoporada: bod nebyl přijat',
    text: letter(
      `váš bod pro poradu vedení nebyl přijat. Důvod najdete v${NB}aplikaci:\n\n${POINTS}`,
    ),
  },
  'report.prompt': {
    subject: `Autoporada: napište zprávu z${NB}akce`,
    text: letter(
      `akce, kterou jste zapsali do přehledu, proběhla. Zprávu do porady můžete napsat v${NB}aplikaci:\n\n${POINTS}`,
    ),
  },
  'reminder.soft': {
    subject: `Autoporada: odevzdejte zprávu z${NB}akce`,
    text: letter(
      `uzávěrka porady z${NB}26.${NB}října 2026 je za dva dny a${NB}porada čeká na vaši zprávu z${NB}akce, která proběhla. Odevzdejte ji v${NB}aplikaci:\n\n${POINTS}`,
    ),
  },
  'reminder.hard': {
    subject: 'Autoporada: dnes je uzávěrka porady',
    text: letter(
      `máte rozpracovaný nebo vrácený bod pro poradu z${NB}26.${NB}října 2026. Uzávěrka je dnes.\n\n${POINTS}`,
    ),
  },
  'reviewer.digest': {
    subject: 'Autoporada: novinky ke kontrole',
    text: letter(`nové položky ke kontrole: 4.\n\nNové žádosti o${NB}přístup: 2.\n\n${REVIEW}`),
  },
  'headmaster.summary': {
    subject: 'Autoporada: uzávěrka porady proběhla',
    text: letter(
      `uzávěrka porady z${NB}26.${NB}října 2026 proběhla. Schváleno: 5, čeká na kontrolu: 2, vráceno k${NB}úpravě: 1.\n\n${REVIEW}`,
    ),
  },
  'issue.moved': {
    subject: `Autoporada: porada se přesouvá na 26.${NB}října 2026`,
    text: letter(
      `porada se přesouvá na 26.${NB}října 2026. Uzávěrka je dřív: pondělí 23.${NB}11. v${NB}20:00.\n\n${BODY}`,
    ),
  },
  'report.ended': {
    subject: `Autoporada: akce skončila, zprávu odevzdejte do 23.${NB}11. v${NB}20:00`,
    text: letter(
      `akce, kterou jste zapsali do přehledu, skončila. Zprávu odevzdejte do 23.${NB}11. v${NB}20:00, půjde na poradu z${NB}26.${NB}října 2026.\n\n${BODY}`,
    ),
  },
  'report.last-call': {
    subject: `Autoporada: poslední hodina na zprávu (do 23.${NB}11. v${NB}20:00)`,
    text: letter(
      `zpráva o${NB}akci ještě není odevzdaná. Odevzdejte ji do 23.${NB}11. v${NB}20:00, půjde na poradu z${NB}26.${NB}října 2026.\n\n${BODY}`,
    ),
  },
  'headmaster.late-summary': {
    subject: `Autoporada: pozdní zprávy k${NB}poradě 26.${NB}října 2026: odevzdáno 3, chybí 1`,
    text: letter(
      `poslední uzávěrka pozdních zpráv k${NB}poradě z${NB}26.${NB}října 2026 proběhla. Odevzdáno: 3, chybí: 1.\n\n${REVIEW}`,
    ),
  },
};

describe('renderMail', () => {
  describe('a close capped at 00:00 of the meeting day', () => {
    // 00:00 Prague on Monday 2 November 2026 (CET): the close reads as the minute before it.
    const MIDNIGHT = new Date('2026-11-01T23:00:00Z');
    const shown = `1.${NB}11. v${NB}23:59`;

    it('prints the day before, 23:59, in the mail at the end and the last call', () => {
      const ended = renderMail(
        'report.ended',
        { meetingDate: calDate(2026, 11, 2), due: MIDNIGHT },
        ORIGIN,
      );
      const call = renderMail(
        'report.last-call',
        { meetingDate: calDate(2026, 11, 2), due: MIDNIGHT },
        ORIGIN,
      );
      expect(ended.subject).toContain(`do ${shown}`);
      expect(ended.text).toContain(`do ${shown},`);
      expect(call.subject).toContain(`(do ${shown})`);
      expect(call.text).toContain(`do ${shown},`);
      expect(ended.text + call.text).not.toContain(`v${NB}0:00`);
    });

    it('prints it in the last close of the headmaster summary too', () => {
      const { text } = renderMail(
        'headmaster.summary',
        {
          meetingDate: calDate(2026, 11, 2),
          approved: 1,
          pending: 0,
          returned: 0,
          lateExpected: 2,
          lastLateDue: MIDNIGHT,
        },
        ORIGIN,
      );
      expect(text).toContain(`Poslední uzávěrka je ${shown}.`);
    });

    it('leaves a close just after midnight as it is', () => {
      const { subject } = renderMail(
        'report.last-call',
        { meetingDate: calDate(2026, 11, 2), due: new Date('2026-11-01T23:15:00Z') },
        ORIGIN,
      );
      expect(subject).toContain(`2.${NB}11. v${NB}0:15`);
    });
  });

  it('words the last call for an akce and for a report draft alike', () => {
    const { text } = render('report.last-call');
    expect(text).not.toContain('zapsali do přehledu');
  });

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

  it('links the author’s points from every decision mail, and nothing else', () => {
    for (const name of ['point.returned', 'point.approved', 'point.rejected'] as const) {
      const { text } = render(name);
      expect(text).toContain(`\n${POINTS}\n`);
      expect(text.match(/https?:\/\/\S*/g)).toEqual([POINTS]);
    }
  });

  it('tells a reviewer only the count that is above zero, and a headmaster both', () => {
    const digest = (submitted: number, accessRequests: number) =>
      renderMail('reviewer.digest', { submitted, accessRequests }, ORIGIN).text;
    expect(digest(1, 0)).toBe(letter(`nové položky ke kontrole: 1.\n\n${REVIEW}`));
    expect(digest(12, 5)).toContain(
      `nové položky ke kontrole: 12.\n\nNové žádosti o${NB}přístup: 5.\n\n${REVIEW}`,
    );
  });

  it('sends a digest of access requests alone to the page that decides them', () => {
    const digest = (submitted: number, accessRequests: number) =>
      renderMail('reviewer.digest', { submitted, accessRequests }, ORIGIN);
    expect(digest(0, 3).text).toBe(letter(`nové žádosti o${NB}přístup: 3.\n\n${USERS}`));
    expect(digest(0, 3).subject).toBe(digest(2, 0).subject);
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
          const date = calDate(year, month, day);
          for (const name of TEMPLATE_NAMES) {
            const view = {
              ...COUNTS,
              meetingDate: date,
              retryFrom: date,
              deadlineAt: new Date(0),
              due: new Date(0),
            };
            const { subject } = renderMail(name, view as never, origin);
            expect(subject).not.toMatch(/[\r\n]/);
          }
        },
      ),
    );
  });
});
