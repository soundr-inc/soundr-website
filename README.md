# Soundr website

Static website for soundr.app. Plain HTML, CSS, JavaScript and bundled fonts. No package installation or build command is required.

## Connect the existing Netlify site

Connect this repository to the existing soundr.app site, not a new site.

- Production branch: `main`
- Base directory: repository root (leave blank)
- Build command: leave blank
- Publish directory: `public` (also set in `netlify.toml`)
- Enable automatic form detection in the Netlify Forms dashboard, then deploy.
- Preserve the existing custom domains and DNS. This setup does not require changing beta.soundr.app.
- The `public/_redirects` file preserves `/support` and `/support/` as 200 rewrites to the page's support section.

## Form activation

The launch configuration uses Netlify Forms on HTTPS soundr.app and www.soundr.app. Other hosts, including localhost and deploy previews, stay in preview mode and do not send submissions.

The `soundr-intake-mode` meta value in `public/index.html` is `netlify`. Set it to `preview` to disable browser submissions in a subsequent deployment.

Before declaring intake live, verify that Netlify detects the `soundr-interest` form and retains actual authorized test submissions for each path: `artist`, `label`, `remixer`, and `producer-dj-waitlist` (the visible DJ waitlist). Email, first name and last name are required. Label name is validated on the Labels path only; role and artist/DJ name are optional. Check these fields, the combined hidden `name`, and hidden audience/path values. Check the spam folder as well as accepted submissions. A browser success message alone does not establish receipt. Monday lead forwarding is not connected by this repository.

## Changes

Use a branch and pull request. Once Netlify is connected, updates merged to `main` trigger deployment automatically. Do not put credentials, private notes, or submitted personal data in this public repository.

## Local preview

Run `python3 -m http.server 8080 --directory public --bind 127.0.0.1` and open http://127.0.0.1:8080/. Font files and their licenses are included under `public/assets/fonts/`.

## Focused form checks

With an existing Playwright installation and its Chromium/WebKit browsers available, run `node tests/mobile-entry.cjs` and `node tests/intake.cjs`. Set `PLAYWRIGHT_MODULE` to the module path if it is not installed locally. Repeat with `BROWSER=webkit`. These checks intercept all network traffic, including mocked form submissions. Optional `EVIDENCE_DIR` captures form screenshots.

The supplied four-door design uses a native dialog with in-modal audience switching. The checks cover actual focus, keyboard containment, close/return focus, scroll cleanup, required fields, payloads, error/retry handling and reduced-height reachability. Zoom remains enabled. Headless checks do not establish native iPhone keyboard, autofill toolbar or actual Safari focus-zoom acceptance; those require an on-device recheck.

The suites return a failing exit code when a required contract is not met. Regression checks cover stale success, error and cleanup after close/reopen (including a newer pending request), >=16px touch inputs, and unclipped modal tabs/labels at 320px. Request completions are bound to their original path and modal session. Closing does not establish that Netlify did not receive the original submission. Preserve the supplied design and obtain the author's approval of the repair scope and current PR head before merging; merging `main` publishes the website automatically.
