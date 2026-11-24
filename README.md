# Namlo

<img src="screens/feedback/namlo-mark.svg" alt="Namlo" width="72">

Hear from the people using your app, and turn what they say into work for Nayo.

Namlo adds a small **Feedback** button to your app. People can report a bug, ask for a feature or
share an idea, and later see what happened to it under **My requests**. Everything they send shows
up in a **Feedback** tab in your Araniko project. From there you set a status, reply, merge
repeats, and press **Send to Nayo** to have it fixed or built.

## Getting started

1. Turn Namlo on in a project. Nayo adds the button to your app, hidden for now.
2. Open the project's **Feedback** tab and press **Connect Namlo**. Nayo switches the button on.
3. Ship your app. New feedback appears in the tab within a minute.

## What you can do in the Feedback tab

- See open, shipped and closed requests, and filter by bugs, features and ideas.
- **Send to Nayo:** Nayo gets the person's words, the page they were on and their browser, and
  works on it like any other task. The request moves to *In progress*.
- **Set a status:** New, Planned, In progress, Shipped, Closed or Won't build. The person sees it in
  your app. Shipped, Closed and Won't build ask first and let you edit the note the person gets.
- **Shipped by itself:** a request you send to Nayo carries a link only for that request. When Nayo's
  work is merged it uses it, so the request turns Shipped, the person gets a "this is fixed/built"
  note, and Nayo says "Namlo #N is shipped" in its summary, which Araniko sees too.
- **Reply:** a short note the person sees next to their request.
- **Merge** repeats, so you see how many people asked and they all follow one status.

## Screenshots

People can add up to 3 screenshots to what they send: pick them, paste them or drop them on the
panel. They're shrunk in the browser first, kept privately with the request, shown in the Feedback
tab, linked in Nayo's brief, and deleted when you delete the request.

## Signed-in people and email updates

If your app has accounts, Nayo tells the button who is signed in. They aren't asked for an email:
they get an **Email me updates** switch instead. People who aren't signed in are offered your
log-in page, or an optional email box if your app has no log-in. Whoever asks for updates gets an
email when you change a status or save a reply, with a link to stop them.

## Staying up to date

The Feedback tab shows when the button in your app is older than Namlo, with **Update the
button** to have Nayo update it. Namlo settings shows both versions. After Nayo's change is
merged, ship your app; the notice goes away once someone opens the new button.

## Settings (per project)

All in one place: the project's **Feedback** tab → **Namlo settings** → Feedback button.


- **Button look:** the logo with "Feedback" next to it, or just the floating logo.
- **Button corners:** square, slightly rounded, rounded or fully round (a circle for the logo on its own).
- **Button text**, default "Feedback". With just the logo, it's the button's tooltip.
- **Button position:** bottom right, bottom left, or hidden, so you can use your own "Send feedback" link.
- **Email updates to people:** optional or off.
- **Your app's log-in page:** where "Log in" goes for people who aren't signed in. Nayo fills in
  the app's own log-in page if it has one.

Press Save and your app shows the change on its next page load, with no code change or redeploy
(needs the button 0.6.0 or newer). "Hidden" only hides the button when the page has a
`data-namlo-open` link; the tab can ask Nayo to add one.

## What Namlo sends and keeps

- The widget talks only to `namlo-api.subaz.workers.dev`. It sends the type, the message, the page
  address and the browser name, plus any screenshots they add, an email (typed, or the signed-in account's) and the app's user
  id and name when there is one.
- It keeps one random id in the person's browser so they can see their own requests. No cookies
  and no tracking.
- Your Namlo keys stay on your Mac, in Namlo's own store in Araniko. The site key in your app is
  public. The owner key never goes into your code.
- Turning Namlo off removes it from your app. Feedback already sent stays in Namlo until you
  delete it from the Feedback tab under **Namlo settings**.

## Works with

Any web app: Next.js, Vite, Astro, SvelteKit, plain HTML and more. For native mobile apps, Nayo
builds a simple feedback screen that uses the same API.

The button and the Feedback tab use the namlo.si look: near-black, white buttons, the orange
ribbon mark and mono labels. The button follows the visitor's light or dark setting.

Icons by Hugeicons (MIT licence, see `screens/LICENSE-hugeicons.md`).
