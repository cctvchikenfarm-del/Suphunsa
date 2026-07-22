-- Central Krabi Production Hardening
-- Run after 00_V3_FULL_SETUP_SUPABASE.sql, COMPATIBILITY_PATCH_v3.0.9.sql,
-- AUTH_PROFILE_SYNC_MIGRATION_v3.0.9.sql, M1, M4 and M5-M6.
begin;

update public.profiles set role='viewer' where role is null or role not in ('owner','admin','editor','viewer');
alter table public.profiles alter column role set default 'viewer';

do $profile_role_fk$
begin
  if not exists(select 1 from pg_constraint where conname='profiles_role_fk') then
    alter table public.profiles add constraint profiles_role_fk foreign key(role)
      references public.roles(role_key) on update cascade not valid;
  end if;
end $profile_role_fk$;

create or replace function public.handle_auth_user_profile()
returns trigger language plpgsql security definer set search_path=public as $profile_function$
begin
  insert into public.profiles(id,email,display_name,role,active)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1)),'viewer',true)
  on conflict(id) do update set email=excluded.email,updated_at=now();
  return new;
end $profile_function$;

alter table public.master_categories add column if not exists name_en text;
alter table public.master_categories add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_master_categories_updated_at on public.master_categories;
create trigger trg_master_categories_updated_at before update on public.master_categories
for each row execute function public.set_updated_at();

alter table public.audit_logs alter column record_id type text using record_id::text;

do $data_integrity_constraints$
begin
  if not exists(select 1 from pg_constraint where conname='data_entries_nonnegative_check') then
    alter table public.data_entries add constraint data_entries_nonnegative_check
      check (coalesce(weight_kg,0)>=0 and coalesce(quantity,0)>=0 and coalesce(unit_price,0)>=0 and coalesce(amount,0)>=0) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='data_entries_period_first_day_check') then
    alter table public.data_entries add constraint data_entries_period_first_day_check
      check (period_month=date_trunc('month',period_month)::date) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='data_entries_date_period_check') then
    alter table public.data_entries add constraint data_entries_date_period_check
      check (date_trunc('month',entry_date)::date=period_month) not valid;
  end if;
end $data_integrity_constraints$;

do $deduplicate_automation_jobs$
declare r record;
begin
  for r in select array_agg(id order by created_at,id) ids from public.automation_jobs group by name,action_type having count(*)>1
  loop
    update public.automation_runs set job_id=r.ids[1] where job_id=any(r.ids[2:array_length(r.ids,1)]);
    delete from public.automation_jobs where id=any(r.ids[2:array_length(r.ids,1)]);
  end loop;
end $deduplicate_automation_jobs$;
create unique index if not exists uq_automation_jobs_name_action on public.automation_jobs(name,action_type);

insert into public.master_categories(module,code,name_th,name_en,unit,color,sort_order,active) values
  ('tissue','tissue_roll','ม้วน',null,'ม้วน','#3B82F6',110,true),
  ('tissue','tissue_hand','มือ',null,'แผ่น','#10B981',120,true),
  ('tissue','tissue_popup','ป๊อปอัพ',null,'แพ็ค','#F59E0B',130,true),
  ('recycle','recycle_other','อื่น ๆ',null,'kg','#8B5CF6',160,true),
  ('black_bag','black_bag_small','ถุงดำเล็ก',null,'ใบ','#64748B',110,true),
  ('black_bag','black_bag_medium','ถุงดำกลาง',null,'ใบ','#475569',120,true),
  ('black_bag','black_bag_large','ถุงดำใหญ่',null,'ใบ','#334155',130,true),
  ('consumable','consumable_foam_soap','สบู่โฟม',null,'แกลลอน','#06B6D4',110,true),
  ('consumable','consumable_seat_cleaner','น้ำยาเช็ดฝาโถ',null,'ขวด','#EC4899',120,true)
on conflict(module,code) do update set name_th=excluded.name_th,unit=excluded.unit,color=excluded.color,active=true;

commit;
notify pgrst,'reload schema';
