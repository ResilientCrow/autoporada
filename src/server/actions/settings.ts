'use server';

import { saveSettings as saveSettingsUseCase } from '@/application/use-cases';

import { defineAction } from '@/server/bind';

/**
 * „Uložit“ of one of the three forms on /nastaveni, under the version that form read. It refreshes
 * the page, which brings the saved values, their new versions and the deadline's effect again.
 */
export const saveSettings = defineAction(saveSettingsUseCase, { rateLimit: 'admin' });
