/**
 * Split a wide "start | end" exercise render into two frames, then tightly
 * crop each half to the figure so there's no dead white/grey space around it.
 * The image is same-origin (served by /api/media), so the canvas is never
 * tainted. Each cropped half is re-uploaded and its media url returned.
 */

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("couldn't load the generated image"));
    img.src = url;
  });
}

/** Draw a source rect of an image onto a fresh canvas. */
function halfCanvas(img: HTMLImageElement, sx: number, sw: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, sx, 0, sw, h, 0, 0, sw, h);
  return canvas;
}

/**
 * Trim the flat background around the subject. The background colour is read
 * from the corners; any pixel that differs enough is "content". Returns a new
 * canvas cropped to the content's bounding box plus a small margin. Falls back
 * to the original if nothing distinct is found.
 */
function tightCrop(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = canvas.width, h = canvas.height;
  const cx = canvas.getContext("2d");
  if (!cx) return canvas;
  const { data } = cx.getImageData(0, 0, w, h);
  const at = (x: number, y: number) => { const i = (y * w + x) * 4; return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!] as const; };
  // Background = average of the four corners.
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  const bg = [0, 1, 2].map((k) => Math.round(corners.reduce((s, c) => s + (c[k] ?? 0), 0) / corners.length));
  const THRESH = 38; // colour distance (sum of channel deltas) to count as subject

  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = at(x, y);
      if (a < 12) continue; // transparent → background
      const dist = Math.abs(r - bg[0]!) + Math.abs(g - bg[1]!) + Math.abs(b - bg[2]!);
      if (dist > THRESH) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0 || maxY < 0) return canvas; // all background — leave as-is

  // A little breathing room so the figure isn't flush to the edge.
  const padX = Math.round(w * 0.05), padY = Math.round(h * 0.05);
  const x0 = Math.max(0, minX - padX), y0 = Math.max(0, minY - padY);
  const x1 = Math.min(w, maxX + padX + 1), y1 = Math.min(h, maxY + padY + 1);
  const cw = x1 - x0, ch = y1 - y0;
  if (cw <= 0 || ch <= 0 || (cw >= w * 0.98 && ch >= h * 0.98)) return canvas;

  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  out.getContext("2d")!.drawImage(canvas, x0, y0, cw, ch, 0, 0, cw, ch);
  return out;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/png"));
}

async function uploadBlob(blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("file", new File([blob], "frame.png", { type: "image/png" }));
  fd.append("purpose", "exercise");
  const up = await fetch("/api/media/upload", { method: "POST", credentials: "include", body: fd });
  const { key } = (await up.json()) as { key?: string };
  if (!key) throw new Error("upload failed");
  return `/api/media/${key}`;
}

/** Left half → start frame, right half → end frame, each tightly cropped. */
export async function splitWideImageToHalves(url: string): Promise<{ startUrl: string; endUrl: string }> {
  const img = await loadImg(url);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const half = Math.floor(w / 2);
  const left = tightCrop(halfCanvas(img, 0, half, h));
  const right = tightCrop(halfCanvas(img, half, w - half, h));
  const [startUrl, endUrl] = await Promise.all([toBlob(left).then(uploadBlob), toBlob(right).then(uploadBlob)]);
  return { startUrl, endUrl };
}
