-- Local-only behavioral verification for Part 18A Performance Fix Batch 2.
-- Run after from_zero_bootstrap.sql and every versioned migration. This file
-- rolls back all fixtures and must never be applied to a hosted project.

begin;

insert into auth.users (id, email)
values
  ('a0000000-0000-4000-8000-000000000001', 'queue-owner-a@example.test'),
  ('b0000000-0000-4000-8000-000000000002', 'queue-owner-b@example.test'),
  ('c0000000-0000-4000-8000-000000000003', 'queue-empty@example.test');

insert into public.movies (
  tmdb_id,
  title,
  genres,
  main_cast,
  production_countries
)
select
  18000 + fixture.number,
  'Queue Fixture ' || fixture.number,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb
from pg_catalog.generate_series(1, 7) as fixture(number);

insert into public.user_movies (
  id,
  user_id,
  movie_id,
  status,
  priority,
  queue_position,
  watched_at,
  created_at
)
values
  (
    'a1000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    (select id from public.movies where tmdb_id = 18001),
    'watch_next', 5, 3, null, '2026-01-01T00:00:00Z'
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000001',
    (select id from public.movies where tmdb_id = 18002),
    'watch_next', 0, 1, '2020-01-02T00:00:00Z', '2026-01-02T00:00:00Z'
  ),
  (
    'a3000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000001',
    (select id from public.movies where tmdb_id = 18003),
    'watch_next', 2, null, null, '2025-12-31T00:00:00Z'
  ),
  (
    'a4000000-0000-4000-8000-000000000004',
    'a0000000-0000-4000-8000-000000000001',
    (select id from public.movies where tmdb_id = 18004),
    'want_to_watch', 4, null, null, '2026-01-04T00:00:00Z'
  ),
  (
    'a5000000-0000-4000-8000-000000000005',
    'a0000000-0000-4000-8000-000000000001',
    (select id from public.movies where tmdb_id = 18005),
    'want_to_watch', 1, null, null, '2026-01-05T00:00:00Z'
  ),
  (
    'b1000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000002',
    (select id from public.movies where tmdb_id = 18006),
    'watch_next', 3, 7, null, '2026-01-01T00:00:00Z'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000001',
  true
);

select public.watchflow_normalize_queue();

do $$
declare
  v_ids uuid[];
  v_positions integer[];
  v_priorities smallint[];
begin
  select
    pg_catalog.array_agg(id order by queue_position),
    pg_catalog.array_agg(queue_position order by queue_position),
    pg_catalog.array_agg(priority order by queue_position)
  into v_ids, v_positions, v_priorities
  from public.user_movies
  where user_id = 'a0000000-0000-4000-8000-000000000001'
    and status = 'watch_next';

  if v_ids <> array[
      'a2000000-0000-4000-8000-000000000002'::uuid,
      'a1000000-0000-4000-8000-000000000001'::uuid,
      'a3000000-0000-4000-8000-000000000003'::uuid
    ]
    or v_positions <> array[1, 2, 3]
    or v_priorities <> array[0, 5, 2]::smallint[] then
    raise exception 'Owner A normalization changed order, priority, or contiguity';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  'b0000000-0000-4000-8000-000000000002',
  true
);

do $$
declare
  v_position integer;
begin
  select queue_position
  into v_position
  from public.user_movies
  where id = 'b1000000-0000-4000-8000-000000000001';

  if v_position <> 7 then
    raise exception 'Owner A normalization changed Owner B position';
  end if;
end;
$$;

select public.watchflow_normalize_queue();

do $$
begin
  if (
    select queue_position
    from public.user_movies
    where id = 'b1000000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'Single-item queue did not normalize to position 1';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  'c0000000-0000-4000-8000-000000000003',
  true
);
select public.watchflow_normalize_queue();

select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000001',
  true
);

select public.watchflow_bulk_update_library_status(
  array[
    'a5000000-0000-4000-8000-000000000005'::uuid,
    'a4000000-0000-4000-8000-000000000004'::uuid
  ],
  'watch_next'
);

do $$
declare
  v_ids uuid[];
  v_positions integer[];
begin
  select
    pg_catalog.array_agg(id order by queue_position),
    pg_catalog.array_agg(queue_position order by queue_position)
  into v_ids, v_positions
  from public.user_movies
  where user_id = 'a0000000-0000-4000-8000-000000000001'
    and status = 'watch_next';

  if v_ids[4:5] <> array[
      'a5000000-0000-4000-8000-000000000005'::uuid,
      'a4000000-0000-4000-8000-000000000004'::uuid
    ]
    or v_positions <> array[1, 2, 3, 4, 5] then
    raise exception 'Bulk add did not append in request order';
  end if;
end;
$$;

select public.move_watch_queue_item(
  'a4000000-0000-4000-8000-000000000004',
  'up'
);

do $$
begin
  if (
    select queue_position
    from public.user_movies
    where id = 'a4000000-0000-4000-8000-000000000004'
  ) <> 4 or (
    select queue_position
    from public.user_movies
    where id = 'a5000000-0000-4000-8000-000000000005'
  ) <> 5 then
    raise exception 'Adjacent queue reorder did not persist';
  end if;
end;
$$;

select public.watchflow_bulk_remove_library_movies(
  array['a5000000-0000-4000-8000-000000000005'::uuid]
);

do $$
begin
  if (
    select pg_catalog.array_agg(queue_position order by queue_position)
    from public.user_movies
    where user_id = 'a0000000-0000-4000-8000-000000000001'
      and status = 'watch_next'
  ) <> array[1, 2, 3, 4] then
    raise exception 'Queue removal did not compact positions';
  end if;
end;
$$;

select public.watchflow_bulk_update_library_status(
  array['a2000000-0000-4000-8000-000000000002'::uuid],
  'watched'
);

do $$
declare
  v_positions integer[];
  v_watched_at timestamptz;
begin
  select pg_catalog.array_agg(queue_position order by queue_position)
  into v_positions
  from public.user_movies
  where user_id = 'a0000000-0000-4000-8000-000000000001'
    and status = 'watch_next';

  select watched_at
  into v_watched_at
  from public.user_movies
  where id = 'a2000000-0000-4000-8000-000000000002';

  if v_positions <> array[1, 2, 3]
    or v_watched_at <> '2020-01-02T00:00:00Z'::timestamptz then
    raise exception 'Status transition failed compaction or watched_at preservation';
  end if;
end;
$$;

reset role;
rollback;

select 'PART_18A_QUEUE_BEHAVIOR=PASS' as result;
