begin;

-- Favourite is private relationship state. If a partially implemented column
-- already contains NULLs, SET NOT NULL deliberately fails rather than silently
-- rewriting those existing values.
alter table public.user_movies
  add column if not exists favourite boolean not null default false;

alter table public.user_movies
  alter column favourite set default false;

alter table public.user_movies
  alter column favourite set not null;

comment on column public.user_movies.favourite is
  'Private favourite flag owned by the user_movies row owner.';

-- Narrow grants cover deployments that use column-level privileges. RLS still
-- decides which relationship row an authenticated member may read or update.
grant select (favourite) on table public.user_movies to authenticated;
grant update (favourite) on table public.user_movies to authenticated;

-- Focused indexes for the Part 12 owner-scoped filters and sorts. Existing
-- unique movie, Watch Next, and schedule indexes are intentionally not repeated.
create index if not exists user_movies_library_created_at_idx
  on public.user_movies (user_id, created_at desc, id desc);

create index if not exists user_movies_library_status_created_at_idx
  on public.user_movies (user_id, status, created_at desc, id desc);

create index if not exists user_movies_library_favourite_created_at_idx
  on public.user_movies (user_id, favourite desc, created_at desc, id desc);

create index if not exists user_movies_library_personal_rating_idx
  on public.user_movies (user_id, personal_rating desc, id desc)
  where personal_rating is not null;

create index if not exists user_movies_library_watched_at_idx
  on public.user_movies (user_id, watched_at desc, id desc)
  where watched_at is not null;

