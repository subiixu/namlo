# Turn on Namlo

Goal: this app gets a small **Feedback** button. People using the app can report a bug, ask for a
feature or share an idea, and see what happened to what they sent. Everything they send goes to
the Namlo API at `https://namlo-api.subaz.workers.dev` and shows up in this project's **Feedback** tab in Araniko.

The button stays hidden until it has a site key. The owner gets the key by pressing **Connect
Namlo** in the Feedback tab, which sends you a separate short brief. Do not try to make a key yourself.

## Steps

1. **Look at the project first.** Find out what kind of app it is and where the shared page
   layout lives. Fit in with what exists. Do not add new dependencies.

2. **Web apps** (anything that renders HTML in a browser):
   1. Download the widget file, unchanged, into the folder the app serves as-is (for example
      `public/` in Next.js, Vite, Astro, SvelteKit or Create React App, `static/` in Hugo or
      SvelteKit, or next to `index.html` in a plain site), named `namlo-widget.js`:
      ```
      curl -fsSL 'https://namlo-api.subaz.workers.dev/v1/widget.js?v=0.8.0' -o public/namlo-widget.js
      ```
      Check it before going on: its first line is `/*! Namlo widget 0.8.0`, and its SHA-256
      (`shasum -a 256 public/namlo-widget.js`) is SHA-256 `56b4744e26e7c5c4e2da08c81b43de9d7994b320f90b38f81b871e62fb7d75ff`. If either doesn't match,
      stop and say so in your summary. Never edit the file.
   2. Load it once on every page, in the shared layout (for example `app/layout.tsx`,
      `pages/_document.tsx`, `index.html`, `src/app.html`, a base template):
      ```html
      <script src="/namlo-widget.js" data-site-key="" data-label="Feedback" defer></script>
      ```
      In Next.js App Router use `next/script` with `strategy="afterInteractive"` and pass the same
      `data-` attributes.
   3. Put the site key in **one** place. Prefer the app's existing way of holding public config
      (for example `NEXT_PUBLIC_NAMLO_SITE_KEY`, `VITE_NAMLO_SITE_KEY`, or a config file the layout
      already reads) and feed it into `data-site-key`. Leave the value empty for now.
      If an env file is used, add the empty variable to the example env file the project keeps
      (such as `.env.example`), not to a real `.env` file.
   4. Add no look attributes (`data-label`, `data-style`, `data-radius`, `data-position`,
      `data-email`). The owner sets the button's look in Araniko's Feedback tab and the widget
      loads it from the Namlo API on each page load.
   5. **Signed-in people.** If the app has accounts, tell the widget who is signed in, so they
      aren't asked for an email and can switch email updates on with one tap:
      - Find how the app knows the signed-in person (its auth library, session or user context).
      - Where that is known in the browser, call
        `window.Namlo && window.Namlo.identify({ id, email, name })` once the person is signed in
        (and on each page load while they are), and `window.Namlo && window.Namlo.identify(null)`
        after they sign out. Use the app's own user id; the email and name are what the app
        already shows the person.
      - In a server-rendered layout you can instead add `data-user-id`, `data-user-email` and
        `data-user-name` to the script tag.
      - Pass only those three values. Never pass tokens, passwords, roles or anything else.
      - No accounts in the app: skip this step.
   6. **Log-in link for people who aren't signed in.** If the app has a log-in page, put its path
      in `data-login-url` (for example `/login`). The owner can change it later in the Feedback tab. The widget then offers "Log in" instead of an email box. No log-in
      page: leave it out, and the widget offers an optional email box.
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
   8. If the app has a Content Security Policy, allow `https://namlo-api.subaz.workers.dev` in `connect-src`.

3. **Mobile or desktop apps with no web page** (Swift, Kotlin, Flutter, React Native, Electron
   without a web layout you control): do not copy the widget. Instead add a simple "Send feedback"
   screen that posts to the API exactly as described in the Namlo API notes
   (`curl -fsSL 'https://namlo-api.subaz.workers.dev/v1/docs/api.md'`), reachable from the
   app's settings or help screen. Keep the site key in one constant, empty for now. If the app has
   accounts, send the signed-in person and an "Email me updates" switch as those notes say,
   instead of an email box. Keep a short list of the last few problems the app hit (errors, failed
   requests, the app's own "you can't do this" messages) and send it as `trail`, and report them to
   `/v1/walls`, both as the notes describe.

4. **No user-facing app** (a library, a CLI, an API with no UI): change nothing in the code. Write
   only the record file in step 5 and say in your summary that Namlo needs an app with a screen.

5. **Keep a record** in `.araniko/plugins/namlo.md` with:
   - every file you added or changed, and what you changed in it;
   - the exact place where the site key goes (file and variable or attribute name);
   - where you call `Namlo.identify` (or set the `data-user-*` attributes), if you did;
   - every place you call `Namlo.wall`, with its message;
   - the line: `Site key: not set yet`.

Done when the app still builds, the widget file is in place and loaded from the shared layout (or
the feedback screen exists), and `.araniko/plugins/namlo.md` lists every change.
