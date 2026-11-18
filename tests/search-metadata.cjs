const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.join(__dirname, '../public');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const title = 'Soundr | A new life for original music.';
const description = 'A new life for original music. Currently working with artists and labels on remixes of their tracks, from stem to release.';
const liveURL = process.env.LIVE_URL;
const paths = ['artist', 'label', 'remixer', 'producer-dj-waitlist'];

(async () => {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch();
    try {
      for (const javaScriptEnabled of [false, true]) {
        const page = await browser.newPage({ javaScriptEnabled, viewport: { width: 390, height: 844 } });
        const errors = [];
        let posts = 0;
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', async route => {
          const request = route.request();
          if (request.method() !== 'GET') { posts++; return route.abort(); }
          if (liveURL) return route.continue();
          const pathname = new URL(request.url()).pathname;
          if (pathname.startsWith('/assets/fonts/')) return route.fulfill({ contentType: 'font/ttf', body: fs.readFileSync(path.join(root, pathname)) });
          return route.fulfill({ contentType: 'text/html', body: html });
        });
        await page.goto(liveURL || 'https://preview.test/', { waitUntil: 'networkidle' });
        assert.equal(await page.title(), title, 'Production search title must replace draft preview title');
        assert.equal(await page.locator('head > title').count(), 1, 'Title must be in the actual head');
        assert.equal(await page.locator('body title').count(), 0);
        assert.equal(await page.locator('html').getAttribute('lang'), 'en');
        for (const [selector, expected, attribute = 'content'] of [
          ['meta[name="description"]', description],
          ['link[rel="canonical"]', 'https://soundr.app/', 'href'],
          ['meta[property="og:title"]', title],
          ['meta[property="og:description"]', description],
          ['meta[property="og:site_name"]', 'Soundr'],
          ['meta[property="og:type"]', 'website'],
          ['meta[property="og:url"]', 'https://soundr.app/'],
          ['meta[name="twitter:card"]', 'summary'],
          ['meta[name="twitter:title"]', title],
          ['meta[name="twitter:description"]', description],
        ]) {
          assert.equal(await page.locator(`head > ${selector}`).count(), 1, `${selector} must occur once in head`);
          assert.equal(await page.locator(selector).getAttribute(attribute), expected);
        }
        assert.equal(await page.locator('meta[name="robots"][content*="noindex"], meta[name="robots"][content*="nosnippet"]').count(), 0);
        for (const selector of ['#support', '.foot span', '.sheet-in']) {
          assert.equal(await page.locator(selector).getAttribute('data-nosnippet'), '', `${selector}: exclude incidental text from snippets`);
          assert(['SPAN', 'DIV', 'SECTION'].includes(await page.locator(selector).evaluate(node => node.tagName)));
        }
        assert.equal(await page.locator('.tagline').textContent(), 'A new life for original music.');
        assert.equal(await page.locator('.card-sub').textContent(), 'Currently working with artists and labels on remixes of their tracks, from stem to release.');
        assert.equal(await page.locator('.card-sub').evaluate(node => !!node.closest('[data-nosnippet]')), false);
        assert.equal(await page.locator('a[href="mailto:support@soundr.app"]').count(), 1, 'Support link remains available');
        if (javaScriptEnabled) {
          await page.evaluate(() => document.fonts.ready);
          for (const width of [390, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            for (const intakePath of paths) {
              await page.locator(`.card [data-path="${intakePath}"]`).click();
              await page.locator('#sheet[open]').waitFor();
              assert.equal(await page.locator('#intakePath').inputValue(), intakePath);
              assert.equal(await page.locator('#accessForm').isVisible(), true);
              await page.locator('#closeSheet').click();
              await page.locator('#sheet[open]').waitFor({ state: 'hidden' });
            }
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No page overflow');
          }
          await page.goto(new URL('/support/', liveURL || 'https://preview.test/').href, { waitUntil: 'networkidle' });
          assert.equal(await page.locator('head > link[rel="canonical"]').getAttribute('href'), 'https://soundr.app/');
          const support = await page.locator('#support').boundingBox();
          assert(support.y < 900 && support.y + support.height > 0, 'Support rewrite still lands at contact section');
        }
        assert.deepEqual(errors, []);
        assert.equal(posts, 0, 'Metadata and entry smoke must not submit leads');
        console.log(`PASS ${engineName} JS=${javaScriptEnabled}: head metadata, canonical, supported snippet exclusions${javaScriptEnabled ? ', phone/desktop four-door entry and support route' : ' available without JavaScript'}; zero POSTs`);
        await page.close();
      }
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
