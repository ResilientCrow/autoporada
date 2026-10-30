'use client';

import { createContext, useContext, useState, type ReactNode, type RefObject } from 'react';

import { LiveStatus, useFocusFirstOnRise } from '@/ui/form';

import { FUTURE_HEADING_ID } from './review-calls';

/** What the reviewer's forms tell the host once a decision or a cancel went through. */
interface FutureHostApi {
  /** Says `message` in the status region and sends focus to the item's title. */
  readonly say: (message: string) => void;
}

const HostContext = createContext<FutureHostApi | null>(null);

/** The item's title as a focus target, looked up when focus moves: a refresh can swap the title for a new node. */
const TITLE: RefObject<HTMLElement | null> = {
  get current() {
    return document.getElementById(FUTURE_HEADING_ID);
  },
};

/**
 * The host of /akce/[id] (ADR 0013 items 1 and 7), above the read view and the editor. Which of
 * the two shows changes with the state (a headmaster approving their own item, a reviewer
 * cancelling an approved akce), and a reviewer's bar may go away with the decision; this host
 * stays, so its one status region is mounted before a decision is said into it and the message
 * outlives every view switch. After a decision or a cancel it sends focus to the item's title,
 * which both views keep, since the button pressed is gone with the refresh.
 */
export function FutureHost({ children }: { readonly children: ReactNode }) {
  const [said, setSaid] = useState({ message: '', count: 0 });
  useFocusFirstOnRise(said.count, [TITLE]);
  const api: FutureHostApi = {
    say: (message) => setSaid((s) => ({ message, count: s.count + 1 })),
  };
  return (
    <HostContext value={api}>
      <div className="space-y-4">
        {children}
        <LiveStatus message={said.message} count={said.count} />
      </div>
    </HostContext>
  );
}

/** The host above a form of the reviewer's side; one that is rendered outside it is a bug. */
export function useFutureHost(): FutureHostApi {
  const host = useContext(HostContext);
  if (host === null) throw new Error('future.host.missing');
  return host;
}
