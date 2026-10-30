'use server';

import { setReminders as setRemindersUseCase } from '@/application/use-cases';

import { defineAction } from '@/server/bind';

/** „Uložit“ of the reminder box on /profil; one box, so it counts as a submission. */
export const setReminders = defineAction(setRemindersUseCase, { rateLimit: 'submission' });
