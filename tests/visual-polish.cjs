// Focused rendered checks for the final background, footer and confirmation polish.
// All requests are fulfilled locally; no submissions leave this test.
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const output = process.env.EVIDENCE_DIR;
(async () => {
  const browser = await (process.env.BROWSER === 'webkit' ? webkit : chromium).launch();
  try {
    for (const width of [320, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      let posts = 0;
      await context.route('**/*', route => {
        const req = route.request();
        if (req.method() !== 'GET') { posts++; return route.abort(); }
        const url = new URL(req.url());
        if (req.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: html });
        if (/^\/assets\/fonts\/[a-z0-9-]+\.ttf$/.test(url.pathname)) return route.fulfill({ contentType: 'font/ttf', body: fs.readFileSync(path.join(root, url.pathname)) });
        return route.abort();
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('https://soundr.test/');
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('.bg svg circle').count(), 4, 'Only four grey background circles remain');
      assert.equal(await page.locator('.bg svg path').count(), 6, 'Background paths are preserved');
      for (const circle of await page.locator('.bg svg circle').all()) {
        assert.match(await circle.getAttribute('fill'), /^rgba\(242,237,228,/);
        assert.equal(await circle.getAttribute('stroke'), null);
      }
      assert.equal(await page.locator('.top .mark svg circle').count(), 1, 'Logo remains intact');
      assert.equal(await page.locator('.foot a').count(), 0);
      assert.equal(await page.locator('.support a[href="mailto:support@soundr.app"]').count(), 1);
      const footer = await page.locator('.foot').boundingBox();
      const copyright = await page.locator('.foot span').boundingBox();
      assert(Math.abs(copyright.x + copyright.width / 2 - footer.x - footer.width / 2) < 1, 'Footer copyright centered');
      if (output) { fs.mkdirSync(output, { recursive: true }); await page.screenshot({ path: path.join(output, `landing-${width}.png`), fullPage: true, animations: 'disabled' }); }
      for (const door of ['artist', 'label', 'remixer', 'producer-dj-waitlist']) {
        await page.locator(`.card [data-path="${door}"]`).click();
        await page.locator('#accessEmail').fill('preview@example.com');
        await page.locator('#firstName').fill('Preview');
        await page.locator('#lastName').fill('Review');
        if (door === 'label') await page.locator('#labelName').fill('Preview Label');
        await page.locator('#accessSubmit').click();
        await page.locator('#confirmation').waitFor({ state: 'visible' });
        const center = await page.locator('#confirmation').evaluate(e => { const r = e.getBoundingClientRect(); return r.x + r.width / 2; });
        for (const selector of ['.check', '#confirmationMessage', '#confirmationSub']) {
          const box = await page.locator(selector).boundingBox();
          assert(Math.abs(box.x + box.width / 2 - center) < 1, `${selector} centered at ${width}`);
        }
        assert.equal(await page.locator('#confirmation').evaluate(e => getComputedStyle(e).textAlign), 'center');
        assert(await page.locator('#startAgain').isVisible());
        if (output && door === 'label') await page.screenshot({ path: path.join(output, `thanks-${width}.png`), fullPage: true, animations: 'disabled' });
        await page.locator('#startAgain').click();
        await page.locator('#sheet').waitFor({ state: 'hidden' });
      }
      assert.equal(posts, 0);
      assert.deepEqual(errors, []);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      console.log(`PASS ${width}px: grey dots/lines/logo preserved, copyright centered, all four confirmations centered, zero POSTs/errors`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
