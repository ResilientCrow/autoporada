import { createHash, X509Certificate } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { testCertificate } from '../../../test/support/oidc/cert';
import { ConfigError } from '../config';
import { loadClientCredential } from './index';

const pair = testCertificate();
const certificate = (pem: string) => ({
  kind: 'certificate' as const,
  privateKeyPem: pair.keyPem,
  certificatePem: pem,
  thumbprint: undefined,
});
const problems = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  throw new Error('expected a ConfigError');
};

describe('loadClientCredential', () => {
  it('loads the pair ENTRA-SETUP §6 makes, with the facts Entra and IT need', () => {
    const der = new X509Certificate(pair.certificatePem).raw;
    const loaded = loadClientCredential({
      ...certificate(pair.certificatePem),
      thumbprint: undefined,
    });
    expect(loaded).toMatchObject({
      kind: 'certificate',
      x5tS256: createHash('sha256').update(der).digest('base64url'),
      sha1: createHash('sha1').update(der).digest('hex').toUpperCase(),
      subject: 'CN=autoporada.test',
    });
    if (loaded.kind !== 'certificate') throw new Error('expected a certificate');
    expect(loaded.key.algorithm).toMatchObject({ name: 'RSA-PSS' });
    const days = (loaded.notAfter.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(728);
  });

  it('cross-checks the thumbprint the portal shows', () => {
    const sha1 = createHash('sha1')
      .update(new X509Certificate(pair.certificatePem).raw)
      .digest('hex')
      .toUpperCase();
    expect(
      loadClientCredential({ ...certificate(pair.certificatePem), thumbprint: sha1 }).kind,
    ).toBe('certificate');
    expect(
      problems(() =>
        loadClientCredential({ ...certificate(pair.certificatePem), thumbprint: 'A'.repeat(40) }),
      ),
    ).toEqual(['OIDC_CLIENT_CERT_THUMBPRINT: does not match OIDC_CLIENT_CERT']);
  });

  it('refuses a certificate that belongs to another key, and weak keys', () => {
    const other = testCertificate(2048);
    expect(problems(() => loadClientCredential(certificate(other.certificatePem)))).toEqual([
      'OIDC_CLIENT_CERT: does not belong to OIDC_CLIENT_KEY',
    ]);
    const weak = testCertificate(1024);
    expect(
      problems(() =>
        loadClientCredential({ ...certificate(weak.certificatePem), privateKeyPem: weak.keyPem }),
      ),
    ).toEqual(['OIDC_CLIENT_KEY: must be an RSA key of at least 2048 bits']);
  });

  it('names the setting, never the value, when a PEM does not parse', () => {
    const run = () =>
      loadClientCredential(
        certificate('-----BEGIN CERTIFICATE-----\nsecret\n-----END CERTIFICATE-----'),
      );
    expect(problems(run)).toEqual(['OIDC_CLIENT_CERT: is not a PEM certificate']);
  });

  it('passes a development secret through', () => {
    expect(loadClientCredential({ kind: 'secret', secret: 'dev' })).toEqual({
      kind: 'secret',
      secret: 'dev',
    });
  });
});
