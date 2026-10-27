'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { instantToWallClock } from '@/domain/time';

import {
  initialState,
  isReadOnly,
  warnOnUnload,
  type AutosaveState,
  type SaveAnswer,
  type StatusAnswer,
} from './machine';
import { createRunner } from './runner';

export interface AutosaveOptions<C> {
  /** The version the page was rendered with; the editor is keyed by it, so it never changes. */
  readonly initialVersion: number;
  readonly save: (request: { content: C; expectedVersion: number }) => Promise<SaveAnswer>;
  readonly status: () => Promise<StatusAnswer>;
  /** „Načíst aktuální stav“: the server's version, e.g. `router.refresh()`. Called after the flush. */
  readonly onRefresh: () => void;
}

/** The field being edited: the focused element, unless focus is on the page itself. */
function editedField(): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

/**
 * Wires the autosave machine to the page (ADR 0017, 0024): timers, `visibilitychange`
 * (hidden saves), `pagehide` (flushes), `beforeunload` (warns while text is unsaved),
 * and a flush when the editor unmounts. The content lives in memory only, never in
 * browser storage (item 8). Pass the result's `status` to `AutosaveStatus`, make the
 * fields read-only when `readOnly`, and call `onChange` and `onBlur` from them. A banner
 * button that starts a save (the banner then unmounts) puts focus back on the field the
 * author last edited.
 */
export function useAutosave<C>({ initialVersion, save, status, onRefresh }: AutosaveOptions<C>) {
  const [state, setState] = useState<AutosaveState<C>>(() => initialState<C>(initialVersion));
  const edited = useRef<HTMLElement | null>(null);
  const [runner] = useState(() =>
    createRunner<C>(
      {
        save,
        status,
        refresh: onRefresh,
        now: () => instantToWallClock(new Date()).time,
        onState: setState,
      },
      initialVersion,
    ),
  );

  // The latest closures of the page, without restarting anything.
  useEffect(() => {
    runner.use({ save, status, refresh: onRefresh });
  }, [runner, save, status, onRefresh]);

  useEffect(() => {
    runner.start();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') runner.dispatch({ type: 'hidden' });
    };
    const onPageHide = () => runner.dispatch({ type: 'leave' });
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!warnOnUnload(runner.state())) return;
      event.preventDefault();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      // The call goes out although the component is gone; its answer is dropped.
      runner.dispatch({ type: 'leave' });
      runner.stop();
    };
  }, [runner]);

  const onChange = useCallback(
    (content: C) => {
      edited.current = editedField() ?? edited.current;
      runner.dispatch({ type: 'change', content });
    },
    [runner],
  );
  const onBlur = useCallback(() => {
    edited.current = editedField() ?? edited.current;
    runner.dispatch({ type: 'blur' });
  }, [runner]);
  /** A banner action unmounts the banner with the button the author pressed: focus goes back to the field. */
  const refocus = () => {
    if (edited.current?.isConnected) edited.current.focus();
  };

  return {
    readOnly: isReadOnly(state.phase),
    onChange,
    onBlur,
    status: {
      phase: state.phase,
      savedAt: state.savedAt,
      onRetry: () => {
        runner.dispatch({ type: 'retry' });
        refocus();
      },
      onKeepMine: () => {
        runner.dispatch({ type: 'keepMine' });
        refocus();
      },
      onReload: () => runner.dispatch({ type: 'reload' }),
    },
  };
}
