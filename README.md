# The Gang Does a Bracket

Private, mobile-first bracket voting for eight friends: everyone nominates 15 ranked entries, the app seeds a 64-entry bracket, and the group votes round by round. Harry runs every phase.

- **Live:** https://hw-wright.github.io/bracket-app/
- **Spec:** `SPEC.md` (source of truth) · **Conventions for future sessions:** `CLAUDE.md`
- **Stack:** Vite + React + TypeScript + Tailwind on GitHub Pages; Supabase (Postgres, Auth, Storage, Realtime, one Edge Function).

---

## Setup from scratch

Prerequisites: Node 24 LTS (`nvm use`), GitHub CLI, Supabase CLI, Docker Desktop (for local tests).

```sh
brew install gh supabase/tap/supabase
nvm install 24 && nvm use
gh auth login --web --git-protocol https --scopes "repo,workflow"
supabase login                                   # in a real terminal (needs a TTY)

git clone https://github.com/HW-Wright/bracket-app.git && cd bracket-app
npm ci
supabase link --project-ref vvevwyazanubxocimxmd # The Gang / Bracket_App
```

Create `.env` (gitignored) from the CLI. `--reveal` matters: without it the secret key comes back masked.

```sh
supabase projects api-keys --project-ref vvevwyazanubxocimxmd --reveal -o json
# copy into .env:
#   VITE_SUPABASE_URL=https://vvevwyazanubxocimxmd.supabase.co
#   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
#   SUPABASE_SECRET_KEY=sb_secret_...
```

Apply the database and function, push auth settings (sign-up off, no email confirmation), and seed users:

```sh
supabase db push
supabase functions deploy admin-users --use-api
supabase config diff && supabase config push     # review the diff, answer y
cp users.example.json users.local.json           # set each starting password (6+ chars)
npm run seed:users                               # idempotent; never resets existing passwords
```

GitHub Pages deploys on every push to `main` (`.github/workflows/deploy.yml`). It reads two repo **variables** (not secrets; both are public by design):

```sh
gh variable set VITE_SUPABASE_URL --body "https://vvevwyazanubxocimxmd.supabase.co"
gh variable set VITE_SUPABASE_PUBLISHABLE_KEY --body "sb_publishable_..."
```

The secret key lives only in `.env` and Supabase's function secrets. Never commit `.env` or `users.local.json`.

## Run locally

```sh
supabase start                 # local Postgres/Auth/Storage/Realtime in Docker
npm run dev                    # http://localhost:5173 (uses .env, or .env.local if present)
```

To point the dev server at the local stack instead of live, create `.env.local` with the local URL and publishable key from `supabase status -o env`.

## Tests

| Command | What it checks | Needs |
|---|---|---|
| `npm test` | Vitest: bracket order, stages, normalisation, list rules, stats (upsets, totals, paths, podium, pick status) | – |
| `npm run test:db` | pgTAP: RLS (blind nominations, hidden voters), scoring, merges, ordering, lock, voting, a full 6-stage simulation, undo, override | local stack |
| `npm run test:auth` | Username login, forced password change, `admin-users` function | local stack + `supabase functions serve` |
| `npm run test:storage` | Entry-image bucket: admin-only writes, public reads | local stack |
| `npm run test:realtime` | Live tallies reach other users; votes are never broadcast | local stack |
| `npm run test:queries` | The app's history/stats queries as a normal user | local stack |
| `npm run dry-run` | End-to-end: 8 fake users nominate, close, merge, lock, random votes through every stage, champion; then wipes | local stack |

`npm run dry-run -- --stages=1` stops with the Round of 32 open and keeps the data so you can click around locally (log in as `zdry-harry` / `dry-run-pass`); `npm run dry-run -- --wipe` removes it.

Also: `npm run typecheck`, `npm run lint`, `npm run build`.

---

## Harry's runbook

Everything is in the **Admin** tab (★). Only you see it.

### Start a bracket
1. Admin → **Start a new bracket**: title (the topic) and optional description. It's created as a **draft**; nobody can nominate yet.
2. **Open nominations.** Everyone ranks exactly 15, #1 = 15 points to #15 = 1. Lists stay private (to you too) until you close.
3. Watch Admin's status list (who's at 15/15, who's on a draft, who has a repeat). Nudge people.

### Close nominations
4. **Close nominations and reveal.** The confirmation names anyone incomplete: their lists won't count. Everyone can now see all lists.
   - Changed your mind? **Reopen nominations** (this throws away any review work).

### Review and seed
5. **Review & seeding ▸**
   - **Suggestions**: likely duplicates (e.g. typos). **Merge…** (pick the name) or **Not the same**. Exact matches (case, punctuation, spaces, hyphens, leading "The") were already combined.
   - **Entries**: tick two to merge; tap one to **unmerge**, **split spellings**, **rename**, **remove** (restorable), or **add an image** (resized on your phone automatically).
   - Fewer than 64? Add entries manually (they score 0).
   - **Seeding**: seeds 1–64 by points → nominators → fixed random tiebreak, with the **cut line**.
6. **Lock seeding and tip off.** Seeds and entries freeze (images can still be added) and the Round of 64 opens for voting.

### Run the rounds
7. People vote on the **Vote** tab; tallies update live, voters stay hidden.
8. Admin → **Stage control → Close stage and advance.** Check the summary (ties go to a server-side coin toss), confirm. Voters are revealed and the next round opens. Six stages: R64, R32, R16, QF, SF, Final + third place.
9. **Undo last advance** (type `UNDO`): reopens the stage you just closed and discards any votes already cast in the next one. Coin tosses are kept.
10. **Override a result** (type `OVERRIDE`), for bugs only: shown publicly as an Admin decision. Only possible until the next matchup is decided.

### Finish and start the next one
11. After the final stage the champion screen appears on the **Bracket** tab and Home.
12. Starting the next bracket automatically moves the finished one to the **Archive**.

### Abandon a bracket
Admin → **Abandon bracket…**, type its title (case and punctuation don't matter). Works in any phase and deletes everything, including votes and images. A finished bracket can also be **deleted instead of archived**.

### Reset a password / manage people
Admin → **Users**: **Reset** sets a temporary password (they must change it on next login), **Add a user**, **Deactivate / Reactivate**.

### Try voting without a real bracket
```sh
npm run test-bracket -- create   # "Test" bracket in review with 64 dummy entries (refuses if a real one is active)
npm run test-bracket -- delete   # or Abandon it in the app
```

---

## If the Supabase project pauses

Free projects pause after about a week of inactivity. `.github/workflows/keepalive.yml` calls the database every 3 days (and keeps its own schedule enabled), so this shouldn't happen. If it does:

1. Open https://supabase.com/dashboard → organisation **The Gang** → **Bracket_App**.
2. Click **Restore project** and wait a few minutes.
3. Reload the app. Optionally run the keep-alive by hand: `gh workflow run keepalive.yml`.

## Dashboard-only settings

None. Schema, RLS, functions, storage policies and auth settings are all in `supabase/` and applied with the CLI.
