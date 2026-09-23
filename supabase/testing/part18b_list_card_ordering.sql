-- Local-only Part 18B list-card ordering verification. Run after
-- from_zero_bootstrap.sql and every versioned migration; this script rolls all
-- fixtures back and must never be applied to a hosted project.

begin;

insert into auth.users (id, email)
values
  ('d0000000-0000-4000-8000-000000000001', 'list-owner-a@example.test'),
  ('e0000000-0000-4000-8000-000000000002', 'list-owner-b@example.test');

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'd0000000-0000-4000-8000-000000000001',
  true
);

insert into public.lists (id, user_id, name, description)
values
  (
    'd1000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000001',
    'First controlled list',
    null
  ),
  (
    'd2000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000001',
    'Second controlled list',
    null
  ),
  (
    'd3000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000001',
    'Third controlled list',
    null
  );

do $$
begin
  if (
    select array_agg(sort_position order by sort_position)
    from public.lists
    where user_id = 'd0000000-0000-4000-8000-000000000001'
  ) <> array[1, 2, 3] then
    raise exception 'New custom lists did not append with contiguous positions';
  end if;
end;
$$;

select public.watchflow_move_custom_list(
  'd3000000-0000-4000-8000-000000000003',
  'up'
);

do $$
begin
  if (
    select array_agg(id order by sort_position)
    from public.lists
    where user_id = 'd0000000-0000-4000-8000-000000000001'
  ) <> array[
    'd1000000-0000-4000-8000-000000000001'::uuid,
    'd3000000-0000-4000-8000-000000000003'::uuid,
    'd2000000-0000-4000-8000-000000000002'::uuid
  ] then
    raise exception 'Saved custom-list card move did not persist';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  'e0000000-0000-4000-8000-000000000002',
  true
);

insert into public.lists (id, user_id, name, description)
values (
  'e1000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000002',
  'Other owner list',
  null
);

select set_config(
  'request.jwt.claim.sub',
  'd0000000-0000-4000-8000-000000000001',
  true
);

delete from public.lists
where id = 'd3000000-0000-4000-8000-000000000003'
  and user_id = 'd0000000-0000-4000-8000-000000000001';

do $$
begin
  if (
    select array_agg(sort_position order by sort_position)
    from public.lists
    where user_id = 'd0000000-0000-4000-8000-000000000001'
  ) <> array[1, 2] then
    raise exception 'Custom-list deletion did not compact card positions';
  end if;

  if (
    select sort_position
    from public.lists
    where id = 'e1000000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'Owner A list ordering changed Owner B data';
  end if;
end;
$$;

reset role;
rollback;

select 'PART_18B_LIST_CARD_ORDERING=PASS' as result;
