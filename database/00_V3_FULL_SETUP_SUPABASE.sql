-- Central Krabi Analytics Platform v3.0.9
-- Render + Supabase production-ready base schema
-- Includes: data entries, report preview/generate history, users/roles/permissions,
-- audit logs, automation starter tables, local AI Insight analytics, and Chart Builder preview.

create extension if not exists pgcrypto;

create table if not exists public.roles (
  role_key text primary key,
  role_name_th text not null,
  description text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permissions (
  permission_key text primary key,
  permission_name_th text not null,
  permission_group text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_key text not null references public.roles(role_key) on delete cascade,
  permission_key text not null references public.permissions(permission_key) on delete cascade,
  allowed boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (role_key, permission_key)
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  display_name text not null default 'System User',
  role text not null default 'viewer' references public.roles(role_key),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_key text not null references public.permissions(permission_key) on delete cascade,
  allowed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, permission_key)
);

create table if not exists public.master_categories (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  code text not null,
  name_th text not null,
  unit text not null default 'kg',
  color text default '#2563eb',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module, code),
  unique (module, name_th)
);

create table if not exists public.data_entries (
  id uuid primary key default gen_random_uuid(),
  module text not null check (module in ('rdf','dog_food','pig_feed','wet_waste','recycle','tissue','black_bag')),
  category_code text,
  entry_date date not null,
  period_month date not null,
  material_name text,
  weight_kg numeric(14,2),
  quantity numeric(14,2),
  unit text not null default 'kg',
  unit_price numeric(14,2),
  amount numeric(14,2),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.report_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  modules text[] not null default array['rdf','dog_food','pig_feed','wet_waste','recycle','tissue','black_bag'],
  outline jsonb not null default '[]'::jsonb,
  theme jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_runs (
  id uuid primary key default gen_random_uuid(),
  report_type text not null default 'powerpoint',
  title text not null,
  period_month date not null,
  modules text[] not null default '{}',
  outline jsonb not null default '[]'::jsonb,
  status text not null default 'success',
  error_message text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.report_files (
  id uuid primary key default gen_random_uuid(),
  report_run_id uuid references public.report_runs(id) on delete cascade,
  file_name text not null,
  mime_type text not null default 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  storage_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.automation_jobs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  action_type text not null check (action_type in ('data_quality_check','monthly_summary','report_preview','ai_insight_check','chart_preview')),
  enabled boolean not null default true,
  interval_minutes integer not null default 1440,
  next_run_at timestamptz,
  last_run_at timestamptz,
  config jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.automation_jobs(id) on delete cascade,
  status text not null default 'success',
  result jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);


-- Safe migration for projects that already ran earlier preview SQL.
alter table public.roles add column if not exists role_name_th text;
alter table public.roles add column if not exists description text;
alter table public.roles add column if not exists sort_order integer not null default 0;
alter table public.roles add column if not exists active boolean not null default true;
alter table public.roles add column if not exists created_at timestamptz not null default now();
alter table public.roles add column if not exists updated_at timestamptz not null default now();

alter table public.permissions add column if not exists permission_name_th text;
alter table public.permissions add column if not exists permission_group text not null default 'general';
alter table public.permissions add column if not exists description text;
alter table public.permissions add column if not exists sort_order integer not null default 0;
alter table public.permissions add column if not exists created_at timestamptz not null default now();

alter table public.role_permissions add column if not exists role_key text;
alter table public.role_permissions add column if not exists permission_key text;
alter table public.role_permissions add column if not exists allowed boolean not null default true;
alter table public.role_permissions add column if not exists created_at timestamptz not null default now();

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists display_name text not null default 'System User';
alter table public.profiles add column if not exists role text not null default 'viewer';
alter table public.profiles add column if not exists active boolean not null default true;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

update public.profiles set role='viewer' where role is null or role not in ('owner','admin','editor','viewer');
alter table public.profiles alter column role set default 'viewer';
do $profile_role_fk$
begin
  if not exists(select 1 from pg_constraint where conname='profiles_role_fk') then
    alter table public.profiles add constraint profiles_role_fk foreign key(role)
      references public.roles(role_key) on update cascade not valid;
  end if;
end $profile_role_fk$;

alter table public.master_categories add column if not exists updated_at timestamptz not null default now();

alter table public.data_entries add column if not exists category_code text;
alter table public.data_entries add column if not exists entry_date date;
alter table public.data_entries add column if not exists period_month date;
alter table public.data_entries add column if not exists material_name text;
alter table public.data_entries add column if not exists weight_kg numeric(14,2);
alter table public.data_entries add column if not exists quantity numeric(14,2);
alter table public.data_entries add column if not exists unit text not null default 'kg';
alter table public.data_entries add column if not exists unit_price numeric(14,2);
alter table public.data_entries add column if not exists amount numeric(14,2);
alter table public.data_entries add column if not exists notes text;
alter table public.data_entries add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.data_entries add column if not exists created_by uuid;
alter table public.data_entries add column if not exists created_at timestamptz not null default now();
alter table public.data_entries add column if not exists updated_at timestamptz not null default now();

alter table public.audit_logs add column if not exists actor_id uuid;
alter table public.audit_logs add column if not exists action text;
alter table public.audit_logs add column if not exists table_name text;
alter table public.audit_logs add column if not exists record_id text;
alter table public.audit_logs alter column record_id type text using record_id::text;
alter table public.audit_logs add column if not exists old_data jsonb;
alter table public.audit_logs add column if not exists new_data jsonb;
alter table public.audit_logs add column if not exists ip_address text;
alter table public.audit_logs add column if not exists user_agent text;
alter table public.audit_logs add column if not exists created_at timestamptz not null default now();

alter table public.report_runs add column if not exists report_type text not null default 'powerpoint';
alter table public.report_runs add column if not exists title text not null default 'รายงานขยะประจำเดือน';
alter table public.report_runs add column if not exists period_month date not null default date_trunc('month', now())::date;
alter table public.report_runs add column if not exists modules text[] not null default '{}';
alter table public.report_runs add column if not exists outline jsonb not null default '[]'::jsonb;
alter table public.report_runs add column if not exists status text not null default 'success';
alter table public.report_runs add column if not exists error_message text;
alter table public.report_runs add column if not exists created_by uuid;
alter table public.report_runs add column if not exists created_at timestamptz not null default now();

alter table public.automation_jobs add column if not exists action_type text;
alter table public.automation_jobs add column if not exists enabled boolean not null default true;
alter table public.automation_jobs add column if not exists interval_minutes integer not null default 1440;
alter table public.automation_jobs add column if not exists next_run_at timestamptz;
alter table public.automation_jobs add column if not exists last_run_at timestamptz;
alter table public.automation_jobs add column if not exists config jsonb not null default '{}'::jsonb;
alter table public.automation_jobs add column if not exists created_by uuid;
alter table public.automation_jobs add column if not exists created_at timestamptz not null default now();
alter table public.automation_jobs add column if not exists updated_at timestamptz not null default now();


-- v3.0.9: allow AI Insight and Chart Builder automation without recreating existing table.
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.automation_jobs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%action_type%'
  loop
    execute format('alter table public.automation_jobs drop constraint if exists %I', r.conname);
  end loop;
end $$;

alter table public.automation_jobs
  add constraint automation_jobs_action_type_check
  check (action_type in ('data_quality_check','monthly_summary','report_preview','ai_insight_check','chart_preview'));

create index if not exists idx_data_entries_module_month on public.data_entries(module, period_month);
create index if not exists idx_data_entries_entry_date on public.data_entries(entry_date);
create index if not exists idx_master_categories_module on public.master_categories(module, active, sort_order);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index if not exists idx_report_runs_created_at on public.report_runs(created_at desc);
create index if not exists idx_automation_jobs_next_run on public.automation_jobs(enabled, next_run_at);

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

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_roles_updated_at on public.roles;
create trigger trg_roles_updated_at before update on public.roles
for each row execute function public.set_updated_at();

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_data_entries_updated_at on public.data_entries;
create trigger trg_data_entries_updated_at before update on public.data_entries
for each row execute function public.set_updated_at();

drop trigger if exists trg_master_categories_updated_at on public.master_categories;
create trigger trg_master_categories_updated_at before update on public.master_categories
for each row execute function public.set_updated_at();

drop trigger if exists trg_report_presets_updated_at on public.report_presets;
create trigger trg_report_presets_updated_at before update on public.report_presets
for each row execute function public.set_updated_at();

drop trigger if exists trg_automation_jobs_updated_at on public.automation_jobs;
create trigger trg_automation_jobs_updated_at before update on public.automation_jobs
for each row execute function public.set_updated_at();

insert into public.roles (role_key, role_name_th, description, sort_order) values
  ('owner', 'เจ้าของระบบ', 'ทำได้ทุกอย่าง', 10),
  ('admin', 'ผู้ดูแลระบบ', 'จัดการข้อมูล ผู้ใช้ รายงาน และ Automation', 20),
  ('editor', 'ผู้บันทึกข้อมูล', 'เพิ่ม/แก้ไขข้อมูลและส่งออกรายงาน', 30),
  ('viewer', 'ผู้ดูอย่างเดียว', 'ดูข้อมูลและพรีวิวรายงานได้เท่านั้น', 40)
on conflict (role_key) do update set
  role_name_th = excluded.role_name_th,
  description = excluded.description,
  sort_order = excluded.sort_order,
  active = true;

insert into public.permissions (permission_key, permission_name_th, permission_group, description, sort_order) values
  ('dashboard.read', 'ดูแดชบอร์ด', 'dashboard', 'เปิดดูภาพรวมระบบ', 10),
  ('entries.read', 'ดูข้อมูล', 'entries', 'ดูตารางข้อมูลทุกโมดูล', 20),
  ('entries.create', 'เพิ่มข้อมูล', 'entries', 'กด Save เพื่อเพิ่มรายการ', 30),
  ('entries.edit', 'แก้ไขข้อมูล', 'entries', 'แก้รายการเดิม', 40),
  ('entries.delete', 'ลบข้อมูล', 'entries', 'ลบรายการข้อมูล', 50),
  ('entries.import', 'นำเข้า CSV', 'entries', 'Import CSV', 60),
  ('entries.export', 'ส่งออก CSV', 'entries', 'Export CSV', 70),
  ('quality.read', 'ดูคุณภาพข้อมูล', 'quality', 'ตรวจคุณภาพข้อมูล', 80),
  ('insights.read', 'ดู AI Insight', 'insights', 'ดูแนวโน้ม ความผิดปกติ และข้อเสนอแนะจากข้อมูลจริง', 85),
  ('charts.read', 'ดูกราฟรายงาน', 'charts', 'ดู Chart Builder และ Graph Preview จากข้อมูลจริง', 87),
  ('charts.export', 'ใช้กราฟในรายงาน', 'charts', 'นำกราฟเข้า PowerPoint Report Builder', 88),
  ('reports.preview', 'พรีวิวรายงาน', 'reports', 'Preview slide outline ก่อนสร้าง', 90),
  ('reports.export', 'สร้าง PowerPoint', 'reports', 'Generate PPTX', 100),
  ('reports.presets.manage', 'จัดการ Preset รายงาน', 'reports', 'บันทึก/แก้ preset รายงาน', 110),
  ('users.read', 'ดูผู้ใช้', 'users', 'ดูรายการผู้ใช้', 120),
  ('users.manage', 'จัดการผู้ใช้', 'users', 'เพิ่ม/แก้/ลบผู้ใช้', 130),
  ('roles.read', 'ดูสิทธิ์', 'roles', 'ดู Role และ Permission Matrix', 140),
  ('roles.manage', 'จัดการสิทธิ์', 'roles', 'แก้ Permission Matrix', 150),
  ('audit.read', 'ดูประวัติแก้ไข', 'audit', 'ดู audit log', 160),
  ('automation.read', 'ดู Automation', 'automation', 'ดูงานอัตโนมัติ', 170),
  ('automation.manage', 'จัดการ Automation', 'automation', 'สร้าง/แก้ automation job', 180),
  ('automation.run', 'รัน Automation', 'automation', 'กดรันงานอัตโนมัติ', 190),
  ('settings.manage', 'ตั้งค่าระบบ', 'settings', 'จัดการตั้งค่าระบบ', 200)
on conflict (permission_key) do update set
  permission_name_th = excluded.permission_name_th,
  permission_group = excluded.permission_group,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.role_permissions (role_key, permission_key, allowed)
select 'owner', permission_key, true from public.permissions
on conflict (role_key, permission_key) do update set allowed = true;

insert into public.role_permissions (role_key, permission_key, allowed)
select 'admin', permission_key, true from public.permissions
where permission_key not in ('settings.manage')
on conflict (role_key, permission_key) do update set allowed = true;

insert into public.role_permissions (role_key, permission_key, allowed)
select 'editor', permission_key, true from public.permissions
where permission_key in (
  'dashboard.read','entries.read','entries.create','entries.edit','entries.import','entries.export',
  'quality.read','insights.read','charts.read','charts.export','reports.preview','reports.export','automation.read'
)
on conflict (role_key, permission_key) do update set allowed = true;

insert into public.role_permissions (role_key, permission_key, allowed)
select 'viewer', permission_key, true from public.permissions
where permission_key in ('dashboard.read','entries.read','quality.read','insights.read','charts.read','reports.preview')
on conflict (role_key, permission_key) do update set allowed = true;

insert into public.master_categories (module, code, name_th, unit, color, sort_order) values
  ('rdf', 'RDF', 'RDF', 'kg', '#f97316', 10),
  ('dog_food', 'DOG_FOOD', 'อาหารหมา', 'kg', '#22c55e', 20),
  ('pig_feed', 'PIG_FEED', 'อาหารหมู', 'kg', '#84cc16', 30),
  ('wet_waste', 'WET_WASTE', 'ขยะเปียก', 'kg', '#14b8a6', 40),
  ('recycle', 'RECYCLE', 'รีไซเคิล', 'kg', '#3b82f6', 50),
  ('tissue', 'TISSUE', 'กระดาษทิชชู่', 'kg', '#a855f7', 60),
  ('black_bag', 'BLACK_BAG', 'ถุงดำ', 'ใบ', '#334155', 70),
  ('consumable', 'CONSUMABLE', 'ของใช้สิ้นเปลือง', 'ชิ้น', '#0ea5e9', 80)
on conflict (module, code) do update set
  name_th = excluded.name_th,
  unit = excluded.unit,
  color = excluded.color,
  sort_order = excluded.sort_order,
  active = true;

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

insert into public.automation_jobs (name, action_type, enabled, interval_minutes, next_run_at, config)
values
  ('ตรวจคุณภาพข้อมูลรายวัน', 'data_quality_check', false, 1440, now() + interval '1 day', '{}'::jsonb),
  ('สรุปรายเดือนอัตโนมัติ', 'monthly_summary', false, 43200, date_trunc('month', now()) + interval '1 month', '{}'::jsonb),
  ('เตรียมพรีวิวรายงาน', 'report_preview', false, 43200, date_trunc('month', now()) + interval '1 month', '{}'::jsonb),
  ('วิเคราะห์ AI Insight รายเดือน', 'ai_insight_check', false, 43200, date_trunc('month', now()) + interval '1 month', '{}'::jsonb),
  ('เตรียมกราฟรายงาน', 'chart_preview', false, 43200, date_trunc('month', now()) + interval '1 month', '{}'::jsonb)
on conflict (name,action_type) do nothing;

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.master_categories enable row level security;
alter table public.data_entries enable row level security;
alter table public.audit_logs enable row level security;
alter table public.report_presets enable row level security;
alter table public.report_runs enable row level security;
alter table public.report_files enable row level security;
alter table public.automation_jobs enable row level security;
alter table public.automation_runs enable row level security;

-- Frontend never connects to Supabase directly. Backend uses SUPABASE_SERVICE_ROLE_KEY and bypasses RLS.
-- Do not expose SUPABASE_SERVICE_ROLE_KEY in frontend variables.

NOTIFY pgrst, 'reload schema';
