-- Run after V3_FULL_SETUP_SUPABASE.sql. Safe to run more than once.
begin;

alter table public.master_categories
  add column if not exists name_en text,
  add column if not exists updated_at timestamptz not null default now();

insert into public.master_categories (module, code, name_th, name_en, unit, color, sort_order, active) values
  ('tissue', 'tissue_roll', 'ม้วน', null, 'ม้วน', '#3B82F6', 110, true),
  ('tissue', 'tissue_hand', 'มือ', null, 'แผ่น', '#10B981', 120, true),
  ('tissue', 'tissue_popup', 'ป๊อปอัพ', null, 'แพ็ค', '#F59E0B', 130, true),
  ('recycle', 'recycle_pet', 'ขวดพลาสติก PET', null, 'kg', '#3B82F6', 110, true),
  ('recycle', 'recycle_cardboard', 'กระดาษลัง', null, 'kg', '#F59E0B', 120, true),
  ('recycle', 'recycle_iron', 'เหล็ก', null, 'kg', '#6B7280', 130, true),
  ('recycle', 'recycle_aluminum', 'อลูมิเนียม', null, 'kg', '#EC4899', 140, true),
  ('recycle', 'recycle_glass', 'ขวดแก้ว', null, 'kg', '#10B981', 150, true),
  ('recycle', 'recycle_other', 'อื่น ๆ', null, 'kg', '#8B5CF6', 160, true),
  ('black_bag', 'black_bag_small', 'ถุงดำเล็ก', null, 'ใบ', '#64748B', 110, true),
  ('black_bag', 'black_bag_medium', 'ถุงดำกลาง', null, 'ใบ', '#475569', 120, true),
  ('black_bag', 'black_bag_large', 'ถุงดำใหญ่', null, 'ใบ', '#334155', 130, true),
  ('consumable', 'consumable_foam_soap', 'สบู่โฟม', null, 'แกลลอน', '#06B6D4', 110, true),
  ('consumable', 'consumable_seat_cleaner', 'น้ำยาเช็ดฝาโถ', null, 'ขวด', '#EC4899', 120, true)
on conflict (module, code) do update set
  name_th = excluded.name_th,
  unit = excluded.unit,
  color = excluded.color,
  sort_order = excluded.sort_order,
  active = true;

commit;
notify pgrst, 'reload schema';
