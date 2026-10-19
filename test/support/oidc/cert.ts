/**
 * The client certificate, made the way docs/ENTRA-SETUP.md §6 tells IT to
 * make it, into a temporary directory. No key is ever committed.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TestCertificate {
  readonly keyPem: string;
  readonly certificatePem: string;
}

const made = new Map<number, TestCertificate>();

export function testCertificate(bits = 3072): TestCertificate {
  const cached = made.get(bits);
  if (cached) return cached;
  const dir = mkdtempSync(join(tmpdir(), 'autoporada-entra-'));
  try {
    const key = join(dir, 'autoporada-entra.key');
    const crt = join(dir, 'autoporada-entra.crt');
    execFileSync(
      'openssl',
      ['req', '-x509', '-newkey', `rsa:${bits}`, '-sha256', '-days', '730', '-nodes'].concat([
        '-keyout',
        key,
        '-out',
        crt,
        '-subj',
        '/CN=autoporada.test',
      ]),
      { stdio: 'ignore' },
    );
    const pair = { keyPem: readFileSync(key, 'utf8'), certificatePem: readFileSync(crt, 'utf8') };
    made.set(bits, pair);
    return pair;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
