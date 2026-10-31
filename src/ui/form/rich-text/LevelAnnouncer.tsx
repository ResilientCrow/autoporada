'use client';

import { useState } from 'react';

import { richtext } from '@/ui/copy';

/**
 * A polite live region that says „Úroveň 2“ or „Odstavec“ when the caret moves to a paragraph of
 * another level (ADR 0031, item 5), so a screen-reader user hears what Tab did. It says nothing
 * until the level first changes.
 */
export function LevelAnnouncer({ level }: { readonly level: number }) {
  const [seen, setSeen] = useState(level);
  const [said, setSaid] = useState('');
  if (level !== seen) {
    setSeen(level);
    setSaid(level === 0 ? richtext.paragraph : richtext.level(level));
  }
  return (
    <div aria-live="polite" className="sr-only">
      {said}
    </div>
  );
}
