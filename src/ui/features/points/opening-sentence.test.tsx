import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { POINT_LIMITS } from '@/domain/report';
import { cs } from '@/ui/copy';
import { Form } from '@/ui/form';

import { cspMarkupProblems } from '../../../../test/support/markup';

import { EDITOR_FORM_ID, EDITOR_FORM_STATE, editorSpec } from './editor-form';
import { OpeningNotice, OpeningSentence } from './OpeningSentence';

const { points } = cs;

const noop = () => undefined;

const sentence = (props: Partial<Parameters<typeof OpeningSentence>[0]> = {}) =>
  renderToStaticMarkup(
    <Form id={EDITOR_FORM_ID} spec={editorSpec([], [])} state={EDITOR_FORM_STATE}>
      <OpeningSentence
        text="Ve čtvrtek 14. ledna 2027 proběhla Exkurze."
        stale={false}
        asking={false}
        onAsk={noop}
        readOnly={false}
        onType={noop}
        onReplace={noop}
        onKeep={noop}
        onBlur={noop}
        {...props}
      />
    </Form>,
  );

const notice = (props: Partial<Parameters<typeof OpeningNotice>[0]> = {}) =>
  renderToStaticMarkup(
    <OpeningNotice
      mode="notice"
      id="bod-opening-notice"
      readOnly={false}
      onAsk={noop}
      onReplace={noop}
      onKeep={noop}
      {...props}
    />,
  );

/** The textarea the label „Úvodní věta“ points at, as its opening tag. */
function boxOf(html: string): string {
  const label = new RegExp(`<label[^>]*\\sfor="([^"]+)"[^>]*>${points.opening.label}</label>`).exec(
    html,
  );
  if (!label) throw new Error('No label „Úvodní věta“ in the markup');
  const box = new RegExp(`<textarea[^>]*\\sid="${label[1]}"[^>]*>`).exec(html);
  if (!box) throw new Error(`The label points at ${label[1]}, which is no textarea`);
  return box[0];
}

describe('the copy of the opening sentence', () => {
  it('is word for word the design’s', () => {
    expect(points.opening).toEqual({
      label: 'Úvodní věta',
      changed: 'Údaje se změnily. Úvodní větu jste upravili ručně.',
      recreate: 'Vytvořit znovu',
      confirm: 'Nahradit vaši větu novou?',
      replace: 'Ano, nahradit',
      keep: 'Ponechat',
    });
  });
});

describe('OpeningSentence', () => {
  it('labels the textarea „Úvodní věta“, named opening, with the sentence in it', () => {
    const html = sentence();
    const box = boxOf(html);
    expect(box).toContain('name="opening"');
    expect(html).toMatch(
      /<textarea[^>]*>Ve čtvrtek 14\. ledna 2027 proběhla Exkurze\.<\/textarea>/,
    );
  });

  it('caps the text at the limit of the contract', () => {
    expect(POINT_LIMITS.opening).toBe(1000);
    expect(boxOf(sentence())).toMatch(/maxlength="1000"/i);
  });

  it('gives the box the id the readiness list and the issues link to', () => {
    expect(boxOf(sentence())).toContain('id="bod-opening"');
  });

  it('is read-only when the autosave says so', () => {
    expect(boxOf(sentence({ readOnly: true }))).toContain('readOnly');
    expect(boxOf(sentence({ readOnly: false }))).not.toContain('readOnly');
  });

  it('shows the message of a refused save under the box', () => {
    const html = sentence({ issue: 'Je to dlouhé.' });
    expect(html).toContain('Je to dlouhé.');
    expect(boxOf(html)).toContain('aria-invalid="true"');
  });

  it('shows no notice while the sentence follows the fields', () => {
    const html = sentence();
    expect(html).not.toContain(points.opening.changed);
    expect(html).not.toContain(points.opening.recreate);
  });

  it('shows the notice with its button once the sentence is out of step', () => {
    const html = sentence({ stale: true });
    expect(html).toContain(points.opening.changed);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Vytvořit znovu<\/button>/);
  });

  it('ties the notice to the box, so a screen reader is told when it reaches it', () => {
    const html = sentence({ stale: true });
    const id = /<p[^>]*\sid="([^"]+)"[^>]*>Údaje se změnily/.exec(html)?.[1];
    expect(id).toBeDefined();
    expect(boxOf(html)).toMatch(new RegExp(`aria-describedby="[^"]*\\b${id}\\b[^"]*"`));
  });

  it('ties the question to the box too, alongside the message of a refused save', () => {
    const html = sentence({ asking: true, issue: 'Je to dlouhé.' });
    const id = /<p[^>]*\sid="([^"]+)"[^>]*>Nahradit vaši větu novou/.exec(html)?.[1];
    expect(id).toBeDefined();
    expect(boxOf(html)).toMatch(new RegExp(`aria-describedby="[^"]*\\b${id}\\b[^"]*"`));
    expect(boxOf(html)).toContain('aria-invalid="true"');
  });

  it('describes the box by nothing of the notice while it is hidden', () => {
    const html = sentence();
    expect(html).not.toContain('bod-opening-notice');
    expect(boxOf(html)).not.toContain('bod-opening-notice');
  });

  it('is clean for the Content-Security-Policy', () => {
    expect(cspMarkupProblems(sentence({ stale: true }))).toEqual([]);
  });
});

describe('OpeningNotice', () => {
  it('is nothing at all while the sentence is in step', () => {
    expect(notice({ mode: 'none' })).not.toContain('<button');
  });

  it('says the data changed, as text with a button, and not as an alert', () => {
    const html = notice({ mode: 'notice' });
    expect(html).toMatch(/<p[^>]*>Údaje se změnily\. Úvodní větu jste upravili ručně\.<\/p>/);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Vytvořit znovu<\/button>/);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain(points.opening.confirm);
  });

  it('asks inline in place of the notice, with both answers', () => {
    const html = notice({ mode: 'question' });
    expect(html).toMatch(/<p[^>]*>Nahradit vaši větu novou\?<\/p>/);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Ano, nahradit<\/button>/);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Ponechat<\/button>/);
    expect(html).not.toContain(points.opening.changed);
    expect(html).not.toContain(points.opening.recreate);
    expect(html).not.toContain('role="alert"');
  });

  it('disables the buttons while the editor is read-only', () => {
    expect(notice({ mode: 'notice', readOnly: true })).toMatch(/<button[^>]*disabled=""/);
    expect(notice({ mode: 'question', readOnly: true }).match(/disabled=""/g)).toHaveLength(2);
  });

  it('is clean for the Content-Security-Policy', () => {
    expect(cspMarkupProblems(notice({ mode: 'question' }))).toEqual([]);
  });
});
