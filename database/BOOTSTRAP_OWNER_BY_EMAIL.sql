-- Run in Supabase SQL Editor after creating the real account in Authentication > Users.
-- Change the email only in the final SELECT statement.
begin;

create or replace function public.bootstrap_owner_by_email(p_email text)
returns void language plpgsql security definer set search_path=public,auth as $bootstrap$
declare target_user auth.users%rowtype;
begin
  select * into target_user from auth.users where lower(trim(email))=lower(trim(p_email)) limit 1;
  if target_user.id is null then
    raise exception 'No Supabase Authentication user found for email %',p_email;
  end if;

  insert into public.profiles(id,email,display_name,role,active)
  values(target_user.id,target_user.email,coalesce(target_user.raw_user_meta_data->>'display_name',split_part(target_user.email,'@',1)),'owner',true)
  on conflict(id) do update set email=excluded.email,display_name=excluded.display_name,role='owner',active=true,updated_at=now();
end $bootstrap$;

revoke all on function public.bootstrap_owner_by_email(text) from public,anon,authenticated;

-- Replace this email with the real Authentication email when needed.
select public.bootstrap_owner_by_email('tongangchoun@gmail.com');

commit;
notify pgrst,'reload schema';
