'use client';

import type { ProposalKind } from '@/domain/report';
import { points } from '@/ui/copy';
import type { FormSpec } from '@/ui/form';

import { proposalInput } from './inputs';
import { StartChooser, type CreatePointAction } from './StartChooser';

const SPEC: FormSpec = { kind: { label: points.proposal.legend, required: true } };

/**
 * /navrhy/novy: the heading and the kind of proposal to start, finance or pokyn, named as the
 * point's header names it. The first kind is checked, since the draft cannot change its kind
 * afterwards and a press must name one.
 */
export function ProposalChooser({
  kinds,
  createPoint,
}: {
  readonly kinds: readonly ProposalKind[];
  readonly createPoint: CreatePointAction;
}) {
  return (
    <StartChooser
      heading={points.proposal.title}
      formId="novy-navrh"
      spec={SPEC}
      field="kind"
      options={kinds.map((kind) => ({ value: kind, label: points.kind[kind] }))}
      {...(kinds[0] !== undefined && { defaultValue: kinds[0] })}
      toInput={proposalInput}
      createPoint={createPoint}
    />
  );
}
