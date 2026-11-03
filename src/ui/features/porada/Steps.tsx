import { porada } from '@/ui/copy';
import { ArrowLink, Card } from '@/ui/kit';

/**
 * The steps of preparing a porada, each a page of its own under /porada/[datum].
 */
const steps = (missing: number) =>
  [
    { path: 'udaje', label: porada.steps.details },
    { path: 'pokyny', label: porada.steps.outline },
    { path: 'priloha-2', label: porada.steps.annex2 },
    {
      path: 'zpravy',
      label: missing > 0 ? porada.missing.step(missing) : porada.steps.missing,
    },
    { path: 'nahled', label: porada.steps.preview },
  ] as const;

/**
 * „Příprava dokumentu“: links to the steps of the porada with this Monday. `missing` is the number
 * of akce that lack a report, named on its step.
 */
export function Steps({ monday, missing }: { readonly monday: string; readonly missing: number }) {
  return (
    <Card level={2} title={porada.steps.title}>
      <ol className="space-y-2">
        {steps(missing).map((step) => (
          <li key={step.path}>
            <ArrowLink href={`/porada/${monday}/${step.path}`}>{step.label}</ArrowLink>
          </li>
        ))}
      </ol>
    </Card>
  );
}
