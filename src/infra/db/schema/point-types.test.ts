import { expectTypeOf, it } from 'vitest';

import type { TitleGender } from '@/domain/cs';

import type { titleGender } from './point-types';

it('title_gender has exactly the values of the domain union', () => {
  expectTypeOf<(typeof titleGender.enumValues)[number]>().toEqualTypeOf<TitleGender>();
});
