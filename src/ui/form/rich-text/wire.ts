import type { z } from 'zod';

import { richDocWire } from '@/contracts';

/**
 * The document a `RichTextField` submitted, in the wire shape the actions take: the hidden input
 * holds its JSON. The server validates it again with `parseRichDoc`; this only reads the shape, and
 * a field that is missing or not a document is a bug, so it throws.
 */
export function richDocOf(data: FormData, name: string): z.output<typeof richDocWire> {
  const value = data.get(name);
  if (typeof value !== 'string') throw new Error(`The form sent no document "${name}".`);
  return richDocWire.parse(JSON.parse(value));
}
