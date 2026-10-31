import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { saveSettings } from '@/server/actions';
import { requireSignedIn, settingsPage } from '@/server/pages';
import { cs, pageTitle } from '@/ui/copy';
import { Settings } from '@/ui/features/settings';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(cs.settings.title) };

/** „Nastavení“: for the headmaster, the deadline rule, the reminders and the annex 1 texts. */
export default async function SettingsPage() {
  const viewer = await requireSignedIn('/nastaveni');
  const model = await settingsPage();
  if (model === null) notFound();
  return (
    <Shell viewer={viewer} current="/nastaveni">
      <Settings
        view={{
          deadline: model.deadline,
          reminders: { value: model.reminders.value, version: model.reminders.version },
          annex1: { value: model.annex1.value, version: model.annex1.version },
          effect: model.effect,
        }}
        saveSettings={saveSettings}
      />
    </Shell>
  );
}
