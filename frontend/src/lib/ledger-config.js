export const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
export const MONTHS_OPTIONS = [
  ['01','มกราคม'],['02','กุมภาพันธ์'],['03','มีนาคม'],['04','เมษายน'],['05','พฤษภาคม'],['06','มิถุนายน'],
  ['07','กรกฎาคม'],['08','สิงหาคม'],['09','กันยายน'],['10','ตุลาคม'],['11','พฤศจิกายน'],['12','ธันวาคม']
].map(([value,label])=>({value,label}))
export const LEDGER_MODULE_LABELS = { rdf:'ขยะ RDF',dog_food:'อาหารหมา',pig_feed:'อาหารหมู',wet_waste:'ขยะเปียก',recycle:'รีไซเคิล',tissue:'กระดาษทิชชู่',black_bag:'ถุงดำ',consumable:'น้ำยาต่างๆ',general_waste:'ขยะทั่วไป' }
export const LEDGER_DB_MODULE_MAP = { rdf:'rdf',dog_food:'dog_food',pig_feed:'pig_feed',wet_waste:'wet_waste',recycle:'recycle',tissue:'tissue',black_bag:'black_bag',consumable:'consumable' }
export function getDayFromDate(dateStr){ if(!dateStr)return 1; const parts=dateStr.split('-'); return parts.length>=3?Number(parts[2]):1 }
export function getWeekIndex(day){ if(day<=7)return 0;if(day<=14)return 1;if(day<=21)return 2;if(day<=27)return 3;return 4 }
export function isDailyAverageEntry(row){
  const metadata = row?.metadata || {}
  if (metadata.value_type === 'actual_daily' || metadata.entry_mode === 'daily') return false
  if (metadata.value_type === 'monthly_total' || metadata.entry_mode === 'monthly_total' || metadata.input_mode === 'monthly_total') return false
  if (metadata.value_type === 'daily_average' || metadata.entry_mode === 'daily_average' || metadata.input_mode === 'daily_average') return true
  // Legacy pig-feed imports stored one average-per-day value on the first day
  // without metadata. Keep those rows compatible, but never override an
  // explicitly declared monthly total.
  return row?.module === 'pig_feed' && getDayFromDate(row?.entry_date || row?.period_month) === 1
}
export function daysInEntryMonth(row){
  const [year, month] = String(row?.period_month || row?.entry_date || '').slice(0, 7).split('-').map(Number)
  return year && month ? new Date(year, month, 0).getDate() : 1
}
export function monthlyEntryValue(row, field = 'weight_kg'){
  const value = Number(row?.[field] || 0)
  return isDailyAverageEntry(row) ? value * Number(row?.metadata?.days_in_month || daysInEntryMonth(row)) : value
}
export function isActivePositiveEntry(row){
  if (!row || row.deleted_at || row.is_deleted === true || row.active === false || row.metadata?.deleted === true || row.metadata?.is_deleted === true) return false
  return ['weight_kg', 'quantity', 'amount'].some(field => Number(row[field] || 0) > 0)
}
export function getReportableMonths(entries, requestedMonths){
  const activeMonths = new Set(
    (entries || [])
      .filter(isActivePositiveEntry)
      .map(row => String(row.period_month || row.entry_date || '').slice(0, 7))
      .filter(month => /^\d{4}-\d{2}$/.test(month))
  )
  return (requestedMonths || []).filter(month => activeMonths.has(month))
}
export function getModuleConfig(moduleCode){
  const type=moduleCode==='tissue'?'count':moduleCode==='recycle'?'sales':['rdf','wet_waste','pig_feed','dog_food'].includes(moduleCode)?'weight':['black_bag','consumable'].includes(moduleCode)?'count':'all'
  if(type==='count')return{type,showWeight:false,showQty:true,showAmount:false,showPrice:false,headers:['วันที่','รายการ','จำนวน','หน่วย','หมายเหตุ'],cols:['date','name','qty','unit','notes']}
  if(type==='sales')return{type,showWeight:true,showQty:false,showAmount:true,showPrice:true,headers:['วันที่ขาย','รายการวัสดุ','น้ำหนัก (กก.)','ราคา/กก. (บาท)','จำนวนเงิน (บาท)','หมายเหตุ'],cols:['date','name','weight','price','amount','notes']}
  if(type==='weight')return{type,showWeight:true,showQty:false,showAmount:false,showPrice:false,headers:['วันที่','รายการ','น้ำหนัก (กก.)','หมายเหตุ'],cols:['date','name','weight','notes']}
  return{type:'all',showWeight:true,showQty:true,showAmount:true,showPrice:false,headers:['วันที่','ประเภทโมดูล','รายการ / รายละเอียด','น้ำหนัก (กก.)','จำนวน','หน่วย','จำนวนเงิน (บาท)','หมายเหตุ'],cols:['date','module','name','weight','qty','unit','amount','notes']}
}
export function getGroupedConfig(moduleCode){ const type=getModuleConfig(moduleCode).type
  if(type==='count')return{headers:['ช่วงเวลาที่จัดกลุ่ม','ประเภทโมดูล','จำนวนหน่วยรวม','จำนวนรายการ'],cols:['period','module','qty','count']}
  if(type==='sales')return{headers:['ช่วงเวลาที่จัดกลุ่ม','ประเภทโมดูล','น้ำหนักรวม (กก.)','ยอดเงินรวม (บาท)','จำนวนรายการ'],cols:['period','module','weight','amount','count']}
  if(type==='weight')return{headers:['ช่วงเวลาที่จัดกลุ่ม','ประเภทโมดูล','น้ำหนักรวม (กก.)','จำนวนรายการ'],cols:['period','module','weight','count']}
  return{headers:['ช่วงเวลาที่จัดกลุ่ม','ประเภทโมดูล','น้ำหนักรวม (กก.)','จำนวนหน่วยรวม','ยอดเงินรวม (บาท)','จำนวนรายการ'],cols:['period','module','weight','qty','amount','count']}
}
