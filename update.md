# Update Namlo

Goal: bring this project's Namlo Feedback button up to the newest Namlo without losing its site key.
Everything you need is below; you don't need the plugin's other files.

1. Read `.araniko/plugins/namlo.md` to find the widget file and where the site key is set. If that
   file is missing, search the project for `namlo-widget.js` and `data-site-key`.

2. **Web apps: the widget file.** Replace the app's `namlo-widget.js` with the new one, unchanged:
   ```
   curl -fsSL 'https://namlo-api.subaz.workers.dev/v1/widget.js?v=0.8.0' -o <the same path>
   ```
   Check its first line is `/*! Namlo widget 0.8.0` and its SHA-256 (`shasum -a 256 <path>`) is
   SHA-256 `56b4744e26e7c5c4e2da08c81b43de9d7994b320f90b38f81b871e62fb7d75ff`. If either doesn't
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

7. **Walls: where the app stops people.** Find the places where the app tells someone they can't
   do something, and add `window.Namlo && window.Namlo.wall('<the message they see>')` right where
   it's shown, so Namlo counts it and attaches it to their feedback. Look for:
   - upgrade or paywall prompts ("Exporting needs the Pro plan");
   - "install", "update" or "use the desktop/mobile app to do this" messages;
   - permission or access-denied screens, and features switched off by a flag or a setting;
   - "not available on this device, browser, plan or region";
   - forms the app refuses with a message (not every validation error; the ones that block the task).
   Use the words the person sees, plus the plan, feature or setting name if that helps. Never put
   their name, email, ids or anything they typed in it. Errors, failed requests and repeated clicks
   are recorded by the widget itself; don't add calls for those.
   Skip this step if the record file already lists `Namlo.wall` calls.

8. **Mobile or desktop apps with their own feedback screen** (no widget file): compare the screen
   with the Namlo API notes (`curl -fsSL 'https://namlo-api.subaz.workers.dev/v1/docs/api.md'`) and add what's new:
   `user` and `notify` for signed-in people, and an optional "Add a screenshot" picker (`images`,
   only when `/v1/config` says `screenshots: true`), and `trail` plus `/v1/walls` reports.

9. Add a line to `.araniko/plugins/namlo.md`: "Updated to Namlo 0.8.0", and note anything you
   added in steps 3 to 8, including every `Namlo.wall` call and its message.

Done when the app builds, the site key is unchanged, `namlo-widget.js` starts with
`/*! Namlo widget 0.8.0`, and the record file has the update line.
