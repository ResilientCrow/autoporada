import { describe, expect, it } from 'vitest';

import { jobId, uuidV5 } from './ids';

const DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const URL_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidV5', () => {
  it('matches the RFC 9562 test vector', () => {
    expect(uuidV5(DNS, 'www.example.com')).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });

  it('matches the reference results of other implementations', () => {
    expect(uuidV5(DNS, 'python.org')).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d');
    expect(uuidV5(URL_NAMESPACE, 'http://www.example.com/')).toBe(
      'fcde3c85-2270-590f-9e7c-ee003d65e0e2',
    );
  });

  it('hashes the UTF-8 bytes of the name', () => {
    expect(uuidV5('0e5d3a4c-6b2f-5c1e-9a77-3f0d8b1c2a64', 'mail.send\0žádost:č')).toBe(
      'a54662a3-17a8-5b14-917a-f32522927704',
    );
  });

  it('refuses a namespace that is not a UUID', () => {
    expect(() => uuidV5('not-a-uuid', 'x')).toThrow(/namespace/);
  });
});

describe('jobId', () => {
  const key = 'access.approved:7c9e6679-7425-40de-944b-e07fc1f90ae7';

  it('is the version 5 UUID of the queue name, a NUL and the dedupe key', () => {
    expect(jobId('mail.send', key)).toBe('d7cb3b88-07cf-593c-b163-02ea8b12cd11');
    expect(jobId('mail.send', key)).toMatch(UUID);
  });

  it('is the same every time and differs by key and by queue', () => {
    expect(jobId('mail.send', key)).toBe(jobId('mail.send', key));
    expect(jobId('mail.send', `${key}x`)).not.toBe(jobId('mail.send', key));
    expect(jobId('dead', key)).toBe('9c7936eb-0e38-50e2-a873-ef5bfbbe9409');
  });

  it('cannot confuse a queue name with the start of a key', () => {
    expect(jobId('ab', 'c')).not.toBe(jobId('a', 'bc'));
  });
});
