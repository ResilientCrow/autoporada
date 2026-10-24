import { afterEach, describe, expect, it } from 'vitest';

import { cs } from '@/ui/copy';

import { enterErrorTitle, leaveErrorTitle } from './error-title';

const PREFIX = `${cs.form.errorPrefix} `;
const TITLE = 'Uživatelé – Autoporada';

describe('error title', () => {
  const target = { title: TITLE };
  afterEach(() => {
    // Balance anything a failed test left behind, then reset the title.
    for (let i = 0; i < 3; i++) leaveErrorTitle({ title: '' });
    target.title = TITLE;
  });

  it('prefixes the title once for one form', () => {
    enterErrorTitle(target);
    expect(target.title).toBe(`${PREFIX}${TITLE}`);
  });

  it('keeps one prefix when two forms have issues', () => {
    enterErrorTitle(target);
    enterErrorTitle(target);
    expect(target.title).toBe(`${PREFIX}${TITLE}`);
  });

  it('keeps the prefix until the last form is clean, then restores the title', () => {
    enterErrorTitle(target);
    enterErrorTitle(target);
    leaveErrorTitle(target);
    expect(target.title).toBe(`${PREFIX}${TITLE}`);
    leaveErrorTitle(target);
    expect(target.title).toBe(TITLE);
  });

  it('leaves a title alone that no longer starts with the prefix', () => {
    enterErrorTitle(target);
    target.title = 'Přehled – Autoporada';
    leaveErrorTitle(target);
    expect(target.title).toBe('Přehled – Autoporada');
  });

  it('starts over after everything left', () => {
    enterErrorTitle(target);
    leaveErrorTitle(target);
    enterErrorTitle(target);
    expect(target.title).toBe(`${PREFIX}${TITLE}`);
  });
});
