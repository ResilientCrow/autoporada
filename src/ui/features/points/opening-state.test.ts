import { describe, expect, it } from 'vitest';

import type { BulletSpec } from '@/domain/report';

import { keyBullets } from './bullet-chips';
import { applyRowOp } from './bullets-state';
import type { PointContentWire } from './fields';
import {
  basisAfterTyping,
  generated,
  keptBasis,
  noticeMode,
  noticeShown,
  replaced,
  typed,
  withOpening,
  withOpeningEdit,
  type OpeningContext,
} from './opening-state';
import { bulletsEdit, patchFor, withPatch, type Edit } from './report-patch';

const SPEC: readonly BulletSpec[] = [
  {
    key: 'organizatori',
    label: 'Organizátoři',
    kind: 'people',
    required: false,
    role: 'organisers',
  },
  { key: 'ucastnici', label: 'Účastníci', kind: 'people', required: true },
];
const CTX: OpeningContext = { titleGender: 'f', typeName: null, spec: SPEC };

const NOVAK = { salutation: 'pan', givenName: 'Jan', familyName: 'Novák' } as const;
const MALA = { salutation: 'slecna', givenName: 'Eva', familyName: 'Malá' } as const;
const DVORAK = { salutation: 'pan', givenName: 'Petr', familyName: 'Dvořák' } as const;

const CONTENT: PointContentWire = {
  title: 'Exkurze do Terezína',
  eventDate: '2027-01-14',
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: 'radlice',
  place: 'v\u00a0učebně S206',
  opening: '',
  openingEdited: false,
  body: { type: 'doc', content: [] },
  bullets: [
    { key: 'organizatori', label: 'Organizátoři', kind: 'people', order: 'input', people: [NOVAK] },
    { key: 'ucastnici', label: 'Účastníci', kind: 'people', order: 'input', people: [DVORAK] },
  ],
  statements: [],
};

const patched = (content: PointContentWire, name: Parameters<typeof patchFor>[0], value: string) =>
  withPatch(content, patchFor(name, value, content));

describe('generated', () => {
  it('writes the sentence from the title, date, campus, place and organisers', () => {
    const sentence = generated(CONTENT, 'f', SPEC, null);
    expect(sentence).toContain('14. ledna 2027');
    expect(sentence).toContain('v areálu Radlice');
    expect(sentence).toContain('v\u00a0učebně S206');
    expect(sentence).toContain('proběhla Exkurze do Terezína');
    expect(sentence).toContain('organizoval pan Jan Novák');
  });

  it('names only the people of the organisers bullet', () => {
    expect(generated(CONTENT, 'f', SPEC, null)).not.toContain('Dvořák');
  });

  it('uses the title gender of the type', () => {
    expect(generated(CONTENT, 'm', SPEC, null)).toContain('proběhl Exkurze do Terezína');
    expect(generated(CONTENT, 'm', SPEC, 'Seminář')).toContain(
      'proběhl seminář Exkurze do Terezína',
    );
  });

  it('is empty while the title is missing', () => {
    expect(generated({ ...CONTENT, title: '  ' }, 'f', SPEC, null)).toBe('');
  });

  it('is empty while the start date is missing', () => {
    expect(generated({ ...CONTENT, eventDate: null }, 'f', SPEC, null)).toBe('');
  });

  it('is empty rather than throwing for a date it cannot read', () => {
    expect(generated({ ...CONTENT, eventDate: '0020-13-45' }, 'f', SPEC, null)).toBe('');
  });

  it('leaves out an end date that is not after the start', () => {
    expect(generated({ ...CONTENT, endDate: '2027-01-10' }, 'f', SPEC, null)).not.toContain(
      'Ve dnech',
    );
    expect(generated({ ...CONTENT, endDate: '2027-01-15' }, 'f', SPEC, null)).toContain('Ve dnech');
  });
});

