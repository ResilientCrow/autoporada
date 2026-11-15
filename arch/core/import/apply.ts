import type { Annex, AnnexPart } from '../types';
import type { Imported } from './parts';

/** The JSON size of the whole annex list as it will be saved, the annex being edited counted as it is now. */
export function listBytes(all: readonly { id: string }[], current: { id: string }): number {
  return new TextEncoder().encode(JSON.stringify(all.some((a) => a.id === current.id) ? all.map((a) => (a.id === current.id ? current : a)) : [...all, current])).length;
}

/**
 * What the annex becomes once an import is added, to the annex as it is NOW (the person may have typed while the file
 * was read). A taken heading names an annex that is still untitled; if a title was typed meanwhile, the heading goes
 * back in as the first paragraph of the new parts instead of being lost.
 */
export function appendImported(now: Annex, r: Imported, id: () => string): Annex {
  const untitled = !now.title.trim();
  const heading: Imported['parts'] = r.title && !untitled ? [{ kind: 'text', doc: { type: 'doc', content: [{ type: 'paragraph', attrs: { indent: 0 }, content: [{ type: 'text', text: r.title }] }] } }] : [];
  const added = [...heading, ...r.parts].map((p) => ({ ...p, id: id() }) as AnnexPart);
  return { ...now, title: untitled ? r.title ?? now.title : now.title, parts: [...now.parts, ...added] };
}
