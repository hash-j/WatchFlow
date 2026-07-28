begin;

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  visibility text not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lists_name_not_blank check (
    char_length(btrim(name)) between 1 and 80
  ),
  constraint lists_description_length check (
    description is null or char_length(description) <= 500
  ),
  constraint lists_private_visibility check (
    visibility = 'private'
  )
);

comment on table public.lists is
  'Private named movie collections owned by one authenticated WatchFlow user.';
comment on column public.lists.visibility is
  'Part 13 supports private lists only.';

create unique index lists_user_normalized_name_key
  on public.lists (
    user_id,
    lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))
  );

create index lists_user_updated_at_idx
  on public.lists (user_id, updated_at desc);

create table public.list_movies (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  user_movie_id uuid not null references public.user_movies(id) on delete cascade,
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint list_movies_position_positive check (position >= 1),
  constraint list_movies_list_user_movie_key unique (list_id, user_movie_id),
  constraint list_movies_list_position_key
    unique (list_id, position) deferrable initially immediate
);

comment on table public.list_movies is
  'Ordered memberships from private lists to owner-scoped user_movies rows.';
comment on column public.list_movies.user_movie_id is
  'The personal-library relationship UUID, never a shared movies or TMDB ID.';

create index list_movies_user_movie_id_idx
  on public.list_movies (user_movie_id);

drop trigger if exists watchflow_lists_updated_at on public.lists;
create trigger watchflow_lists_updated_at
before update on public.lists
for each row execute function public.watchflow_set_updated_at();

drop trigger if exists watchflow_list_movies_updated_at on public.list_movies;
create trigger watchflow_list_movies_updated_at
before update on public.list_movies
for each row execute function public.watchflow_set_updated_at();

alter table public.lists enable row level security;
alter table public.list_movies enable row level security;

create policy watchflow_lists_select_own
  on public.lists
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy watchflow_lists_insert_own
  on public.lists
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy watchflow_lists_update_own
  on public.lists
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy watchflow_lists_delete_own
  on public.lists
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy watchflow_list_movies_select_own
  on public.list_movies
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.lists
      where lists.id = list_movies.list_id
        and lists.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.user_movies
      where user_movies.id = list_movies.user_movie_id
        and user_movies.user_id = (select auth.uid())
    )
  );

create policy watchflow_list_movies_insert_own
  on public.list_movies
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.lists
      where lists.id = list_movies.list_id
        and lists.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.user_movies
      where user_movies.id = list_movies.user_movie_id
        and user_movies.user_id = (select auth.uid())
    )
  );

create policy watchflow_list_movies_update_own
  on public.list_movies
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.lists
      where lists.id = list_movies.list_id
        and lists.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.user_movies
      where user_movies.id = list_movies.user_movie_id
        and user_movies.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.lists
      where lists.id = list_movies.list_id
        and lists.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.user_movies
      where user_movies.id = list_movies.user_movie_id
        and user_movies.user_id = (select auth.uid())
    )
  );

create policy watchflow_list_movies_delete_own
  on public.list_movies
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.lists
      where lists.id = list_movies.list_id
        and lists.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.user_movies
      where user_movies.id = list_movies.user_movie_id
        and user_movies.user_id = (select auth.uid())
    )
  );

revoke all on table public.lists from public, anon, authenticated;
revoke all on table public.list_movies from public, anon, authenticated;
grant select, delete on table public.lists to authenticated;
grant insert (user_id, name, description)
  on table public.lists to authenticated;
grant update (name, description, updated_at)
  on table public.lists to authenticated;
grant select, delete on table public.list_movies to authenticated;
grant insert (list_id, user_movie_id, position)
  on table public.list_movies to authenticated;
grant update (position)
  on table public.list_movies to authenticated;

