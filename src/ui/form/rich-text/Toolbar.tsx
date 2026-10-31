'use client';

import type { ReactNode } from 'react';

import { richtext } from '@/ui/copy';
import { buttonStyles } from '@/ui/kit';

import type { CaretState } from './types';

/** The deepest level of the outline profile. */
const DEEPEST = 3;

function ToolButton({
  pressed,
  isDisabled,
  onPress,
  children,
}: {
  /** Set on a toggle: whether the caret is in bold or italic text. */
  readonly pressed?: boolean;
  readonly isDisabled: boolean;
  readonly onPress: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={isDisabled}
      // A press must not take focus from the editor, or the caret and the selection would be lost.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
      className={buttonStyles(pressed === true ? 'primary' : 'secondary')}
    >
      {children}
    </button>
  );
}

/**
 * „Tučně“, „Kurzíva“ and, for the outline profile, „Odsadit“ and „Vrátit odsazení“: the same commands
 * as the keys, for touch users (ADR 0031, item 5). The marks are toggles that say whether the caret
 * is in such text; the indent buttons stop at the first and the deepest level.
 */
export function Toolbar({
  caret,
  ready,
  withLevels,
  onBold,
  onItalic,
  onShift,
}: {
  readonly caret: CaretState;
  readonly ready: boolean;
  readonly withLevels: boolean;
  readonly onBold: () => void;
  readonly onItalic: () => void;
  readonly onShift: (delta: 1 | -1) => void;
}) {
  return (
    <div role="group" aria-label={richtext.toolbar.label} className="flex flex-wrap gap-2">
      <ToolButton pressed={caret.bold} isDisabled={!ready} onPress={onBold}>
        {richtext.toolbar.bold}
      </ToolButton>
      <ToolButton pressed={caret.italic} isDisabled={!ready} onPress={onItalic}>
        {richtext.toolbar.italic}
      </ToolButton>
      {withLevels ? (
        <>
          <ToolButton isDisabled={!ready || caret.level >= DEEPEST} onPress={() => onShift(1)}>
            {richtext.toolbar.indent}
          </ToolButton>
          <ToolButton isDisabled={!ready || caret.level <= 0} onPress={() => onShift(-1)}>
            {richtext.toolbar.outdent}
          </ToolButton>
        </>
      ) : null}
    </div>
  );
}
