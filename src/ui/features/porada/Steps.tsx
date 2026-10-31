import { porada } from '@/ui/copy';
import { ArrowLink, Card } from '@/ui/kit';

/**
 * The steps of preparing a porada, each a page of its own under /porada/[datum].
 * TODO(m9-verify): udaje, pokyny and priloha-2 are built in rows 47, 43 and 48; their links 404 until then.
 */
const STEPS = [
  { path: 'udaje', label: porada.steps.details },
  { path: 'pokyny', label: porada.steps.outline },
  { path: 'priloha-2', label: porada.steps.annex2 },
  { path: 'nahled', label: porada.steps.preview },
] as const;

/** „Příprava dokumentu“: links to the steps of the porada with this Monday. */
export function Steps({ monday }: { readonly monday: string }) {
  return (
    <Card level={2} title={porada.steps.title}>
      <ol className="space-y-2">
        {STEPS.map((step) => (
          <li key={step.path}>
            <ArrowLink href={`/porada/${monday}/${step.path}`}>{step.label}</ArrowLink>
          </li>
        ))}
      </ol>
    </Card>
  );
}
