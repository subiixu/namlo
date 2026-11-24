# Update Namlo

Goal: bring this project's Namlo Feedback button up to the newest Namlo without losing its site key.
Everything you need is below; you don't need the plugin's other files.

1. Read `.araniko/plugins/namlo.md` to find the widget file and where the site key is set. If that
   file is missing, search the project for `namlo-widget.js` and `data-site-key`.

2. **Web apps: the widget file.** Replace the app's `namlo-widget.js` with the new one, unchanged:
   ```
   curl -fsSL 'https://namlo-api.subaz.workers.dev/v1/widget.js?v=0.7.0' -o <the same path>
   ```
   Check its first line is `/*! Namlo widget 0.7.0` and its SHA-256 (`shasum -a 256 <path>`) is
   SHA-256 `1a8ade6c6574a8105d876b46e45b130f333f36489d5e38a4c3a84169c10e8d75`. If either doesn't
   match, put the old file back, stop and say so. Never edit the file. Don't touch the site key.

3. **Signed-in people** (skip if the record file already mentions `Namlo.identify`, or the app has
   no accounts). Find how the app knows who is signed in. Where that is known in the browser, call
   `window.Namlo && window.Namlo.identify({ id, email, name })` once they're signed in (and on each
   page load while they are), and `window.Namlo && window.Namlo.identify(null)` after sign-out.
   Use the app's own user id and the email and name it already shows them. Pass only those three
   values, never tokens. In a server-rendered layout you can instead add `data-user-id`,
   `data-user-email` and `data-user-name` to the script tag.

4. **Log-in link** (skip if the script tag already has `data-login-url`, or the app has no log-in
   page). Put the app's log-in page path in `data-login-url`, for example `/login`.

5. **The button's look** now comes from the Feedback tab in Araniko, not from code. Leave any
   existing `data-label`, `data-style`, `data-radius`, `data-position` or `data-email` as they are
   (the tab's settings win) and add none.

6. Screenshots need nothing extra: the new widget offers "Add a screenshot" by itself when the
   Namlo API can keep them.

7. **Mobile or desktop apps with their own feedback screen** (no widget file): compare the screen
   with the Namlo API notes (`curl -fsSL 'https://namlo-api.subaz.workers.dev/v1/docs/api.md'`) and add what's new:
   `user` and `notify` for signed-in people, and an optional "Add a screenshot" picker (`images`,
   only when `/v1/config` says `screenshots: true`).

8. Add a line to `.araniko/plugins/namlo.md`: "Updated to Namlo 0.7.0", and note anything you
   added in steps 3 to 7.

Done when the app builds, the site key is unchanged, `namlo-widget.js` starts with
`/*! Namlo widget 0.7.0`, and the record file has the update line.
