import { defineUseCase, fail, ok } from '@/application/core';
import { settingsSaveInput, settingsSaveOutput } from '@/contracts';

/**
 * The headmaster saves one setting under the version the form read (0: no row yet). A save from a
 * stale form is refused as a conflict, whoever got there first. The audit event names the key and
 * never the value: the annex texts are text a person wrote (ADR 0032).
 */
export const saveSettings = defineUseCase({
  name: 'settings.save',
  mode: 'write',
  input: settingsSaveInput,
  output: settingsSaveOutput,
  access: { kind: 'gate', check: () => ({ action: 'settings.manage' }) },
  async execute({ tx }, input) {
    const version = await tx.settings.save(input.key, input.value, input.version);
    if (version === null) return fail({ code: 'conflict' });
    await tx.audit.record({ action: 'settings.saved', target: null, meta: { key: input.key } });
    return ok({ version });
  },
});
