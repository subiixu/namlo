# Namlo API for apps without a web page

Use this when the app can't load `namlo-widget.js` (native iOS, Android, Flutter, React Native).
Base address: `https://namlo-api.subaz.workers.dev`. JSON in, JSON out. No cookies.

## The reporter id

Make one random id per install and keep it in the app's local storage:
`r_` followed by 32 lowercase hex characters (16 random bytes). It lets the person see their own
requests. It is not tied to their account and must not contain anything about them.

## Send feedback

`POST /v1/feedback`

```json
{
  "site_key": "pk_...",
  "type": "bug",
  "message": "What the person wrote (3 to 4000 characters)",
  "email": "optional@example.com",
  "user": { "id": "the app's user id", "email": "their account email", "name": "Their name" },
  "notify": true,
  "images": [{ "data": "base64 of a PNG, JPEG or WebP, up to 1.5 MB each, at most 3" }],
  "page_url": "the screen name, for example Settings > Billing",
  "user_agent": "App name, version and OS, for example MyApp 2.3 (iOS 18.1)",
  "reporter_id": "r_..."
}
```

`type` is `bug`, `feature` or `idea`. Answers `201 {"id","number","status","updates_by_email"}`.
On an error, the answer has `{"error": "plain sentence"}`, which you can show as-is.
`429` means too many messages in an hour.

**Screenshots:** ask `GET /v1/config?site_key=pk_...` first; offer "Add a screenshot" only when it
answers `screenshots: true`. Shrink each picture to about 1600px on its longest side (JPEG at 85%
is fine) before sending.

**Signed-in people:** send `user` (id, email and name only, never tokens) and leave out `email`.
Show an "Email me updates" switch instead of an email box and send its value as `notify`.
**Not signed in:** if the app has a log-in screen, offer "Log in to get updates" instead of an
email box. Otherwise offer an optional email box; typing an email means they want updates.

## My requests

`GET /v1/feedback/mine?site_key=pk_...&reporter_id=r_...`

Answers `{"items": [{"id","number","type","message","status","merged","reply","updates_by_email","images","created_at","updated_at"}]}`
(`images` is how many screenshots they attached).
Show `status` in plain words: `new` Received, `planned` Planned, `in_progress` Being worked on,
`shipped` Done, `closed` Closed. Show `reply` under the message when it is there.
Times are milliseconds since 1970.

## The screen

- Three choices: Bug, Feature, Idea. A message box. Then, unless the `ask_email` setting is Off:
  the "Email me updates" switch (signed in), a "Log in" link (not signed in, app has log-in),
  or an optional email box (no accounts). A Send button.
- A second tab or section, "My requests", listing what was sent from this device.
- Plain words, no jargon. Keep the site key in one constant.
