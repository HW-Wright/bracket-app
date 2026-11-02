# Handover

This is for a Claude Code session that picks up this codebase without the original build conversation, for example in the multi-room copy. Read `SPEC.md` (what the app does), `CLAUDE.md` (conventions and architecture) and `README.md` (setup, tests, Harry's runbook) first. This file covers what those leave out:
- the state of the original app;
- how Harry works;
- the reasons behind decisions;
- what was tried and dropped;
- platform quirks;
- settings that live outside the repo;
- open items;
- where the code assumes a single group.

Written 2026-11-03 at commit `accd120`. Dates are Harry's local dates (commits show +1100).

---

## 1. Before working in a copy

**A folder copy is still wired to the live app.** These gitignored files are in Harry's working folder. `cp -R` would bring them along; `git clone` doesn't.
- `.env`: the live project's URL, publishable key and **secret key**.
- `.env.local`: made for local screenshots, contents not re-checked. Vite gives it priority over `.env`, so `npm run dev` here may point at the local stack.
- `users.local.json`: the friends' starting passwords. Don't open it unless Harry asks.
- `supabase/.temp/`: the CLI's link to the live project. From a copy, `supabase db push` would migrate the original live database.

Start the new version from `git clone` (or delete those files), then `supabase link` it to its own project.

**Tracked files that point at the original deployment:**
- `supabase/config.toml`: `site_url`, and `project_id = "bracket_app"`, which also names the local Docker containers. Two local stacks with the same id clash.
- `README.md`: the Pages URL, the project ref, and the organisation and project names.
- The workflows read repo variables, which are set per repo (section 7).

`npm run seed:users` and `npm run test-bracket` use the **live** project from `.env` unless you pass `--local`.

## 2. State of the original app

- **Where it lives:**
  - Site: https://hw-wright.github.io/bracket-app/ (repo `HW-Wright/bracket-app`, public).
  - Supabase: organisation "The Gang", project "Bracket_App" (`vvevwyazanubxocimxmd`). Sydney region, Postgres 17, free plan.
- **Accounts:** eight. Harry (admin), Kier, Ollie, Reiss, Joe, Sean, Conor and Hutton. Ollie helped Harry test voting.
- **How it was built:** in one long Claude Code session. All eight SPEC phases went live on 2026-10-23. Changes from the group's real use followed until 2026-11-02. `git log` reads as a changelog (one commit per change).
- **Brackets played:** one real one, "The Worst Person of all Time" (64 seeds). Nominations opened around 2026-10-24 and it finished by 2026-11-02.
  - At the last check it was complete but not archived. Harry was going to press Admin → Archive now.
  - Brackets created before the sizes migration have size 64.
- **Stage counts:** no 10-stage bracket is left. The only one, "Test – ignore", was deleted on 2026-10-23. Advance and undo still look up whether a next stage exists rather than assume a count.

## 3. Working with Harry

- **Commands.** Harry is comfortable with the terminal and Git. Give exact, copy-pasteable commands and say where to run them.
  - Interactive logins (`supabase login`, `gh auth login --web`) need a real terminal. Harry runs those in a separate tab.
- **Ask first** before any of these:
  - a destructive change to the live database;
  - a live config push (`supabase config push`);
  - **starting Docker**. Harry's Mac has 8 GB of RAM. On 2026-10-24 the Docker Desktop VM crashed under memory pressure while the local stack, a dev server and headless Chromium were all running.
  - When you're finished with Docker, run `supabase stop`, then quit Docker Desktop.
- **Shipping.** Each change was shipped as its own commit with the tests passing.
  - Additive migrations were applied live as part of shipping: `supabase db push --dry-run` first, to see exactly what will run.
  - Then push (Pages deploys on push to `main`) and follow the run with `gh run watch`.
  - Check the staged diff for secrets before committing: the repo is public.
- **Small changes.** Harry often refines or reverses a change after seeing it ("Sorry, can we revert just…"). Keep changes small and separately revertable, and say what was verified and what wasn't.
- **Devices.** Harry tests in Brave on both a phone and a laptop, both in dark mode. The phone's OS was never stated.
  - Claude never tested on a real device. Layouts were checked in headless Chromium at 360px and 430px wide.
- **Mockups first.** For visual changes Harry likes to compare options before anything is built.
  - The mockups are in the claude.ai artifact "Bracket Theme Directions": https://claude.ai/artifact/PfiFJz5hmpx5BJPvrQrTDT. It is private to Harry's account; read it with the Artifact tool.
  - Rows A to G, described in section 5.
- **Timing.** For a change that touches a running bracket, Harry asks *when* to make it. Answer in terms of the live bracket's phase.
  - Example: a new mystery-seed rule only affects the next deal, and unlocking seeding re-deals.
- **Privacy.** Flag changes that affect privacy so Harry can tell the group. For example, the admin can see draft nominations.

## 4. Decisions and their reasons

SPEC records *what* was decided and when. These are the reasons, where they aren't already written there.

### Platform and auth
- **Hash routing, not a `404.html` fallback.** Deep links survive a refresh on Pages without tricks, and together with `base: './'` the build works at any path.
- **New-style API keys** (`sb_publishable_…` / `sb_secret_…`), not the legacy anon and service_role JWTs. The URL and publishable key are public by design, so they're GitHub repo *variables*, not secrets.
- **`.invalid` login domain** (`users.gang-bracket.invalid`): a reserved TLD that can never receive mail. Hosted Supabase Auth accepted it; this was checked during the first live seed.
- **`admin-users` has `verify_jwt = false`.** The function checks the caller's token and admin flag itself (`requireAdmin`), so it works with the project's asymmetric JWT signing keys.
  - It reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, which Supabase injects. No function secrets were ever set by hand.
- **Function EXECUTE is opt-in.** A test showed Supabase grants `anon` EXECUTE on every new function by default, so default privileges were revoked (see CLAUDE.md).

### Nominations and seeding
- **Duplicates auto-combine.** Harry needs duplicates *combined*, not removed, because the combined points and nominator count decide the seeding.
  - Fuzzy matches stay suggestions because near-misses are often different things. "Spider-Man" vs "Spider-Man 2" is a regular false positive: answer **Not the same**.
- **Spaces are dropped in `entry_key`.** With spaces kept, "Spider-Man" normalised to "spider man" and missed "spiderman".
- **Merges never rewrite data.** Scores are recomputed over the merge tree, so unmerge just clears `merged_into`. The target is the earlier entry and keeps its tiebreak, so a merge can't reroll the order.
- **Typed-title confirmations are lenient.** The first test bracket's title, "Test – ignore", had an en dash that phone keyboards make hard to type, so Harry couldn't abandon it. Confirmations now ignore case, punctuation and dash style (`20261023100000_lenient_title_confirm.sql`).

### Bracket and voting
- **One stage per round.** Originally the R64 was released in quarters and the R32 in halves (10 stages). Harry wanted each round shown whole.
- **Abandon in any phase.** Harry wants to be able to shut a bracket down at any point. It also made it possible to test voting on phones.
- **Unlock seeding.** Harry found missed duplicates after voting had opened. Seeds can change after a merge, so the matchups, votes and mystery deal go, while the review work stays.
- **Sizes on a fixed round scale.** The final is always round 6 and smaller brackets start later. That way the existing data and every final, third-place and semi-final rule stayed the same.
  - 128 seeds usually need manual entries, because eight complete lists give at most 120 distinct entries.

### Mystery seeds
- **Harry's sweepstake-style twist.** The table is in seed order but **shows no seed numbers**, because people would work out the entry from the number.
- **Nobody sees anyone else's hidden entry, the admin included**, because Harry plays too.
- **Top half only:** Harry's decision on 2026-10-30, live from 2026-11-02. The pool widens only when there are more players than top-half seeds.

### Stats and Home
- **Kingmaker was dropped.** In Harry's words, in practice it "really just counts how often a player voted last".
- **Voter-based stats use closed stages only**, because RLS hides open-stage votes.
- **"Who voted for who" panel:** before it, you could only find voters through an entry's path.
- **Stats has its own tab.** Profile moved to the header avatar to keep the bar at six tabs.
- **The Sean Zone** banner on Stats is an in-joke about Sean, one of the eight. Harry asked for it.

### Design
- **White text on the orange top crawl** is Harry's explicit choice, at 2.6:1 (below AA).
  - No orange dark enough to give 4.5:1 with white still looked like the brand orange, so the text has a faint navy edge instead.
  - Every other colour pair passes AA. The tightest is white on the LIVE-badge red, at 4.94:1.
- **Near-black title plates (#1b1b1b).** Brave's forced dark mode turned the white plates dark grey on Harry's phone, and Harry preferred that look, so it became the design. The page now declares `color-scheme: dark` so browsers don't repaint it.
- **Tabs are always orange.** Red is kept for warnings and the LIVE dot, after Home's red "Nominations open" tab clashed with the orange tabs elsewhere.
- **No NCAA or broadcaster branding.** Direction F was inspired by a UK Saturday football results show. It borrows the look only: no names, logos or fonts.

## 5. Tried and dropped

Don't propose these again without a new reason. The comparison artifact (section 3) still shows directions A to G.

| Dropped | Replaced by | When |
|---|---|---|
| 1920s art-deco theme (Limelight + Jost, gold, marquee cards) | broadcast direction D. Harry: "a gatsby esque vibe … a mismatch" for showdowns | 2026-10-23 |
| Directions A (arcade cabinet), B (jumbotron), C (90s broadcast), E (arena night) | D (C's broadcast graphics with B's LED numbers), plus E's numbered box per game | 2026-10-23 |
| D's fonts (Russo One, DotGothic16, Saira Condensed) and its dot-matrix texture | F's Roboto Condensed + IBM Plex Mono, on plain dark insets | 2026-10-24 |
| F's own colours (red accent, royal blue, yellow teleprinter text) | D's colours | 2026-10-24 |
| Dot-matrix LED font on the crawls | IBM Plex Mono. Tried at Harry's request, reverted within the hour because Harry preferred the original | 2026-10-24 |
| Dark crawl bars with amber text | G6 "split": orange top crawl, yellow results crawl | 2026-10-24 |
| White title plates | #1b1b1b plates on an offset orange box (G4) | 2026-10-24 |
| Red title tabs on some pages | always orange | 2026-10-24 |
| Yellow Sean Zone caption | the ActionLink shape (orange bar on a yellow offset) | 2026-10-24 |
| Sticky stats jump menu that scrolled sideways | static rows that wrap | 2026-10-26 |
| Pastel LIVE dot that faded as it pulsed | solid #ff1a1a with a white rim and a halo pulse | 2026-10-27 |
| "Round by round" as the default Bracket view | the tree | 2026-10-23 |
| Gold highlight on repeated nominations | red | 2026-10-23 |
| 10 stages (R64 in quarters, R32 in halves) | one stage per round | 2026-10-23 |
| Abandon allowed only before live | any phase | 2026-10-23 |
| Submission counts only during nominations | per-person status for the admin, later the lists themselves | 2026-10-23 / 24 |
| Nominations blind to the admin too | the admin sees every list, drafts included | 2026-10-24 |
| Kingmaker stat | dropped | 2026-10-30 |
| Mystery seeds dealt from the whole bracket | the top half | 2026-10-30 |
| A second free Supabase project for tests | the local Docker stack | 2026-10-23 |

## 6. Quirks and workarounds

### Bottom nav floating up on iOS (fix not verified on a device)
- **Symptom** (Harry, 2026-10-23): the tab bar sometimes floats up from the bottom of the screen until the tab is closed and reopened.
- **Likely cause** (not reproduced): after the keyboard closes, iOS WebKit can leave the layout viewport out of step with the screen. A `position: fixed; bottom: 0` bar then sits where the bottom used to be.
  - The app scrolls fields into view while you type nominations, which may make it more likely.
  - Brave on iOS also uses WebKit.
- **Fix** (`3f09d06`, `src/lib/useKeyboardAware.ts`), in two parts:
  - When the keyboard closes, the app re-sets the scroll position so Safari re-lays-out fixed elements.
  - It publishes the remaining gap as `--vv-shift`, which `.pin-to-visible-bottom` applies as a downward `translateY`. The gap is normally 0 and is ignored while pinch-zoomed.
- **Status:** never tested on a real iPhone, and no reports since.
- **If it comes back,** ask:
  - what was done just before (typing, rotating, switching apps, pull to refresh);
  - whether it happened in the browser or the home-screen app;
  - the device and iOS version.
- **Workaround:** scrolling slightly snaps the bar back.

### On-screen keyboard (fixed; Harry confirmed on a phone, 2026-10-23)
- **Symptom:** while typing a nomination, the keyboard, the pinned save bar and the tab bar covered the field.
- **Fix** (`e1fc2b2`): `useKeyboardAware` sets `data-keyboard` on `<html>` while the keyboard is up. It counts the keyboard as up when the visual viewport shrinks by more than 150px with a text field focused. Android compares against the tallest height seen for the orientation.
  - CSS then hides `.hide-with-keyboard` (the nav and the results crawl) and un-sticks `.unstick-with-keyboard` (the save and merge bars).
  - Focused fields scroll into the visible area 350ms after focus.
  - The editor's "Add #n" field calls `revealFocusedField()` after each add.
- **Rules for new UI:**
  - Fixed bottom chrome gets `hide-with-keyboard`.
  - Sticky bottom bars get `unstick-with-keyboard` and sit at `bottom-[calc(3.5rem+var(--results-h,0px)+env(safe-area-inset-bottom))]`.
  - `--results-h` is the results crawl's height (26px, or 0 when it's hidden), set in `Layout.tsx`.
  - `html` has `scroll-padding` for the sticky header and bars.

### Other front-end gotchas
- **Forced dark mode** in Brave/Chrome repainted the app: plates went grey and navy text went white. `color-scheme: dark` in `index.html` and `index.css` stops it.
- **iOS ignores SVG touch icons**, so the icons in `public/` are PNGs. Home-screen installs keep the old icon until they're removed and re-added.
- **Crawls** (`Crawl.tsx`):
  - Two identical copies scroll by exactly 50%, so the moving track must have no padding or the loop jumps.
  - The duration scales with the text length, so the speed stays constant.
  - Short feeds repeat to fill the bar. The crawls stay still under reduced motion.
- **Title tabs must not wrap.** They stay on one line, and the plate is at least as wide as its tabs (`5180d11`). A wrapping tab once covered "STATS".
- **Taste twins** uses equal-width columns so the 8×8 grid fits at 360px.
- Widths below 360px were never checked.

### Supabase CLI and tooling
- **`supabase login` needs a TTY**, so it can't run from Claude's `!` prompt. Avoid `--token`: it would put the token in the chat.
- **`supabase projects api-keys` masks the secret key unless you pass `--reveal`.** The first live seed failed with "Invalid API key" because `.env` held the masked value.
- **Hanging commands:** Supabase CLI commands can wait for input in a non-interactive shell. Add `< /dev/null`.
- **No Docker needed for linking or deploys:** `supabase link` worked without the database password, and `supabase functions deploy … --use-api` bundles on the server.
- **`supabase config push`:** run `supabase config diff` first.
  - The local `config.toml` was aligned with the live values (pool sizes, MFA, vector storage), so the push changed only auth.
  - The note "10 declared properties are not managed by config push" is expected.
- **Local stack:**
  - The first `supabase start` took about 30 minutes to pull images on Harry's connection.
  - Studio, analytics and the local mail catcher are turned off in `config.toml` to save memory. This only affects the local stack and isn't pushed.
- **Node version:** non-interactive shells pick up Homebrew's Node 23, which is past end of life. Run `source ~/.nvm/nvm.sh && nvm use` first.
- **zsh globs:** zsh expands unquoted globs, so write `grep --include='*.tsx'`, not `--include=*.tsx`.
- **Realtime:**
  - `postgres_changes` takes a few seconds after subscribing before it streams. Wait for the subscription to report it's ready before writing, as `test:realtime` does.
  - Give each subscription a unique channel name, or two screens using the same hook interfere.
  - Subscribing to `votes` fails outright because the table isn't in the publication. That's intended.
- **Changing an RPC's parameters:** PostgREST matches functions by argument names, so to add a parameter:
  1. Drop the old signature.
  2. Create the new one with a default, so the deployed app keeps working until the new build is live.
  3. Grant EXECUTE again. `create or replace` keeps grants only when the signature is unchanged.
- **plpgsql:** a loop variable with the same name as a column alias raises "column reference … is ambiguous". This happened in `lock_seeding`, and the alias was renamed.
- **pgTAP:**
  - `plan(n)` must match the number of assertions exactly.
  - `mystery_seeds` has no client access, so tests `reset role` before reading it.
  - Helpers live in `pg_temp`. Each file runs in a transaction and rolls back.
- **`npm run test:auth`** needs `supabase functions serve` running alongside it.

### Screenshots with realistic data
- `npm run dry-run -- --stages=N --keep` leaves a half-played bracket on the local stack. Log in as `zdry-harry` / `dry-run-pass`; `--wipe` removes it.
- To point `npm run dev` at the local stack, use `.env.local` with the values from `supabase status -o env`.
- Playwright was installed in the session scratchpad, not the project; keep it out of `package.json`. The viewport was 360px wide at device scale 2. The scratchpad is cleared between sessions, so expect to reinstall.
- Without Docker, components were rendered in a throwaway page that imports `src/index.css` with `@source "../src"`, so Tailwind generates the classes. Delete the page afterwards.

## 7. Settings outside the repo

Nothing was changed in the Supabase dashboard. Everything else that lives outside git:

| Where | What | How |
|---|---|---|
| Supabase Auth (live) | sign-up off, email confirmation off, `site_url` = the Pages URL, minimum password length 6 | `supabase config push` from `supabase/config.toml` (Harry ran it, 2026-10-23) |
| Supabase Edge Functions | `admin-users` | `supabase functions deploy admin-users --use-api` (unchanged since 2026-10-23) |
| Supabase Auth users | the eight accounts | `npm run seed:users` |
| Supabase Auth users | `connor` renamed to `conor` without a logout (2026-10-24) | Admin API (the app has no rename button). See the note below the table. |
| GitHub | public repo; Pages source = GitHub Actions | `gh repo create bracket-app --public --source . --remote origin`, then `gh api -X POST repos/HW-Wright/bracket-app/pages -f build_type=workflow` |
| GitHub | repo variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | `gh variable set` |
| GitHub | the keep-alive keeps its own schedule enabled (GitHub turns schedules off after 60 days without activity) | `gh api -X PUT …/enable` inside `keepalive.yml`, with `permissions: actions: write` |
| Harry's Mac | `gh auth setup-git` (global git credential helper), nvm default Node 24, Docker Desktop with 4 GB of memory (3 GB suggested) and not started at login | by hand |

The `conor` rename used:
1. `auth.admin.updateUserById(id, { email: 'conor@users.gang-bracket.invalid', email_confirm: true, user_metadata: { username: 'conor' } })`
2. An update of `profiles.username` and `profiles.display_name`.

The account's password and sessions were kept.

## 8. Unfinished, gaps and leftovers

- **Archived brackets** don't show the full Stats page or the Mystery seeds table. The data is kept.
- **No export or backup** of finished brackets: the archive exists only in the Supabase database. An export command was offered on 2026-10-30 but not requested.
- **The iOS nav fix** hasn't been verified on a device (section 6).
- **The white text on the orange crawl** is below AA. Harry accepted this.
- **`users.local.json` may still say `connor`.** If it does, re-running `npm run seed:users` would create a second account called "connor". It hasn't been checked, because the file stays unopened.
  - Fix with: `sed -i '' 's/"username": "connor", "displayName": "Connor"/"username": "conor", "displayName": "Conor"/' users.local.json`
- **The finished live bracket** may still be waiting for Archive now.
- **No UI tests.** Vitest covers pure logic only, and the database and integration scripts need the local stack.
  - CI (`deploy.yml`) runs `npm test` and the build, which type-checks. It doesn't run lint or any local-stack test.
- **Small leftovers in the code** (none of them affect behaviour):
  - The `--color-led` token is unused.
  - The comment on the `navy-900` token says "panel headers", but since direction F the panel header strips use `navy-700`.
  - In `index.css`, the "LED news crawl" comment sits above the LIVE-dot rules instead of above `@keyframes ticker`.
  - `Crawl.tsx` still calls itself an "LED news crawl"; it uses teleprinter type now.

## 9. Where the code assumes one group

These are the places that assume one group of friends with one admin:
- **One active bracket in the whole database:** the unique index `brackets_one_active` (`20261023020000_brackets_nominations.sql`). `create_bracket` auto-archives a finished one.
- **One global admin:** `profiles.is_admin`, `is_admin()` and `require_admin()`. Every admin RPC and the `entry-images` storage policies use them.
- **"Players" means every active profile.** Nomination progress ("5 of 8 have submitted"), the admin's submission list and the mystery-seed deal all count `profiles where active`.
- **Signed-in users can read everything** in every profile, bracket, entry, stage, matchup and tally (`using (true)`). The only privacy rules cover open nominations, open-stage votes and mystery seeds.
- **Accounts:** they come only from `seed:users` or the `admin-users` function, since sign-up is off. `usernameToEmail()` maps usernames into one global email namespace.
- **Copy:** UI text names Harry in about a dozen places (`grep -rn Harry src`). The app name and The Sean Zone are also specific to this group.
- **Constants:**
  - 15 nominations (`MAX_NOMINATIONS` in TS, `nomination_list_status()` in SQL);
  - points of 16 − rank;
  - sizes 8 to 128.
- **Layout:** Taste twins draws an N×N grid sized for about eight players at 360px.
- **Per-bracket keys:** storage paths are `entry-images/<bracket id>/`, and Realtime channels are per bracket.

## 10. Verification at handover

- The commit that adds this file changes only docs. `npm test` (59 tests), `npm run typecheck`, `npm run lint` and `npm run build` pass.
- The local-stack checks last ran on 2026-11-02 against `accd120`, and the code hasn't changed since. All of these passed:
  - the 10 pgTAP files;
  - dry runs at 8, 64 and 128 seeds;
  - `test:queries`, `test:realtime` and `test:storage`.
- `test:auth` last ran on 2026-10-23. `admin-users` hasn't changed since.
