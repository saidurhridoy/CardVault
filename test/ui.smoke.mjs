/* Optional end-to-end UI smoke test — runs the app in headless Chromium.
   Requires:  npm i -D playwright-core && npx playwright-core install chromium
   Run with:  npm run test:ui                                            */
import { chromium } from 'playwright-core';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname } from 'path';

const log = (m) => console.log(m);
process.on('unhandledRejection', (e) => { console.error('UNHANDLED REJECTION:', e); process.exit(2); });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

/* The test always runs in UNCONFIGURED mode (setup screen + demo mode),
   regardless of the real values in js/config.js — patch it on the fly.  */
const patchConfig = (src) => src
  .replace(/^export const SUPABASE_URL = .*$/m, "export const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';")
  .replace(/^export const SUPABASE_ANON_KEY = .*$/m, "export const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';");

const server = createServer(async (req, res) => {
  try {
    const path = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
    if (path === '/js/config.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      return res.end(patchConfig(await readFile('.' + path, 'utf8')));
    }
    const body = await readFile('.' + path);
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(4173, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // phone size
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

const step = async (name, fn) => {
  try { await fn(); log("✓ " + name); }
  catch (e) { log("✗ " + name + " :: " + e.message.split("\n")[0]); process.exitCode = 1; }
};

await step('loads & shows setup screen (unconfigured)', async () => {
  await page.goto('http://localhost:4173/');
  await page.waitForSelector('.auth-card', { timeout: 5000 });
});

await step('demo mode → main view with empty state', async () => {
  await page.click('[data-action="demo-mode"]');
  await page.waitForSelector('.empty', { timeout: 5000 });
  await page.waitForSelector('.fab');
});

await step('add 3 sample cards → grid renders', async () => {
  await page.click('[data-action="add-samples"]');
  await page.waitForSelector('.tile', { timeout: 5000 });
  const n = await page.locator('.tile').count();
  if (n !== 3) throw new Error(`expected 3 tiles, got ${n}`);
});

await step('search "manager" → 1 result (designation match)', async () => {
  await page.fill('#searchInput', 'manager');
  await page.waitForTimeout(400);
  const n = await page.locator('.tile').count();
  if (n !== 1) throw new Error(`expected 1 tile, got ${n}`);
});

await step('search "foods" → 1 result (company match)', async () => {
  await page.fill('#searchInput', 'foods');
  await page.waitForTimeout(400);
  if (await page.locator('.tile').count() !== 1) throw new Error('company search failed');
});

await step('search phone digits "1811" → 1 result', async () => {
  await page.fill('#searchInput', '1811');
  await page.waitForTimeout(400);
  if (await page.locator('.tile').count() !== 1) throw new Error('phone-digit search failed');
});

await step('clear search → all 3 back; sort by name', async () => {
  await page.click('[data-action="clear-search"]');
  await page.waitForTimeout(300);
  await page.selectOption('#sortSelect', 'name');
  await page.waitForTimeout(200);
  const first = await page.locator('.tile-name').first().textContent();
  if (!/nusrat/i.test(first)) throw new Error('name sort wrong, first=' + first);
});

await step('open detail sheet → fields + actions', async () => {
  await page.click('.tile >> nth=0');
  await page.waitForSelector('.detail-name', { timeout: 3000 });
  const txt = await page.locator('.sheet').innerText();
  for (const want of ['Nusrat Jahan', 'Product Manager', 'Bengal Solutions', 'Call', 'Save contact', 'Share', 'Edit', 'Delete'])
    if (!txt.includes(want)) throw new Error('detail missing: ' + want);
  await page.keyboard.press('Escape');
});

await step('edit card → rename & verify in grid', async () => {
  await page.click('.tile >> nth=0');
  await page.click('[data-action="edit"]');
  await page.fill('#f-name', 'Nusrat Jahan Chowdhury');
  await page.click('#editSave');
  await page.waitForTimeout(600);
  const names = await page.locator('.tile-name').allTextContents();
  if (!names.some(n => n.includes('Chowdhury'))) throw new Error('rename not reflected');
});

await step('delete card with confirm → 2 left', async () => {
  await page.click('.tile >> nth=0');
  await page.click('[data-action="delete"]');
  await page.waitForSelector('[data-x="ok"]', { timeout: 3000 });
  await page.click('[data-x="ok"]');
  await page.waitForTimeout(600);
  if (await page.locator('.tile').count() !== 2) throw new Error('delete failed');
});

await step('manual entry flow (manual button → form → save)', async () => {
  await page.click('.fab');
  await page.waitForSelector('.cam-overlay', { timeout: 3000 });
  await page.click('#camManual');
  await page.waitForSelector('#cardForm', { timeout: 3000 });
  await page.fill('#f-name', 'Test Person');
  await page.fill('#f-company', 'Test Co');
  await page.click('.sheet-head .btn-primary');
  await page.waitForTimeout(600);
  if (await page.locator('.tile').count() !== 3) throw new Error('manual save failed');
});

await step('OCR review flow with sample card upload', async () => {
  await page.click('.fab');
  await page.waitForSelector('.cam-overlay');
  // camera will fail in headless → error box with gallery upload
  await page.setInputFiles('#camFile', 'samples/sample-card.png');
  await page.waitForSelector('#cardForm', { timeout: 5000 });
  // OCR engine needs CDN → wait for either extracted name or the error notice
  await page.waitForFunction(() => {
    const v = document.querySelector('#f-name')?.value || '';
    return v.includes('Nusrat') || !!document.querySelector('.ocr-status svg');
  }, { timeout: 60000 }).catch(() => {});
  const nameVal = await page.inputValue('#f-name');
  const companyVal = await page.inputValue('#f-company');
  const phoneVal = await page.inputValue('#f-phone');
  console.log('   OCR prefill → name:', JSON.stringify(nameVal), '| company:', JSON.stringify(companyVal), '| phone:', JSON.stringify(phoneVal));
  if (!nameVal.includes('Nusrat')) throw new Error('OCR did not prefill the name');
  if (!companyVal.includes('Bengal')) throw new Error('OCR did not prefill the company');
});

await step('discard review is guarded, then force discard', async () => {
  await page.click('.sheet-head [data-action="close-modal"]');
  await page.waitForSelector('[data-x="ok"]', { timeout: 3000 });
  await page.click('[data-x="ok"]');
  await page.waitForTimeout(400);
  if (await page.locator('#cardForm').count() !== 0) throw new Error('review did not close');
});

await step('settings sheet opens & exports', async () => {
  await page.click('[data-action="settings"]');
  await page.waitForSelector('.menu-list', { timeout: 3000 });
  const download = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.click('[data-action="export-vcf"]');
  const d = await download;
  if (!d) throw new Error('no .vcf download fired');
  await page.keyboard.press('Escape');
});

await step('exit demo → back to setup screen (unconfigured)', async () => {
  await page.click('[data-action="settings"]');
  await page.click('.menu-item-danger');
  await page.waitForSelector('.auth-card', { timeout: 3000 }); // unconfigured → setup screen
});

await browser.close();
server.close();
console.log('\npage errors:', errors.length ? errors : 'none 🎉');
