import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NAV } from '@/ui/shell/nav';

describe('navigation', () => {
  it.each(NAV.map((item) => item.href))('%s has a page', (href) => {
    const dir = href === '/' ? '' : href;
    expect(existsSync(join(process.cwd(), 'src/app', dir, 'page.tsx'))).toBe(true);
  });
});
