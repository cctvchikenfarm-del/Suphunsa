-- Removes only the obsolete placeholder profile when it is not linked to Supabase Authentication.
-- Real auth users and their matching profiles are not touched.
begin;

delete from public.profiles p
where lower(trim(p.email))='owner@central-krabi.local'
  and not exists(select 1 from auth.users a where a.id=p.id);

commit;
notify pgrst,'reload schema';
