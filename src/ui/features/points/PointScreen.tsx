import type { TitleGender } from '@/domain/cs';
import type { RecentPerson } from '@/domain/people';
import type { BulletSpec, PointKind } from '@/domain/report';
import type { AuthorMove, PointState } from '@/domain/review';
import type { CalDate } from '@/domain/time';
import { points } from '@/ui/copy';
import type { Directory } from '@/ui/form';

import { editorKey } from './editor-key';
import type { PointContentWire } from './fields';
import { PointEditor, type PointStatusAction, type SavePointAction } from './PointEditor';
import { PointFacts, type PointFactsView } from './PointFacts';
import { PointHeader } from './PointHeader';
import { PointReadContent } from './PointReadContent';
import { PointTransitions } from './PointTransitions';
import { placementYear, standingOf, type StandingInput } from './standing';
import { StandingLine } from './StandingLine';
import { Timeline, type TimelineEntry } from './Timeline';
import type { RetractPointAction, WithdrawPointAction } from './transition-call';
import type { SubmitPointAction } from './use-submit';

/** What /body/[id] hands the screen: the header and read view values, and the editor's start when it shows. */
export interface PointScreenModel {
  readonly id: string;
  readonly kind: PointKind;
  readonly state: PointState;
  /** The version the page shows: what the move forms send. */
  readonly version: number;
  /** Where the point goes and when that closes, for the author of a draft or returned point. */
  readonly standing: StandingInput | null;
  /** The author's buttons from this state, as the server worked them out (none for anyone else). */
  readonly moves: readonly AuthorMove[];
  readonly title: string;
  readonly typeName: string | null;
  readonly facts: PointFactsView;
  /** What the read view prints below the facts: the content as the document sets it, and the point's history. */
  readonly read: {
    /** Null where the editor shows: it holds the content. */
    readonly content: PointContentWire | null;
    /** The school year the paper's {skolniRok} is. */
    readonly schoolYear: string;
    /** Newest first. */
    readonly timeline: readonly TimelineEntry[];
  };
  readonly editor: PointEditorModel | null;
}

/** What the editor starts from: the saved content, the type's bullets and title gender, today, today's school year (the one the submit checks classes against) and the author's recent people. */
interface PointEditorModel {
  readonly version: number;
  readonly content: PointContentWire;
  readonly spec: readonly BulletSpec[];
  readonly titleGender: TitleGender | null;
  readonly today: CalDate;
  readonly readinessSchoolYear: string;
  readonly recents: readonly RecentPerson[];
  readonly directory: Directory;
}

/**
 * A point's page below the shell: its header, then the report editor for the author of a
 * draft or returned report, or the read view for everyone else, every other state and
 * every other kind; the point's history is below either.
 */
export function PointScreen({
  point,
  savePoint,
  submitPoint,
  pointStatus,
  retractPoint,
  withdrawPoint,
}: {
  readonly point: PointScreenModel;
  readonly savePoint: SavePointAction;
  readonly submitPoint: SubmitPointAction;
  readonly pointStatus: PointStatusAction;
  readonly retractPoint: RetractPointAction;
  readonly withdrawPoint: WithdrawPointAction;
}) {
  // Proposals get their own fields with M8b; until then only a report is edited here.
  const editor = point.kind === 'report' ? point.editor : null;
  const moves = { events: point.moves, retractPoint, withdrawPoint };
  const standing = point.standing && standingOf(point.standing);
  return (
    <div className="space-y-4">
      <PointHeader
        kind={point.kind}
        state={point.state}
        title={point.title}
        typeName={point.typeName}
      />
      {editor === null ? (
        <>
          {/* The editor shows it with its submit button. */}
          {point.standing === null ? null : <StandingLine standing={point.standing} />}
          <PointFacts facts={point.facts} />
          {point.read.content === null ? null : (
            <PointReadContent
              kind={point.kind}
              content={point.read.content}
              schoolYear={point.read.schoolYear}
            />
          )}
          <PointTransitions id={point.id} version={point.version} moves={moves} />
        </>
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
          readinessSchoolYear={editor.readinessSchoolYear}
          previewSchoolYear={placementYear(standing, editor.readinessSchoolYear)}
          standing={point.standing}
          moves={moves}
          recents={editor.recents}
          directory={editor.directory}
          savePoint={savePoint}
          submitPoint={submitPoint}
          pointStatus={pointStatus}
        />
      )}
      <Timeline entries={point.read.timeline} />
    </div>
  );
}