create or replace function public.watchflow_normalize_list_positions(
  p_list_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_item_count integer := 0;
  v_needs_normalization boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if p_list_id is null then
    raise exception using errcode = '22023', message = 'Invalid list';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('watchflow:list:' || p_list_id::text, 0)
  );

  perform 1
  from public.lists
  where id = p_list_id
    and user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'normalized', false,
      'reason', 'not_found'
    );
  end if;

  perform 1
  from public.list_movies
  where list_id = p_list_id
  order by position asc nulls last, created_at asc, id asc
  for update;

  with ordered as (
    select
      id,
      row_number() over (
        order by position asc nulls last, created_at asc, id asc
      )::integer as normalized_position
    from public.list_movies
    where list_id = p_list_id
  )
  select
    count(*)::integer,
    coalesce(
      bool_or(list_movies.position is distinct from ordered.normalized_position),
      false
    )
  into v_item_count, v_needs_normalization
  from ordered
  inner join public.list_movies on list_movies.id = ordered.id;

  if v_needs_normalization then
    -- Defer the named unique constraint and use a positive temporary range.
    -- This remains conflict-safe with the required position >= 1 check.
    set constraints list_movies_list_position_key deferred;

    with ordering as (
      select
        id,
        row_number() over (
          order by position asc nulls last, created_at asc, id asc
        )::integer as normalized_position
      from public.list_movies
      where list_id = p_list_id
    )
    update public.list_movies
    set position = ordering.normalized_position + v_item_count
    from ordering
    where list_movies.id = ordering.id
      and list_movies.list_id = p_list_id;

    with ordering as (
      select
        id,
        row_number() over (
          order by position asc nulls last, created_at asc, id asc
        )::integer as normalized_position
      from public.list_movies
      where list_id = p_list_id
    )
    update public.list_movies
    set position = ordering.normalized_position
    from ordering
    where list_movies.id = ordering.id
      and list_movies.list_id = p_list_id;

    update public.lists
    set updated_at = now()
    where id = p_list_id
      and user_id = v_user_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'normalized', v_needs_normalization,
    'item_count', v_item_count
  );
end;
$$;

create or replace function public.watchflow_move_list_item(
  p_list_movie_id uuid,
  p_direction text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_list_id uuid;
  v_list_movie_ids uuid[];
  v_current_index integer;
  v_target_index integer;
  v_target_id uuid;
  v_item_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if p_list_movie_id is null or p_direction not in ('up', 'down') then
    raise exception using errcode = '22023', message = 'Invalid list movement';
  end if;

  select list_movies.list_id
  into v_list_id
  from public.list_movies
  inner join public.lists on lists.id = list_movies.list_id
  inner join public.user_movies on user_movies.id = list_movies.user_movie_id
  where list_movies.id = p_list_movie_id
    and lists.user_id = v_user_id
    and user_movies.user_id = v_user_id;

  if not found then
    return jsonb_build_object(
      'success', false,
      'moved', false,
      'reason', 'not_found'
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('watchflow:list:' || v_list_id::text, 0)
  );

  perform 1
  from public.lists
  where id = v_list_id
    and user_id = v_user_id
  for update;

  perform 1
  from public.list_movies
  where list_id = v_list_id
  order by position asc nulls last, created_at asc, id asc
  for update;

  perform public.watchflow_normalize_list_positions(v_list_id);

  select coalesce(
    array_agg(id order by position asc, created_at asc, id asc),
    array[]::uuid[]
  )
  into v_list_movie_ids
  from public.list_movies
  where list_id = v_list_id;

  v_current_index := array_position(v_list_movie_ids, p_list_movie_id);

  if v_current_index is null then
    return jsonb_build_object(
      'success', false,
      'moved', false,
      'reason', 'not_found'
    );
  end if;

  v_item_count := cardinality(v_list_movie_ids);
  v_target_index := case
    when p_direction = 'up' then v_current_index - 1
    else v_current_index + 1
  end;

  if v_target_index < 1 or v_target_index > v_item_count then
    return jsonb_build_object(
      'success', true,
      'moved', false,
      'list_id', v_list_id,
      'final_position', v_current_index
    );
  end if;

  v_target_id := v_list_movie_ids[v_target_index];

  update public.list_movies
  set position = v_item_count + 1
  where id = p_list_movie_id
    and list_id = v_list_id;

  update public.list_movies
  set position = v_current_index
  where id = v_target_id
    and list_id = v_list_id;

  update public.list_movies
  set position = v_target_index
  where id = p_list_movie_id
    and list_id = v_list_id;

  update public.lists
  set updated_at = now()
  where id = v_list_id
    and user_id = v_user_id;

  return jsonb_build_object(
    'success', true,
    'moved', true,
    'list_id', v_list_id,
    'final_position', v_target_index
  );
end;
$$;

create or replace function public.watchflow_add_movies_to_list(
  p_list_id uuid,
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
  v_added integer := 0;
  v_inserted integer;
  v_next_position integer;
  v_selected record;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  v_requested := coalesce(cardinality(p_user_movie_ids), 0);

  if p_list_id is null
    or p_user_movie_ids is null
    or v_requested = 0
    or v_requested > 100
    or array_position(p_user_movie_ids, null) is not null
    or (
      select count(distinct selected_id)
      from unnest(p_user_movie_ids) as selected(selected_id)
    ) <> v_requested then
    raise exception using errcode = '22023', message = 'Invalid movie selection';
  end if;

  -- Share Part 12's per-user mutation lock before taking relationship rows.
  -- This serializes list membership changes with bulk status/deletion.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  -- Check ownership without taking the list lock yet. The global mutation
  -- order locks user_movies before lists to stay compatible with relationship
  -- deletion and its membership-cascade compaction trigger.
  perform 1
  from public.lists
  where id = p_list_id
    and user_id = v_user_id;

  if not found then
    return jsonb_build_object(
      'success', false,
      'requested', v_requested,
      'matched', 0,
      'added_count', 0,
      'skipped_count', v_requested,
      'reason', 'not_found'
    );
  end if;

  perform 1
  from public.user_movies as user_movies
  where user_movies.user_id = v_user_id
    and user_movies.id = any (p_user_movie_ids)
  order by
    user_movies.queue_position asc nulls last,
    user_movies.created_at asc,
    user_movies.id asc
  for update;

  select count(*)::integer
  into v_matched
  from public.user_movies as um
  where um.user_id = v_user_id
    and um.id = any (p_user_movie_ids);

  if v_matched <> v_requested then
    return jsonb_build_object(
      'success', false,
      'requested', v_requested,
      'matched', v_matched,
      'added_count', 0,
      'skipped_count', v_requested - v_matched,
      'reason', 'selection_changed'
    );
  end if;

  -- Continue the shared order: owned user_movies first, then the per-list
  -- advisory lock and parent row, then list_movies.
  perform pg_advisory_xact_lock(
    hashtextextended('watchflow:list:' || p_list_id::text, 0)
  );

  perform 1
  from public.lists
  where id = p_list_id
    and user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'requested', v_requested,
      'matched', v_matched,
      'added_count', 0,
      'skipped_count', v_requested,
      'reason', 'not_found'
    );
  end if;

  perform 1
  from public.list_movies
  where list_id = p_list_id
  order by position asc nulls last, created_at asc, id asc
  for update;

  perform public.watchflow_normalize_list_positions(p_list_id);

  select coalesce(max(position), 0)
  into v_next_position
  from public.list_movies
  where list_id = p_list_id;

  for v_selected in
    select requested.user_movie_id, requested.ordinality
    from unnest(p_user_movie_ids) with ordinality
      as requested(user_movie_id, ordinality)
    inner join public.user_movies as um
      on um.id = requested.user_movie_id
     and um.user_id = v_user_id
    left join public.list_movies as existing
      on existing.list_id = p_list_id
     and existing.user_movie_id = requested.user_movie_id
    where existing.id is null
    order by requested.ordinality
  loop
    v_next_position := v_next_position + 1;

    insert into public.list_movies (list_id, user_movie_id, position)
    values (p_list_id, v_selected.user_movie_id, v_next_position)
    on conflict on constraint list_movies_list_user_movie_key do nothing;

    get diagnostics v_inserted = row_count;
    if v_inserted = 1 then
      v_added := v_added + 1;
    else
      v_next_position := v_next_position - 1;
    end if;
  end loop;

  if v_added > 0 then
    update public.lists
    set updated_at = now()
    where id = p_list_id
      and user_id = v_user_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'list_id', p_list_id,
    'requested', v_requested,
    'matched', v_matched,
    'added_count', v_added,
    'skipped_count', v_requested - v_added
  );
