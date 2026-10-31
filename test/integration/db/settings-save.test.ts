import { describe, expect, it } from 'vitest';

import { system } from '@/application/ports';
import { SETTINGS } from '@/contracts';

import { setupWorld } from '../../support/world';

const world = setupWorld();
const cli = system('cli:test');

const save = (key: string, value: unknown, expected: number) =>
  world.tx(cli, (tx) => tx.settings.save(key, value, expected));

describe('saving a setting, in PostgreSQL', () => {
  it('gives one winner and one stale save when two first saves race, and never settings_pkey', async () => {
    const results = await Promise.all([
      save('reminders', { soft: true, hard: true }, 0),
      save('reminders', { soft: false, hard: false }, 0),
    ]);
    expect(results.filter((version) => version === 1)).toHaveLength(1);
    expect(results.filter((version) => version === null)).toHaveLength(1);
    const row = await world.tx(cli, (tx) => tx.settings.get('reminders'), 'read');
    expect(row?.version).toBe(1);
  });

  it('gives one winner when two saves name the same version', async () => {
    await save('reminders', { soft: true, hard: true }, 0);
    const results = await Promise.all([
      save('reminders', { soft: false, hard: true }, 1),
      save('reminders', { soft: true, hard: false }, 1),
    ]);
    expect([...results].sort()).toEqual([2, null]);
  });

  it('takes the largest annex 1 text the schema accepts, as jsonb prints it', async () => {
    const { schema } = SETTINGS['texts.annex1'];
    const heading = '€'.repeat(300);
    // The shapes that grow most per byte: empty paragraphs, and one-letter texts.
    const shapes = [
      { type: 'paragraph', attrs: { indent: 0 } },
      { type: 'paragraph', attrs: { indent: 0 }, content: [{ type: 'text', text: 'a' }] },
    ];
    for (const [at, shape] of shapes.entries()) {
      let content: unknown[] = [];
      while (
        schema.safeParse({ heading, intro: { type: 'doc', content: [...content, shape] } }).success
      ) {
        content = [...content, shape];
      }
      const largest = schema.parse({ heading, intro: { type: 'doc', content } });
      // Just under the cap: the schema refused one more paragraph.
      expect(content.length).toBeGreaterThan(300);
      expect(await save('texts.annex1', largest, at), `shape ${at}`).toBe(at + 1);
    }
  });
});
