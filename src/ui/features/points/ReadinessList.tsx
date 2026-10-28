'use client';

import { useDeferredValue, useMemo, type MouseEvent } from 'react';

import type { BulletSpec, PointKind } from '@/domain/report';
import { points } from '@/ui/copy';
import { revealAndFocus } from '@/ui/form';

import { editorSpec } from './editor-form';
import type { PointContentWire } from './fields';
import { readinessItems, readinessOf, type ReadinessItem } from './readiness';

/** A link to a control moves there from its own click, opening what hides it first. */
function goTo(event: MouseEvent<HTMLAnchorElement>, id: string): void {
  const target = document.getElementById(id);
  if (target === null) return;
  event.preventDefault();
  revealAndFocus(target);
}

function Items({ items }: { readonly items: readonly ReadinessItem[] }) {
  return (
    <ul className="list-disc pl-6">
      {items.map(({ id, text }, i) => (
        // Two lines can say the same; the position tells them apart.
        <li key={`${i}:${text}`}>
          {id === null ? (
            text
          ) : (
            <a href={`#${id}`} onClick={(event) => goTo(event, id)}>
              {text}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * What the submit would still ask for, live under the form (design section 6): every problem
 * leads to its field, and a speaker who is no participant is a warning that never blocks. It
 * follows a deferred copy of the content, like the preview, so typing is never held up.
 */
export function ReadinessList({
  kind,
  content,
  spec,
  schoolYear,
}: {
  readonly kind: PointKind;
  readonly content: PointContentWire;
  readonly spec: readonly BulletSpec[];
  readonly schoolYear: string;
}) {
  const deferred = useDeferredValue(content);
  const { problems, warnings } = useMemo(
    () =>
      readinessItems(
        readinessOf(kind, deferred, spec, schoolYear),
        editorSpec(deferred.bullets, spec, deferred.statements.length),
      ),
    [kind, deferred, spec, schoolYear],
  );
  return (
    <section aria-labelledby="bod-readiness" className="space-y-2">
      <h2 id="bod-readiness">{points.readiness.heading}</h2>
      {problems.length === 0 ? <p>{points.readiness.ok}</p> : null}
      {problems.length > 0 ? (
        <>
          <h3>{points.readiness.problems}</h3>
          <Items items={problems} />
        </>
      ) : null}
      {warnings.length > 0 ? (
        <>
          <h3>{points.readiness.warnings}</h3>
          <Items items={warnings} />
        </>
      ) : null}
    </section>
  );
}