end;
$$;

create or replace function public.watchflow_remove_movie_from_list(
  p_list_movie_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_list_id uuid;
  v_deleted integer := 0;
  v_final_count integer := 0;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if p_list_movie_id is null then
    raise exception using errcode = '22023', message = 'Invalid list movie';
  end if;

  select list_movies.list_id
  into v_list_id
  from public.list_movies
  inner join public.lists on lists.id = list_movies.list_id
  inner join public.user_movies on user_movies.id = list_movies.user_movie_id
  where list_movies.id = p_list_movie_id
    and lists.user_id = v_user_id
    and user_movies.user_id = v_user_id;

  if not found then
    return jsonb_build_object(
      'success', false,
      'removed', false,
      'reason', 'not_found'
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('watchflow:list:' || v_list_id::text, 0)
  );

  perform 1
  from public.lists
  where id = v_list_id
    and user_id = v_user_id
  for update;

  perform 1
  from public.list_movies
  where list_id = v_list_id
  order by position asc nulls last, created_at asc, id asc
  for update;

  delete from public.list_movies
  where id = p_list_movie_id
    and list_id = v_list_id;

  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    return jsonb_build_object(
      'success', false,
      'removed', false,
      'reason', 'not_found'
    );
  end if;

  select count(*)::integer
  into v_final_count
  from public.list_movies
  where list_id = v_list_id;

  return jsonb_build_object(
    'success', true,
    'removed', true,
    'list_id', v_list_id,
    'final_count', v_final_count
  );
end;
$$;

create or replace function public.watchflow_set_movie_list_memberships(
  p_user_movie_id uuid,
  p_list_ids uuid[]
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
  v_added integer := 0;
  v_removed integer := 0;
  v_unchanged integer := 0;
  v_inserted integer;
  v_next_position integer;
  v_list_id uuid;
  v_removed_list_ids uuid[];
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  v_requested := coalesce(cardinality(p_list_ids), 0);

  if p_user_movie_id is null
    or p_list_ids is null
    or v_requested > 500
    or array_position(p_list_ids, null) is not null
    or (
      select count(distinct selected_id)
      from unnest(p_list_ids) as selected(selected_id)
    ) <> v_requested then
    raise exception using errcode = '22023', message = 'Invalid list selection';
  end if;

  -- Share the Part 12 per-user mutation lock before the relationship row.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  perform 1
  from public.user_movies
  where id = p_user_movie_id
    and user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'added_count', 0,
      'removed_count', 0,
      'unchanged_count', 0,
      'reason', 'not_found'
    );
  end if;

  select count(*)::integer
  into v_matched
  from public.lists
  where user_id = v_user_id
    and id = any (p_list_ids);

  if v_matched <> v_requested then
    return jsonb_build_object(
      'success', false,
      'requested', v_requested,
      'matched', v_matched,
      'added_count', 0,
      'removed_count', 0,
      'unchanged_count', 0,
      'reason', 'selection_changed'
    );
  end if;

  -- Lock every current or desired list in stable UUID order to avoid deadlocks.
  for v_list_id in
    select affected.list_id
    from (
      select requested.list_id
      from unnest(p_list_ids) as requested(list_id)
      union
      select list_movies.list_id
      from public.list_movies
      inner join public.lists on lists.id = list_movies.list_id
      where list_movies.user_movie_id = p_user_movie_id
        and lists.user_id = v_user_id
    ) as affected
    order by affected.list_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('watchflow:list:' || v_list_id::text, 0)
    );
  end loop;

  perform 1
  from public.lists
  where user_id = v_user_id
    and id in (
      select requested.list_id
      from unnest(p_list_ids) as requested(list_id)
      union
      select list_movies.list_id
      from public.list_movies
      where list_movies.user_movie_id = p_user_movie_id
    )
  order by id
  for update;

  perform 1
  from public.list_movies
  where list_id in (
      select requested.list_id
      from unnest(p_list_ids) as requested(list_id)
      union
      select current_membership.list_id
      from public.list_movies as current_membership
      where current_membership.user_movie_id = p_user_movie_id
    )
  order by list_id, position asc nulls last, created_at asc, id asc
  for update;

  -- Repeat ownership counts after locks so a concurrent deletion cannot turn a
  -- mixed stale selection into a partial update.
  perform 1
  from public.user_movies
  where id = p_user_movie_id
    and user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'added_count', 0,
      'removed_count', 0,
      'unchanged_count', 0,
      'reason', 'selection_changed'
    );
  end if;

  select count(*)::integer
  into v_matched
  from public.lists
  where user_id = v_user_id
    and id = any (p_list_ids);

  if v_matched <> v_requested then
    return jsonb_build_object(
      'success', false,
      'requested', v_requested,
      'matched', v_matched,
      'added_count', 0,
      'removed_count', 0,
      'unchanged_count', 0,
      'reason', 'selection_changed'
    );
  end if;

  select count(*)::integer
  into v_unchanged
  from public.list_movies
  where user_movie_id = p_user_movie_id
    and list_id = any (p_list_ids);

  select coalesce(
    array_agg(list_id order by list_id),
    array[]::uuid[]
  )
  into v_removed_list_ids
  from public.list_movies
  where user_movie_id = p_user_movie_id
    and not (list_id = any (p_list_ids));

  delete from public.list_movies
  where user_movie_id = p_user_movie_id
    and list_id = any (v_removed_list_ids);

  get diagnostics v_removed = row_count;

  for v_list_id in
    select requested.list_id
    from unnest(p_list_ids) with ordinality
      as requested(list_id, ordinality)
    order by requested.ordinality
  loop
    if not exists (
      select 1
      from public.list_movies
      where list_id = v_list_id
        and user_movie_id = p_user_movie_id
    ) then
      perform public.watchflow_normalize_list_positions(v_list_id);

      select coalesce(max(position), 0) + 1
      into v_next_position
      from public.list_movies
      where list_id = v_list_id;

      insert into public.list_movies (list_id, user_movie_id, position)
      values (v_list_id, p_user_movie_id, v_next_position)
      on conflict on constraint list_movies_list_user_movie_key do nothing;

      get diagnostics v_inserted = row_count;
      if v_inserted = 1 then
        v_added := v_added + 1;

        update public.lists
        set updated_at = now()
        where id = v_list_id
          and user_id = v_user_id;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'requested', v_requested,
    'added_count', v_added,
    'removed_count', v_removed,
    'unchanged_count', v_unchanged
  );
