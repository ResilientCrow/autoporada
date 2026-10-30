import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { DirectoryPerson } from '@/application/ports';
import { DIRECTORY_LIMITS } from '@/domain/report';
import { ConfigError } from '@/infra/config';

import { createDirectory, MAX_DEV_PEOPLE } from './index';

const person = (n: number, givenName: string, familyName: string, displayName?: string) => ({
  graphId: `0d000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`,
  givenName,
  familyName,
  displayName: displayName ?? `${givenName} ${familyName}`,
});

const PEOPLE: readonly DirectoryPerson[] = [
  person(1, 'Jana', 'Nováková'),
  person(2, 'Petr', 'Svoboda'),
  person(3, 'Karel', 'Dvořák'),
  person(4, 'Marie', 'Nováková-Horská'),
  person(5, 'Anna', 'van der Meer'),
  person(6, 'Čeněk', 'Čekající'),
  person(7, 'Jan', 'Novák', 'Novák Jan (ředitelství)'),
  // A display name without the given or the family name, as Graph can hold a nickname or a role.
  person(8, 'Božena', 'Hrubá', 'Ředitelství'),
];

const filePath = '/srv/dev/directory.json';
const fileOf = (content: unknown) => (path: string) => {
  if (path !== filePath) throw new Error(`unexpected read of ${path}`);
  return typeof content === 'string' ? content : JSON.stringify(content);
};
/** The dev and off adapters take no Graph: building a token source would fail the test. */
const deps = (readFile: (path: string) => string) => ({
  readFile,
  graphBaseUrl: 'https://graph.microsoft.com/v1.0',
  graphTokens: (): never => {
    throw new Error('the dev and off directories build no token source');
  },
});
const dev = (people: unknown = PEOPLE) =>
  createDirectory({ kind: 'dev', path: filePath }, deps(fileOf(people)));
const live = () => new AbortController().signal;

async function found(query: string, people: unknown = PEOPLE): Promise<string[]> {
  const result = await dev(people).search(query, live());
  if (!result.ok) throw new Error(`answered ${result.code}`);
  return result.value.map((hit) => hit.familyName);
}

describe('the dev directory: search', () => {
  it.each([
    ['novakova', ['Nováková', 'Nováková-Horská']],
    ['NOVÁKOVÁ', ['Nováková', 'Nováková-Horská']],
    ['  nováková  ', ['Nováková', 'Nováková-Horská']],
    ['novakova horska', ['Nováková-Horská']],
    ['nov', ['Nováková', 'Nováková-Horská', 'Novák']],
    ['jana nov', ['Nováková']],
    ['nov jana', ['Nováková']],
    ['jan nov', ['Nováková', 'Novák']],
    ['dvorak', ['Dvořák']],
    ['cenek', ['Čekající']],
    ['cekajici', ['Čekající']],
    ['meer', ['van der Meer']],
    ['van meer', ['van der Meer']],
    ['horska', ['Nováková-Horská']],
    ['reditelstvi', ['Novák', 'Hrubá']],
    ['hruba', ['Hrubá']],
    ['bozena', ['Hrubá']],
    ['bozena reditelstvi', ['Hrubá']],
    ['ovakova', []],
    ['svoboda x', []],
    ['zzz', []],
  ])('finds %j as word prefixes, in the file order', async (query, families) => {
    expect(await found(query)).toEqual(families);
  });

  it.each(['', ' ', 'no', '  no  ', 'ch', 'é', '(((', '- - -'])(
    'answers nothing for %j, under three characters or without a word',
    async (query) => {
      expect(await dev().search(query, live())).toEqual({ ok: true, value: [] });
    },
  );

  it('returns the whole person', async () => {
    const result = await dev().search('svoboda', live());
    expect(result).toEqual({ ok: true, value: [PEOPLE[1]] });
  });

  it('caps the answer and keeps the file order', async () => {
    const many = Array.from({ length: DIRECTORY_LIMITS.hits + 5 }, (_, i) =>
      person(i + 1, `Jméno${i}`, 'Testovací'),
    );
    const result = await dev(many).search('testov', live());
    expect(result.ok && result.value.map((p) => p.givenName)).toEqual(
      many.slice(0, DIRECTORY_LIMITS.hits).map((p) => p.givenName),
    );
  });

  it('answers timeout for a signal that is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await dev().search('novakova', controller.signal)).toEqual({
      ok: false,
      code: 'directory.timeout',
    });
  });

  it('answers unavailable when something inside throws, and never throws', async () => {
    const broken = {
      get aborted(): boolean {
        throw new Error('secret-query-text');
      },
    } as AbortSignal;
    expect(await dev().search('novakova', broken)).toEqual({
      ok: false,
      code: 'directory.unavailable',
    });
  });

  it('reads the file once, when it is created', async () => {
    let reads = 0;
    const directory = createDirectory(
      { kind: 'dev', path: filePath },
      deps((path) => {
        reads += 1;
        return fileOf(PEOPLE)(path);
      }),
    );
    await directory.search('novakova', live());
    await directory.search('svoboda', live());
    expect(reads).toBe(1);
  });
});

