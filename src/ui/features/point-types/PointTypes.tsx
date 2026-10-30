'use client';

import { useState } from 'react';

import { pointTypes } from '@/ui/copy';
import { LiveStatus } from '@/ui/form';
import { Card, SlantLabel } from '@/ui/kit';

import { TypeForm, type SaveAction, type TypeView } from './TypeForm';

export type { TypeView } from './TypeForm';

/** What `saved` holds after the new-type form saved. */
const NEW = 'new';

/** The page's model: every type, retired ones too, in the order the chooser offers them. */
export interface PointTypesView {
  readonly types: readonly TypeView[];
}

/**
 * The host of „Typy bodů“. Each saved type's form is keyed by its version and the new-type form
 * by the number of types added, so the refresh after a save starts every changed form afresh;
 * the host also says which form was saved last, so that the one that starts again takes focus.
 */
export function PointTypes({
  view,
  savePointType,
}: {
  readonly view: PointTypesView;
  readonly savePointType: SaveAction;
}) {
  const [said, setSaid] = useState({ message: '', count: 0, added: 0, saved: '' });
  const say = (message: string, created: boolean, id: string) =>
    setSaid((s) => ({
      message,
      count: s.count + 1,
      added: s.added + (created ? 1 : 0),
      saved: id,
    }));
  /** `id` is the type's, or `NEW` for the new-type form. */
  const result = (id: string) => (changed: boolean) => {
    if (!changed) say(pointTypes.said.unchanged, false, '-');
    else say(id === NEW ? pointTypes.said.created : pointTypes.said.changed, id === NEW, id);
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
              <TypeForm
                action={savePointType}
                type={type}
                restoreFocus={said.saved === type.id}
                onSaved={result(type.id)}
              />
            </Card>
          ))}
        </section>
        <section className="space-y-4">
          <h2 className="text-xl">{pointTypes.create.title}</h2>
          <TypeForm
            key={said.added}
            action={savePointType}
            restoreFocus={said.saved === NEW}
            onSaved={result(NEW)}
          />
        </section>
      </div>
    </>
  );
}
