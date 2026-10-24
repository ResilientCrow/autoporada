/**
 * The SMTP transport (development only, ADR 0016) against Mailpit on
 * 127.0.0.1:1025, and against a scripted SMTP server for the answers Mailpit
 * never gives. Each test mails its own address and reads only that address:
 * other suites share the Mailpit, so nothing here deletes its messages.
 */
import { randomUUID } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import type { MailResult, OutgoingMail } from '@/application/ports';
import { createSmtpMail } from '@/infra/mail';
import { inTransactionScope } from '@/infra/system';

const MAILPIT = 'http://127.0.0.1:8025/api/v1';
const FROM = 'autoporada@ssps.cz';
const mailTo = (to: string): OutgoingMail => ({
  to,
  subject: 'Žádost o přístup byla schválena – „Matematika“',
  text: 'Dobrý den,\nvaše žádost byla schválena.\nŠkola ŠPŠ Smíchov',
  dedupeKey: `access.approved:${randomUUID()}`,
});
const unique = () => `smtp-${randomUUID().slice(0, 8)}@ssps.cz`;

interface MailpitSummary {
  readonly ID: string;
}

/** Polls Mailpit for the one message to `to` (this test's own address). */
async function received(to: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const search = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await search.json()) as { messages: MailpitSummary[] };
    if (messages[0]) return messages[0].ID;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`no message to ${to} in Mailpit`);
}

/** A scripted SMTP server: `answer` gets each command (and `.` after the data) and may reply. */
const servers: Server[] = [];
async function scripted(answer: (line: string) => string | undefined): Promise<string> {
  const server = createServer((socket: Socket) => {
    socket.write('220 scripted ESMTP\r\n');
    let buffer = '';
    let inData = false;
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      for (let end = buffer.indexOf('\r\n'); end >= 0; end = buffer.indexOf('\r\n')) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (inData && line !== '.') continue;
        inData = /^DATA/i.test(line);
        const reply = inData
          ? '354 go on'
          : (answer(line) ?? (line === 'QUIT' ? '221 bye' : '250 ok'));
        if (reply !== 'hang') socket.write(`${reply}\r\n`);
      }
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return `smtp://127.0.0.1:${address.port}`;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))));
});

describe('the SMTP transport', () => {
  it('delivers a Czech subject and body to Mailpit exactly, with our headers', async () => {
    const to = unique();
    const mail = mailTo(to);
    const result = await createSmtpMail({ url: 'smtp://127.0.0.1:1025', from: FROM }).send(mail);
    expect(result).toEqual({ kind: 'sent', requestId: null });

    const id = await received(to);
    const message = (await (await fetch(`${MAILPIT}/message/${id}`)).json()) as {
      Subject: string;
      Text: string;
      From: { Address: string };
      To: { Address: string }[];
    };
    expect(message.Subject).toBe(mail.subject);
    // SMTP carries CRLF line ends; the text is otherwise byte for byte.
    expect(message.Text.replaceAll('\r\n', '\n').trimEnd()).toBe(mail.text);
    expect(message.From.Address).toBe(FROM);
    expect(message.To.map((r) => r.Address)).toEqual([to]);

    const raw = await (await fetch(`${MAILPIT}/message/${id}/raw`)).text();
    expect(raw).toMatch(/^Subject: =\?UTF-8\?Q\?/m);
    expect(raw).toMatch(/^Content-Type: text\/plain; charset=utf-8$/im);
    expect(raw).toMatch(/^Content-Transfer-Encoding: quoted-printable$/im);
    expect(raw).toMatch(/^Auto-Submitted: auto-generated$/m);
    expect(raw).toMatch(/^X-Auto-Response-Suppress: All$/m);
    expect(raw).toContain(`\nX-Autoporada-Dedupe: ${mail.dedupeKey}\r\n`);
  });

  it('calls a refused connection not sent', async () => {
    const url = await scripted(() => undefined);
    await new Promise((resolve) => servers.pop()?.close(resolve));
    const result = await createSmtpMail({ url, from: FROM }).send(mailTo(unique()));
    expect(result).toEqual({ kind: 'not-sent', code: 'net.ECONNREFUSED' });
  });

  it('calls a host that does not resolve not sent', async () => {
    const mail = createSmtpMail({ url: 'smtp://no-such-host.invalid:25', from: FROM });
    expect(await mail.send(mailTo(unique()))).toEqual({
      kind: 'not-sent',
      code: expect.stringMatching(/^net\.(ENOTFOUND|EAI_AGAIN)$/),
    });
  });

  it.each<[string, (line: string) => string | undefined, MailResult]>([
    [
      'a 4xx to the recipient',
      (l) => (/^RCPT/i.test(l) ? '451 later' : undefined),
      { kind: 'throttled', retryAfterMs: 30_000, code: 'throttled.451' },
    ],
    [
      'a 4xx after the data',
      (l) => (l === '.' ? '452 full' : undefined),
      { kind: 'throttled', retryAfterMs: 30_000, code: 'throttled.452' },
    ],
    [
      'a 5xx to the recipient',
      (l) => (/^RCPT/i.test(l) ? '550 no such user' : undefined),
      { kind: 'rejected', code: 'rejected.550' },
    ],
    [
      'a 5xx after the data',
      (l) => (l === '.' ? '554 refused' : undefined),
      { kind: 'rejected', code: 'rejected.554' },
    ],
    [
      'silence after the data',
      (l) => (l === '.' ? 'hang' : undefined),
      { kind: 'unknown', code: 'unknown.timeout' },
    ],
  ])('classifies %s', async (_, answer, expected) => {
    const url = await scripted(answer);
    const mail = createSmtpMail({ url, from: FROM, budgetMs: 300 });
    expect(await mail.send(mailTo(unique()))).toEqual(expected);
  });

  it('refuses an address that is not plain ASCII without connecting', async () => {
    const lines: string[] = [];
    const url = await scripted((line) => void lines.push(line));
    const result = await createSmtpMail({ url, from: FROM }).send(mailTo('jána@ssps.cz'));
    expect(result).toEqual({ kind: 'rejected', code: 'rejected.address' });
    expect(lines).toEqual([]);
  });

  it('refuses to send inside a database transaction', async () => {
    const lines: string[] = [];
    const url = await scripted((line) => void lines.push(line));
    const mail = createSmtpMail({ url, from: FROM });
    await expect(inTransactionScope(() => mail.send(mailTo(unique())))).rejects.toThrow(
      /inside a database transaction/,
    );
    expect(lines).toEqual([]);
  });
});
