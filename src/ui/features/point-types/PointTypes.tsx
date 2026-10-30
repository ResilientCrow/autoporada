'use client';

import { useState } from 'react';

import { pointTypes } from '@/ui/copy';
import { LiveStatus } from '@/ui/form';
import { Card, SlantLabel } from '@/ui/kit';

import { TypeForm, type SaveAction, type TypeView } from './TypeForm';

export type { TypeView } from './TypeForm';

/** The page's model: every type, retired ones too, in the order the chooser offers them. */
export interface PointTypesView {
  readonly types: readonly TypeView[];
}

/**
 * The host of „Typy bodů“. Each saved type's form is keyed by its version and the new-type form
 * by the number of types added, so the refresh after a save starts every changed form afresh.
 */
export function PointTypes({
  view,
  savePointType,
}: {
  readonly view: PointTypesView;
  readonly savePointType: SaveAction;
}) {
  const [said, setSaid] = useState({ message: '', count: 0, added: 0 });
  const say = (message: string, created: boolean) =>
    setSaid((s) => ({ message, count: s.count + 1, added: s.added + (created ? 1 : 0) }));
  const result = (created: boolean) => (changed: boolean) => {
    if (!changed) say(pointTypes.said.unchanged, false);
    else say(created ? pointTypes.said.created : pointTypes.said.changed, created);
  };
  return (
    <>
      <SlantLabel level={1}>{pointTypes.title}</SlantLabel>
      <div className="mt-4 space-y-8">
        <p>{pointTypes.intro}</p>
        <LiveStatus message={said.message} count={said.count} />
        <section className="space-y-4">
          <h2 className="text-xl">{pointTypes.list.title}</h2>
          {view.types.length === 0 && <p>{pointTypes.list.empty}</p>}
          {view.types.map((type) => (
            <Card
              key={`${type.id}-${type.version}`}
              level={3}
              title={type.active ? type.name : `${type.name} (${pointTypes.list.off})`}
            >
              <TypeForm action={savePointType} type={type} onSaved={result(false)} />
            </Card>
          ))}
        </section>
        <section className="space-y-4">
          <h2 className="text-xl">{pointTypes.create.title}</h2>
          <TypeForm key={said.added} action={savePointType} onSaved={result(true)} />
        </section>
      </div>
    </>
  );
}
