# The Gang Does a Bracket

Private bracket voting for eight friends. See `SPEC.md` for the full spec.

> Full setup, local dev, testing and Harry's runbook will be written as the build progresses.

## Resuming a paused Supabase project
A keep-alive workflow (`.github/workflows/keepalive.yml`) pings the database every 3 days. If the project pauses anyway:
open the Supabase dashboard → organisation **The Gang** → **Bracket_App** → **Restore project**, wait a few minutes, then reload the app.
