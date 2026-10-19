import { describe, expect, it } from 'vitest';

import { testCertificate } from '../../../test/support/oidc/cert';
import { createTestIdp, TEST_CLIENT, TEST_ISSUER } from '../../../test/support/oidc/test-idp';
import { formatProbe, loadClientCredential, probeEntra } from './index';

const pair = testCertificate();
const credential = loadClientCredential({
  kind: 'certificate',
  privateKeyPem: pair.keyPem,
  certificatePem: pair.certificatePem,
  thumbprint: undefined,
});

async function probe(
  setup: (idp: Awaited<ReturnType<typeof createTestIdp>>) => void = () => {},
  now = new Date(),
) {
  const idp = await createTestIdp();
  setup(idp);
  return probeEntra(
    {
      issuer: TEST_ISSUER,
      clientId: TEST_CLIENT,
      appOrigin: 'https://autoporada.ssps.cz',
      credential,
      domainHint: null,
      production: true,
      fetch: idp.fetch,
    },
    now,
  );
}

describe('probeEntra', () => {
  it('reports an accepted certificate, its thumbprint and the roles Entra granted', async () => {
    const report = await probe((idp) => idp.trust(pair.certificatePem));
    expect(report).toMatchObject({
      issuer: TEST_ISSUER,
      accepted: true,
      roles: ['User.ReadBasic.All'],
      errors: [],
      warnings: [],
    });
    if (credential.kind !== 'certificate') throw new Error('expected a certificate');
    const lines = formatProbe(report);
    expect(lines).toContain('Entra accepted the credential');
    expect(lines.join('\n')).toContain(credential.sha1);
    expect(lines.join('\n')).not.toMatch(/PRIVATE KEY|BEGIN CERTIFICATE/);
  });

  it('says ERROR for an expired certificate', async () => {
    if (credential.kind !== 'certificate') throw new Error('expected a certificate');
    const later = new Date(credential.notAfter.getTime() + 86_400_000);
    const report = await probe((idp) => idp.trust(pair.certificatePem), later);
    expect(formatProbe(report)).toContain(
      'ERROR: the certificate has expired: renew it (ENTRA-SETUP §6)',
    );
  });

  it('reports a certificate Entra does not know', async () => {
    const report = await probe();
    expect(report).toMatchObject({
      accepted: false,
      failure: {
        failure: 'idp-error',
        detail: { error: 'invalid_client', aadsts: 'AADSTS7000215' },
      },
    });
    expect(formatProbe(report)).toContain('Entra refused: idp-error invalid_client AADSTS7000215');
  });

  it('warns when Mail.Send was granted in Entra, which covers every mailbox', async () => {
    const report = await probe((idp) => {
      idp.trust(pair.certificatePem);
      idp.grantRoles(['User.ReadBasic.All', 'Mail.Send']);
    });
    expect(report.warnings).toEqual([
      'Mail.Send is granted in Entra and covers every mailbox: remove it (ENTRA-SETUP §1.4)',
    ]);
  });
});
