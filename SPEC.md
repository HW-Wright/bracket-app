# The Gang Does a Bracket: Build Specification

A private, mobile-first web app where eight friends nominate entries on a changing topic, the app seeds a 64-entry single-elimination bracket from ranked nominations, and the group votes round by round. Harry is the sole admin and controls every phase transition.

---

## 0. How to work (instructions for Claude Code)

- **Read this whole file before doing anything.** Then produce a phased plan (see section 14), list every step that needs Harry to act manually, and start Phase 1.
- **Automate everything you can.** Use the `gh` CLI and `supabase` CLI to create the repo, configure GitHub Pages, set secrets, link the project, push migrations and deploy functions. Only stop when a step truly needs Harry (creating an account, a browser login, pasting a secret, choosing something subjective).
- **When Harry must act, give exact, copy-pasteable terminal commands** in a single block, say where to run them, and say what output to expect. Harry is comfortable with the terminal and Git; do not over-explain basics.
- **Check prerequisites first:** Node LTS, `gh`, `supabase` CLI, Docker. Install what you can; tell Harry exactly how to install the rest.
- **Commit after each phase** with a clear message, and make sure tests pass before moving on.
- **Never commit secrets.** The repo will be public (GitHub Pages is only free for public repos). The Supabase anon key is safe to expose by design, but only because Row Level Security is enforced on every table. The service role key must only ever live in a gitignored local `.env` and in Supabase function secrets.
- **Ask before any destructive action against the live database.**
- **Create a `CLAUDE.md`** early with project conventions, commands and architecture notes so future sessions have context.
- **Keep it lean.** Eight users, free tiers. No over-engineering, no paid services.

---

## 1. Stack

- **Front end:** Vite + React + TypeScript. Tailwind CSS with custom design tokens (or CSS modules if you judge it cleaner for the deco styling). Static build only.
- **Routing:** must work on GitHub Pages. Use hash routing, or a `404.html` SPA fallback. Your call, but deep links must survive a refresh.
- **Backend:** Supabase free tier: Postgres, Auth, Storage, Realtime, Postgres functions (RPC), and Edge Functions only where the service role key is required.
- **Database changes:** all schema, RLS policies, functions and triggers as migrations in `supabase/migrations`, applied with the CLI. No manual dashboard edits except where unavoidable (document them in the README if so).
- **Hosting:** GitHub Pages, deployed by a GitHub Actions workflow on every push to `main`.
- **Keep-alive:** Supabase pauses free projects after about 7 days of low activity, and there may be weeks between brackets. Add a scheduled GitHub Actions workflow that makes a lightweight real database call (a tiny RPC) every 3 days. Document how to resume a paused project anyway.
- **Testing:** Vitest for pure logic (seeding, scoring, bracket order, advancement). RLS and RPC tests against a local Supabase instance (needs Docker). If Docker is unavailable, tell Harry and propose using a second free Supabase project as a test environment.
- **PWA basics:** web manifest and icons so friends can add it to their home screen. No offline mode needed.

---

## 2. Users and authentication

- **Users (8):** Harry, Kier, Ollie, Reiss, Joe, Sean, Connor, Hutton.
- **Harry is the only admin** and also nominates and votes exactly like everyone else.
- **No public sign-up.** Accounts are created by a script and by Harry in the admin panel only.
- **Login is username + password.** Username is case-insensitive (e.g. `joe`, `Joe`). Supabase Auth needs an email, so map each username to a synthetic internal email on a placeholder domain. Users never see it, and no emails are ever sent. Disable email confirmation. Verify the placeholder domain is accepted by Supabase Auth when creating users via the admin API.
- **Initial passwords:** Harry wants them simple. Supabase enforces a minimum password length of 6, so bare first names will fail for most users. Read initial passwords from a gitignored local file `users.local.json` (create a `users.example.json` template), and on first login **force a password change** (flag on the profile; block the rest of the app until changed).
- **Sessions:** keep users logged in on their phones for as long as Supabase allows (persisted session, auto refresh). Logging in repeatedly is the fastest way to lose friends from the app.
- **Seed script:** `npm run seed:users` creates the eight auth users and profiles from `users.local.json` using the service role key from `.env`. Idempotent.
- **Admin user management (in-app):** an Edge Function, callable only by an admin, to reset a user's password to a temporary one (sets the force-change flag), add a user, and deactivate a user.

