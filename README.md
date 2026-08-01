# WatchFlow

WatchFlow is a private, multi-user movie-management SaaS built with the Next.js
App Router, TypeScript, Tailwind CSS, Supabase Auth/PostgreSQL/RLS, and a
server-only TMDB integration.

The implemented application supports authentication, profiles and preferences,
movie search, a private library, personal ratings/reviews/favourites, Watch
Next ordering, timezone-aware scheduling, CSV import, CSV/JSON exports, private
custom lists, a filtered random picker, and transparent rule-based
recommendations.

Payments, public profiles/lists, social or collaborative features, AI
recommendations, notification delivery, calendar sync, and production
deployment are out of scope. There is currently no `/statistics` page.

## Repository orientation

Read these before changing the application:

1. `AGENTS.md`
2. `docs/PROJECT_CONTEXT.md`
3. the relevant architecture/database/security documents

Important references:

- `docs/ARCHITECTURE.md` — application and data-flow boundaries
- `docs/DATABASE.md` — tables, RLS expectations, RPCs, migrations, and indexes
- `docs/SECURITY.md` — permanent security rules
- `docs/SECURITY_AUDIT.md` — Part 15 source/static audit and unresolved risks
- `docs/TESTING.md` — unit, integration, database, and Playwright architecture
- `docs/PRODUCTION_READINESS.md` — honest Preview/production gate status
- `docs/PRODUCT_SPEC.md` — implemented product behavior
- `docs/IMPLEMENTATION_PLAN.md` — milestone history and next work

## Requirements

- A maintained Node.js version supported by Next.js 16
- npm and the committed lockfile
- A non-production Supabase project with the reviewed schema/migrations
- A TMDB API read-access token for search/import workflows
- Chrome for the configured Playwright project

Install from the lockfile:

```bash
npm ci
```

## Environment-variable names

Copy `.env.example` to an ignored `.env.local` and configure the required names
without committing their values.

| Name | Exposure | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe public | Supabase publishable/legacy anon key |
| `SUPABASE_SECRET_KEY` | Server-only secret | Shared movie metadata and final verified Auth-user deletion |
| `TMDB_READ_ACCESS_TOKEN` | Server-only secret | Server-side TMDB search/details/import |
| `NEXT_PUBLIC_APP_URL` | Browser-safe public, currently optional | Reserved application origin name; current source does not consume it |

The E2E and integration names are documented in `.env.example` and
`docs/TESTING.md`. Real QA emails/passwords, cookies, Auth storage state,
access/refresh tokens, and downloaded private exports must not be committed.

## Database setup

The repository contains incremental migrations only; the original base schema
for `profiles`, `movies`, and `user_movies` is absent. Do not rerun older
non-idempotent migrations blindly or infer remote application from Git.

For an existing development target:

1. verify actual objects with
   `supabase/verification/development_readiness.sql`;
2. reconcile the target with the reviewed migration sequence;
3. manually apply only the missing patch migration(s), ending with
   `supabase/migrations/202607300001_part_15_tmdb_rate_limits.sql`;
4. after the transaction commits, run this as a separate SQL Editor step:

   ```sql
   notify pgrst, 'reload schema';
   ```

5. run both read-only verification scripts and investigate every `MISSING`,
   `REVIEW_*`, or unsafe result; and
6. use two disposable users to verify RLS and privileges before mutating real
   data.

No migration in this repository should be automatically applied to an unknown
or production database.

## Local development

Start the development server:

```bash
npm run dev
```

The default local origin is `http://localhost:3000`. Supabase Auth Site URL and
allowed redirect URLs must include the local callback/recovery routes described
in `docs/ARCHITECTURE.md`.

## Quality commands

```bash
npm run lint
npx tsc --noEmit
npm test
npm run test:integration
npm run test:e2e
npm run build
npm run scan:client-secrets
```

The integration and authenticated/destructive Playwright suites are deliberately
guarded. Credentialed runs require `E2E_EXPECTED_SUPABASE_URL` to exactly match
the configured public Supabase URL, an explicit development target, a loopback
application URL, and disposable credentials. Playwright starts its configured
server instead of reusing an unknown listener for a correctly pinned run. A
skipped live test is not a passing workflow; see `docs/TESTING.md`.

Run the client secret scan only after a successful production build. It checks
built browser chunks and rendered payloads without printing configured secret
values.

## Security essentials

- Keep `SUPABASE_SECRET_KEY` and `TMDB_READ_ACCESS_TOKEN` in server-only code.
- Use fresh Supabase Auth identity for mutations, provider ingestion, exports,
  and deletion; never trust a browser-supplied user ID.
- Keep normal user-owned operations on the authenticated SSR client so RLS is
  enforced.
- Restrict the admin client to shared `movies` metadata and final deletion of
  the same verified Auth user.
- Never disable RLS or broaden policies/grants to make an application error go
  away.
- Keep CSV uploads in memory and bounded; keep exports private/no-store and
  formula-safe.
- Use only disposable development users for destructive QA.

See `docs/SECURITY.md` and `docs/SECURITY_AUDIT.md` for the complete rules and
Part 15 findings.

## Current readiness

Part 15 hardening and test architecture are implemented locally, but the
required authenticated workflow matrix and live Preview verification remain
incomplete. The database-backed rate limiter migration has not been applied
remotely by this work, and live two-user RLS, full authenticated workflows,
password-reset delivery, and disposable account deletion remain unverified.

The next milestone is **Part 16 — Preview Deployment**. Production launch
remains blocked on isolated environments, migration/RLS evidence, email,
backups, monitoring, legal pages, TMDB attribution/licensing, and domain/Auth
configuration. The full status is in `docs/PRODUCTION_READINESS.md`.
