import { form } from '@/ui/copy';
import { Notice } from '@/ui/kit';

/** Why a form cannot send without JavaScript; render it once per host. */
export function NoScriptNotice() {
  return (
    <noscript>
      <Notice tone="info" live={false}>
        {form.noscript}
      </Notice>
    </noscript>
  );
}