describe('withOpening, while the author has not edited the sentence', () => {
  const follows = (content: PointContentWire) => withOpening(content, CTX);

  it('sets the sentence the first time the fields allow one', () => {
    const next = follows(CONTENT);
    expect(next.opening).toBe(generated(CONTENT, 'f', SPEC, null));
    expect(next.opening).not.toBe('');
    expect(next.openingEdited).toBe(false);
  });

  it('follows a new title', () => {
    const next = follows(patched(CONTENT, 'title', 'Výlet'));
    expect(next.opening).toContain('proběhla Výlet');
    expect(next.opening).not.toContain('Terezín');
  });

  it('follows a new date', () => {
    expect(follows(patched(CONTENT, 'eventDate', '2027-02-03')).opening).toContain('3. února 2027');
  });

  it('follows a new campus', () => {
    expect(follows(patched(CONTENT, 'campus', 'smichov')).opening).toContain('v areálu Smíchov');
  });

  it('follows a new place', () => {
    expect(follows(patched(CONTENT, 'place', 'v Aule')).opening).toContain('v Aule');
  });

  it('empties the sentence again when the title is cleared', () => {
    const filled = follows(CONTENT);
    expect(follows(patched(filled, 'title', '')).opening).toBe('');
  });

  it('empties the sentence again when the date is cleared', () => {
    const filled = follows(CONTENT);
    expect(follows(patched(filled, 'eventDate', '')).opening).toBe('');
  });

  it('does not touch the rest of the content', () => {
    expect(follows(CONTENT)).toEqual({ ...CONTENT, opening: generated(CONTENT, 'f', SPEC, null) });
  });
});

describe('typed', () => {
  it('stores the text and marks the sentence as the author’s', () => {
    const next = typed(withOpening(CONTENT, CTX), 'Moje věta.');
    expect(next.opening).toBe('Moje věta.');
    expect(next.openingEdited).toBe(true);
  });

  it('leaves the other fields as they are', () => {
    expect(typed(CONTENT, 'x')).toEqual({ ...CONTENT, opening: 'x', openingEdited: true });
  });

  it('keeps an emptied box as the author’s too', () => {
    const next = typed(withOpening(CONTENT, CTX), '');
    expect(next).toMatchObject({ opening: '', openingEdited: true });
  });
});

describe('withOpening, once the author has edited the sentence', () => {
  const EDITED = typed(withOpening(CONTENT, CTX), 'Moje věta.');

  it.each([
    ['title', 'Výlet'],
    ['eventDate', '2027-02-03'],
    ['campus', 'smichov'],
    ['place', 'v Aule'],
  ] as const)('keeps the text through a change of the %s', (name, value) => {
    const next = withOpening(patched(EDITED, name, value), CTX);
    expect(next.opening).toBe('Moje věta.');
    expect(next.openingEdited).toBe(true);
  });

  it('keeps the text when the title is cleared', () => {
    expect(withOpening(patched(EDITED, 'title', ''), CTX).opening).toBe('Moje věta.');
  });
});

