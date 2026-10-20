/** A piece of running text: plain, or a link (external links are plain anchors). */
type Segment = string | { readonly text: string; readonly href: string };

/** Text that may carry links. */
export type Rich = string | readonly Segment[];

/** A task for the person who signs the notice off, in neutral words („Ověřit …“). */
export interface Review {
  readonly by: 'dpo' | 'headmaster';
  readonly note: string;
}

export type Block =
  | { readonly kind: 'p'; readonly text: Rich; readonly review?: Review }
  | { readonly kind: 'list'; readonly items: readonly Rich[]; readonly review?: Review }
  | {
      readonly kind: 'facts';
      readonly review?: Review;
      readonly rows: readonly {
        readonly term: string;
        readonly value: Rich;
        readonly review?: Review;
      }[];
    };

export interface Section {
  readonly id: string;
  readonly title: string;
  readonly blocks: readonly Block[];
}

/** The privacy notice as data: the page only renders it, so each line can be reviewed. */
export interface PrivacyCopy {
  readonly approved: boolean;
  /** Shown as „Účinné od …“ once the notice is approved. */
  readonly effectiveFrom: string | null;
  readonly title: string;
  readonly draft: string;
  readonly summaryTitle: string;
  readonly summary: readonly Rich[];
  readonly tocLabel: string;
  readonly reviewLabel: string;
  readonly reviewBy: Readonly<Record<Review['by'], string>>;
  readonly effectiveLabel: string;
  readonly sections: readonly Section[];
}
