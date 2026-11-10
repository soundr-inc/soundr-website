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
- The `public/_redirects` file preserves `/support` as a 200 rewrite to the page's support section.

## Form activation

The launch configuration uses Netlify Forms on HTTPS soundr.app and www.soundr.app. Other hosts, including localhost and deploy previews, stay in preview mode and do not send submissions.

The `soundr-intake-mode` meta value in `public/index.html` is `netlify`. Set it to `preview` to disable browser submissions in a subsequent deployment.

Before declaring intake live, verify that Netlify detects the `soundr-interest` form and retains actual authorized test submissions for each path: `artist-label`, `remixer`, and `producer-dj-waitlist` (the visible DJ waitlist). Check email, optional name, optional artist/label name, and hidden audience/path values. Check the spam folder as well as accepted submissions. A browser success message alone does not establish receipt. Monday lead forwarding is not connected by this repository.

## Changes

Use a branch and pull request. Once Netlify is connected, updates merged to `main` trigger deployment automatically. Do not put credentials, private notes, or submitted personal data in this public repository.

## Local preview

Run `python3 -m http.server 8080 --directory public --bind 127.0.0.1` and open http://127.0.0.1:8080/. Font files and their licenses are included under `public/assets/fonts/`.
