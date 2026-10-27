import { describe, expect, it } from 'vitest';

import type { BulletSpec } from '@/domain/report';
import { cs } from '@/ui/copy';
import { fieldId } from '@/ui/form';

import type { Bullet } from './bullets-state';
import { bulletField, EDITOR_FORM_ID, editorSpec } from './editor-form';

const { points } = cs;

const SPEC: readonly BulletSpec[] = [
  { key: 'organizatori', label: 'Organizátoři', kind: 'people', required: false },
  { key: 'ucastnici', label: 'Účastníci', kind: 'people', required: true },
  { key: 'vysledky', label: 'Výsledky', kind: 'text', required: false },
];

const BULLETS: readonly Bullet[] = [
  { key: 'organizatori', label: 'Organizátoři', kind: 'people', order: 'input', people: [] },
  { key: 'ucastnici', label: 'Účastníci', kind: 'people', order: 'input', people: [] },
  { key: 'vysledky', label: 'Výsledky', kind: 'text', text: '' },
  { key: 'custom-1', label: '', kind: 'people', order: 'input', people: [] },
  { key: 'custom-2', label: 'Hosté', kind: 'text', text: '' },
];

describe('editorSpec', () => {
  const spec = editorSpec(BULLETS, SPEC);

  it('has the fields of the report with no bullets', () => {
    expect(Object.keys(editorSpec([], []))).toEqual([
      'title',
      'eventDate',
      'endDate',
      'timeFrom',
      'timeTo',
      'campus',
      'place',
      'body',
    ]);
  });

  it('puts the bullets between the place and the body, in the order of the draft', () => {
    expect(Object.keys(spec)).toEqual([
      'title',
      'eventDate',
      'endDate',
      'timeFrom',
      'timeTo',
      'campus',
      'place',
      'bullets.0.people',
      'bullets.0.order',
      'bullets.1.people',
      'bullets.1.order',
      'bullets.2.text',
      'bullets.3.label',
      'bullets.3.people',
      'bullets.3.order',
      'bullets.4.label',
      'bullets.4.text',
      'body',
    ]);
  });

  it('names a people row by its label and asks for it only when the type requires it', () => {
    expect(spec['bullets.0.people']).toEqual({ label: 'Organizátoři', required: false });
    expect(spec['bullets.1.people']).toEqual({ label: 'Účastníci', required: true });
  });

  it('names the order select „Pořadí“, which always has a value', () => {
    expect(spec['bullets.0.order']).toEqual({ label: points.bullets.order, required: true });
  });

  it('names a text row by its label', () => {
    expect(spec['bullets.2.text']).toMatchObject({ label: 'Výsledky', required: false });
  });

  it('gives a custom row the „Název řádku“ field, required, and names it by its label or its place', () => {
    expect(spec['bullets.3.label']).toEqual({ label: points.bullets.label, required: true });
    expect(spec['bullets.3.people']?.label).toBe(points.bullets.unnamed(4));
    expect(spec['bullets.4.text']?.label).toBe('Hosté');
    expect(spec['bullets.4.text']?.required).toBe(false);
  });
});

describe('bulletField', () => {
  it('is the path readiness reports, without the content prefix', () => {
    expect(bulletField(2, 'people')).toBe('bullets.2.people');
    expect(bulletField(0, 'text')).toBe('bullets.0.text');
    expect(bulletField(11, 'label')).toBe('bullets.11.label');
  });

  it('gives an id through the form’s own helper', () => {
    expect(fieldId(EDITOR_FORM_ID, bulletField(2, 'people'))).toBe('bod-bullets-2-people');
  });
});
