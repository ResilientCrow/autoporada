'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';

import { gallery } from '@/ui/copy';
import { AutosaveStatus, useAutosave, type SaveAnswer, type StatusAnswer } from '@/ui/form';
import { buttonStyles } from '@/ui/kit';

const { autosave } = gallery;

type Mode = keyof typeof autosave.arm;
const MODES = Object.keys(autosave.arm) as Mode[];
const SAVE_MS = 300;
const FIRST_VERSION = 1;
/** The e2e test answers this path with page.route; no route exists in the app. */
const SEEN_PATH = '/vzornik/ulozeni';

const later = <T,>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), SAVE_MS));

/**
 * One textarea saved through the real hook against a pretend server: its version, and the mode
 * the next answer follows. Every save is also POSTed to SEEN_PATH, so a test can see a flush land.
 */
export function AutosaveDemo() {
  const [armed, setArmed] = useState<Mode>('ok');
  const [refreshed, setRefreshed] = useState(0);
  const world = useRef({ version: FIRST_VERSION, mode: 'ok' as Mode });

  const save = async (request: {
    content: string;
    expectedVersion: number;
  }): Promise<SaveAnswer> => {
    void fetch(SEEN_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    }).catch(() => undefined);
    const { mode } = world.current;
    if (mode === 'failed') return later({ kind: 'failed' });
    world.current.mode = 'ok';
    setArmed('ok');
    if (mode === 'locked') return later({ kind: 'not-editable' });
    if (mode === 'signedOut') return later({ kind: 'unauthenticated' });
    // Another window saved first.
    if (mode === 'conflict') world.current.version += 1;
    if (request.expectedVersion !== world.current.version) return later({ kind: 'conflict' });
    world.current.version += 1;
    return later({ kind: 'ok', version: world.current.version });
  };
  const status = (): Promise<StatusAnswer> =>
    later({ kind: 'ok', version: world.current.version, editable: true });

  const autosaving = useAutosave<string>({
    initialVersion: FIRST_VERSION,
    save,
    status,
    onRefresh: () => setRefreshed((n) => n + 1),
  });

  const arm = (mode: Mode) => {
    world.current.mode = mode;
    setArmed(mode);
  };

  return (
    <div className="flex flex-col gap-3">
      <p>{autosave.hint}</p>
      <div className="flex flex-col gap-1">
        <label htmlFor="demo-autosave" className="font-bold">
          {autosave.label}
        </label>
        <textarea
          id="demo-autosave"
          rows={4}
          readOnly={autosaving.readOnly}
          onChange={(event) => autosaving.onChange(event.currentTarget.value)}
          onBlur={autosaving.onBlur}
          className="min-h-11 w-full rounded-brand border-2 border-ink bg-light px-3 py-2 text-ink"
        />
      </div>
      <AutosaveStatus {...autosaving.status} />
      <div className="flex flex-wrap gap-2">
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => arm(mode)}
            className={buttonStyles('secondary')}
          >
            {autosave.arm[mode]}
          </button>
        ))}
      </div>
      <p>{autosave.armed(autosave.arm[armed])}</p>
      <p>{autosave.refreshed(refreshed)}</p>
      <p>
        <Link href="/" prefetch={false}>
          {autosave.leave}
        </Link>
      </p>
    </div>
  );
}
