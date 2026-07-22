-- M4: Dynamic Table, Dashboard, Reports and per-module permissions.
-- Safe migration: keeps data_entries and all existing business rows unchanged.
begin;

insert into public.permissions(permission_key,permission_name_th,permission_group,description,sort_order)
select 'modules.'||code||'.read','ดูโมดูล '||name_th,'modules','เข้าถึงข้อมูล ตาราง และ Dashboard ของ '||name_th,1000+sort_order
from public.master_modules
on conflict(permission_key) do update set permission_name_th=excluded.permission_name_th,description=excluded.description,sort_order=excluded.sort_order;

insert into public.permissions(permission_key,permission_name_th,permission_group,description,sort_order)
select 'modules.'||code||'.export','ส่งออกรายงาน '||name_th,'modules','ส่งออก CSV, PDF และ PowerPoint ของ '||name_th,1001+sort_order
from public.master_modules
on conflict(permission_key) do update set permission_name_th=excluded.permission_name_th,description=excluded.description,sort_order=excluded.sort_order;

-- Owner always receives every module permission.
insert into public.role_permissions(role_key,permission_key,allowed)
select 'owner',permission_key,true from public.permissions where permission_key like 'modules.%'
on conflict(role_key,permission_key) do update set allowed=true;

-- Preserve current access: roles that could read entries receive read access to existing modules.
insert into public.role_permissions(role_key,permission_key,allowed)
select rp.role_key,'modules.'||m.code||'.read',true
from public.role_permissions rp cross join public.master_modules m
where rp.permission_key='entries.read' and rp.allowed=true
on conflict(role_key,permission_key) do nothing;

-- Preserve current export access for existing modules.
insert into public.role_permissions(role_key,permission_key,allowed)
select distinct rp.role_key,'modules.'||m.code||'.export',true
from public.role_permissions rp cross join public.master_modules m
where rp.permission_key in ('entries.export','reports.export') and rp.allowed=true
on conflict(role_key,permission_key) do nothing;

create or replace function public.create_module_permissions()
returns trigger language plpgsql security definer set search_path=public as $m4$
begin
  insert into public.permissions(permission_key,permission_name_th,permission_group,description,sort_order) values
    ('modules.'||new.code||'.read','ดูโมดูล '||new.name_th,'modules','เข้าถึงข้อมูล ตาราง และ Dashboard ของ '||new.name_th,1000+new.sort_order),
    ('modules.'||new.code||'.export','ส่งออกรายงาน '||new.name_th,'modules','ส่งออก CSV, PDF และ PowerPoint ของ '||new.name_th,1001+new.sort_order)
  on conflict(permission_key) do update set permission_name_th=excluded.permission_name_th,description=excluded.description,sort_order=excluded.sort_order;

  insert into public.role_permissions(role_key,permission_key,allowed) values
    ('owner','modules.'||new.code||'.read',true),
    ('owner','modules.'||new.code||'.export',true)
  on conflict(role_key,permission_key) do update set allowed=true;
  return new;
end $m4$;

drop trigger if exists trg_create_module_permissions on public.master_modules;
create trigger trg_create_module_permissions after insert or update of name_th,sort_order on public.master_modules
for each row execute function public.create_module_permissions();

commit;
notify pgrst,'reload schema';
