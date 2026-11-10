// Uses an existing Playwright installation. All traffic intercepted, no real submissions.
// PLAYWRIGHT_MODULE=/path/to/playwright BROWSER=webkit node tests/mobile-entry.cjs
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const paths = ['artist-label', 'remixer', 'producer-dj-waitlist'];
const choice = (page, audience) => page.locator(audience === paths[2] ? '#waitlistLink' : `[data-path="${audience}"]`);
(async () => {
  const browser = await engine.launch();
  try {
    for (const [width, height, touch] of [[320, 480, true], [390, 500, true], [440, 540, true], [844, 390, true], [640, 900, false], [641, 900, false], [768, 1024, true], [1440, 900, false]]) {
      for (const reducedMotion of ['reduce', 'no-preference']) {
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, reducedMotion });
        const page = await context.newPage();
        const errors = [], posts = [];
        page.on('pageerror', e => errors.push(e.message));
        await context.route('**/*', route => {
          const req = route.request();
          if (req.method() !== 'GET') { posts.push(req.method()); return route.abort(); }
          const name = new URL(req.url()).pathname.match(/^\/assets\/fonts\/([a-z0-9-]+\.ttf)$/)?.[1];
          if (name) return route.fulfill({ contentType: 'font/ttf', body: fs.readFileSync(path.join(root, 'assets/fonts', name)) });
          return req.isNavigationRequest() ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort();
        });
        await page.goto('http://soundr.test/');
        await page.evaluate(() => document.fonts.ready);
        const mobile = width <= 640 || touch;
        const tab = process.env.BROWSER === 'webkit' ? 'Alt+Tab' : 'Tab';
        for (const audience of paths) {
          await choice(page, audience).click();
          assert.equal(await page.evaluate(() => document.activeElement.id), mobile ? 'audienceDescription' : 'accessEmail', `${width} touch=${touch}: entry focus`);
          if (mobile) {
            assert(await page.locator('#audienceDescription').evaluate(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom < innerHeight; }), 'Introduction visible');
            assert(await page.locator('#contactFields h2').evaluate(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom < innerHeight; }), 'Heading visible');
            await page.keyboard.press(tab);
            assert.equal(await page.evaluate(() => document.activeElement.id), 'accessEmail');
          }
          assert.deepEqual(await page.locator('#contactFields input').evaluateAll(es => es.map(e => [e.name, e.required, parseFloat(getComputedStyle(e).fontSize)])), [['email', true, mobile ? 16 : 14], ['name', false, mobile ? 16 : 14], ['artist-name', false, mobile ? 16 : 14]]);
          await page.locator('#accessEmail').focus();
          assert.equal(await page.evaluate(() => document.activeElement.id), 'accessEmail');
          await page.keyboard.press(tab);
          assert.equal(await page.evaluate(() => document.activeElement.id), 'accessName');
          await page.keyboard.press(tab);
          assert.equal(await page.evaluate(() => document.activeElement.id), 'artistName');
          await page.keyboard.press(tab);
          assert.equal(await page.evaluate(() => document.activeElement.id), 'accessSubmit');
          await page.locator('#accessSubmit').scrollIntoViewIfNeeded();
          await page.waitForFunction(() => { const e = document.querySelector('#accessSubmit'); const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && e === document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); });
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
          if (process.env.EVIDENCE_DIR && audience === paths[0] && reducedMotion === 'reduce' && [390, 1440].includes(width)) {
            fs.mkdirSync(process.env.EVIDENCE_DIR, { recursive: true });
            const shot = suffix => page.screenshot({ path: path.join(process.env.EVIDENCE_DIR, `${process.env.BROWSER || 'chromium'}-${width}-${suffix}.png`) });
            await shot('lower');
            await page.locator('#accessEmail').focus();
            await shot('focused');
            await choice(page, audience).click();
            await shot('entry');
          }
          await page.locator('#accessEmail').fill('reset@example.com');
          await page.locator('#backToChoices').click();
          assert.equal(await choice(page, audience).evaluate(e => document.activeElement === e), true);
          assert.equal(await page.locator('#contactFields').isVisible(), false);
          assert.equal(await page.locator('#accessEmail').inputValue(), '');
          assert.equal(await page.locator('#intakePath').inputValue(), '');
        }
        assert.deepEqual(errors, []);
        assert.deepEqual(posts, []);
        await context.close();
        console.log(`PASS ${width}x${height} touch=${touch} motion=${reducedMotion}: all paths, intro/focus, fonts, tab order, scroll/hit-test, reset`);
      }
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
