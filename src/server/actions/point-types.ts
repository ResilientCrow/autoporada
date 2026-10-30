'use server';

import { savePointType as savePointTypeUseCase } from '@/application/use-cases';

import { defineAction } from '@/server/bind';

/**
 * „Uložit“ of a point type on /nastaveni/typy-bodu, a new one or a changed one. It refreshes the
 * page, which lists the types again with their new versions.
 */
export const savePointType = defineAction(savePointTypeUseCase, { rateLimit: 'admin' });
