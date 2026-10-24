import type { z } from 'zod';

import type { myAccessOutput } from '@/contracts';
import { access } from '@/ui/copy';
import { ArrowLink, Notice } from '@/ui/kit';
import { Chip, STANDING_LOOK } from '@/ui/status';

type Standing = z.output<typeof myAccessOutput>['standing'];
type Of<K extends Standing['kind']> = Extract<Standing, { readonly kind: K }>;

/**
 * The page's model: the contract's standing, with its dates written out. The
 * contract's fields carry over; the date fields become the text, or are left out.
 */
export type AccessView =
  | Of<'member'>
  | Of<'open'>
  | Omit<Of<'blocked'>, 'decidedAt'>
  | (Omit<Of<'pending'>, 'createdAt'> & { readonly sent: string })
  | (Omit<Of<'cooldown'>, 'decidedAt' | 'until'> & {
      readonly decided: string;
      readonly from: string;
    });

/** The heading of the state: it stays one element and only its text changes. */
export function headingOf(view: AccessView): string {
  switch (view.kind) {
    case 'member':
      return access.member.title;
    case 'open':
      return access.open.title;
    case 'pending':
      return access.pending.title;
    case 'cooldown':
      return access.cooldown.title;
    case 'blocked':
      return access.blocked.title;
  }
}

/** Whether the state asks for or changes something by a form. */
export function hasForm(view: AccessView): boolean {
  return view.kind === 'open' || view.kind === 'pending';
}

/** What the standing says, under the heading. */
export function Standing({ view }: { readonly view: AccessView }) {
  switch (view.kind) {
    case 'member':
      return <ArrowLink href="/">{access.member.overview}</ArrowLink>;
    case 'open':
      return (
        <>
          {view.previous !== null && (
            // Part of the page as it loads: the host's status region announces changes.
            <Notice tone="info" live={false}>
              {view.previous === 'cancelled'
                ? access.open.previousCancelled
                : access.open.previousRejected}
            </Notice>
          )}
          <p>{access.open.text}</p>
        </>
      );
    case 'pending':
      return (
        <>
          <p>
            <Chip look={STANDING_LOOK.pending} />
          </p>
          <p>
            {access.pending.sent(view.sent)} {access.pending.afterApproval}
          </p>
          <h3 className="text-lg">{access.pending.reason}</h3>
          <p className="break-words whitespace-pre-line">{view.reason}</p>
        </>
      );
    case 'cooldown':
      return (
        <>
          <p>
            <Chip look={STANDING_LOOK.cooldown} />
          </p>
          <p>{access.cooldown.text(view.decided, view.from)}</p>
        </>
      );
    case 'blocked':
      return (
        <>
          <p>
            <Chip look={STANDING_LOOK.blocked} />
          </p>
          <p>{access.blocked.text}</p>
        </>
      );
  }
}
