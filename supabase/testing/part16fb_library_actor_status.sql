-- Local-only behavioral verification for Part 16F-B Batch 2A.
-- Run after from_zero_bootstrap.sql and every versioned migration. This file
-- rolls back its fixtures and must never be applied to a hosted project.

begin;

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'batch2a-owner@example.test'),
  ('20000000-0000-0000-0000-000000000002', 'batch2a-other@example.test');

insert into public.movies (
  tmdb_id,
  title,
  original_title,
  release_date,
  release_year,
  genres,
  director,
  main_cast,
  production_countries,
  public_rating
)
values
  (
    16001,
    'Arrival Fixture',
    'Arrival Fixture',
    '2016-11-11',
    2016,
    '[{"name":"Drama"},{"name":"Science Fiction"}]'::jsonb,
    'Denis Villeneuve',
    '[{"name":"Amy Adams"},{"name":"Jeremy Renner"}]'::jsonb,
    '[]'::jsonb,
    7.9
  ),
  (
    16002,
    'Enchanted Fixture',
    'Enchanted Fixture',
    '2007-11-21',
    2007,
    '["Comedy", "Fantasy"]'::jsonb,
    'Kevin Lima',
    '["Amy   Adams", "Patrick Dempsey"]'::jsonb,
    '[]'::jsonb,
    7.1
  ),
  (
    16003,
    'Unrelated Fixture',
    'Unrelated Fixture',
    '2012-01-01',
    2012,
    '["Drama"]'::jsonb,
    'Another Director',
    '["Another Actor"]'::jsonb,
    '[]'::jsonb,
    6.5
  );

insert into public.user_movies (
  id,
  user_id,
  movie_id,
  status,
  personal_rating,
  priority,
  watched_at
)
values
  (
    '11000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000001',
    (select id from public.movies where tmdb_id = 16001),
    'watched',
    9,
    4,
    '2020-01-02T00:00:00Z'
  ),
  (
    '12000000-0000-0000-0000-000000000012',
    '10000000-0000-0000-0000-000000000001',
    (select id from public.movies where tmdb_id = 16002),
    'dropped',
    null,
    0,
    null
  ),
  (
    '13000000-0000-0000-0000-000000000013',
    '10000000-0000-0000-0000-000000000001',
    (select id from public.movies where tmdb_id = 16003),
    'want_to_watch',
    null,
    0,
    null
  ),
  (
    '21000000-0000-0000-0000-000000000021',
    '20000000-0000-0000-0000-000000000002',
    (select id from public.movies where tmdb_id = 16001),
    'watched',
    8,
    2,
    '2021-02-03T00:00:00Z'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

do $$
declare
  v_actor_count integer;
  v_combined_count integer;
  v_first_id uuid;
  v_second_id uuid;
begin
  select count(*)
  into v_actor_count
  from public.watchflow_library_rows_v2(p_actor => '  AMY ADAMS  ');

  if v_actor_count <> 2 then
    raise exception 'Actor filter expected 2 owner rows, received %', v_actor_count;
  end if;

  select count(*)
  into v_combined_count
  from public.watchflow_library_rows_v2(
    p_status => 'watched',
    p_watched => true,
    p_genre => '  DRAMA ',
    p_director => ' denis   villeneuve ',
    p_actor => ' amy adams ',
    p_year => 2016
  );

  if v_combined_count <> 1 then
    raise exception 'Combined actor filter expected 1 row, received %', v_combined_count;
  end if;

  select user_movie_id
  into v_first_id
  from public.watchflow_library_rows_v2(p_actor => 'amy adams')
  order by title, user_movie_id
  offset 0 limit 1;

  select user_movie_id
  into v_second_id
  from public.watchflow_library_rows_v2(p_actor => 'amy adams')
  order by title, user_movie_id
  offset 1 limit 1;

  if v_first_id is null or v_second_id is null or v_first_id = v_second_id then
    raise exception 'Actor-filter pagination did not return two stable distinct rows';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002',
  true
);

do $$
declare
  v_other_owner_count integer;
begin
  select count(*)
  into v_other_owner_count
  from public.watchflow_library_rows_v2(p_actor => 'amy adams');

  if v_other_owner_count <> 1 then
    raise exception 'Owner isolation expected 1 row, received %', v_other_owner_count;
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

do $$
declare
  v_updated boolean;
  v_watched_at timestamptz;
  v_queue_position integer;
begin
  select public.watchflow_update_library_movie_v2(
    p_library_id => '11000000-0000-0000-0000-000000000011'::uuid,
    p_status => 'want_to_watch'::text,
    p_personal_rating => 9::numeric,
    p_review => 'Preserved review'::text,
    p_priority => 4::smallint,
    p_would_watch_again => true,
    p_watched_at => null::timestamptz,
    p_watched_at_provided => false,
    p_scheduled_for => null::timestamptz,
    p_timezone => null::text,
    p_schedule_note => null::text
  ) into v_updated;

  select watched_at, queue_position
  into v_watched_at, v_queue_position
  from public.user_movies
  where id = '11000000-0000-0000-0000-000000000011';

  if not v_updated
    or v_watched_at <> '2020-01-02T00:00:00Z'::timestamptz
    or v_queue_position is not null then
    raise exception 'Saved update did not preserve watched_at or stay outside Watch Next';
  end if;

  select public.watchflow_update_library_movie_v2(
    p_library_id => '11000000-0000-0000-0000-000000000011'::uuid,
    p_status => 'watched'::text,
    p_personal_rating => 8.5::numeric,
    p_review => 'Unrelated edit'::text,
    p_priority => 3::smallint,
    p_would_watch_again => true,
    p_watched_at => null::timestamptz,
    p_watched_at_provided => false,
    p_scheduled_for => null::timestamptz,
    p_timezone => null::text,
    p_schedule_note => null::text
  ) into v_updated;

  select watched_at
  into v_watched_at
  from public.user_movies
  where id = '11000000-0000-0000-0000-000000000011';

  if not v_updated or v_watched_at <> '2020-01-02T00:00:00Z'::timestamptz then
    raise exception 'Unrelated Watched edit erased watched_at';
  end if;

  select public.watchflow_update_library_movie_v2(
    p_library_id => '11000000-0000-0000-0000-000000000011'::uuid,
    p_status => 'watched'::text,
    p_personal_rating => 8.5::numeric,
    p_review => 'Explicit clear'::text,
    p_priority => 3::smallint,
    p_would_watch_again => true,
    p_watched_at => null::timestamptz,
    p_watched_at_provided => true,
    p_scheduled_for => null::timestamptz,
    p_timezone => null::text,
    p_schedule_note => null::text
  ) into v_updated;

  select watched_at
  into v_watched_at
  from public.user_movies
  where id = '11000000-0000-0000-0000-000000000011';

  if not v_updated or v_watched_at is not null then
    raise exception 'Explicit Watched-date clear did not persist';
  end if;
end;
$$;

reset role;
rollback;

select 'PART_16FB_BEHAVIOR=PASS' as result;
