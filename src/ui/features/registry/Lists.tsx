'use client';

import { useState } from 'react';

import { registry } from '@/ui/copy';
import { LiveStatus } from '@/ui/form';
import { ArrowLink, Card, SlantLabel } from '@/ui/kit';

import type { MoveListAction, SaveListAction } from './actions';
import { ListForm, type ListFormValues } from './ListForm';
import { MoveForm } from './MoveForm';

/** One list of /registr with its counts of active and never printed students. */
export interface ListView extends ListFormValues {
  readonly key: string;
  readonly entries: number;
  readonly fresh: number;
}

/** /registr: every list in the order the document prints them. */
export interface ListsView {
  readonly lists: readonly ListView[];
  readonly canEdit: boolean;
}

/**
 * The host of „Registr“: a card per list with its counts and a link to the students, and for the
 * headmaster the order buttons, a form to rename or switch off the list and one to add a list.
 * A saved list's form is keyed by its version and the new-list form by the number of lists made.
 */
export function Lists({
  view,
  saveList,
  moveList,
}: {
  readonly view: ListsView;
  readonly saveList: SaveListAction;
  readonly moveList: MoveListAction;
}) {
  const [said, setSaid] = useState({ message: '', count: 0, created: 0 });
  const say = (message: string, created = 0) =>
    setSaid((s) => ({ message, count: s.count + 1, created: s.created + created }));
  const saved = (changed: boolean) =>
    say(changed ? registry.said.changed : registry.said.unchanged);
  const { lists, canEdit } = view;
  return (
    <>
      <SlantLabel level={1}>{registry.title}</SlantLabel>
      <div className="mt-4 space-y-8">
        <p>{registry.intro}</p>
        {canEdit && (
          <p>
            <ArrowLink href="/registr/novy-skolni-rok">{registry.newYear.link}</ArrowLink>
          </p>
        )}
        <LiveStatus message={said.message} count={said.count} />
        <section className="space-y-4">
          <h2 className="text-xl">{registry.lists.title}</h2>
          {lists.length === 0 && <p>{registry.lists.empty}</p>}
          {lists.map((list, index) => (
            <Card
              key={`${list.id}-${list.version}`}
              level={3}
              title={list.active ? list.title : `${list.title} (${registry.lists.off})`}
            >
              <div className="space-y-3">
                <p>{registry.lists.counts(list.entries, list.fresh)}</p>
                <p>
                  <ArrowLink href={`/registr/${list.key}`}>{registry.lists.open}</ArrowLink>
                </p>
                {canEdit && (
                  <>
                    <MoveForm
                      action={moveList}
                      id={list.id}
                      title={list.title}
                      first={index === 0}
                      last={index === lists.length - 1}
                      onMoved={() => say(registry.said.moved)}
                    />
                    <details>
                      <summary className="min-h-11 cursor-pointer font-bold">
                        {registry.lists.edit}
                      </summary>
                      <div className="mt-3">
                        <ListForm action={saveList} list={list} onSaved={saved} />
                      </div>
                    </details>
                  </>
                )}
              </div>
            </Card>
          ))}
        </section>
        {canEdit && (
          <section className="space-y-4">
            <h2 className="text-xl">{registry.lists.create.title}</h2>
            <ListForm
              key={said.created}
              action={saveList}
              onSaved={(changed) => say(registry.said.created, changed ? 1 : 0)}
            />
          </section>
        )}
      </div>
    </>
  );
}
