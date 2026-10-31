import type { ReactNode } from 'react';

import { formatClock } from '@/domain/cs';
import type { WallTime } from '@/domain/time';
import { autosave } from '@/ui/copy';
import { Button, Notice } from '@/ui/kit';

import type { Phase } from './machine';

function lineOf(phase: Phase, savedAt: WallTime | null): string {
  switch (phase) {
    case 'idle':
      return '';
    case 'saving':
      return autosave.saving;
    case 'saved':
      return savedAt === null ? '' : autosave.saved(formatClock(savedAt));
    case 'dirty':
    case 'failed':
    case 'conflict':
    case 'locked':
    case 'gone':
    case 'signedOut':
      return autosave.unsaved;
  }
}

function Banner({ text, children }: { readonly text: string; readonly children: ReactNode }) {
  return (
    <Notice tone="problem">
      <p>{text}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">{children}</div>
    </Notice>
  );
}

/**
 * The status line (visual only: `aria-live="off"`) and, for the five states that need
 * the author, a banner with its buttons. A banner is a `role="alert"` that mounts on entry
 * into its phase, so its insertion is the one announcement; no status region repeats it.
 * Focus never moves into it.
 */
export function AutosaveStatus({
  phase,
  savedAt,
  lockedText = autosave.locked.text,
  onRetry,
  onKeepMine,
  onReload,
}: {
  readonly phase: Phase;
  readonly savedAt: WallTime | null;
  /** What the locked banner says when the editor is not a point's (its own „už nelze upravovat“). */
  readonly lockedText?: string;
  readonly onRetry: () => void;
  readonly onKeepMine: () => void;
  readonly onReload: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p aria-live="off">{lineOf(phase, savedAt)}</p>
      {phase === 'failed' ? (
        <Banner text={autosave.failed.text}>
          <Button variant="secondary" onPress={onRetry}>
            {autosave.failed.retry}
          </Button>
        </Banner>
      ) : null}
      {phase === 'conflict' ? (
        <Banner text={autosave.conflict.text}>
          <Button variant="primary" onPress={onReload}>
            {autosave.conflict.reload}
          </Button>
          <Button variant="secondary" onPress={onKeepMine}>
            {autosave.conflict.keepMine}
          </Button>
        </Banner>
      ) : null}
      {phase === 'locked' ? (
        <Banner text={lockedText}>
          <Button variant="primary" onPress={onReload}>
            {autosave.locked.reload}
          </Button>
        </Banner>
      ) : null}
      {phase === 'gone' ? (
        <Banner text={autosave.gone.text}>
          <Button variant="primary" onPress={onReload}>
            {autosave.gone.reload}
          </Button>
        </Banner>
      ) : null}
      {phase === 'signedOut' ? (
        <Banner text={autosave.signedOut.text}>
          <a href="/prihlaseni" target="_blank" rel="noopener">
            {autosave.signedOut.signIn}
          </a>
          <Button variant="primary" onPress={onRetry}>
            {autosave.signedOut.save}
          </Button>
        </Banner>
      ) : null}
    </div>
  );
}
