import { describe, expect, expectTypeOf, it } from 'vitest';

import { ROLES, type Role, type UserStatus } from '@/domain/actor';
import type { AccessState } from '@/domain/review';

import type { accessRequestState, userStatus } from './identity';
import { role } from './identity';

describe('identity enums', () => {
  it('have exactly the values of the domain unions', () => {
    expectTypeOf<(typeof role.enumValues)[number]>().toEqualTypeOf<Role>();
    expectTypeOf<(typeof userStatus.enumValues)[number]>().toEqualTypeOf<UserStatus>();
    expectTypeOf<(typeof accessRequestState.enumValues)[number]>().toEqualTypeOf<AccessState>();
    // Same order as the domain, which ranks roles by privilege.
    expect(role.enumValues).toEqual(ROLES);
  });
});
