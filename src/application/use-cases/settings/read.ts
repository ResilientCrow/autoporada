import { defineUseCase, ok, readSetting } from '@/application/core';
import { bodyWire, settingsReadInput, settingsReadOutput } from '@/contracts';

/**
 * Every setting with the version a save names, for the headmaster's settings screen: the stored
 * value, or the default of the registry at version 0 when nothing is stored (ADR 0032).
 */
export const readSettings = defineUseCase({
  name: 'settings.read',
  mode: 'read',
  input: settingsReadInput,
  output: settingsReadOutput,
  access: { kind: 'gate', check: () => ({ action: 'settings.manage' }) },
  async execute({ tx }) {
    const annex1 = await readSetting(tx, 'texts.annex1');
    return ok({
      deadline: await readSetting(tx, 'deadline'),
      reminders: await readSetting(tx, 'reminders'),
      'texts.annex1': {
        value: { ...annex1.value, intro: bodyWire(annex1.value.intro) },
        version: annex1.version,
      },
    });
  },
});
