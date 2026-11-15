import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { assertZipSize, declaredSize } from './zipguard';

const load = async (files: Record<string, string | Uint8Array>) => { const z = new JSZip(); for (const [k, v] of Object.entries(files)) z.file(k, v); return JSZip.loadAsync(await z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })); };

describe('zipguard', () => {
  it('knows what an entry will inflate to from the zip directory, without inflating it', async () => {
    const zip = await load({ 'a.txt': 'x'.repeat(5000) });
    const proto = Object.getPrototypeOf(zip.file('a.txt')!) as { async: () => unknown };
    const spy = vi.spyOn(proto, 'async');
    expect(declaredSize(zip, 'a.txt')).toBe(5000);
    expect(declaredSize(zip, 'none')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('refuses an entry over the cap, and a sum over the cap', async () => {
    const zip = await load({ 'a.xml': 'x'.repeat(2000), 'b.xml': 'y'.repeat(2000) });
    expect(() => assertZipSize(zip, { entry: 1999, total: 10_000 })).toThrowError(expect.objectContaining({ code: 'too-big' }));
    expect(() => assertZipSize(zip, { entry: 2000, total: 3999 })).toThrowError(expect.objectContaining({ code: 'too-big' }));
    expect(() => assertZipSize(zip, { entry: 2000, total: 4000 })).not.toThrow();
  });

  it('ignores folders', async () => {
    const z = new JSZip(); z.folder('Pictures'); z.file('Pictures/a.png', 'x');
    const zip = await JSZip.loadAsync(await z.generateAsync({ type: 'uint8array' }));
    expect(() => assertZipSize(zip, { entry: 10, total: 10 })).not.toThrow();
  });
});
