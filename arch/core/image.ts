const MAX_SIDE = 1400;
/** Draws a decoded picture on a white canvas, longest side at most `MAX_SIDE`, and returns it as a JPEG data URL. */
export function shrinkToJpeg(url: string): Promise<{ src: string; w: number; h: number }> {
  return new Promise((ok, no) => {
    const img = new Image();
    img.onerror = () => no(new Error('read'));
    img.onload = () => {
      if (!img.width || !img.height) { no(new Error('read')); return; }
      const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height)); const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
      ok({ src: c.toDataURL('image/jpeg', 0.84), w, h });
    };
    img.src = url;
  });
}
