begin;

alter table public.user_preferences enable row level security;

grant select, insert, update
on table public.user_preferences
to authenticated;

insert into public.user_preferences (user_id)
select id
from auth.users
on conflict (user_id) do nothing;

commit;
