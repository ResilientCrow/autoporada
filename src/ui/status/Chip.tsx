import { StatusChip } from '@/ui/kit';

import type { Look } from './looks';

/** A status chip for a look from this module. */
export function Chip({ look }: { readonly look: Look }) {
  return <StatusChip tone={look.tone}>{look.label}</StatusChip>;
}
