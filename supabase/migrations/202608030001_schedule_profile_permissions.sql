begin;

-- The SECURITY INVOKER scheduling RPC updates these two columns on the
-- authenticated caller's owned profile row.
grant update (timezone, updated_at)
  on table public.profiles
  to authenticated;

commit;