describe('noticeShown', () => {
  const basis = generated(CONTENT, 'f', SPEC, null);
  const EDITED = typed(withOpening(CONTENT, CTX), 'Moje věta.');

  it('is hidden while the sentence follows the fields', () => {
    const changed = withOpening(patched(CONTENT, 'title', 'Výlet'), CTX);
    expect(noticeShown(changed, CTX, basis)).toBe(false);
  });

  it('is hidden right after the author typed, when no field has changed', () => {
    expect(noticeShown(EDITED, CTX, basis)).toBe(false);
  });

  it('is hidden after a reload with edited text: the basis is the sentence of the loaded fields', () => {
    expect(
      noticeShown(EDITED, CTX, generated(EDITED, CTX.titleGender, CTX.spec, CTX.typeName)),
    ).toBe(false);
  });

  it('appears when a field changes what the sentence would say', () => {
    expect(noticeShown(patched(EDITED, 'title', 'Výlet'), CTX, basis)).toBe(true);
    expect(noticeShown(patched(EDITED, 'campus', 'smichov'), CTX, basis)).toBe(true);
  });

  it('stays hidden for a change the sentence does not show', () => {
    const body: PointContentWire['body'] = { type: 'doc', content: [] };
    expect(noticeShown({ ...EDITED, body, statements: [] }, CTX, basis)).toBe(false);
    const withParticipant = {
      ...EDITED,
      bullets: EDITED.bullets.map((b) =>
        b.key === 'ucastnici' && b.kind === 'people' ? { ...b, people: [NOVAK, MALA] } : b,
      ),
    };
    expect(noticeShown(withParticipant, CTX, basis)).toBe(false);
  });

  it('goes away when the fields change back', () => {
    const away = patched(EDITED, 'title', 'Výlet');
    expect(noticeShown(patched(away, 'title', CONTENT.title), CTX, basis)).toBe(false);
  });

  it('is hidden while the fields make no sentence, and back when they make another one', () => {
    const cleared = patched(EDITED, 'title', '');
    expect(generated(cleared, CTX.titleGender, CTX.spec, CTX.typeName)).toBe('');
    expect(noticeShown(cleared, CTX, basis)).toBe(false);
    expect(noticeShown(patched(cleared, 'title', 'Výlet'), CTX, basis)).toBe(true);
    expect(noticeShown(patched(EDITED, 'eventDate', ''), CTX, basis)).toBe(false);
  });

  it('is hidden after „Ponechat“: the basis becomes the current sentence', () => {
    const away = patched(EDITED, 'title', 'Výlet');
    const kept = generated(away, CTX.titleGender, CTX.spec, CTX.typeName);
    expect(noticeShown(away, CTX, kept)).toBe(false);
    expect(noticeShown(patched(away, 'title', 'Jiný'), CTX, kept)).toBe(true);
  });
});

describe('replaced („Ano, nahradit“)', () => {
  const away = patched(typed(withOpening(CONTENT, CTX), 'Moje věta.'), 'title', 'Výlet');
  const edit = (content: PointContentWire): Edit => ({
    content,
    bullets: keyBullets(content.bullets),
  });

  it('gives the sentence back to the fields, which one recompute then writes', () => {
    const next = withOpeningEdit(edit(replaced(away)), CTX).content;
    expect(next.opening).toBe(generated(away, 'f', SPEC, null));
    expect(next.openingEdited).toBe(false);
    expect(withOpening(patched(next, 'place', 'v Aule'), CTX).opening).toContain('v Aule');
  });

  it('only clears the flag and leaves the rest as it is', () => {
    expect(replaced(away)).toEqual({ ...away, openingEdited: false });
  });
});

describe('basisAfterTyping', () => {
  const EDITED = typed(withOpening(CONTENT, CTX), 'Moje věta.');
  const away = patched(EDITED, 'title', 'Výlet');

  it('becomes the sentence of the fields on the keystroke that makes the text the author’s', () => {
    const before = withOpening(CONTENT, CTX);
    expect(basisAfterTyping(before, '', CTX)).toBe(generated(CONTENT, 'f', SPEC, null));
  });

  it('is the sentence of the fields as they are, not of an earlier state', () => {
    const before = withOpening(patched(CONTENT, 'title', 'Výlet'), CTX);
    expect(basisAfterTyping(before, generated(CONTENT, 'f', SPEC, null), CTX)).toContain('Výlet');
  });

  it('never moves while the text is already the author’s, even after a field changed', () => {
    expect(basisAfterTyping(away, 'stará', CTX)).toBe('stará');
    expect(basisAfterTyping(EDITED, 'stará', CTX)).toBe('stará');
  });

  it('keeps the notice once the fields changed, whatever the author types after', () => {
    const basis = basisAfterTyping(withOpening(CONTENT, CTX), '', CTX);
    const afterDate = patched(EDITED, 'eventDate', '2027-02-03');
    const stillEdited = typed(afterDate, 'Moje věta s opravou.');
    expect(noticeShown(stillEdited, CTX, basisAfterTyping(afterDate, basis, CTX))).toBe(true);
  });

  it('is empty for a draft with no sentence yet, so the notice shows once the fields make one', () => {
    const draft = withOpening({ ...CONTENT, title: '' }, CTX);
    const basis = basisAfterTyping(draft, '', CTX);
    expect(basis).toBe('');
    expect(noticeShown(typed(draft, 'Moje.'), CTX, basis)).toBe(false);
  });
});

