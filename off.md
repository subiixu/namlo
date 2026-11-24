# Turn off Namlo

Goal: take the Feedback button out of this app and leave the project as it was before Namlo,
still building.

1. Read `.araniko/plugins/namlo.md`. It lists every file Namlo added or changed.
2. Delete the files Namlo added (normally `namlo-widget.js`, or the feedback screen in a mobile or
   desktop app).
3. Undo each change Namlo made to existing files: the script tag or `next/script` element, the
   site key variable (in code and in the example env file), the `data-namlo-open` link if one was
   added, every `Namlo.identify` call and `data-user-*` or `data-login-url` attribute, and `https://namlo-api.subaz.workers.dev` in a Content Security Policy if Namlo added it. Leave
   everything else in those files exactly as it is.
4. Search the project for `namlo` (any case) to catch anything the list missed, and remove only
   what Namlo added.
5. Delete `.araniko/plugins/namlo.md`.

Do not touch the feedback people already sent. It is stored by Namlo, not in this repo, and the
owner can delete it from the Feedback tab before turning Namlo off.

Done when nothing from Namlo is left in the project and it still builds.