describe('the dev directory: the file', () => {
  const SECRET = 'secret-file-content';

  it('accepts as many people as the cap allows', () => {
    const full = Array.from({ length: MAX_DEV_PEOPLE }, (_, i) => person(i + 1, 'Jan', 'Novák'));
    expect(() => dev(full)).not.toThrow();
  });

  it.each([
    ['not json', `{ ${SECRET}`],
    ['not an array', { people: [] }],
    ['an unknown field', [{ ...person(1, 'Jana', 'Nováková'), mail: SECRET }]],
    ['a missing field', [{ graphId: person(1, 'a', 'b').graphId, givenName: 'Jana' }]],
    ['an id that is no uuid', [{ ...person(1, 'Jana', 'Nováková'), graphId: SECRET }]],
    ['a given name over 80', [person(1, SECRET.repeat(5), 'Nováková')]],
    ['a family name over 80', [person(1, 'Jana', SECRET.repeat(5))]],
    ['a display name over 160', [person(1, 'Jana', 'Nováková', SECRET.repeat(10))]],
    ['an empty family name', [person(1, 'Jana', '')]],
    [
      'more people than the cap',
      Array.from({ length: MAX_DEV_PEOPLE + 1 }, (_, i) => person(i + 1, 'Jan', 'Novák')),
    ],
  ])('stops the boot for %s, without echoing the file', (_, content) => {
    let error: unknown;
    try {
      dev(content);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect(String(error)).toContain('DIRECTORY_DEV_PATH');
    expect(String(error)).not.toContain(SECRET);
  });

  it('names the cap it enforces', () => {
    const over = Array.from({ length: MAX_DEV_PEOPLE + 1 }, (_, i) =>
      person(i + 1, 'Jan', 'Novák'),
    );
    expect(() => dev(over)).toThrow(`at most ${MAX_DEV_PEOPLE} people`);
  });

  it('stops the boot for a file it cannot read, without echoing why', () => {
    const unreadable = () => {
      throw new Error(`ENOENT ${SECRET}`);
    };
    let error: unknown;
    try {
      createDirectory({ kind: 'dev', path: filePath }, deps(unreadable));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect(String(error)).not.toContain(SECRET);
  });
});

describe('the off directory', () => {
  it('answers directory.off to every search, and reads no file', async () => {
    const directory = createDirectory(
      { kind: 'off' },
      deps(() => {
        throw new Error('off reads nothing');
      }),
    );
    expect(await directory.search('novakova', live())).toEqual({
      ok: false,
      code: 'directory.off',
    });
    expect(await directory.search('', live())).toEqual({ ok: false, code: 'directory.off' });
  });
});

describe('docker/dev/directory.json', () => {
  const read = (path: string) => readFileSync(path, 'utf8');
  const file = 'docker/dev/directory.json';
  const SCHOOL_TENANT = '00000000-0000-0000-0000-000000000001';

  it('loads, and holds every mock IdP persona of the school under the same name', async () => {
    const directory = createDirectory({ kind: 'dev', path: file }, deps(read));
    const idp = JSON.parse(read('docker/dev/mock-oauth2.json')) as {
      tokenCallbacks: {
        requestMappings: { claims: { name: string; oid: string; tid: string } }[];
      }[];
    };
    // The wildcard mapping names whoever signs in; the guest and the persona of another tenant are
    // no people of the school's directory.
    const personas = (idp.tokenCallbacks[0]?.requestMappings ?? [])
      .map((mapping) => mapping.claims)
      .filter(
        (claims) =>
          !claims.name.startsWith('$') &&
          claims.name !== 'Host Zvenku' &&
          claims.tid === SCHOOL_TENANT,
      );
    expect(personas.length).toBeGreaterThanOrEqual(20);
    for (const { name, oid } of personas) {
      const result = await directory.search(name, live());
      expect(
        result.ok && result.value.some((p) => p.displayName === name && p.graphId === oid),
      ).toBe(true);
    }
  });

  it('exercises folding, a two-word family name and a shared family name', async () => {
    const directory = createDirectory({ kind: 'dev', path: file }, deps(read));
    const families = async (query: string) => {
      const result = await directory.search(query, live());
      return result.ok ? result.value.map((p) => `${p.givenName} ${p.familyName}`) : [];
    };
    expect(await families('dvorak')).toEqual(['Karel Dvořák']);
    expect(await families('van meer')).toEqual(['Anna van der Meer']);
    expect(await families('benes')).toEqual(['Tomáš Beneš', 'Alena Beneš']);
  });

  it('does not offer the persona of another tenant', async () => {
    const directory = createDirectory({ kind: 'dev', path: file }, deps(read));
    expect(await directory.search('odjinud', live())).toEqual({ ok: true, value: [] });
  });
});
