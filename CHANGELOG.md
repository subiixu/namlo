# Changelog

## 0.8.0 (2026-11-27)

- **See what happened before someone wrote in.** Each request can now carry the last 30 minutes of
  what the person ran into in your app: the pages they were on, errors, failed requests, places
  they were blocked and repeated clicks. They see it before they send, and it never includes
  anything they typed.
- **Walls.** The same problems are counted across everyone, even when nobody writes in, under a new
  **Walls** section in the Feedback tab. You see how often and how many people hit each one, can
  send it to Nayo to fix, and it's marked fixed when the work is merged. If a fixed wall comes back,
  it says so. You can switch Walls off in Namlo settings.
- Update the button in each app (the Feedback tab offers **Update the button**) to start
  collecting these.

Data change: the API adds a `trail` column to feedback, a `walls_off` setting to projects, and the
`walls`, `wall_people` and `wall_days` tables (`api/migrations/0007_walls.sql`). Rollback: redeploy
the 0.7.0 API (`npx wrangler rollback`). It ignores the new column and tables, so nothing needs to
be dropped. Older buttons keep working either way.
