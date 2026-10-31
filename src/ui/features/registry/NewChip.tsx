import { registry } from '@/ui/copy';
import { StatusChip } from '@/ui/kit';

/** „NOVÉ“: the student was added since the last printed document. */
export function NewChip() {
  return <StatusChip tone="attention">{registry.new}</StatusChip>;
}
