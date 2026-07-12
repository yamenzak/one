/**
 * Split a wide "start | end" exercise render into two frames. The image is
 * same-origin (served by /api/media), so the canvas is never tainted. Each
 * half is re-uploaded as its own media asset and its url returned.
 */

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("couldn't load the generated image"));
    img.src = url;
  });
}

function crop(img: HTMLImageElement, sx: number, sw: number, h: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = h;
  const cx = canvas.getContext("2d");
  if (!cx) return Promise.reject(new Error("canvas unavailable"));
  cx.drawImage(img, sx, 0, sw, h, 0, 0, sw, h);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("crop failed"))), "image/png"));
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

/** Left half → start frame, right half → end frame. Returns the two media urls. */
export async function splitWideImageToHalves(url: string): Promise<{ startUrl: string; endUrl: string }> {
  const img = await loadImg(url);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const half = Math.floor(w / 2);
  const [left, right] = await Promise.all([crop(img, 0, half, h), crop(img, half, w - half, h)]);
  const [startUrl, endUrl] = await Promise.all([uploadBlob(left), uploadBlob(right)]);
  return { startUrl, endUrl };
}
