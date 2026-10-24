import { stepUpNotice } from '@/ui/copy';
import { buttonStyles, Card } from '@/ui/kit';

const BUTTON = buttonStyles('primary');

/**
 * Asks for a fresh sign-in before a form that needs one, so nothing typed is
 * lost. A plain link in the same tab, never prefetched: /auth/* is not a page.
 */
export function StepUpNotice({ returnTo }: { readonly returnTo: string }) {
  return (
    <Card title={stepUpNotice.title}>
      <div className="space-y-3">
        <p>{stepUpNotice.text}</p>
        <a href={`/auth/step-up?returnTo=${encodeURIComponent(returnTo)}`} className={BUTTON}>
          {stepUpNotice.action}
        </a>
      </div>
    </Card>
  );
}
