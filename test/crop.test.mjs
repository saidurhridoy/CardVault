/* ============================================================================
   Tests for coverRectToVideo — the screen→sensor mapping that makes the
   camera guide frame actually crop the snapshot (object-fit: cover math).
   All expected values hand-computed. Run: node test/crop.test.mjs
   ========================================================================== */

import { coverRectToVideo } from '../js/util.js';

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ FAIL: ${label}`); }
};
const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;

/* Tall phone 390×780, landscape sensor 1920×1080 (typical Android back cam).
   cover scale = 780/1080 = 0.7222; video is horizontally center-cropped.     */
{
  const guide = { left: 27.3, top: 285.1875, width: 335.4, height: 209.625 }; // min(86%,560) @16:10 centered
  const r = coverRectToVideo(guide, 390, 780, 1920, 1080);
  console.log('• landscape sensor on tall phone');
  ok(near(r.sx, 727.80) && near(r.sy, 394.70) && near(r.sw, 464.48) && near(r.sh, 290.11),
    `maps guide into sensor px — got (${r.sx.toFixed(1)}, ${r.sy.toFixed(1)}, ${r.sw.toFixed(1)}, ${r.sh.toFixed(1)})`);
  ok(r.sx >= 0 && r.sy >= 0 && r.sx + r.sw <= 1920 && r.sy + r.sh <= 1080, 'crop stays inside the frame');
}

/* Portrait sensor 1080×1920 (some front cameras) on the same phone.
   cover scale = 780/1920 = 0.40625; horizontal crop again.                   */
{
  const guide = { left: 27.3, top: 285.1875, width: 335.4, height: 209.625 };
  const r = coverRectToVideo(guide, 390, 780, 1080, 1920);
  console.log('• portrait sensor on tall phone');
  ok(near(r.sx, 127.2) && near(r.sy, 702.0) && near(r.sw, 825.6) && near(r.sh, 515.8),
    `maps guide into sensor px — got (${r.sx.toFixed(1)}, ${r.sy.toFixed(1)}, ${r.sw.toFixed(1)}, ${r.sh.toFixed(1)})`);
  ok(r.sx + r.sw <= 1080 && r.sy + r.sh <= 1920, 'crop stays inside the frame');
}

/* Identity: view exactly the video size → mapping is a no-op. */
{
  const r = coverRectToVideo({ left: 100, top: 100, width: 500, height: 300 }, 1920, 1080, 1920, 1080);
  console.log('• identity (view = video)');
  ok(near(r.sx, 100) && near(r.sy, 100) && near(r.sw, 500) && near(r.sh, 300), 'identity mapping');
}

/* Clamping: rect wildly outside the view must clamp, never go negative or
   overflow. Degenerate results (0 size) signal the caller to fall back.     */
{
  const r = coverRectToVideo({ left: -1000, top: 5000, width: 2000, height: 400 }, 390, 780, 1920, 1080);
  console.log('• clamping');
  ok(r.sx === 0 && r.sw === 1920, `left overflow clamps to full width — got sx=${r.sx}, sw=${r.sw}`);
  ok(r.sy === 1080 && r.sh === 0, `top overflow clamps to zero height (degenerate → fallback) — got sy=${r.sy}, sh=${r.sh}`);
}

/* Square video on wide view: symmetric mapping sanity. */
{
  const r = coverRectToVideo({ left: 200, top: 0, width: 400, height: 400 }, 800, 400, 1000, 1000);
  console.log('• square sensor, wide view');
  ok(near(r.sx, 250) && near(r.sy, 250) && near(r.sw, 500) && near(r.sh, 500), 'centered square maps symmetrically');
}

/* Aspect preserved: crop ratio in sensor px matches the guide ratio. */
{
  const guide = { left: 27.3, top: 285.1875, width: 335.4, height: 209.625 };
  const r = coverRectToVideo(guide, 390, 780, 1920, 1080);
  console.log('• aspect preservation');
  ok(near(r.sw / r.sh, 335.4 / 209.625, 0.01), 'crop keeps the guide aspect ratio');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
