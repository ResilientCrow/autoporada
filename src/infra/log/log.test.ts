import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createLogger, requestIdFrom } from './index';

function capture() {
  const lines: Record<string, unknown>[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      done();
    },
  });
  return { lines, destination };
}

describe('createLogger', () => {
  it('writes JSON with service, level label and ISO time', () => {
    const { lines, destination } = capture();
    createLogger({ service: 'web', level: 'info', destination }).info('started');
    expect(lines[0]).toMatchObject({ service: 'web', level: 'info', msg: 'started' });
    expect(lines[0]?.['time']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('redacts credentials, tokens, cookies and bodies at any of three depths', () => {
    const { lines, destination } = capture();
    createLogger({ service: 'web', level: 'info', destination }).info(
      {
        token: 't0',
        'set-cookie': 'top',
        req: { headers: { cookie: 'c', authorization: 'Bearer x', 'set-cookie': 's' } },
        oidc: { code: 'abc', id_token: 'eyJ', tokens: { refreshToken: 'r' } },
        body: { reason: 'Jan Novák, 1.A' },
        user: { id: 'u-1' },
      },
      'callback',
    );
    const line = JSON.stringify(lines[0]);
    for (const secret of ['t0', 'top', 'Bearer x', '"c"', '"s"', 'abc', 'eyJ', 'Jan Novák']) {
      expect(line).not.toContain(secret);
    }
    expect(lines[0]).toMatchObject({ user: { id: 'u-1' } });
  });

  it('redacts capitalised headers and keys four levels deep', () => {
    const { lines, destination } = capture();
    createLogger({ service: 'web', level: 'info', destination }).warn(
      {
        graph: { init: { headers: { Authorization: 'Bearer CAP' } } },
        err: { response: { headers: { 'Set-Cookie': 'SID=DEEP' } } },
        tokenRequest: { client_secret: 'CS', client_assertion: 'CA', code_verifier: 'CV' },
      },
      'graph call failed',
    );
    const line = JSON.stringify(lines[0]);
    for (const secret of ['Bearer CAP', 'SID=DEEP', '"CS"', '"CA"', '"CV"']) {
      expect(line).not.toContain(secret);
    }
  });

  it('redacts mail addresses at the top level, in nested objects and in arrays of objects', () => {
    const { lines, destination } = capture();
    createLogger({ service: 'worker', level: 'info', destination }).warn(
      {
        to: 'top-to@ssps.cz',
        email: 'top-email@ssps.cz',
        mail: {
          from: 'nested-from@ssps.cz',
          to: 'nested-to@ssps.cz',
          dedupeKey: 'access.approved:1',
        },
        graph: {
          message: {
            toRecipients: [{ emailAddress: { address: 'graph-to@ssps.cz' } }],
            from: { emailAddress: { address: 'graph-from@ssps.cz' } },
          },
        },
        recipients: [{ email: 'array-email@ssps.cz' }, { address: 'array-address@ssps.cz' }],
        user: { profile: { email: 'deep-email@ssps.cz' } },
      },
      'mail.systemic',
    );
    const line = JSON.stringify(lines[0]);
    expect(line).not.toContain('@ssps.cz');
    expect(lines[0]).toMatchObject({ mail: { dedupeKey: 'access.approved:1' } });
  });

  it('never prints the secrets of a logged Config object', () => {
    const { lines, destination } = capture();
    createLogger({ service: 'web', level: 'info', destination }).info({
      config: {
        databaseUrl: 'postgres://u:DBPASS@db/x',
        mail: { smtpUrl: 'smtp://u:SMTPPASS@relay' },
        oidc: { credential: { kind: 'secret', secret: 'OIDC', privateKeyPem: 'PEM' } },
      },
    });
    const line = JSON.stringify(lines[0]);
    for (const secret of ['DBPASS', 'SMTPPASS', '"OIDC"', '"PEM"']) {
      expect(line).not.toContain(secret);
    }
  });

  it('keeps error codes but redacts the OAuth authorization code', () => {
    const { lines, destination } = capture();
    const err = Object.assign(new Error('duplicate key'), { code: '23505' });
    createLogger({ service: 'web', level: 'info', destination }).error(
      { err, query: { code: 'AUTHCODE', state: 's' } },
      'callback failed',
    );
    expect(lines[0]).toMatchObject({ err: { code: '23505' }, query: { state: 's' } });
    expect(JSON.stringify(lines[0])).not.toContain('AUTHCODE');
  });

  it('drops records below the configured level', () => {
    const { lines, destination } = capture();
    const logger = createLogger({ service: 'worker', level: 'warn', destination });
    logger.info('noise');
    logger.warn('kept');
    expect(lines.map((l) => l['msg'])).toEqual(['kept']);
  });
});

describe('requestIdFrom', () => {
  it('keeps a well-formed proxy id', () => {
    expect(requestIdFrom('0f8b1c2d-aaaa-bbbb')).toBe('0f8b1c2d-aaaa-bbbb');
  });

  it.each([null, undefined, '', 'short', 'x'.repeat(65), 'evil\nlog line', '<script>'])(
    'replaces %j with a fresh UUID',
    (header) => {
      expect(requestIdFrom(header)).toMatch(/^[0-9a-f-]{36}$/);
    },
  );
});
