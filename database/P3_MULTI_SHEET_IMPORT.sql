-- CKAP P3: One-shot multi-sheet Excel import.
-- Apply after P2_TISSUE_EXCEL_IMPORT.sql.

begin;

alter table public.import_batches drop constraint if exists import_batches_source_type_check;
alter table public.import_batches add constraint import_batches_source_type_check
  check (source_type in ('hygiene_enterprise','tissue_excel','central_multi_sheet'));

insert into public.master_categories(module,code,name_th,unit,color,sort_order,active) values
  ('rdf','RDF','ขยะ RDF','kg','#F97316',10,true),
  ('dog_food','DOG_FOOD','อาหารหมา','kg','#22C55E',20,true),
  ('tissue','tissue_roll','ม้วน','ม้วน','#0284C7',10,true),
  ('tissue','tissue_hand','เช็ดมือ','แผ่น','#10B981',20,true),
  ('tissue','tissue_popup','ป๊อปอัพ','แพ็ค','#EC4899',30,true),
  ('black_bag','black_bag_large','ถุงใหญ่ 30x40 สีดำ','ใบ','#18181B',10,true),
  ('black_bag','black_bag_medium','ถุงกลาง 28x36 สีชา','ใบ','#EA580C',20,true),
  ('black_bag','black_bag_small','ถุงเล็ก 18x20 สีดำ','ใบ','#71717A',30,true)
on conflict(module,code) do update set
  name_th=excluded.name_th, unit=excluded.unit, color=excluded.color,
  sort_order=excluded.sort_order, active=true, updated_at=now();

commit;
notify pgrst,'reload schema';
