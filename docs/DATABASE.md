# WatchFlow Database

## Scope and source of truth

The deployed Supabase database already contains `profiles`, `movies`, and
`user_movies`, with RLS enabled. This repository currently contains no SQL
migrations, schema dump, or generated Supabase database types, so this document
records the verified table-level design and the application contract without
inventing unverified deployed columns.

The live Supabase schema remains authoritative. Before Phase 2 adds writes or
generated types, capture the deployed definitions in a reviewed, non-destructive
migration baseline.

## Relationship model

```text
auth.users
    1
    |
    1
profiles
    1
    |
    many
user_movies
    many
    |
    1
movies
```

## Tables

### `profiles`

Purpose: application-owned member information that complements the identity in
Supabase Auth.

Phase 1 application contract:

- A profile is addressed by the authenticated Auth user UUID through `id`.
- A signed-in member can read their own profile under the existing RLS policy.
- The dashboard tolerates a missing profile row and reports it as not yet
  created.
- Common optional presentation fields such as `display_name`, `full_name`,
  `username`, or `name` are used only when present; the authenticated email
  continues to come from verified Auth claims.

### `movies`

Purpose: the shared movie catalog used by all members. It should hold canonical
movie metadata once Phase 2 begins.

Phase 1 does not read or write this table. TMDB identifiers, metadata mapping,
upsert behavior, and refresh policy must be confirmed during Phase 2 against the
actual deployed columns.

### `user_movies`

Purpose: the association between a member and a shared movie. It is the natural
location for user-specific state such as library membership, status, priority,
rating, notes, or scheduling references where those columns exist.

Phase 1 does not read or write this table. The deployed foreign-key column names,
status vocabulary, uniqueness constraint, and timestamps must be confirmed
before implementing library mutations.

## RLS expectations

RLS is already configured and must not be disabled or bypassed. The intended
security properties are:

- Members can access only their own `profiles` row.
- Members can access only their own associations in `user_movies`.
- Access to shared `movies` rows follows the deployed read/write policies.
- Browser and server requests use the member's publishable-key client and JWT;
  application code does not use a service-role key.

These are security expectations, not a replacement for reviewing the deployed
policy SQL before Phase 2 writes are introduced.

## Schema-change policy

No schema changes are part of Phase 1. Future changes should be represented as
reviewable migrations, preserve RLS, include indexes for foreign keys and common
filters, and be tested as at least two distinct users to verify tenant isolation.