describe('keptBasis („Ponechat“)', () => {
  it('is the sentence the fields make now', () => {
    const away = patched(typed(withOpening(CONTENT, CTX), 'Moje věta.'), 'title', 'Výlet');
    const basis = keptBasis(away, CTX);
    expect(basis).toBe(generated(away, 'f', SPEC, null));
    expect(basis).toContain('Výlet');
    expect(noticeShown(away, CTX, basis)).toBe(false);
  });
});

describe('noticeMode', () => {
  it('shows nothing while the sentence is in step and no question is open', () => {
    expect(noticeMode(false, false)).toBe('none');
  });

  it('shows the notice when the sentence is out of step', () => {
    expect(noticeMode(true, false)).toBe('notice');
  });

  it('shows the question while it is open, also when the fields changed back', () => {
    expect(noticeMode(true, true)).toBe('question');
    expect(noticeMode(false, true)).toBe('question');
  });
});

describe('withOpeningEdit', () => {
  const edit = (content: PointContentWire): Edit => ({
    content,
    bullets: keyBullets(content.bullets),
  });
  const start = withOpeningEdit(edit(CONTENT), CTX);

  it('keeps the bullets and recomputes the content', () => {
    expect(start.bullets).toEqual(keyBullets(CONTENT.bullets));
    expect(start.content.opening).toBe(generated(CONTENT, 'f', SPEC, null));
  });

  it('drops the organisers from the sentence when their bullet is taken out', () => {
    const removed = applyRowOp(start.bullets, SPEC, { kind: 'remove', key: 'organizatori' });
    if (!removed.ok) throw new Error('the bullet is removable');
    const next = withOpeningEdit(
      bulletsEdit(start, () => removed.bullets),
      CTX,
    );
    expect(next.content.opening).not.toContain('Novák');
    expect(next.content.opening).not.toContain('organizoval');
  });

  it('brings the role back with „Vrátit řádek“, and the people typed afterwards', () => {
    const removed = applyRowOp(start.bullets, SPEC, { kind: 'remove', key: 'organizatori' });
    if (!removed.ok) throw new Error('the bullet is removable');
    const gone = withOpeningEdit(
      bulletsEdit(start, () => removed.bullets),
      CTX,
    );
    const restored = applyRowOp(gone.bullets, SPEC, { kind: 'restore', key: 'organizatori' });
    if (!restored.ok) throw new Error('the bullet is restorable');
    const back = withOpeningEdit(
      bulletsEdit(gone, () => restored.bullets),
      CTX,
    );
    expect(back.content.opening).not.toContain('organizoval');
    const filled = withOpeningEdit(
      bulletsEdit(back, (previous) =>
        previous.map((b) =>
          b.key === 'organizatori' && b.kind === 'people'
            ? { ...b, people: [{ key: 'organizatori.0', person: MALA }] }
            : b,
        ),
      ),
      CTX,
    );
    expect(filled.content.opening).toContain('organizovala slečna Eva Malá');
  });

  it('leaves an edited sentence alone', () => {
    const typedEdit = { ...start, content: typed(start.content, 'Moje věta.') };
    const next = withOpeningEdit(
      { ...typedEdit, content: patched(typedEdit.content, 'title', 'Výlet') },
      CTX,
    );
    expect(next.content.opening).toBe('Moje věta.');
  });
});
