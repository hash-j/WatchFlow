# WatchFlow Product Specification

## Product summary

WatchFlow is a multi-user SaaS for maintaining a personal movie library,
choosing what to watch next, and planning future viewing. Each user's account
and movie activity are private and isolated through Supabase Auth and database
RLS.

## Phase 1 goal

Establish a secure, deployable application foundation with complete email and
password authentication and an authenticated product shell.

## Phase 1 users and journeys

### New member

1. A visitor creates an account with an email address and password.
2. WatchFlow asks the visitor to verify their email.
3. The verification callback exchanges the Supabase auth code or token hash for
   a cookie-backed session.
4. The verified member enters the protected dashboard.

### Returning member

1. A member signs in with email and password.
2. WatchFlow sends them to `/dashboard`.
3. The member can navigate the authenticated application or sign out.

### Password recovery

1. A member requests a recovery email without revealing whether an account
   exists.
2. The recovery link enters the server callback, which establishes the recovery
   session.
3. Only an authenticated recovery session can open the reset form.
4. After selecting and confirming a new password, the member returns to the
   dashboard.

## Phase 1 functional requirements

- Email/password sign-up, sign-in, sign-out, verification, forgotten-password,
  and reset-password flows.
- Server-side protection for `/dashboard`, `/search`, `/library`,
  `/watch-next`, `/schedule`, and `/settings`.
- Redirect unauthenticated application visitors to `/auth/login`.
- Show the signed-in email address and load the member's `profiles` record.
- Provide a responsive authenticated shell with navigation for Dashboard,
  Search Movies, My Library, Watch Next, Schedule, and Settings.
- Provide intentional placeholder screens for features not yet implemented.
- Provide useful loading, form error, callback error, and route error states.

## Non-functional requirements

- Server Components are the default rendering boundary.
- Client Components are limited to interactive auth forms, sign-out, theme
  controls, and required error-boundary behavior.
- The publishable Supabase key may be used by browser code; secret/service-role
  keys must never enter the client bundle.
- User data access must use RLS-scoped Supabase clients.
- Layouts must work from mobile through desktop widths.

## Explicitly out of scope

- TMDB API integration, movie ingestion, and live movie search.
- Payments, subscriptions, plans, invoices, and billing-provider integration.
- Database schema changes.
- Fully implemented library, queue, schedule, or settings workflows.

## Phase 1 acceptance criteria

- All specified routes exist and protected routes reject anonymous access.
- Authentication callbacks create server-visible cookie sessions.
- The dashboard renders the authenticated email and profile availability.
- The repository passes ESLint, TypeScript checking, and a production build.
