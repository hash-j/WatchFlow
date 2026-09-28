begin;

-- The claim function returns a column named subscription_id. In PL/pgSQL that
-- return column is also a variable, so the original unqualified ON CONFLICT
-- inference target was ambiguous at execution time. Give the existing unique
-- constraint a stable explicit name, then target that constraint directly.
do $migration$
declare
  v_constraint_name name;
begin
  select constraint_definition.conname
  into v_constraint_name
  from pg_catalog.pg_constraint as constraint_definition
  where constraint_definition.conrelid =
        'public.scheduled_notification_deliveries'::pg_catalog.regclass
    and constraint_definition.contype = 'u'
    and (
      select pg_catalog.array_agg(
        constraint_attribute.attname::text
        order by constraint_key.ordinality
      )
      from pg_catalog.unnest(constraint_definition.conkey)
        with ordinality as constraint_key(attnum, ordinality)
      join pg_catalog.pg_attribute as constraint_attribute
        on constraint_attribute.attrelid = constraint_definition.conrelid
       and constraint_attribute.attnum = constraint_key.attnum
    ) = array['schedule_key', 'subscription_id']::text[];

  if v_constraint_name is null then
    raise exception using
      errcode = '42704',
      message = 'Part 18I delivery uniqueness constraint is missing';
  end if;

  if v_constraint_name <> 'watchflow_scheduled_delivery_schedule_subscription_key' then
    execute pg_catalog.format(
      'alter table public.scheduled_notification_deliveries rename constraint %I to watchflow_scheduled_delivery_schedule_subscription_key',
      v_constraint_name
    );
  end if;
end;
$migration$;

do $migration$
declare
  v_function_definition text;
  v_ambiguous_statement constant text :=
    'on conflict (schedule_key, subscription_id) do nothing';
  v_qualified_statement constant text :=
    'on conflict on constraint watchflow_scheduled_delivery_schedule_subscription_key do nothing';
begin
  select pg_catalog.pg_get_functiondef(
    'public.watchflow_claim_scheduled_reminders(integer,integer)'::pg_catalog.regprocedure
  )
  into v_function_definition;

  if pg_catalog.strpos(v_function_definition, v_ambiguous_statement) = 0 then
    raise exception using
      errcode = '42704',
      message = 'Part 18I claim function does not contain the expected conflict target';
  end if;

  v_function_definition := pg_catalog.replace(
    v_function_definition,
    v_ambiguous_statement,
    v_qualified_statement
  );
  execute v_function_definition;
end;
$migration$;

comment on function public.watchflow_claim_scheduled_reminders(integer, integer) is
  'Service-role-only bounded claim that revalidates schedules and creates deterministic reminders.';

revoke all on function public.watchflow_claim_scheduled_reminders(integer, integer)
  from public, anon, authenticated;
grant execute on function public.watchflow_claim_scheduled_reminders(integer, integer)
  to service_role;

commit;
