import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const d = await b.newPage({ viewport: { width: 1440, height: 700 } });
await d.goto('file:///tmp/wrap/index.html', { waitUntil: 'networkidle' }).catch(()=>{});
await d.waitForTimeout(2600);
await d.evaluate(() => window.scrollTo(0, 1130));
await d.waitForTimeout(400);
const rows = await d.locator('.ml__row').all();
if (rows[1]) { await rows[1].click(); await d.waitForTimeout(700); }
await d.screenshot({ path: '/tmp/s9.png' });
await b.close();
console.log('done');
