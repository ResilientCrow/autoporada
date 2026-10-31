'use client';

import { useState } from 'react';

import type { RichDoc } from '@/domain/richtext';
import { settings } from '@/ui/copy';
import { LiveStatus } from '@/ui/form';
import { ArrowLink, Card, SlantLabel } from '@/ui/kit';

import { AnnexForm } from './AnnexForm';
import { DeadlineForm, type DeadlineEffect, type SaveAction } from './DeadlineForm';
import { RemindersForm } from './RemindersForm';

/** The page's model: each setting with the version its form names, and the deadline's effect. */
export interface SettingsView {
  readonly deadline: {
    readonly rule: { readonly dayOffset: number; readonly time: string };
    readonly version: number;
  };
  readonly reminders: {
    readonly value: { readonly soft: boolean; readonly hard: boolean };
    readonly version: number;
  };
  readonly annex1: {
    readonly value: { readonly heading: string; readonly intro: RichDoc };
    readonly version: number;
  };
  readonly effect: DeadlineEffect;
}

/**
 * The host of „Nastavení“: three forms, each with its own „Uložit“ and its own version. Each form
 * is keyed by its version, so the refresh after a save starts it again from the saved values.
 */
export function Settings({
  view,
  saveSettings,
}: {
  readonly view: SettingsView;
  readonly saveSettings: SaveAction;
}) {
  const [said, setSaid] = useState({ message: '', count: 0 });
  const saved = () => setSaid((s) => ({ message: settings.said.changed, count: s.count + 1 }));
  return (
    <>
      <SlantLabel level={1}>{settings.title}</SlantLabel>
      <div className="mt-4 space-y-8">
        <LiveStatus message={said.message} count={said.count} />
        <Card level={2} title={settings.deadline.title}>
          <DeadlineForm
            key={`deadline-${view.deadline.version}`}
            action={saveSettings}
            rule={view.deadline.rule}
            version={view.deadline.version}
            effect={view.effect}
            onSaved={saved}
          />
        </Card>
        <Card level={2} title={settings.reminders.title}>
          <RemindersForm
            key={`reminders-${view.reminders.version}`}
            action={saveSettings}
            value={view.reminders.value}
            version={view.reminders.version}
            onSaved={saved}
          />
        </Card>
        <Card level={2} title={settings.annex1.title}>
          <AnnexForm
            key={`annex1-${view.annex1.version}`}
            action={saveSettings}
            value={view.annex1.value}
            version={view.annex1.version}
            onSaved={saved}
          />
        </Card>
        <p>
          <ArrowLink href="/nastaveni/typy-bodu">{settings.typesLink}</ArrowLink>
        </p>
      </div>
    </>
  );
}
