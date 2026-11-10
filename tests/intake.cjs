// Actual shipped HTML, all network intercepted. No live lead creation.
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
assert.match(source, /name="soundr-intake-mode" content="netlify"/);
assert.doesNotMatch(source, /user-scalable\s*=\s*no|maximum-scale\s*=/);
assert.equal(fs.readFileSync(path.join(__dirname, '../public/_redirects'), 'utf8').trim(), '/support /index.html 200');
const preview = source.replace('name="soundr-intake-mode" content="netlify"', 'name="soundr-intake-mode" content="preview"');
(async () => {
  const browser = await (process.env.BROWSER === 'webkit' ? webkit : chromium).launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 500 }, hasTouch: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [], payloads = [];
    page.on('pageerror', e => errors.push(e.message));
    let html = preview, outcome = 'success', release;
    await context.route('**/*', async route => {
      const req = route.request();
      if (req.method() === 'POST') {
        assert.equal(req.url(), 'https://soundr.app/');
        payloads.push(Object.fromEntries(new URLSearchParams(req.postData())));
        if (outcome === 'pending') await new Promise(resolve => { release = resolve; });
        if (outcome === 'network') return route.abort('failed');
        if (outcome === 'timeout') return; // Fetch's actual 15-second AbortController deadline.
        return route.fulfill({ status: outcome === 'error' ? 503 : 200, body: 'local fixture' });
      }
      return req.isNavigationRequest() ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort();
    });
    const choose = audience => page.locator(audience === 'producer-dj-waitlist' ? '#waitlistLink' : `[data-path="${audience}"]`).click();
    await page.goto('https://soundr.app/');
    await choose('artist-label');
    await page.locator('#accessEmail').fill('preview@example.com');
    await page.locator('#accessSubmit').click();
    assert.match(await page.locator('#confirmation').innerText(), /Nothing was sent or saved/);
    assert.equal(payloads.length, 0);
    html = source;
    for (const audience of ['artist-label', 'remixer', 'producer-dj-waitlist']) {
      await page.goto('https://soundr.app/');
      await choose(audience);
      await page.locator('#accessSubmit').click();
      assert.equal(await page.locator('#accessEmail').evaluate(e => e.matches(':invalid')), true);
      assert.equal(await page.locator('#confirmation').isVisible(), false);
      await page.locator('#accessEmail').fill('qa@example.com');
      await page.locator('#accessName').fill('Test & Name');
      await page.locator('#artistName').fill('Label + Artist');
      for (const failure of ['error', 'network', 'timeout']) {
        outcome = failure;
        await page.locator('#accessSubmit').click();
        await page.waitForFunction(() => !document.querySelector('#formError').hidden, null, { timeout: 20000 });
        assert.equal(await page.locator('#confirmation').isVisible(), false);
        assert.equal(await page.locator('#accessEmail').inputValue(), 'qa@example.com');
        assert.equal(await page.locator('#accessSubmit').isEnabled(), true);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'formError');
      }
      outcome = 'pending';
      const before = payloads.length;
      await page.locator('#accessSubmit').click();
      await page.waitForFunction(() => document.querySelector('#accessForm').getAttribute('aria-busy') === 'true');
      assert.equal(await page.locator('#accessSubmit').isDisabled(), true);
      await page.locator('#accessForm').evaluate(e => e.dispatchEvent(new Event('submit', { cancelable: true })));
      assert.equal(payloads.length, before + 1);
      outcome = 'success'; release();
      await page.locator('#confirmation').waitFor();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'confirmation');
      assert.deepEqual(payloads.at(-1), { 'form-name': 'soundr-interest', audience, path: audience, 'bot-field': '', email: 'qa@example.com', name: 'Test & Name', 'artist-name': 'Label + Artist' });
      await page.locator('#startAgain').click();
      assert.equal(await page.locator('#contactFields').isVisible(), false);
      await choose(audience);
      await page.locator('#accessEmail').fill('optional@example.com');
      await page.locator('#accessSubmit').click();
      await page.locator('#confirmation').waitFor();
      assert.equal(payloads.at(-1).name, '');
      assert.equal(payloads.at(-1)['artist-name'], '');
    }
    for (const url of ['http://localhost:8080', 'https://unapproved.test']) {
      const before = payloads.length;
      await page.goto(url);
      await choose('artist-label');
      await page.locator('#accessEmail').fill('preview@example.com');
      await page.locator('#accessSubmit').click();
      assert.match(await page.locator('#confirmation').innerText(), /Nothing was sent or saved/);
      assert.equal(payloads.length, before);
    }
    assert.deepEqual(errors, []);
    await context.close();
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    await noJs.route('**/*', route => route.fulfill({ contentType: 'text/html', body: source }));
    const disabled = await noJs.newPage();
    await disabled.goto('https://soundr.app/');
    assert.equal(await disabled.locator('#interestFields').evaluate(e => e.disabled), true);
    assert.equal(await disabled.locator('#waitlistLink').isVisible(), false);
    await noJs.close();
    console.log('PASS actual source activation, preview negative control, all paths, validation, payload/optional fields, 503/network/real timeout, pending guard, retry, success/reset, disallowed origins, no-JS safety, no errors. All POSTs mocked.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
