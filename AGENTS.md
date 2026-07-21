# WatchFlow Repository Guidance

## Product scope

WatchFlow is a multi-user movie-management SaaS built with the Next.js App
Router, TypeScript, Tailwind CSS, Supabase Auth, Supabase PostgreSQL, and
Supabase Row Level Security (RLS).

Phase 1 established the project foundation and authentication. The current
milestone is Phase 2: server-side TMDB search and the private movie library.
Payments remain explicitly out of scope.

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
- Map provider responses into internal movie types at the provider boundary.
- Do not log access tokens, refresh tokens, credentials, or private user data.

## Current data contract

- `profiles` stores application profile data associated with Supabase Auth
  users.
- `movies` stores shared movie records.
- `user_movies` associates a user/profile with a movie and stores user-specific
  movie state.
- RLS is already configured and must remain enabled.

See `docs/ARCHITECTURE.md` and `docs/DATABASE.md` before extending these areas.