end;
$$;

create or replace function public.watchflow_list_summaries()
returns table (
  list_id uuid,
  name text,
  description text,
  visibility text,
  created_at timestamptz,
  updated_at timestamptz,
  movie_count bigint,
  poster_paths jsonb
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    lists.id as list_id,
    lists.name,
    lists.description,
    lists.visibility,
    lists.created_at,
    lists.updated_at,
    count(owned_membership.id) as movie_count,
    coalesce(
      (
        select jsonb_agg(
          preview.poster_path
          order by preview.position, preview.user_movie_id
        )
        from (
          select
            movies.poster_path,
            list_movies.position,
            list_movies.user_movie_id
          from public.list_movies
          inner join public.user_movies
            on user_movies.id = list_movies.user_movie_id
           and user_movies.user_id = (select auth.uid())
          inner join public.movies on movies.id = user_movies.movie_id
          where list_movies.list_id = lists.id
            and movies.poster_path is not null
          order by
            list_movies.position asc nulls last,
            list_movies.created_at asc,
            list_movies.id asc
          limit 4
        ) as preview
      ),
      '[]'::jsonb
    ) as poster_paths
  from public.lists
  left join public.list_movies as owned_membership
    on owned_membership.list_id = lists.id
   and exists (
     select 1
     from public.user_movies
     where user_movies.id = owned_membership.user_movie_id
       and user_movies.user_id = (select auth.uid())
   )
  where lists.user_id = (select auth.uid())
  group by
    lists.id,
    lists.name,
    lists.description,
    lists.visibility,
    lists.created_at,
    lists.updated_at
  order by lists.updated_at desc, lists.id;
$$;

-- A personal-library deletion cascades membership rows. Compact every
-- surviving affected list in the same transaction so Part 12 individual,
-- bulk, and full-library deletion cannot leave list ordering gaps.
create or replace function public.watchflow_compact_lists_after_membership_delete()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_list_id uuid;
begin
  -- Auth-user deletion also cascades the lists themselves and may run without
  -- an Auth JWT. There are no surviving lists to compact in that case.
  if v_user_id is null then
    return null;
  end if;

  for v_list_id in
    select distinct deleted.list_id
    from deleted_list_movies as deleted
    inner join public.lists on lists.id = deleted.list_id
    where lists.user_id = v_user_id
    order by deleted.list_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('watchflow:list:' || v_list_id::text, 0)
    );

    update public.lists
    set updated_at = now()
    where id = v_list_id
      and user_id = v_user_id;

    perform public.watchflow_normalize_list_positions(v_list_id);
  end loop;

  return null;
