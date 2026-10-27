import type { TitleGender } from '@/domain/cs';
import type { RecentPerson } from '@/domain/people';
import type { BulletSpec, PointKind } from '@/domain/report';
import type { PointState } from '@/domain/review';
import type { CalDate } from '@/domain/time';
import { points } from '@/ui/copy';
import type { Directory } from '@/ui/form';

import { editorKey } from './editor-key';
import type { PointContentWire } from './fields';
import { PointEditor, type PointStatusAction, type SavePointAction } from './PointEditor';
import { PointFacts, type PointFactsView } from './PointFacts';
import { PointHeader } from './PointHeader';

/** What /body/[id] hands the screen: the header and read view values, and the editor's start when it shows. */
export interface PointScreenModel {
  readonly id: string;
  readonly kind: PointKind;
  readonly state: PointState;
  readonly title: string;
  readonly typeName: string | null;
  readonly facts: PointFactsView;
  readonly editor: PointEditorModel | null;
}

/** What the editor starts from: the saved content, the type's bullets and title gender, today and the author's recent people. */
interface PointEditorModel {
  readonly version: number;
  readonly content: PointContentWire;
  readonly spec: readonly BulletSpec[];
  readonly titleGender: TitleGender | null;
  readonly today: CalDate;
  readonly recents: readonly RecentPerson[];
  readonly directory: Directory;
}

/**
 * A point's page below the shell: its header, then the report editor for the author of a
 * draft or returned report, or the read view for everyone else, every other state and
 * every other kind.
 */
export function PointScreen({
  point,
  savePoint,
  pointStatus,
}: {
  readonly point: PointScreenModel;
  readonly savePoint: SavePointAction;
  readonly pointStatus: PointStatusAction;
}) {
  // Proposals get their own fields with M8b; until then only a report is edited here.
  const editor = point.kind === 'report' ? point.editor : null;
  return (
    <div className="space-y-4">
      <PointHeader
        kind={point.kind}
        state={point.state}
        title={point.title}
        typeName={point.typeName}
      />
      {editor === null ? (
        <PointFacts facts={point.facts} />
      ) : (
        <PointEditor
          key={editorKey({ id: point.id, version: editor.version })}
          id={point.id}
          typeLabel={point.typeName ?? points.kind[point.kind]}
          version={editor.version}
          content={editor.content}
          spec={editor.spec}
          titleGender={editor.titleGender}
          today={editor.today}
          recents={editor.recents}
          directory={editor.directory}
          savePoint={savePoint}
          pointStatus={pointStatus}
        />
      )}
    </div>
  );
}
