-- CKAP v3.2 P1: audited Hygiene Enterprise Excel imports.
-- Apply after P0_PRODUCTION_HARDENING.sql.

create extension if not exists pgcrypto;

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('hygiene_enterprise')),
  file_name text not null,
  file_sha256 text not null check (file_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'previewed' check (status in ('previewed','committing','committed','failed','rolled_back')),
  total_rows integer not null default 0 check (total_rows >= 0),
  ready_rows integer not null default 0 check (ready_rows >= 0),
  imported_rows integer not null default 0 check (imported_rows >= 0),
  skipped_rows integer not null default 0 check (skipped_rows >= 0),
  review_rows integer not null default 0 check (review_rows >= 0),
  summary jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  rolled_back_at timestamptz
);

alter table public.data_entries add column if not exists import_batch_id uuid references public.import_batches(id) on delete set null;
alter table public.data_entries add column if not exists source_system text;
alter table public.data_entries add column if not exists source_key text;

create unique index if not exists data_entries_source_identity_uq
  on public.data_entries(source_system, source_key)
  where source_system is not null and source_key is not null;
create index if not exists data_entries_import_batch_idx on public.data_entries(import_batch_id);
create index if not exists import_batches_created_at_idx on public.import_batches(created_at desc);

insert into public.master_modules(code,name_th,name_en,description,input_mode,primary_metric,active,sort_order)
values ('general_waste','ขยะทั่วไป','General Waste','ข้อมูลน้ำหนักขยะทั่วไปรายวัน','daily','weight_kg',true,85)
on conflict (code) do update set
  name_th=excluded.name_th,
  name_en=excluded.name_en,
  description=excluded.description,
  input_mode=excluded.input_mode,
  primary_metric=excluded.primary_metric,
  active=true,
  updated_at=now();

insert into public.module_fields(module_code,field_key,label_th,label_en,data_type,required,active,sort_order,placeholder,validation)
values ('general_waste','weight_kg','น้ำหนัก','Weight','decimal',true,true,10,'0.00','{"min":0}'::jsonb)
on conflict (module_code,field_key) do update set
  label_th=excluded.label_th,
  label_en=excluded.label_en,
  data_type=excluded.data_type,
  required=excluded.required,
  active=true,
  validation=excluded.validation,
  updated_at=now();

insert into public.permissions(permission_key,permission_name_th,permission_group,description,sort_order)
values
  ('modules.general_waste.read','ดูข้อมูลขยะทั่วไป','modules','ดูข้อมูลและรายงานขยะทั่วไป',1085),
  ('modules.general_waste.create','เพิ่มข้อมูลขยะทั่วไป','modules','เพิ่มหรือนำเข้าข้อมูลขยะทั่วไป',1086),
  ('modules.general_waste.edit','แก้ไขข้อมูลขยะทั่วไป','modules','แก้ไขข้อมูลขยะทั่วไป',1087),
  ('modules.general_waste.delete','ลบข้อมูลขยะทั่วไป','modules','ลบหรือย้อนกลับข้อมูลขยะทั่วไป',1088),
  ('modules.general_waste.export','ส่งออกข้อมูลขยะทั่วไป','modules','ส่งออกข้อมูลขยะทั่วไป',1089)
on conflict (permission_key) do update set
  permission_name_th=excluded.permission_name_th,
  permission_group=excluded.permission_group,
  description=excluded.description,
  sort_order=excluded.sort_order;

insert into public.role_permissions(role_key,permission_key,allowed)
select role_key, permission_key, true
from (values ('owner'),('admin'),('editor')) as roles(role_key)
cross join (values
  ('modules.general_waste.read'),('modules.general_waste.create'),('modules.general_waste.edit'),
  ('modules.general_waste.delete'),('modules.general_waste.export')
) as permissions(permission_key)
on conflict (role_key,permission_key) do update set allowed=true;

insert into public.role_permissions(role_key,permission_key,allowed)
values ('viewer','modules.general_waste.read',true)
on conflict (role_key,permission_key) do update set allowed=true;

alter table public.import_batches enable row level security;
-- The Backend service role owns import operations; authenticated browser clients receive no direct table policy.
