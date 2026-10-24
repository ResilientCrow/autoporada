import { buttonStyles } from '@/ui/kit';

import { CONTROL } from './control-styles';

/**
 * A search by GET, which works without JavaScript: the text is `hledat`, and
 * `keep` carries a value the search must not lose (the chosen group). It needs
 * no form state, so it is a server component.
 */
export function SearchForm({
  path,
  label,
  submit,
  query,
  keep,
}: {
  readonly path: string;
  readonly label: string;
  readonly submit: string;
  readonly query: string;
  readonly keep: { readonly name: string; readonly value: string };
}) {
  return (
    <form method="get" role="search" action={path} className="space-y-2">
      <label htmlFor="hledat" className="block font-bold">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="hledat"
          type="search"
          name="hledat"
          defaultValue={query}
          autoComplete="off"
          className={`${CONTROL} flex-1 basis-60`}
        />
        <input type="hidden" name={keep.name} value={keep.value} />
        <button type="submit" className={buttonStyles('secondary')}>
          {submit}
        </button>
      </div>
    </form>
  );
}
