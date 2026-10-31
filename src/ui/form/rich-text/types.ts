import type { RichDoc, RichProfile } from '@/domain/richtext';

/** What the toolbar and the level announcer follow: the marks and indent at the caret. */
export interface CaretState {
  readonly bold: boolean;
  readonly italic: boolean;
  /** 0 is a plain paragraph. */
  readonly level: number;
}

/** What the page tells the editor about its element; changes with the form's error. */
export interface EditorAttributes {
  readonly id: string;
  readonly labelledBy: string;
  readonly describedBy: string | undefined;
}

export interface CreateEditorOptions {
  /** An empty element React never fills (ADR 0031, item 3). */
  readonly element: HTMLElement;
  readonly profile: RichProfile;
  readonly doc: RichDoc;
  readonly placeholder: string;
  readonly attributes: EditorAttributes;
  readonly onDoc: (doc: RichDoc) => void;
  readonly onCaret: (state: CaretState) => void;
}

/** The editor as the hook holds it; the TipTap objects stay inside the lazy chunk. */
export interface RichEditorControl {
  toggleBold(): void;
  toggleItalic(): void;
  /** One level deeper (1) or back (-1), for every paragraph of the selection. */
  shiftIndent(delta: 1 | -1): void;
  setAttributes(attributes: EditorAttributes): void;
  destroy(): void;
}
