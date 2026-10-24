'use server';

import { changeUserAccess as changeUserAccessUseCase } from '@/application/use-cases';

import { defineAction } from '@/server/bind';

/** „Uložit změny“ of role and audience, and the account buttons; the pipeline asks for step-up. */
export const changeUserAccess = defineAction(changeUserAccessUseCase, { rateLimit: 'admin' });
