import { textOf } from '@/ui/form';

/** What „Odeslat žádost“ sends: the reason as typed; the server trims and checks it. */
export function requestInput(data: FormData): { readonly reason: string } {
  return { reason: textOf(data, 'reason') };
}
