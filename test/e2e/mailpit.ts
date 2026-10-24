/**
 * The development Mailpit (127.0.0.1:8025) as the e2e specs read it. Projects
 * run in parallel against one Mailpit, so everything is by recipient: a
 * journey has a persona of its own and only ever looks at, or deletes, the
 * mail to that address. The subject is compared in code, never in the query:
 * Mailpit matches non-ASCII text case-sensitively.
 */
import { expect } from '@playwright/test';

const API = 'http://127.0.0.1:8025/api/v1';
const POLL_MS = 250;

export interface MailpitMessage {
  readonly id: string;
  readonly subject: string;
  readonly text: string;
  readonly to: readonly string[];
}

interface Summary {
  readonly ID: string;
}

interface Detail {
  readonly ID: string;
  readonly Subject: string;
  readonly Text: string;
  readonly To: readonly { readonly Address: string }[];
}

const query = (to: string) => `query=${encodeURIComponent(`to:"${to}"`)}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`Mailpit answered ${response.status} for ${response.url}`);
  return (await response.json()) as T;
}

/** The ids of the messages to `to`, newest first. */
async function idsTo(to: string): Promise<readonly string[]> {
  const { messages } = await json<{ messages: Summary[] }>(
    await fetch(`${API}/search?${query(to)}&limit=50`),
  );
  return messages.map((m) => m.ID);
}

export const mailpit = {
  /** Deletes the mail to this address only (never all: other tests are running). */
  async forget(address: string): Promise<void> {
    const response = await fetch(`${API}/search?${query(address)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(`Mailpit answered ${response.status} on delete`);
  },

  /** The first message to `to`, polled for; fails with the address when none arrives. */
  async waitFor({ to, timeoutMs = 15_000 }: { to: string; timeoutMs?: number }) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const [newest] = await idsTo(to);
      if (newest) return mailpit.read(newest);
      if (Date.now() >= deadline) throw new Error(`no message to ${to} within ${timeoutMs} ms`);
      await sleep(POLL_MS);
    }
  },

  async read(id: string): Promise<MailpitMessage> {
    const detail = await json<Detail>(await fetch(`${API}/message/${id}`));
    return {
      id: detail.ID,
      subject: detail.Subject,
      text: detail.Text,
      to: detail.To.map((t) => t.Address),
    };
  },

  /** The message as sent, headers first. */
  async raw(id: string): Promise<string> {
    const response = await fetch(`${API}/message/${id}/raw`);
    if (!response.ok) throw new Error(`Mailpit answered ${response.status} for the raw message`);
    return response.text();
  },

  /** Waits `ms`, then expects no message to `to` beyond those already there. */
  async quiet({ to, ms = 2_000 }: { to: string; ms?: number }): Promise<void> {
    const before = await idsTo(to);
    await sleep(ms);
    expect(await idsTo(to), `mail to ${to} after the first`).toEqual(before);
  },
};
