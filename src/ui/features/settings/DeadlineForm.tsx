'use client';

import { useState } from 'react';
import type { z } from 'zod';

import type { ServerAction, settingsSaveInput, settingsSaveOutput } from '@/contracts';
import { formatTime } from '@/domain/cs';
import { parseWallTime } from '@/domain/time';
import { settings } from '@/ui/copy';
import { Form, SelectField, SubmitButton, useActionForm, type FormSpec } from '@/ui/form';

import { deadlineInput, differsFromSaved, exampleOf, QUARTER_HOURS } from './inputs';

export type SaveAction = ServerAction<
  z.input<typeof settingsSaveInput>,
  z.output<typeof settingsSaveOutput>
>;

/** What saving a new rule leaves alone, written out: the porada shown now, its deadline, and where the rule starts. */
export interface DeadlineEffect {
  readonly keep: string;
  readonly day: string;
  readonly time: string;
  readonly from: string;
}

const { deadline } = settings;

const SPEC: FormSpec = {
  'value.dayOffset': { label: deadline.days.label },
  'value.time': { label: deadline.time.label },
};

const DAY_OPTIONS = ([1, 2, 3, 4] as const).map((n) => ({
  value: String(n),
  label: deadline.dayOptions[n],
}));
const TIME_OPTIONS = QUARTER_HOURS.map((time) => ({
  value: time,
  label: deadline.timeOption(formatTime(parseWallTime(time))),
}));

/** The deadline rule, the example it gives for a Monday porada and what saving it leaves alone. */
export function DeadlineForm({
  action,
  rule,
  version,
  effect,
  onSaved,
}: {
  readonly action: SaveAction;
  readonly rule: { readonly dayOffset: number; readonly time: string };
  readonly version: number;
  readonly effect: DeadlineEffect;
  readonly onSaved: () => void;
}) {
  const [days, setDays] = useState(String(-rule.dayOffset));
  const [time, setTime] = useState(rule.time);
  const state = useActionForm({
    action,
    toInput: (data) => deadlineInput(version, data),
    onSuccess: onSaved,
  });
  const example = exampleOf(Number(days), time);
  return (
    <Form id="uzaverka" spec={SPEC} state={state}>
      <p>{deadline.intro}</p>
      <SelectField name="value.dayOffset" options={DAY_OPTIONS} value={days} onChange={setDays} />
      <SelectField name="value.time" options={TIME_OPTIONS} value={time} onChange={setTime} />
      <p>{deadline.example(example.day, example.time)}</p>
      {differsFromSaved(rule, days, time) && (
        <p>{deadline.effect(effect.keep, effect.day, effect.time, effect.from)}</p>
      )}
      <SubmitButton>{settings.save}</SubmitButton>
    </Form>
  );
}
