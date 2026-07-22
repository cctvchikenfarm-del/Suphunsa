-- CKAP P2: Tissue Excel daily/weekly/monthly audited imports.
-- Apply after P1_HYGIENE_EXCEL_IMPORT.sql.

begin;

alter table public.import_batches drop constraint if exists import_batches_source_type_check;
alter table public.import_batches add constraint import_batches_source_type_check
  check (source_type in ('hygiene_enterprise','tissue_excel'));

insert into public.master_categories(module,code,name_th,unit,color,sort_order,active)
values
  ('tissue','tissue_roll','ม้วน','ม้วน','#0284C7',10,true),
  ('tissue','tissue_hand','เช็ดมือ','แผ่น','#10B981',20,true),
  ('tissue','tissue_popup','ป๊อปอัพ','แพ็ค','#EC4899',30,true)
on conflict (module,code) do update set
  name_th=excluded.name_th,
  unit=excluded.unit,
  color=excluded.color,
  active=true,
  updated_at=now();

commit;
notify pgrst,'reload schema';