end;
$$;

create trigger watchflow_list_movies_compact_after_delete
after delete on public.list_movies
referencing old table as deleted_list_movies
for each statement
execute function public.watchflow_compact_lists_after_membership_delete();

revoke all on function public.watchflow_normalize_list_positions(uuid)
  from public, anon;
revoke all on function public.watchflow_move_list_item(uuid, text)
  from public, anon;
revoke all on function public.watchflow_add_movies_to_list(uuid, uuid[])
  from public, anon;
revoke all on function public.watchflow_remove_movie_from_list(uuid)
  from public, anon;
revoke all on function public.watchflow_set_movie_list_memberships(uuid, uuid[])
  from public, anon;
revoke all on function public.watchflow_list_summaries()
  from public, anon;
revoke all on function public.watchflow_compact_lists_after_membership_delete()
  from public, anon, authenticated;

grant execute on function public.watchflow_normalize_list_positions(uuid)
  to authenticated;
grant execute on function public.watchflow_move_list_item(uuid, text)
  to authenticated;
grant execute on function public.watchflow_add_movies_to_list(uuid, uuid[])
  to authenticated;
grant execute on function public.watchflow_remove_movie_from_list(uuid)
  to authenticated;
grant execute on function public.watchflow_set_movie_list_memberships(uuid, uuid[])
  to authenticated;
grant execute on function public.watchflow_list_summaries()
  to authenticated;

commit;
