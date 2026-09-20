/* ============================================================================
   Unit tests for the OCR preprocessing helpers used by the dual-pass
   recognition (unsharpMask for the sparse pass, otsuBinarize for the block
   pass). Pure functions on {width,height,data}. Run: node test/ocrpre.test.mjs
   ========================================================================== */

import { unsharpMask, otsuBinarize, cloneImage } from '../js/ocr-pre.js';

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ FAIL: ${label}`); }
};

const mk = (w, h, fill) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(fill) });
const px = (img, x, y) => img.data[(y * img.width + x) * 4];

/* ---------- unsharpMask ---------- */
{
  console.log('• unsharpMask');
  const flat = mk(8, 8, 120);
  const zeroed = unsharpMask(flat, 0.5);
  ok(px(zeroed, 3, 3) === 120, 'amount 0 on flat image → unchanged');

  const edge = mk(8, 8, 40);
  for (let y = 0; y < 8; y++) for (let x = 4; x < 8; x++) {
    const p = (y * 8 + x) * 4;
    edge.data[p] = edge.data[p + 1] = edge.data[p + 2] = 220;
  }
  const before = px(edge, 4, 3);
  const sharpened = unsharpMask(edge, 0.5);
  ok(px(sharpened, 4, 3) > before, `bright side of edge gets brighter (${before} → ${px(sharpened, 4, 3)})`);
  ok(px(sharpened, 3, 3) < px(edge, 3, 3), 'dark side of edge gets darker');
  ok(px(edge, 4, 3) === before, 'input image is not mutated');
  ok(sharpened.width === 8 && sharpened.height === 8, 'dimensions preserved');

  const bright = mk(5, 5, 255);
  const sat = unsharpMask(bright, 0.5);
  ok(px(sat, 2, 2) === 255, 'clamped at 255 (no overflow)');
}

/* ---------- otsuBinarize ---------- */
{
  console.log('• otsuBinarize');
  const bimodal = mk(10, 10, 0);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    const p = (y * 10 + x) * 4;
    const v = x < 5 ? 40 : 220;
    bimodal.data[p] = bimodal.data[p + 1] = bimodal.data[p + 2] = v;
  }
  const img = cloneImage(bimodal);
  otsuBinarize(img);
  const darkVal = px(img, 1, 5), brightVal = px(img, 8, 5);
  ok(darkVal === 0 && brightVal === 255, `bimodal image splits to 0/255 (${darkVal}/${brightVal})`);
  ok(px(bimodal, 1, 5) === 40, 'otsuBinarize works on a copy (original untouched here)');
}

/* ---------- cloneImage ---------- */
{
  console.log('• cloneImage');
  const a = mk(4, 4, 90);
  const b = cloneImage(a);
  b.data[0] = 200;
  ok(a.data[0] === 90, 'clone is independent of the original');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