---

## 3. Bracket lifecycle

Only **one active bracket** at a time. Past brackets are archived and viewable.

Phases, all advanced manually by Harry. No deadlines or timers anywhere (users are across three continents).

1. **Draft:** Harry creates a bracket with a title/topic and optional short description.
2. **Nominations open:** users submit ranked nominations.
3. **Review:** nominations closed and revealed; Harry audits, merges, adds images, previews seeding.
4. **Live:** seeding locked, voting runs stage by stage.
5. **Complete:** champion and podium shown; bracket moves to the archive when Harry starts the next one.

The home screen is phase-aware and always shows the single most relevant action (e.g. "Submit your nominations", "Vote in Round of 64, Section B", "See the champion").

---

## 4. Nominations

- **Each user may submit up to 15 nominations, ranked 1 (favourite) to 15.** Fewer than 15 is allowed.
- Users can save, edit, reorder and delete their list freely until Harry closes nominations.
- Reordering must be easy on a phone: drag handles **and** up/down buttons.
- Warn (do not block silently) if a user enters something that normalises to the same text as another of their own entries.
- **Blind until close:** a user can only see their own nominations while nominations are open. **Enforce this with RLS**, not just the UI.
- While open, everyone can see a progress count only, e.g. "5 of 8 have submitted" (no content, no names).
- **After close:** everyone can see all nominations, grouped by user with ranks, in a section at the bottom of the nominations page.

---

## 5. Review and seeding (admin)

This is the most important admin screen. **Nothing is ever dropped or merged without Harry seeing it.**

### 5.1 Full nomination list
- Show every raw nomination with nominator and rank. Sortable and filterable. Nothing hidden.

### 5.2 Duplicate detection
- Flag likely duplicate groups using normalisation (case, punctuation, diacritics, whitespace, hyphens, leading "the"/"a") plus fuzzy similarity (e.g. Postgres `pg_trgm` or Levenshtein).
- **Exact matches auto-combine** (decided by Harry, 2026-10-23): nominations whose normalised text is identical once spaces are also removed (e.g. "spiderman", "Spiderman", "Spider-Man") become one entry automatically when nominations close. The entry is labelled with how many spellings it combines, shows every original spelling, and Harry can split it back apart.
- **Near matches are suggestions only** (typos, fuzzy similarity). Harry confirms each merge and chooses or types the canonical display name.
- Merges can be undone at any time before seeding is locked.
- **Merge rule:** if the same user nominated two items that are merged, that user contributes only their best (lowest) rank to the merged entry. No double counting.

### 5.3 Admin edits (for fixing problems, not shaping the result)
- Edit canonical names.
- Add entries manually (used when there are fewer than 64). Manual entries score 0 points.
- Remove entries, with confirmation. Removed entries go to a visible "Removed" list and can be restored until lock.

### 5.4 Images
- Harry can upload one optional image per entry, at any time (including after lock).
- Resize and compress client-side before upload (e.g. max 800px longest side, WebP, roughly 200KB or less).
- Store in a Supabase Storage bucket: public read, admin-only write (enforce with storage policies).
- Entries without an image get a styled deco placeholder (frame plus initial or monogram).

### 5.5 Scoring and seeding
- **Points:** each nomination is worth `16 - rank` (rank 1 = 15 points, rank 15 = 1 point). An entry's score is the sum across nominators.
- **Order:** points descending, then number of distinct nominators descending, then a **random tiebreak value**.
- The random tiebreak value is generated **once** per entry when it is created and stored, so the preview is stable and cannot be rerolled. When entries are merged, the merged entry keeps one of the existing values (document which).
- **Seeding preview:** show seeds 1 to 64 with points and nominator count, and a clear **cut line**. Everything below 64 is listed as "Cut" with its points. Harry sees exactly what will be cut before locking.
- If there are fewer than 64 entries, show the shortfall and disable locking until Harry adds enough.
- **Lock seeding** (with confirmation) generates the bracket and opens the first voting stage.

---

## 6. Bracket structure

