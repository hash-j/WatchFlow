begin;

-- Version the Library relation instead of overloading the Part 12 function.
-- Every predicate is applied inside the owner-scoped relation before
-- PostgREST computes its exact count, ordering, and requested range.
create function public.watchflow_library_rows_v2(
  p_query text default null,
  p_status text default null,
  p_watched boolean default null,
  p_genre text default null,
  p_director text default null,
  p_actor text default null,
  p_year integer default null
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
      lower(left(nullif(regexp_replace(btrim(p_genre), '[[:space:]]+', ' ', 'g'), ''), 100)) as genre,
      lower(left(nullif(regexp_replace(btrim(p_director), '[[:space:]]+', ' ', 'g'), ''), 150)) as director,
      lower(left(nullif(regexp_replace(btrim(p_actor), '[[:space:]]+', ' ', 'g'), ''), 150)) as actor,
      case
        when p_year between 1888 and extract(year from current_date)::integer + 5
          then p_year
        else null
      end as exact_year
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
    and (
      filters.director is null
      or lower(regexp_replace(btrim(coalesce(m.director, '')), '[[:space:]]+', ' ', 'g'))
        = filters.director
    )
    and (
      filters.actor is null
      or exists (
        select 1
        from jsonb_array_elements(
          case
            when jsonb_typeof(m.main_cast) = 'array' then m.main_cast
            else '[]'::jsonb
          end
        ) as actor(value)
        where lower(
          regexp_replace(
            btrim(
              coalesce(
                case jsonb_typeof(actor.value)
                  when 'string' then actor.value #>> '{}'
                  when 'object' then actor.value ->> 'name'
                  else null
                end,
                ''
              )
            ),
            '[[:space:]]+',
            ' ',
            'g'
          )
        ) = filters.actor
      )
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
              coalesce(
                case jsonb_typeof(genre.value)
                  when 'string' then genre.value #>> '{}'
                  when 'object' then genre.value ->> 'name'
                  else null
                end,
                ''
              )
            ),
            '[[:space:]]+',
            ' ',
            'g'
          )
        ) = filters.genre
      )
    )
    and (filters.exact_year is null or m.release_year = filters.exact_year)
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

comment on function public.watchflow_library_rows_v2(
  text, text, boolean, text, text, text, integer
) is
  'Returns one auth.uid()-owned Library relation with normalized actor filtering before exact count and pagination.';

-- A separate mutation version distinguishes an omitted watched-date field from
-- an explicitly cleared date. Only a Watched submission may change watched_at;
-- all other status and metadata edits preserve the stored value atomically.
create function public.watchflow_update_library_movie_v2(
  p_library_id uuid,
  p_status text,
  p_personal_rating numeric,
  p_review text,
  p_priority smallint,
  p_would_watch_again boolean,
  p_watched_at timestamptz,
  p_watched_at_provided boolean,
  p_scheduled_for timestamptz,
  p_timezone text,
  p_schedule_note text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_current_status text;
  v_queue_position integer;
begin
  if v_user_id is null then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  select status
  into v_current_status
  from public.user_movies
  where id = p_library_id
    and user_id = v_user_id
  for update;

  if not found then
    return false;
  end if;

  if p_status not in (
    'want_to_watch',
    'watch_next',
    'scheduled',
    'currently_watching',
    'watched',
    'on_hold',
    'dropped'
  ) then
    raise exception using errcode = '22023', message = 'Invalid movie status';
  end if;

  if p_personal_rating is not null
    and (p_personal_rating < 0 or p_personal_rating > 10) then
    raise exception using errcode = '22023', message = 'Invalid personal rating';
  end if;

  if p_priority < 0 or p_priority > 5 then
    raise exception using errcode = '22023', message = 'Invalid priority';
  end if;

  if pg_catalog.char_length(coalesce(p_review, '')) > 5000
    or pg_catalog.char_length(coalesce(p_schedule_note, '')) > 1000 then
    raise exception using errcode = '22023', message = 'Text value is too long';
  end if;

  if p_status = 'scheduled' then
    if p_scheduled_for is null
      or p_timezone is null
      or not exists (
        select 1
        from pg_catalog.pg_timezone_names
        where name = p_timezone
      ) then
      raise exception using errcode = '22023', message = 'Invalid schedule';
    end if;

    update public.profiles
    set timezone = p_timezone,
        updated_at = pg_catalog.now()
    where id = v_user_id;

    if not found then
      raise exception using errcode = 'P0002', message = 'Profile not found';
    end if;
  end if;

  if p_status = 'watch_next' then
    if v_current_status = 'watch_next' then
      select queue_position
      into v_queue_position
      from public.user_movies
      where id = p_library_id
        and user_id = v_user_id;
    else
      select coalesce(pg_catalog.max(queue_position), 0) + 1
      into v_queue_position
      from public.user_movies
      where user_id = v_user_id
        and status = 'watch_next';
    end if;
  else
    v_queue_position := null;
  end if;

  update public.user_movies
  set status = p_status,
      personal_rating = p_personal_rating,
      review = nullif(pg_catalog.btrim(p_review), ''),
      priority = p_priority,
      would_watch_again = p_would_watch_again,
      watched_at = case
        when p_status = 'watched' and p_watched_at_provided
          then p_watched_at
        else watched_at
      end,
      queue_position = v_queue_position,
      scheduled_for = case
        when p_status = 'scheduled' then p_scheduled_for
        else null
      end,
      schedule_timezone = case
        when p_status = 'scheduled' then p_timezone
        else null
      end,
      schedule_note = case
        when p_status = 'scheduled'
          then nullif(pg_catalog.btrim(p_schedule_note), '')
        else null
      end,
      updated_at = pg_catalog.now()
  where id = p_library_id
    and user_id = v_user_id;

  perform public.watchflow_normalize_queue();
  return true;
end;
$$;

comment on function public.watchflow_update_library_movie_v2(
  uuid, text, numeric, text, smallint, boolean, timestamptz, boolean,
  timestamptz, text, text
) is
  'Atomically updates one owned movie while preserving watched_at unless a Watched form explicitly provides it.';

revoke all on function public.watchflow_library_rows_v2(
  text, text, boolean, text, text, text, integer
) from public, anon;
grant execute on function public.watchflow_library_rows_v2(
  text, text, boolean, text, text, text, integer
) to authenticated;

revoke all on function public.watchflow_update_library_movie_v2(
  uuid, text, numeric, text, smallint, boolean, timestamptz, boolean,
  timestamptz, text, text
) from public, anon;
grant execute on function public.watchflow_update_library_movie_v2(
  uuid, text, numeric, text, smallint, boolean, timestamptz, boolean,
  timestamptz, text, text
) to authenticated;

commit;
