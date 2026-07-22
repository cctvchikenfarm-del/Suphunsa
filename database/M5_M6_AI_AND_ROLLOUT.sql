-- M5-M6: Metadata-aware AI configuration and rollout permissions.
-- Prerequisite: M1_METADATA_DRIVEN_CORE.sql and M4_DYNAMIC_ANALYTICS_PERMISSIONS.sql
-- This migration does not modify or delete data_entries.
begin;

insert into public.module_ai_settings(module_code,enabled,context_th,primary_metric,aggregation,better_direction,warning_change_percent,allowed_fields,excluded_fields)
select code,false,description,primary_metric,aggregation,better_direction,15,array[primary_metric],array['created_by']
from public.master_modules
on conflict(module_code) do nothing;

insert into public.permissions(permission_key,permission_name_th,permission_group,description,sort_order) values
('fmhy.import','นำเข้ารายงาน FM-HY','entries','อัปโหลด ตรวจสอบ และยืนยันข้อมูลจากรายงาน FM-HY',75)
on conflict(permission_key) do update set permission_name_th=excluded.permission_name_th,permission_group=excluded.permission_group,description=excluded.description,sort_order=excluded.sort_order;

insert into public.role_permissions(role_key,permission_key,allowed)
select role_key,'fmhy.import',true from public.roles where role_key in ('owner','admin','editor')
on conflict(role_key,permission_key) do update set allowed=true;

commit;
notify pgrst,'reload schema';
