-- Run after V3_FULL_SETUP_SUPABASE.sql and COMPATIBILITY_PATCH_v3.0.9.sql.
-- Aligns existing profiles with auth.users without deleting business records.
begin;

do $migration$
declare r record;
begin
  for r in
    select p.id old_id, a.id auth_id, p.email, p.display_name, p.role, p.active
    from public.profiles p join auth.users a on lower(trim(a.email)) = lower(trim(p.email))
    where p.id <> a.id
  loop
    update public.profiles set email = 'migrating-' || r.old_id::text || '@invalid.local' where id = r.old_id;
    insert into public.profiles(id,email,display_name,role,active)
    values(r.auth_id,r.email,r.display_name,r.role,r.active)
    on conflict(id) do update set email=excluded.email,display_name=excluded.display_name,role=excluded.role,active=excluded.active;
    update public.data_entries set created_by=r.auth_id where created_by=r.old_id;
    update public.audit_logs set actor_id=r.auth_id where actor_id=r.old_id;
    update public.report_presets set created_by=r.auth_id where created_by=r.old_id;
    update public.report_runs set created_by=r.auth_id where created_by=r.old_id;
    update public.automation_jobs set created_by=r.auth_id where created_by=r.old_id;
    insert into public.user_permission_overrides(user_id,permission_key,allowed,created_at)
      select r.auth_id,permission_key,allowed,created_at from public.user_permission_overrides where user_id=r.old_id
      on conflict(user_id,permission_key) do update set allowed=excluded.allowed;
    delete from public.user_permission_overrides where user_id=r.old_id;
    delete from public.profiles where id=r.old_id;
  end loop;
end $migration$;

create or replace function public.handle_auth_user_profile()
returns trigger language plpgsql security definer set search_path=public as $profile_function$
begin
  insert into public.profiles(id,email,display_name,role,active)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1)),
    'viewer',true)
  on conflict(id) do update set email=excluded.email,updated_at=now();
  return new;
end $profile_function$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert or update of email on auth.users
for each row execute function public.handle_auth_user_profile();

do $constraint_block$ begin
  if not exists(select 1 from pg_constraint where conname='profiles_auth_user_fk') then
    alter table public.profiles add constraint profiles_auth_user_fk foreign key(id)
      references auth.users(id) on delete cascade not valid;
  end if;
end $constraint_block$;

commit;
notify pgrst, 'reload schema';