- **Standard 64-seed bracket order**, generated algorithmically: round one pairs sum to 65 (1 v 64, 32 v 33, etc.), arranged so seeds 1 and 2 can only meet in the final, seeds 1 to 4 sit in different quarters, and so on. Unit test this.
- **Stages** (each stage is what Harry opens and closes with one button):

| Stage | Round | Section | Matchups |
|---|---|---|---|
| 1 | Round of 64 | Quarter A | 8 |
| 2 | Round of 64 | Quarter B | 8 |
| 3 | Round of 64 | Quarter C | 8 |
| 4 | Round of 64 | Quarter D | 8 |
| 5 | Round of 32 | Top half | 8 |
| 6 | Round of 32 | Bottom half | 8 |
| 7 | Round of 16 | All | 8 |
| 8 | Quarter-finals | All | 4 |
| 9 | Semi-finals | All | 2 |
| 10 | Final + third-place playoff | All | 2 |

- Quarters are the four structural quarters of the bracket (each contains 16 entries), released in fixed order A to D. Halves are the top and bottom halves.
- **Third-place playoff:** the two semi-final losers play each other in stage 10 alongside the final, to decide third place on the podium.

---

## 7. Voting

- The **Vote** screen shows only the matchups in the currently open stage. Future pairings are never shown.
- Each matchup card shows both entries (image, name, seed). Tap an entry to vote; tap the other to switch; tap your choice again to clear it.
- **Voting is never compulsory.** Users can vote in any, all or none of the matchups.
- Users can change their vote until Harry closes the stage.
- Show personal progress ("You've voted in 5 of 8") and an anonymous stage count ("6 of 8 people have voted").
- **Live tallies are visible** to everyone (counts and a bar per matchup) while the stage is open.
- **Who voted for what is hidden until the stage closes,** then revealed to everyone. **Enforce in the database:** while a matchup is open, users can read only their own vote rows. Expose counts via a tally table maintained by a trigger (or a security-definer function), and use Supabase Realtime on the tally table for live updates, with refetch on focus as a fallback. Do not rely on Realtime over the votes table itself (RLS will hide other users' rows).
- Timestamps display in each user's local time zone.

---

## 8. Advancing stages (admin)

- **One button: "Close stage and advance".** It shows a confirmation modal summarising each matchup's result, flagging any ties, then on confirm runs a **single transactional RPC** (admin-only) that:
  1. Locks the stage's votes.
  2. Decides each matchup by most votes.
  3. **Ties (including 0-0) are decided by a random coin toss performed server-side** inside the function. Store the result and mark the matchup `decided_by = 'coin_toss'`; show a coin-toss badge on it everywhere.
  4. Reveals voter identities for the closed stage.
  5. Fills next-round matchups once both feeder matchups are decided.
  6. Opens the next stage, or marks the bracket complete after stage 10.
- **Undo last advance** (admin, for fixing mistakes): reverts the most recent push after a typed confirmation, warning that any votes cast in the newly opened stage will be discarded. Coin toss results already recorded are kept and reused if that matchup is still tied when re-closed, so a toss can never be rerolled.
- **Override a matchup result** (admin, bug fixing only): requires typed confirmation and is shown publicly with an "Admin decision" badge, so the bracket stays transparent.

---

## 9. History and seed paths

- **Bracket history:** every closed stage, viewable at any time. Mobile-friendly: round-by-round lists with an optional horizontally scrollable bracket tree for completed rounds.
- Each closed matchup shows final tallies, who voted for which entry, and any coin-toss or admin badge.
- **Entry page:** tap any entry anywhere to see its seed, points, who nominated it and at what rank, and its full path through the bracket (each opponent, tally, voters, result). People enjoy following a seed's run, so make this page good.

---

## 10. Champion and podium

- When stage 10 closes, show a **champion screen**: the winner presented in the full deco treatment, a **podium** (1st champion, 2nd final loser, 3rd third-place playoff winner), and the champion's path.
- Tasteful animation only; respect `prefers-reduced-motion`.

---

## 11. Archive

- A list of past brackets: title, dates, champion, podium.
- Each opens a read-only view of the full history, nominations and entry pages.
- Harry can start a new bracket only when no bracket is active.

---

## 12. Screens and navigation

- **Login** and **Change password** (forced on first login).
- **Home** (phase-aware call to action, current bracket title).
- **Nominate** (own list while open; everyone's lists after close).
- **Vote** (current stage).
- **Bracket** (history and tree).
- **Entry** (detail and path).
- **Archive**.
- **Profile** (change password, log out).
- **Admin** (visible to Harry only): bracket setup, nominations control, review and merge, images, seeding preview and lock, stage control, user management.
- Mobile bottom navigation; admin reached via an extra tab or menu item for Harry only.

---

## 13. Design

### Mood
- **Sleek dark art deco.** Style reference: the "dark deco" look of *Batman: The Animated Series* (1992): scenes painted on black so shapes emerge from shadow, silhouetted deco skyscrapers, searchlight beams, film-noir lighting, bold title-card typography.
- **Evoke the mood only.** Use no Batman or DC characters, logos, bat motifs, names, or trademarked fonts anywhere.

### Palette
- **Black and gold, restrained.** Near-black and charcoal surfaces in a few layered shades, a single muted gold/brass accent, warm ivory text.
- Gold is an accent: headings, fine rules, borders, active and selected states, the champion screen. Keep it to a small fraction of any screen. Do not overdo it.
- Define all colours as design tokens. Meet WCAG AA contrast.

### Typography
- A deco display face (e.g. from Google Fonts: Limelight, Poiret One, or similar) for titles and key headings only.
- A clean, legible geometric sans for body text and controls.
- Uppercase, letter-spaced small labels for section headers and seeds.

### Motifs
- Fine double gold rules, stepped and chevron borders, sunburst or fan shapes, an ornamental "vs" divider on matchup cards, subtle grain or vignette. Build with lightweight CSS/SVG.
- Matchup cards should feel like a theatre marquee or film title card.

### Usability
- Mobile-first; minimum 44px tap targets; works one-handed.
- Fast on slow connections: small bundle, lazy-loaded images.
- App name **"The Gang Does a Bracket"** in the header, manifest and page title. Design a simple original deco monogram or wordmark for the icon.

---

## 14. Build phases and acceptance criteria

1. **Scaffold and deploy:** repo created (public) via `gh`, Vite app builds, GitHub Actions deploys to Pages, Supabase project linked, env and secrets wired, keep-alive workflow running. *Done when the placeholder app loads at the Pages URL and can read from Supabase.*
2. **Auth and users:** seed script, username login, forced password change, persistent sessions, admin user management function, profiles with admin flag. *Done when all eight can log in and only Harry sees Admin.*
3. **Brackets and nominations:** bracket creation, phases, ranked nominations with blind RLS, progress count, reveal after close. *Done when RLS tests prove a non-admin cannot read others' nominations while open.*
4. **Review and seeding:** full list, duplicate suggestions, merge/unmerge with the best-rank rule, manual add, remove/restore, images, scoring, stored random tiebreaks, preview with cut line, lock. *Done when unit tests cover scoring, merge rules and ordering, and locking produces a correct bracket.*
5. **Voting and advancement:** stages, voting, hidden voters with visible live tallies, close-and-advance RPC with server-side coin toss, undo, override. *Done when RLS tests prove voters are hidden until close and a full simulated bracket advances correctly.*
6. **History, entry paths, champion, podium, archive.**
7. **Design polish:** full deco pass, mobile testing at common phone widths, accessibility check, reduced motion.
8. **Dry run tooling:** a dev-only script that simulates a complete bracket with fake nominations and random votes from all eight users against the test environment, then wipes it. Use it to verify everything end to end.

---

## 15. Documentation

Write a `README.md` with:
- Setup from scratch (with exact commands).
- How to run locally and run tests.
- **Harry's runbook:** start a bracket, close nominations, review, lock, advance stages, undo, reset a password, start the next bracket.
- How to resume a paused Supabase project.

---

## 16. Assumptions (Harry may change these)

- Users can change their vote until the stage closes.
- Stage sections release in fixed order (Quarter A to D, then top and bottom halves).
- A third-place playoff decides the podium's third place.
- After nominations close, everyone sees all nominations grouped by user with ranks.
- Seeding tiebreak order is points, then distinct nominators, then the stored random value.
- Exact normalised matches auto-combine at close (splittable); fuzzy matches need Harry's confirmation.
- Harry can abandon (delete) any bracket that has not gone live, with a typed confirmation.
