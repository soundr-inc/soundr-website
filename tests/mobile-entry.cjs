// Uses an existing Playwright installation. All traffic intercepted, no real submissions.
// PLAYWRIGHT_MODULE=/path/to/playwright BROWSER=webkit node tests/mobile-entry.cjs
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const paths = ['artist', 'label', 'remixer', 'producer-dj-waitlist'];
const choice = (page, audience) => page.locator(`.card [data-path="${audience}"]`);
if (process.env.EVIDENCE_DIR) fs.mkdirSync(process.env.EVIDENCE_DIR, { recursive: true });
(async () => {
  const browser = await engine.launch();
  const findings = new Set();
  try {
    for (const [width, height, touch] of [[320, 480, true], [390, 844, true], [390, 500, true], [440, 540, true], [844, 390, true], [1440, 900, false]]) {
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
        await page.evaluate(async () => {
          await Promise.all([document.fonts.load('400 17px "Space Grotesk"'), document.fonts.load('400 11px "JetBrains Mono"')]);
          await document.fonts.ready;
        });
        assert(await page.evaluate(() => document.fonts.check('400 17px "Space Grotesk"') && document.fonts.check('400 11px "JetBrains Mono"')));
        const tab = process.env.BROWSER === 'webkit' ? 'Alt+Tab' : 'Tab';
        if (process.env.EVIDENCE_DIR && reducedMotion === 'reduce' && [390, 1440].includes(width)) {
          fs.mkdirSync(process.env.EVIDENCE_DIR, { recursive: true });
          await page.screenshot({ path: path.join(process.env.EVIDENCE_DIR, `${process.env.BROWSER || 'chromium'}-${width}x${height}-landing.png`), fullPage: true });
        }
        for (const audience of paths) {
          await choice(page, audience).click();
          await page.waitForFunction(() => document.querySelector('#sheet').open);
          // The source's desktop focus timer runs after 60ms. Observe actual native entry first.
          const entry = await page.evaluate(() => ({ tag: document.activeElement.tagName, id: document.activeElement.id, className: document.activeElement.className }));
          assert(await page.evaluate(() => document.querySelector('#sheet').contains(document.activeElement)));
          console.log(`OBSERVE ${width}x${height} ${audience} native initial focus=${JSON.stringify(entry)}`);
          if (process.env.EVIDENCE_DIR && reducedMotion === 'reduce') {
            await page.screenshot({ path: path.join(process.env.EVIDENCE_DIR, `${process.env.BROWSER || 'chromium'}-${width}x${height}-${audience}-entry.png`) });
          }
          assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
          const sizes = await page.locator('#accessForm input:visible').evaluateAll(es => es.map(e => [e.name, parseFloat(getComputedStyle(e).fontSize)]));
          if (touch && sizes.some(([, size]) => size < 16)) findings.add('Touch text fields use 15px rather than >=16px; real iPhone focus zoom remains unverified.');
          assert.equal(await page.locator('#firstName').evaluate(e => e.required), true);
          assert.equal(await page.locator('#lastName').evaluate(e => e.required), true);
          // Let the supplied 60ms entry-focus callback settle before testing Tab order.
          // Otherwise its legitimate late focus can race a synthetic immediate Tab.
          await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
          if (width > 720) assert.equal(await page.evaluate(() => document.activeElement.id), 'accessEmail');
          await page.locator('#accessEmail').focus();
          assert.equal(await page.evaluate(() => document.activeElement.id), 'accessEmail');
          await page.keyboard.press(tab);
          assert.equal(await page.evaluate(() => document.activeElement.id), 'firstName');
          await page.keyboard.press(tab);
          assert.equal(await page.evaluate(() => document.activeElement.id), 'lastName');
          for (let i = 0; i < 14; i++) {
            await page.keyboard.press(tab);
            assert(await page.evaluate(() => document.activeElement === document.body || document.querySelector('#sheet').contains(document.activeElement)), 'Native focus trap');
          }
          for (const control of ['#accessEmail', '#firstName', '#lastName', ...(audience === 'label' ? ['#labelName'] : []), '#accessSubmit']) {
            await page.locator(control).scrollIntoViewIfNeeded();
            assert(await page.locator(control).evaluate(e => {
              const r = e.getBoundingClientRect(), s = e.closest('.sheet-in').getBoundingClientRect();
              return r.top >= Math.max(0, s.top) && r.bottom <= Math.min(innerHeight, s.bottom) && e === document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            }), `${width}x${height}: ${control} reachable/hit-test`);
          }
          await page.locator('#accessSubmit').scrollIntoViewIfNeeded();
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
          if (process.env.EVIDENCE_DIR && reducedMotion === 'reduce') {
            fs.mkdirSync(process.env.EVIDENCE_DIR, { recursive: true });
            await page.screenshot({ path: path.join(process.env.EVIDENCE_DIR, `${process.env.BROWSER || 'chromium'}-${width}x${height}-${audience}.png`) });
          }
          for (const next of paths) {
            await page.locator(`.tab[data-path="${next}"]`).click();
            assert.equal(await page.locator('#intakePath').inputValue(), next);
            assert.equal(await page.locator('#audiencePath').inputValue(), next);
            assert.equal(await page.locator('#labelRow').isVisible(), next === 'label');
            assert.equal(await page.locator('#artistField').isVisible(), next !== 'label');
          }
          await page.locator('#accessEmail').fill('reset@example.com');
          await page.locator('#closeSheet').click();
          assert.equal(await choice(page, audience).evaluate(e => document.activeElement === e), true);
          assert.equal(await page.locator('#sheet').isVisible(), false);
          assert.equal(await page.evaluate(() => document.body.style.overflow), '');
          assert.equal(await page.locator('#accessEmail').inputValue(), '');
          await choice(page, audience).click(); await page.keyboard.press('Escape');
          assert.equal(await page.locator('#sheet').isVisible(), false);
          assert.equal(await page.evaluate(() => document.body.style.overflow), '');
          assert.equal(await choice(page, audience).evaluate(e => document.activeElement === e), true);
          await choice(page, audience).click(); await page.mouse.click(2, 2);
          assert.equal(await page.locator('#sheet').isVisible(), false);
          assert.equal(await page.evaluate(() => document.body.style.overflow), '');
          assert.equal(await choice(page, audience).evaluate(e => document.activeElement === e), true);
        }
        assert.deepEqual(errors, []);
        assert.deepEqual(posts, []);
        await context.close();
        console.log(`PASS ${width}x${height} touch=${touch} motion=${reducedMotion}: four openers, all tab transitions, native modal/focus trap, fonts, controls reachable, no overflow, X/Escape/outside close and return focus/scroll cleanup`);
      }
    }
    findings.forEach(f => console.error(`FAIL contract: ${f}`));
    if (findings.size) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
