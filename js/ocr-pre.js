/* ============================================================================
   OCR preprocessing — pure functions on ImageData-like objects
   ({ data: RGBA bytes, width, height }). No platform APIs, so the exact same
   code runs in the browser (fed from a <canvas>) and in Node (lab / tests).
   Pipeline: crop to the card → resize into the size band Tesseract likes →
   grayscale + percentile contrast stretch → optional Otsu binarization.
   ========================================================================== */

export function cloneImage(img) {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
}

/** Luminance array (internal). */
function grayOf(img) {
  const g = new Uint8Array(img.width * img.height);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    g[i] = (img.data[p] * 299 + img.data[p + 1] * 587 + img.data[p + 2] * 114) / 1000 | 0;
  }
  return g;
}

/**
 * Crop to the card: estimates the background colour from the image border,
 * then keeps the bounding box of pixels that differ from it. Conservative —
 * returns the original image when the result looks unsafe.
 */
export function autoCropCard(img, opts = {}) {
  const minArea = (opts.minArea ?? 0.10) * img.width * img.height;
  const maxArea = (opts.maxArea ?? 0.98) * img.width * img.height;
  const diffThreshold = opts.diff ?? 30;
  const { width: w, height: h, data } = img;

  // Background = per-channel median of border pixels.
  const rs = [], gs = [], bs = [];
  const step = Math.max(1, ((w + h) / 128) | 0);
  const sample = (x, y) => {
    const p = (y * w + x) * 4;
    rs.push(data[p]); gs.push(data[p + 1]); bs.push(data[p + 2]);
  };
  for (let x = 0; x < w; x += step) { sample(x, 0); sample(x, h - 1); }
  for (let y = 0; y < h; y += step) { sample(0, y); sample(w - 1, y); }
  const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
  const br = med(rs), bg = med(gs), bb = med(bs);

  const mark = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < mark.length; i++, p += 4) {
    const d = Math.max(
      Math.abs(data[p] - br), Math.abs(data[p + 1] - bg), Math.abs(data[p + 2] - bb)
    );
    if (d > diffThreshold) mark[i] = 1;
  }

  // A row/col counts as "active" when it has enough marked pixels to ignore
  // stray noise (hands, shadows, background texture).
  const rowMin = Math.max(2, (w * 0.01) | 0);
  const colMin = Math.max(2, (h * 0.01) | 0);
  let top = -1, bottom = -1;
  for (let y = 0; y < h; y++) {
    let c = 0;
    for (let x = 0; x < w; x++) c += mark[y * w + x];
    if (c >= rowMin) { if (top === -1) top = y; bottom = y; }
  }
  if (top === -1) return img;
  let left = -1, right = -1;
  for (let x = 0; x < w; x++) {
    let c = 0;
    for (let y = 0; y < h; y++) c += mark[y * w + x];
    if (c >= colMin) { if (left === -1) left = x; right = x; }
  }
  if (left === -1) return img;

  const mx = Math.round((right - left) * 0.015);
  const my = Math.round((bottom - top) * 0.015);
  left = Math.max(0, left - mx); top = Math.max(0, top - my);
  right = Math.min(w - 1, right + mx); bottom = Math.min(h - 1, bottom + my);
  const cw = right - left + 1, ch = bottom - top + 1;
  if (cw * ch < minArea || cw * ch > maxArea) return img;
  if (cw < 100 || ch < 60) return img;

  const out = { width: cw, height: ch, data: new Uint8ClampedArray(cw * ch * 4) };
  for (let y = 0; y < ch; y++) {
    const so = ((top + y) * w + left) * 4;
    out.data.set(data.subarray(so, so + cw * 4), y * cw * 4);
  }
  return out;
}

/** Percentile contrast stretch (grayscale). Writes grayscale RGB back. */
export function contrastStretch(img, loPct = 1, hiPct = 99) {
  const g = grayOf(img);
  const hist = new Uint32Array(256);
  for (let i = 0; i < g.length; i++) hist[g[i]]++;
  const total = g.length;
  const loN = total * loPct / 100, hiN = total * hiPct / 100;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= loN) { lo = v; break; } }
  acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= hiN) { hi = v; break; } }
  if (hi - lo < 16) return img; // flat image — don't destroy it
  const scale = 255 / (hi - lo);
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.max(0, Math.min(255, ((v - lo) * scale) | 0));
  const d = img.data;
  for (let p = 0; p < d.length; p += 4) {
    const v = lut[(d[p] * 299 + d[p + 1] * 587 + d[p + 2] * 114) / 1000 | 0];
    d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255;
  }
  return img;
}

/** Otsu global threshold → pure black/white. */
export function otsuBinarize(img) {
  const g = grayOf(img);
  const hist = new Uint32Array(256);
  for (let i = 0; i < g.length; i++) hist[g[i]]++;
  const total = g.length;
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * hist[v];
  let sumB = 0, wB = 0, best = 0, thr = 127;
  for (let v = 0; v < 256; v++) {
    wB += hist[v]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += v * hist[v];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = v; }
  }
  const d = img.data;
  for (let p = 0; p < d.length; p += 4) {
    const v = ((d[p] * 299 + d[p + 1] * 587 + d[p + 2] * 114) / 1000 | 0) > thr ? 255 : 0;
    d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255;
  }
  return img;
}

/** Bilinear resize to the given width. */
export function resize(img, targetW) {
  if (Math.abs(img.width - targetW) < 8) return img;
  const targetH = Math.max(1, Math.round(img.height * targetW / img.width));
  const out = { width: targetW, height: targetH, data: new Uint8ClampedArray(targetW * targetH * 4) };
  const sx = img.width / targetW, sy = img.height / targetH;
  for (let y = 0; y < targetH; y++) {
    const fy = Math.min(img.height - 1, y * sy);
    const y0 = fy | 0, y1 = Math.min(img.height - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < targetW; x++) {
      const fx = Math.min(img.width - 1, x * sx);
      const x0 = fx | 0, x1 = Math.min(img.width - 1, x0 + 1), wx = fx - x0;
      const p00 = (y0 * img.width + x0) * 4, p01 = (y0 * img.width + x1) * 4;
      const p10 = (y1 * img.width + x0) * 4, p11 = (y1 * img.width + x1) * 4;
      const o = (y * targetW + x) * 4;
      for (let c = 0; c < 3; c++) {
        const t = img.data[p00 + c] * (1 - wx) + img.data[p01 + c] * wx;
        const b = img.data[p10 + c] * (1 - wx) + img.data[p11 + c] * wx;
        out.data[o + c] = t * (1 - wy) + b * wy;
      }
      out.data[o + 3] = 255;
    }
  }
  return out;
}

/**
 * Full pipeline used before OCR.
 * @param {{data,width,height}} img  RGBA image
 * @param {{crop?:boolean,minWidth?:number,maxWidth?:number,binarize?:boolean}} opts
 */
export function preprocessForOcr(img, opts = {}) {
  let out = cloneImage(img);
  if (opts.crop !== false) out = autoCropCard(out);
  const minW = opts.minWidth ?? 1500;
  const maxW = opts.maxWidth ?? 2200;
  if (out.width < minW) out = resize(out, minW);
  else if (out.width > maxW) out = resize(out, maxW);
  contrastStretch(out);
  if (opts.binarize) otsuBinarize(out);
  return out;
}
