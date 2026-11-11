// Actual HTML and bundled fonts. Every request intercepted; no real lead creation.
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../public');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const paths = ['artist', 'label', 'remixer', 'producer-dj-waitlist'];
assert.match(source, /name="soundr-intake-mode" content="netlify"/);
assert.doesNotMatch(source, /user-scalable\s*=\s*no|maximum-scale\s*=|name="robots"/);
assert.equal(fs.readFileSync(path.join(root, '_redirects'), 'utf8'), '/support /index.html 200\n/support/ /index.html 200\n');
(async () => {
  const browser = await (process.env.BROWSER === 'webkit' ? webkit : chromium).launch();
  const findings = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 500 }, hasTouch: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const original = window.fetch;
      window.finishedRequests = 0;
      window.fetch = (...args) => original(...args).finally(() => { window.finishedRequests++; });
    });
    const errors = [], payloads = [];
    page.on('pageerror', e => errors.push(e.message));
    let html = source, outcome = 'success', release;
    await context.route('**/*', async route => {
      const req = route.request();
      if (req.method() === 'POST') {
        assert(['https://soundr.app/', 'https://www.soundr.app/'].includes(req.url()));
        payloads.push(Object.fromEntries(new URLSearchParams(req.postData())));
        const current = outcome;
        const result = typeof current === 'object' ? current.result : current;
        if (typeof current === 'object') await new Promise(resolve => { current.release = resolve; });
        if (result === 'pending') await new Promise(resolve => { release = resolve; });
        if (result === 'network') return route.abort('failed');
        if (result === 'timeout') return; // Exercise the actual 15-second abort deadline.
        return route.fulfill({ status: result === 'error' ? 503 : 200, body: 'local fixture' });
      }
      const font = new URL(req.url()).pathname.match(/^\/assets\/fonts\/([a-z0-9-]+\.ttf)$/)?.[1];
      if (font) return route.fulfill({ contentType: 'font/ttf', body: fs.readFileSync(path.join(root, 'assets/fonts', font)) });
      return req.isNavigationRequest() ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort();
    });
    const choose = audience => page.locator(`.card [data-path="${audience}"]`).click();
    const fill = async () => {
      await page.locator('#accessEmail').fill('qa@example.com');
      await page.locator('#firstName').fill('Test &');
      await page.locator('#lastName').fill('Name');
    };
    const settled = () => page.waitForFunction(() => !document.querySelector('#accessSubmit').disabled);
    for (const audience of paths) {
      await page.goto('https://soundr.app/');
      await choose(audience);
      const before = payloads.length;
      for (const [field, value, note] of [
        ['#accessEmail', 'invalid', /email/],
        ['#accessEmail', 'qa@example.com', /first name/],
        ['#firstName', 'Test &', /last name/]
      ]) {
        await page.locator(field).fill(value);
        await page.locator('#accessSubmit').click();
        assert.match(await page.locator('#formNote').innerText(), note);
        assert.equal(await page.locator('#confirmation').isVisible(), false);
        assert.equal(payloads.length, before);
      }
      await page.locator('#lastName').fill('Name');
      if (audience === 'label') {
        await page.locator('#accessSubmit').click();
        assert.match(await page.locator('#formNote').innerText(), /label's name/);
        assert.equal(payloads.length, before);
        await page.locator('#labelName').fill('Label + Name');
        await page.locator('#roleName').fill('A&R');
      } else await page.locator('#artistName').fill('Artist + Name');
      for (const failure of ['error', 'network', 'timeout']) {
        outcome = failure;
        await page.locator('#accessSubmit').click();
        await page.waitForFunction(() => document.querySelector('#formNote').classList.contains('err'), null, { timeout: 20000 });
        await settled();
        assert.equal(await page.locator('#confirmation').isVisible(), false);
        assert.equal(await page.locator('#accessEmail').inputValue(), 'qa@example.com');
      }
      outcome = 'pending'; release = null;
      await page.locator('#accessSubmit').click();
      await page.waitForFunction(() => document.querySelector('#accessSubmit').disabled);
      const sent = payloads.length;
      await page.locator('#accessForm').evaluate(e => e.dispatchEvent(new Event('submit', { cancelable: true })));
      await page.locator('.tab[data-path="label"]').click();
      assert.equal(await page.locator('#intakePath').inputValue(), audience);
      assert.equal(payloads.length, sent);
      assert.equal(typeof release, 'function');
      release();
      await page.locator('#confirmation').waitFor();
      await settled();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'confirmation');
      assert.deepEqual(payloads.at(-1), {
        'form-name': 'soundr-interest', audience, path: audience, 'bot-field': '',
        email: 'qa@example.com', 'first-name': 'Test &', 'last-name': 'Name', name: 'Test & Name',
        'label-name': audience === 'label' ? 'Label + Name' : '', role: audience === 'label' ? 'A&R' : '',
        'artist-name': audience === 'label' ? '' : 'Artist + Name'
      });
      await page.locator('#startAgain').click();
      assert.equal(await page.locator('#sheet').isVisible(), false);
      await choose(audience); await fill();
      if (audience === 'label') await page.locator('#labelName').fill('Required label');
      outcome = 'success';
      await page.locator('#accessSubmit').click();
      await page.locator('#confirmation').waitFor(); await settled();
      assert.equal(payloads.at(-1)['artist-name'], '');
      assert.equal(payloads.at(-1).role, '');
      console.log(`PASS ${audience}: missing-field validation, exact payload, optional fields, 503/network/real timeout/retry, pending duplicate/tab guard, confirmation/reset`);
    }
    for (const url of ['https://soundr.app/', 'http://localhost:8080/', 'https://unapproved.test/']) {
      html = url === 'https://soundr.app/' ? source.replace('content="netlify"', 'content="preview"') : source;
      await page.goto(url); await choose('artist'); await fill();
      const before = payloads.length;
      assert.match(await page.locator('#formNote').innerText(), /Nothing is sent or saved/);
      await page.locator('#accessSubmit').click();
      await page.locator('#confirmation').waitFor();
      assert.equal(payloads.length, before);
    }
    html = source;
    await page.goto('https://www.soundr.app/'); await choose('artist'); await fill();
    await page.locator('#accessSubmit').click();
    await page.locator('#confirmation').waitFor(); await settled();
    console.log('PASS activation on both HTTPS domains, preview mode and disallowed-host negative controls');
    await page.goto('https://soundr.app/'); await choose('label');
    await page.locator('.tab[data-path="artist"]').click(); await fill();
    assert.equal(await page.locator('#labelRow').isVisible(), false);
    assert.equal(await page.locator('#accessForm').evaluate(e => e.checkValidity()), true);
    await page.locator('#accessSubmit').click();
    await page.locator('#confirmation').waitFor(); await settled();
    console.log('PASS label-to-artist hidden-field validity and successful payload');
    // Observe old completion, including its cleanup, before checking the new session.
    for (const result of ['success', 'error', 'network', 'timeout']) {
      for (const next of ['closed', 'artist', 'producer-dj-waitlist', 'new-pending']) {
        await page.goto('https://soundr.app/'); await choose('artist'); await fill();
        const old = { result };
        outcome = old; release = null;
        // Hold failures too, so they complete only after close/reopen.
        await page.locator('#accessSubmit').click();
        await page.waitForFunction(() => document.querySelector('#accessSubmit').disabled);
        assert.equal(typeof old.release, 'function');
        await page.locator('#closeSheet').click();
        if (next !== 'closed') await choose(next === 'artist' ? 'artist' : 'producer-dj-waitlist');
        if (next === 'new-pending') {
          // Keep the new request's real 15s deadline well after the old timeout.
          if (result === 'timeout') await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 14000)));
          await fill(); outcome = 'pending'; release = null;
          await page.locator('#accessSubmit').click();
          await page.waitForFunction(() => document.querySelector('#accessSubmit').disabled);
          assert.equal(typeof release, 'function');
        }
        old.release();
        await page.waitForFunction(() => window.finishedRequests >= 1, null, { timeout: 20000 });
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
        assert.equal(await page.locator('#confirmation').isVisible(), false, `${result}/${next}: no stale success`);
        assert.equal(await page.locator('#formNote').evaluate(e => e.classList.contains('err')), false, `${result}/${next}: no stale error`);
        assert.equal(await page.locator('#accessSubmit').isDisabled(), next === 'new-pending', `${result}/${next}: isolated cleanup`);
        if (next === 'new-pending') {
          assert.match(await page.locator('#formNote').innerText(), /Sending/);
          await page.locator('.tab[data-path="artist"]').click();
          assert.equal(await page.locator('#intakePath').inputValue(), 'producer-dj-waitlist');
          release(); await page.locator('#confirmation').waitFor(); await settled();
          assert.equal(await page.locator('#confirmationSub').innerText(), "You're on the DJ waitlist.");
          assert.equal(payloads.at(-1).path, 'producer-dj-waitlist');
        }
      }
    }
    console.log('PASS stale success/error/network/timeout after close, same/different reopen and newer pending request; isolated confirmation/error/cleanup');
    assert.deepEqual(errors, []);
    await context.close();
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    await noJs.route('**/*', route => route.fulfill({ contentType: 'text/html', body: source }));
    const disabled = await noJs.newPage(); await disabled.goto('https://soundr.app/');
    assert.equal(await disabled.locator('#sheet').isVisible(), false);
    await noJs.close();
    console.log('PASS no-JS form not exposed; no page errors. All HTTP/POST traffic mocked.');
    findings.forEach(f => console.error(`FAIL contract: ${f}`));
    if (findings.length) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
