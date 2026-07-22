-- M1: Metadata-driven foundation. Preserves all existing business data.
begin;

-- Preflight: M1 is an upgrade migration, not the base schema.
do $m1_preflight$
begin
  if to_regclass('public.data_entries') is null then
    raise exception 'M1 prerequisite missing: public.data_entries does not exist. For a new Supabase project, run database/00_V3_FULL_SETUP_SUPABASE.sql first.';
  end if;
  if to_regprocedure('public.set_updated_at()') is null then
    raise exception 'M1 prerequisite missing: public.set_updated_at() does not exist. Run database/00_V3_FULL_SETUP_SUPABASE.sql first.';
  end if;
end $m1_preflight$;

create table if not exists public.master_modules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_th text not null,
  name_en text,
  description text,
  input_mode text not null check (input_mode in ('daily','monthly','daily_average','transaction','multi_row','hybrid','calculated')),
  category_module_code text,
  icon_key text default 'package',
  color text default '#3B82F6' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  primary_metric text default 'quantity',
  default_unit text,
  aggregation text not null default 'sum' check (aggregation in ('sum','average','latest','count','calculated')),
  better_direction text not null default 'neutral' check (better_direction in ('lower','higher','neutral')),
  allow_csv_import boolean not null default true,
  allow_csv_export boolean not null default true,
  system_module boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.module_fields (
  id uuid primary key default gen_random_uuid(),
  module_code text not null references public.master_modules(code) on update cascade on delete cascade,
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]*$'),
  label_th text not null,
  label_en text,
  data_type text not null check (data_type in ('text','integer','decimal','date','month','select','boolean','calculated')),
  required boolean not null default false,
  unit text,
  placeholder text,
  options jsonb not null default '[]'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  calculated boolean not null default false,
  formula_key text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(module_code, field_key)
);

create table if not exists public.module_formulas (
  id uuid primary key default gen_random_uuid(),
  module_code text not null references public.master_modules(code) on update cascade on delete cascade,
  formula_key text not null,
  formula_type text not null check (formula_type in ('sum_modules','multiply','divide','percentage_change','expression')),
  definition jsonb not null,
  output_field text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(module_code, formula_key)
);

create table if not exists public.module_ai_settings (
  module_code text primary key references public.master_modules(code) on update cascade on delete cascade,
  enabled boolean not null default false,
  context_th text,
  primary_metric text,
  aggregation text default 'sum',
  better_direction text default 'neutral',
  warning_change_percent numeric(7,2),
  allowed_fields text[] not null default '{}',
  excluded_fields text[] not null default array['created_by'],
  instructions text,
  updated_at timestamptz not null default now()
);

insert into public.master_modules(code,name_th,input_mode,category_module_code,icon_key,color,primary_metric,default_unit,aggregation,better_direction,allow_csv_import,system_module,sort_order) values
 ('rdf','RDF','daily','rdf','flame','#F97316','weight_kg','kg','sum','lower',true,true,10),
 ('dog_food','อาหารหมา','daily','dog_food','bone','#22C55E','weight_kg','kg','sum','neutral',true,true,20),
 ('pig_feed','อาหารหมู','daily_average','pig_feed','utensils','#84CC16','weight_kg','kg','average','neutral',true,true,30),
 ('wet_waste','ขยะเปียก','calculated','wet_waste','droplets','#14B8A6','weight_kg','kg','calculated','lower',false,true,40),
 ('recycle','รีไซเคิล','transaction','recycle','recycle','#3B82F6','weight_kg','kg','sum','higher',true,true,50),
 ('tissue','กระดาษทิชชู่','hybrid','tissue','file-text','#A855F7','quantity',null,'sum','lower',true,true,60),
 ('black_bag','ถุงดำ','monthly','black_bag','shopping-bag','#334155','quantity','ใบ','sum','lower',true,true,70),
 ('consumable','ของใช้สิ้นเปลือง','monthly','cleaning_liquid','package','#0EA5E9','quantity',null,'sum','lower',true,true,80)
