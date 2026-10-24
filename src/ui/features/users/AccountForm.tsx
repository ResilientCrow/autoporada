'use client';

import type { UserStatus } from '@/domain/actor';
import { users } from '@/ui/copy';
import { CheckboxField, Form, SubmitButton, useActionForm, type FormSpec } from '@/ui/form';

import { accountInput } from './inputs';
import type { ChangeAccessAction, RoleFormUser } from './RoleForm';

const { accountStatus: copy } = users.detail;

const SPEC: FormSpec = {
  confirmed: { label: copy.confirm, required: true, messages: { required: copy.unconfirmed } },
};

/** The status the single button leads to, and its label: blocking is the only one that needs a tick. */
const NEXT: Readonly<Record<UserStatus, { status: UserStatus; label: string }>> = {
  active: { status: 'blocked', label: copy.block },
  blocked: { status: 'active', label: copy.unblock },
  deactivated: { status: 'active', label: copy.restore },
};

/**
 * „Stav účtu“: one action. An active account is blocked behind a confirmation
 * (it lowers access); a blocked one is unblocked and a deactivated one restored,
 * both without (they raise it). A deactivated account is never offered.
 */
export function AccountForm({
  action,
  user,
  onSaved,
}: {
  readonly action: ChangeAccessAction;
  readonly user: RoleFormUser;
  readonly onSaved: (changed: boolean) => void;
}) {
  const next = NEXT[user.status];
  const state = useActionForm({
    action,
    toInput: (data) => accountInput(user, next.status, data),
    onSuccess: (value) => onSaved(value.changed),
  });
  return (
    <Form id="ucet" spec={user.status === 'active' ? SPEC : {}} state={state}>
      {user.status === 'active' && (
        <div className="space-y-3 border-t-2 border-ink pt-4">
          <p>{copy.blockText}</p>
          <CheckboxField name="confirmed" />
        </div>
      )}
      <SubmitButton variant={user.status === 'active' ? 'secondary' : 'primary'}>
        {next.label}
      </SubmitButton>
    </Form>
  );
}