-- A flat, owner-scoped relation lets PostgREST safely apply whitelisted sort,
-- exact count, and range modifiers to both relationship and movie columns.
-- Search uses literal substring matching, so %, _, commas, quotes, parentheses,
-- and backslashes cannot become SQL or PostgREST syntax.
create or replace function public.watchflow_library_rows(
  p_query text default null,
  p_status text default null,
  p_watched boolean default null,
  p_favourite boolean default null,
  p_genre text default null,
  p_director text default null,
  p_year integer default null,
  p_year_from integer default null,
  p_year_to integer default null,
  p_rating_min numeric default null,
  p_rating_max numeric default null
)
returns table (
  user_movie_id uuid,
  movie_id bigint,
  status text,
  personal_rating numeric,
  priority smallint,
  watched_at timestamptz,
  added_at timestamptz,
  favourite boolean,
  tmdb_id bigint,
  title text,
  original_title text,
  poster_path text,
  release_date text,
  release_year integer,
  public_rating numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with normalized as (
    select
      lower(left(nullif(btrim(p_query), ''), 100)) as query,
      case
        when p_status = any (array[
          'want_to_watch',
          'watch_next',
          'scheduled',
          'currently_watching',
          'watched',
          'on_hold',
          'dropped'
        ]::text[]) then p_status
        else null
      end as status,
      p_watched as watched,
      p_favourite as favourite,
      lower(left(nullif(regexp_replace(btrim(p_genre), '[[:space:]]+', ' ', 'g'), ''), 100)) as genre,
      lower(left(nullif(regexp_replace(btrim(p_director), '[[:space:]]+', ' ', 'g'), ''), 150)) as director,
      case
        when p_year between 1888 and extract(year from current_date)::integer + 5
          then p_year
        else null
      end as exact_year,
      case
        when p_year_from between 1888 and extract(year from current_date)::integer + 5
          then p_year_from
        else null
      end as year_from,
      case
        when p_year_to between 1888 and extract(year from current_date)::integer + 5
          then p_year_to
        else null
      end as year_to,
      case when p_rating_min between 0 and 10 then p_rating_min else null end as rating_min,
      case when p_rating_max between 0 and 10 then p_rating_max else null end as rating_max
  )
  select
    um.id,
    m.id::bigint,
    um.status,
    um.personal_rating::numeric,
    um.priority::smallint,
    um.watched_at,
    um.created_at,
    um.favourite,
    m.tmdb_id::bigint,
    m.title,
    m.original_title,
    m.poster_path,
    m.release_date::text,
    m.release_year::integer,
    m.public_rating::numeric
  from public.user_movies as um
  inner join public.movies as m on m.id = um.movie_id
  cross join normalized as filters
  where um.user_id = (select auth.uid())
    and (filters.status is null or um.status = filters.status)
    and (
      filters.watched is null
      or (filters.watched and um.status = 'watched')
      or (not filters.watched and um.status is distinct from 'watched')
    )
    and (filters.favourite is null or um.favourite = filters.favourite)
    and (
      filters.director is null
      or lower(regexp_replace(btrim(coalesce(m.director, '')), '[[:space:]]+', ' ', 'g'))
        = filters.director
    )
    and (
      filters.genre is null
      or exists (
        select 1
        from jsonb_array_elements(
          case
            when jsonb_typeof(m.genres) = 'array' then m.genres
            else '[]'::jsonb
          end
        ) as genre(value)
        where lower(
          regexp_replace(
            btrim(
              case jsonb_typeof(genre.value)
                when 'string' then genre.value #>> '{}'
                when 'object' then genre.value ->> 'name'
                else null
              end
            ),
            '[[:space:]]+',
            ' ',
            'g'
          )
        ) = filters.genre
      )
    )
    and (
      (
        filters.exact_year is not null
        and m.release_year = filters.exact_year
      )
      or (
        filters.exact_year is null
        and (filters.year_from is null or m.release_year >= filters.year_from)
        and (filters.year_to is null or m.release_year <= filters.year_to)
      )
    )
    and (
      filters.rating_min is null
      or um.personal_rating >= filters.rating_min
    )
    and (
      filters.rating_max is null
      or um.personal_rating <= filters.rating_max
    )
    and (
      filters.query is null
      or strpos(lower(coalesce(m.title, '')), filters.query) > 0
      or strpos(lower(coalesce(m.original_title, '')), filters.query) > 0
      or strpos(lower(coalesce(m.director, '')), filters.query) > 0
      or exists (
        select 1
        from jsonb_array_elements(
          case
            when jsonb_typeof(m.genres) = 'array' then m.genres
            else '[]'::jsonb
          end
        ) as genre(value)
        where strpos(
          lower(
            coalesce(
              case jsonb_typeof(genre.value)
                when 'string' then genre.value #>> '{}'
                when 'object' then genre.value ->> 'name'
                else null
              end,
              ''
            )
          ),
          filters.query
        ) > 0
      )
      or exists (
        select 1
        from jsonb_array_elements(
          case
            when jsonb_typeof(m.main_cast) = 'array' then m.main_cast
            else '[]'::jsonb
          end
        ) as cast_member(value)
        where strpos(
          lower(
            coalesce(
              case jsonb_typeof(cast_member.value)
                when 'string' then cast_member.value #>> '{}'
                when 'object' then cast_member.value ->> 'name'
                else null
              end,
              ''
            )
          ),
          filters.query
        ) > 0
      )
    );
$$;

create or replace function public.watchflow_library_filter_options()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with owned as materialized (
    select
      um.status,
      um.favourite,
      m.genres,
      m.director,
      m.release_year
    from public.user_movies as um
    inner join public.movies as m on m.id = um.movie_id
    where um.user_id = (select auth.uid())
  ),
  genre_candidates as (
    select regexp_replace(
      btrim(
        case jsonb_typeof(genre.value)
          when 'string' then genre.value #>> '{}'
          when 'object' then genre.value ->> 'name'
          else null
        end
      ),
      '[[:space:]]+',
      ' ',
      'g'
    ) as label
    from owned
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(owned.genres) = 'array' then owned.genres
        else '[]'::jsonb
      end
    ) as genre(value)
  ),
  normalized_genres as (
    select min(label) as label
    from genre_candidates
    where nullif(label, '') is not null
    group by lower(label)
  ),
  director_candidates as (
    select regexp_replace(
      btrim(director),
      '[[:space:]]+',
      ' ',
      'g'
    ) as label
    from owned
    where nullif(btrim(director), '') is not null
  ),
  normalized_directors as (
    select min(label) as label
    from director_candidates
    group by lower(label)
  ),
  normalized_years as (
    select distinct release_year as year
    from owned
    where release_year is not null
  ),
  summary as (
    select
      count(*) as all_count,
      count(*) filter (where status = 'watched') as watched_count,
      count(*) filter (where status is distinct from 'watched') as unwatched_count,
      count(*) filter (where favourite) as favourite_count
    from owned
  )
  select jsonb_build_object(
    'genres',
    coalesce(
      (select jsonb_agg(label order by lower(label), label) from normalized_genres),
      '[]'::jsonb
    ),
    'directors',
    coalesce(
      (select jsonb_agg(label order by lower(label), label) from normalized_directors),
      '[]'::jsonb
    ),
    'years',
    coalesce(
      (select jsonb_agg(year order by year desc) from normalized_years),
      '[]'::jsonb
    ),
    'counts',
    (
      select jsonb_build_object(
        'all', all_count,
        'watched', watched_count,
        'unwatched', unwatched_count,
        'favourites', favourite_count
      )
      from summary
    )
  );
$$;

