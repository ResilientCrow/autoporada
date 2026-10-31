import { porada } from '@/ui/copy';
import { SlantLabel } from '@/ui/kit';

/** „Žádná porada k přípravě“: the calendar has no open porada ahead. */
export function NoPorada() {
  return (
    <>
      <SlantLabel level={1}>{porada.title}</SlantLabel>
      <div className="mt-4 space-y-2">
        <h2 className="text-xl">{porada.none.title}</h2>
        <p>{porada.none.text}</p>
      </div>
    </>
  );
}
