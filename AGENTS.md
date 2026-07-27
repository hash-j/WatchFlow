# WatchFlow Repository Guidance

## PROJECT CONTEXT REQUIREMENT

Before planning or modifying code:

1. Read `docs/PROJECT_CONTEXT.md`.
2. Treat it as the primary project handoff document.
3. Verify relevant statements against the current repository.
4. Do not repeat completed discovery work unless the file is stale or
   conflicting.
5. After completing a task, update `docs/PROJECT_CONTEXT.md`.
6. Never place secrets or actual environment-variable values in the context
   file.

## Product scope

WatchFlow is a multi-user movie-management SaaS built with the Next.js App
Router, TypeScript, Tailwind CSS, Supabase Auth, Supabase PostgreSQL, and
Supabase Row Level Security (RLS).

Phase 1 established the project foundation and authentication, Phase 2 added
server-side TMDB search and the private movie library, and Phase 3 added private
movie management, the Watch Next queue, and timezone-aware scheduling. Part
10A added CSV import. Part 10B adds private settings, preferences, exports, and
account data controls. Payments remain explicitly out of scope.

## Engineering rules

- Inspect the existing implementation and working tree before editing.
- Do not recreate or replace the Next.js project.
- Use Server Components by default. Add `"use client"` only where browser
  state, event handlers, or another client-only API is required.
- Keep changes simple, typed, accessible, responsive, and production-oriented.
- Preserve unrelated and pre-existing user changes.
- Do not run destructive filesystem, Git, or database commands.
- Do not modify files outside this repository.
- Do not change the database schema unless a confirmed blocking error requires
  it and the user has authorized the change.
- Run ESLint, TypeScript checking, and a production build after implementation.
  Never claim a check passed unless its command completed successfully.

## Security requirements

- Never print, expose, copy, or log values from `.env.local`.
- Never commit environment files or credentials.
- Never expose a Supabase secret/service-role key to browser code.
- Never expose `TMDB_READ_ACCESS_TOKEN` or `SUPABASE_SECRET_KEY` to browser
  JavaScript.
- Browser code may use only the public Supabase URL and publishable/anon key.
- Keep secret environment variables out of Client Components.
- Use the `@supabase/ssr` browser and server clients for cookie-based auth.
- Validate server-side identity with `supabase.auth.getClaims()` (or
  `getUser()` when fresh Auth-server data is specifically required); never use
  `getSession()` as an authorization check.
- Refresh auth cookies through `proxy.ts`, preserving all cookies written by
  Supabase on the returned response.
- Treat callback redirect parameters as untrusted and allow only internal
  application paths.
- Query user-owned data with the signed-in user's Supabase client so RLS is
  enforced. Never bypass RLS in application code.
- Mark TMDB provider and Supabase admin-client modules with `import
  "server-only"`.
- Never accept a user ID from browser input. Derive it from verified server-side
  Supabase claims.
- Confirm the authenticated user before invoking TMDB detail ingestion or
  constructing the secret-key admin client.
- Restrict the secret-key client to shared `movies` metadata. Perform
  `user_movies` reads and mutations with the authenticated SSR client so RLS
  remains enforced.
- Keep queue and schedule mutations user-scoped. Direct `user_movies` updates
  must filter by both the record ID and the verified user ID; database
  functions must derive ownership from `auth.uid()`. RLS must apply in either
  path.
- Store scheduled instants in `scheduled_for` as `timestamptz`; validate IANA
  timezone input, store the selected timezone in `schedule_timezone`, and use
  `profiles.timezone` as the preferred form default.
- Map provider responses into internal movie types at the provider boundary.
- Do not log access tokens, refresh tokens, credentials, or private user data.
- Generate private exports on demand, send them as no-store attachments, and
  protect CSV values from spreadsheet formula execution.
- Use the authenticated client for profile, preference, export, and library
  deletion operations. Construct the admin client only after `getUser()` for
  the final deletion of that same Auth user.

## Current data contract

- `profiles` stores application profile data associated with Supabase Auth
  users.
- `movies` stores shared movie records.
- `user_movies` associates a user/profile with a movie and stores user-specific
  movie state, queue position, personal metadata, and scheduling data.
- `user_preferences` stores private application, display, search, and future
  notification choices. Notification delivery is not implemented.
- RLS is already configured and must remain enabled.

See `docs/ARCHITECTURE.md` and `docs/DATABASE.md` before extending these areas.

## Critical authentication route stability

Critical authentication routes must not be deleted, renamed, or moved while
implementing unrelated features:

- `/auth/login`
- `/auth/sign-up`
- `/auth/forgot-password`
- `/auth/reset-password`
- `/auth/callback` or `/auth/confirm`
- `/dashboard`
- `/settings`

Before completing future features, verify that `/auth/sign-up` does not return
a 404 response.