create or replace function public.watchflow_bulk_update_library_status(
  p_user_movie_ids uuid[],
  p_status text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_requested integer;
  v_matched integer;
  v_queue_position integer;
  v_selected record;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  v_requested := coalesce(cardinality(p_user_movie_ids), 0);

  if v_requested = 0
    or v_requested > 100
    or array_position(p_user_movie_ids, null) is not null
    or (
      select count(distinct selected_id)
      from unnest(p_user_movie_ids) as selected(selected_id)
    ) <> v_requested then
    raise exception using errcode = '22023', message = 'Invalid library selection';
  end if;

  -- Scheduled is intentionally excluded: bulk actions must not invent a
  -- scheduled_for instant for rows that do not already have one.
  if p_status is null or p_status not in (
    'want_to_watch',
    'watch_next',
    'currently_watching',
    'watched',
    'on_hold',
    'dropped'
  ) then
    raise exception using errcode = '22023', message = 'Invalid bulk status';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  perform 1
  from public.user_movies
  where user_id = v_user_id
    and (status = 'watch_next' or id = any (p_user_movie_ids))
  order by queue_position asc nulls last, created_at asc, id asc
  for update;

  select count(*)
  into v_matched
  from public.user_movies
  where user_id = v_user_id
    and id = any (p_user_movie_ids);

  if v_matched <> v_requested then
    return jsonb_build_object(
      'success', false,
      'requested', v_requested,
      'matched', v_matched,
      'updated', 0,
      'skipped', v_requested - v_matched,
      'failed', 0,
      'reason', 'selection_changed'
    );
  end if;

  if p_status = 'watch_next' then
    perform public.watchflow_normalize_queue();

    select coalesce(max(queue_position), 0)
    into v_queue_position
    from public.user_movies
    where user_id = v_user_id
      and status = 'watch_next';

    for v_selected in
      select um.id
      from unnest(p_user_movie_ids) with ordinality as requested(id, display_order)
      inner join public.user_movies as um
        on um.id = requested.id
       and um.user_id = v_user_id
      where um.status is distinct from 'watch_next'
      order by requested.display_order
    loop
      v_queue_position := v_queue_position + 1;

      update public.user_movies
      set status = 'watch_next',
          queue_position = v_queue_position,
          updated_at = now()
      where id = v_selected.id
        and user_id = v_user_id;
    end loop;
  else
    update public.user_movies
    set status = p_status,
        queue_position = null,
        updated_at = now()
    where user_id = v_user_id
      and id = any (p_user_movie_ids);
  end if;

  -- watched_at and stored schedule fields are deliberately preserved. This
  -- bulk action changes status only and never invents personal dates.
  perform public.watchflow_normalize_queue();

  return jsonb_build_object(
    'success', true,
    'requested', v_requested,
    'matched', v_matched,
    'updated', v_matched,
    'skipped', 0,
    'failed', 0
  );
end;
$$;

create or replace function public.watchflow_bulk_remove_library_movies(
  p_user_movie_ids uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_requested integer;
  v_matched integer;
  v_deleted integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  v_requested := coalesce(cardinality(p_user_movie_ids), 0);

  if v_requested = 0
    or v_requested > 100
    or array_position(p_user_movie_ids, null) is not null
    or (
      select count(distinct selected_id)
      from unnest(p_user_movie_ids) as selected(selected_id)
    ) <> v_requested then
    raise exception using errcode = '22023', message = 'Invalid library selection';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  perform 1
  from public.user_movies
  where user_id = v_user_id
    and (status = 'watch_next' or id = any (p_user_movie_ids))
  order by queue_position asc nulls last, created_at asc, id asc
  for update;

  select count(*)
  into v_matched
  from public.user_movies
  where user_id = v_user_id
    and id = any (p_user_movie_ids);

  if v_matched <> v_requested then
    return jsonb_build_object(
      'success', false,
      'requested', v_requested,
      'matched', v_matched,
      'deleted', 0,
      'skipped', v_requested - v_matched,
      'failed', 0,
      'reason', 'selection_changed'
    );
  end if;

  delete from public.user_movies
  where user_id = v_user_id
    and id = any (p_user_movie_ids);

  get diagnostics v_deleted = row_count;

  perform public.watchflow_normalize_queue();

  return jsonb_build_object(
    'success', true,
    'requested', v_requested,
    'matched', v_matched,
    'deleted', v_deleted,
    'skipped', v_requested - v_deleted,
    'failed', 0
  );
end;
$$;

revoke all on function public.watchflow_library_rows(
  text, text, boolean, boolean, text, text, integer, integer, integer, numeric, numeric
) from public, anon;
revoke all on function public.watchflow_library_filter_options()
  from public, anon;
revoke all on function public.watchflow_bulk_update_library_status(uuid[], text)
  from public, anon;
revoke all on function public.watchflow_bulk_remove_library_movies(uuid[])
  from public, anon;

grant execute on function public.watchflow_library_rows(
  text, text, boolean, boolean, text, text, integer, integer, integer, numeric, numeric
) to authenticated;
grant execute on function public.watchflow_library_filter_options()
  to authenticated;
grant execute on function public.watchflow_bulk_update_library_status(uuid[], text)
  to authenticated;
grant execute on function public.watchflow_bulk_remove_library_movies(uuid[])
  to authenticated;

commit;