on conflict(code) do update set name_th=excluded.name_th,input_mode=excluded.input_mode,category_module_code=excluded.category_module_code,primary_metric=excluded.primary_metric,default_unit=excluded.default_unit,aggregation=excluded.aggregation,active=true;

insert into public.module_fields(module_code,field_key,label_th,data_type,required,unit,validation,sort_order) values
 ('rdf','weight_kg','น้ำหนัก','decimal',true,'kg','{"min":0}',10),
 ('dog_food','weight_kg','น้ำหนัก','decimal',true,'kg','{"min":0}',10),
 ('pig_feed','weight_kg','ค่าเฉลี่ยรายวัน','decimal',true,'kg/วัน','{"min":0}',10),
 ('recycle','category_code','ประเภทวัสดุ','select',true,null,'{}',10),
 ('recycle','weight_kg','น้ำหนัก','decimal',true,'kg','{"min":0}',20),
 ('recycle','unit_price','ราคา/กก.','decimal',false,'บาท','{"min":0}',30),
 ('recycle','amount','ยอดเงิน','calculated',false,'บาท','{}',40),
 ('tissue','category_code','ประเภททิชชู่','select',true,null,'{}',10),
 ('tissue','quantity','จำนวน','integer',true,null,'{"min":0}',20),
 ('black_bag','category_code','ขนาดถุงดำ','select',true,null,'{}',10),
 ('black_bag','quantity','จำนวน','integer',true,'ใบ','{"min":0}',20),
 ('consumable','category_code','ประเภทของใช้','select',true,null,'{}',10),
 ('consumable','quantity','จำนวน','decimal',true,null,'{"min":0}',20)
on conflict(module_code,field_key) do update set label_th=excluded.label_th,data_type=excluded.data_type,required=excluded.required,unit=excluded.unit,validation=excluded.validation,active=true;

insert into public.module_formulas(module_code,formula_key,formula_type,definition,output_field) values
 ('wet_waste','wet_waste_total','sum_modules','{"modules":["dog_food","pig_feed"],"metric":"weight_kg"}','weight_kg'),
 ('recycle','sale_amount','multiply','{"fields":["weight_kg","unit_price"]}','amount')
on conflict(module_code,formula_key) do update set formula_type=excluded.formula_type,definition=excluded.definition,output_field=excluded.output_field,active=true;

insert into public.module_ai_settings(module_code,enabled,context_th,primary_metric,aggregation,better_direction,warning_change_percent,allowed_fields)
select code,false,description,primary_metric,aggregation,better_direction,15,array[primary_metric]
from public.master_modules
on conflict(module_code) do nothing;

create index if not exists idx_master_modules_active_sort on public.master_modules(active,sort_order);
create index if not exists idx_module_fields_module_sort on public.module_fields(module_code,active,sort_order);

-- Replace the hard-coded data_entries module check with metadata-backed modules.
do $module_constraint_cleanup$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid='public.data_entries'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%module%'
  loop execute format('alter table public.data_entries drop constraint if exists %I',r.conname); end loop;
  if not exists(select 1 from pg_constraint where conname='data_entries_module_metadata_fk') then
    alter table public.data_entries add constraint data_entries_module_metadata_fk foreign key(module)
      references public.master_modules(code) on update cascade not valid;
  end if;
end $module_constraint_cleanup$;

drop trigger if exists trg_master_modules_updated_at on public.master_modules;
create trigger trg_master_modules_updated_at before update on public.master_modules for each row execute function public.set_updated_at();
drop trigger if exists trg_module_fields_updated_at on public.module_fields;
create trigger trg_module_fields_updated_at before update on public.module_fields for each row execute function public.set_updated_at();

alter table public.master_modules enable row level security;
alter table public.module_fields enable row level security;
alter table public.module_formulas enable row level security;
alter table public.module_ai_settings enable row level security;

commit;
notify pgrst, 'reload schema';
