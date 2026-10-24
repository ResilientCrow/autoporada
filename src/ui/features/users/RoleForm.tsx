'use client';

import { useState } from 'react';
import type { z } from 'zod';

import type { changeUserAccessInput, changeUserAccessOutput, ServerAction } from '@/contracts';
import type { Role, UserStatus } from '@/domain/actor';
import { lowersAccess } from '@/domain/policy';
import { users } from '@/ui/copy';
import {
  CheckboxField,
  Form,
  SelectField,
  SubmitButton,
  useActionForm,
  type FormSpec,
} from '@/ui/form';
import { ROLE_LOOK } from '@/ui/status';

import { roleInput } from './inputs';

export type ChangeAccessAction = ServerAction<
  z.input<typeof changeUserAccessInput>,
  z.output<typeof changeUserAccessOutput>
>;

/** The user as the form needs them: the row it changes and what it started from. */
export interface RoleFormUser {
  readonly id: string;
  readonly version: number;
  readonly role: Role;
  readonly status: UserStatus;
  readonly isStudent: boolean;
}

const { access: copy } = users.detail;

const SPEC: FormSpec = {
  role: { label: copy.roleLabel, required: true },
  audience: { label: copy.audienceLabel, required: true },
  confirmed: { label: copy.confirm, required: true, messages: { required: copy.unconfirmed } },
};

const AUDIENCES = [
  { value: 'staff', label: copy.audience.staff },
  { value: 'student', label: copy.audience.student },
];

/**
 * „Role a typ uživatele“: sends the whole desired state. The confirmation
 * appears when the chosen role lowers access; the server checks it anyway.
 */
export function RoleForm({
  action,
  user,
  roles,
  onSaved,
}: {
  readonly action: ChangeAccessAction;
  readonly user: RoleFormUser;
  readonly roles: readonly Role[];
  readonly onSaved: (changed: boolean) => void;
}) {
  const [chosen, setChosen] = useState<string>(user.role);
  const lowers = lowersAccess(
    { role: user.role, isStudent: user.isStudent, status: user.status },
    {
      role: roles.find((r) => r === chosen) ?? user.role,
      isStudent: user.isStudent,
      status: user.status,
    },
  );
  const state = useActionForm({
    action,
    toInput: (data) => roleInput(user, data),
    onSuccess: (value) => onSaved(value.changed),
  });
  return (
    <Form id="role" spec={SPEC} state={state}>
      <SelectField
        name="role"
        options={roles.map((role) => ({ value: role, label: ROLE_LOOK[role].label }))}
        defaultValue={user.role}
        onChange={setChosen}
      />
      <SelectField
        name="audience"
        options={AUDIENCES}
        defaultValue={user.isStudent ? 'student' : 'staff'}
      />
      {lowers && <CheckboxField name="confirmed" />}
      <SubmitButton>{copy.save}</SubmitButton>
    </Form>
  );
}
