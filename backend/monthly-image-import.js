'use strict';

const crypto = require('node:crypto');

const HEADER_ALIASES = [
  { module:'tissue', category_code:'tissue_roll', aliases:['ม้วน','ทิชชู่ม้วน','roll'], unit:'ม้วน' },
  { module:'tissue', category_code:'tissue_hand', aliases:['มือ','เช็ดมือ','ทิชชู่มือ','hand towel'], unit:'แพ็ค' },
  { module:'tissue', category_code:'tissue_popup', aliases:['popup','pop up','ป๊อปอัพ','ป๊อบอัพ'], unit:'แพ็ค' },
  { module:'black_bag', category_code:'black_bag_large', aliases:['ถุงใหญ่','30x40'], unit:'kg' },
  { module:'black_bag', category_code:'black_bag_medium', aliases:['ถุงกลาง','28x36'], unit:'kg' },
  { module:'black_bag', category_code:'black_bag_small', aliases:['ถุงเล็ก','18x20'], unit:'kg' },
  { module:'consumable', category_code:null, aliases:['น้ำยา','สบู่โฟม','ของใช้สิ้นเปลือง'], unit:'แกลลอน' }
];

const MATERIAL_ALIASES = {
  'กระดาษน้ำตาล':['กระดาษน้ำตาล'], 'สังกะสีกระป๋อง':['สังกะสีกระป๋อง','สังกะสีกระป๋อง 1','สังกะสีกระป๋อง 2'],
  'pet':['pet','ขวด pet','ขวดพลาสติก pet'], 'พลาสติกรวม':['พลาสติกรวม','พลาสติกรวม1','พลาสติกรวม2'],
  'อลูโค้ก':['อลูโค้ก','อลู-โค้ก','อลู โค้ก'], 'แก้วรวมสี':['แก้วรวมสี','แก้ว-รวมสี'], 'กระดาษจับจั้ว':['กระดาษจับจั้ว']
};

function normalizeText(value) {
  return String(value || '').toLowerCase().normalize('NFKC').replace(/[\s_./()\-]+/g, '').replace(/ป๊อบ/g,'ป๊อป').trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '' || value === '-') return null;
  const parsed = Number(String(value).replace(/,/g,''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function sourceKey(fileHash, identity) {
  return crypto.createHash('sha256').update(`monthly-image|${fileHash}|${identity}`).digest('hex');
}

function matchCategory(name, categories) {
  const target = normalizeText(name);
  const direct = categories.find(item => [item.code,item.name_th,item.name].some(value => normalizeText(value) === target));
  if (direct) return direct;
  for (const [canonical, aliases] of Object.entries(MATERIAL_ALIASES)) {
    if (![canonical,...aliases].some(alias => normalizeText(alias) === target)) continue;
    const aliasTargets = [canonical,...aliases].map(normalizeText);
    const match = categories.find(item => aliasTargets.includes(normalizeText(item.name_th || item.name || item.code)));
    if (match) return match;
  }
  return null;
}

function matchHeader(label, categories) {
  const text = normalizeText(label);
  const definition = HEADER_ALIASES.find(item => item.aliases.some(alias => text.includes(normalizeText(alias))));
  if (!definition) return null;
  if (definition.category_code) return definition;
  const category = categories.find(item => ['consumable','cleaning_liquid'].includes(item.module) && text.includes(normalizeText(item.name_th || item.name || item.code)));
  return { ...definition, category_code:category?.code || null };
}

function previewRow({ fileHash, identity, rawLabel, entry, issues = [], confidence = 1 }) {
  return {
    row_id:sourceKey(fileHash, identity), source_key:sourceKey(fileHash, identity), raw_label:rawLabel,
    status:issues.length || confidence < .82 ? 'review' : 'ready', confidence:Number(confidence || 0), issues, entry
  };
}

function buildRecycleRows(extraction, categories, month, fileHash) {
  const rows = (extraction.rows || []).map((raw,index) => {
    const materialName=String(raw.material_name || raw.name || '').trim();
    const category=matchCategory(materialName,categories.filter(item=>item.module==='recycle'));
    const weight=numberOrNull(raw.weight_kg ?? raw.weight);
    const amount=numberOrNull(raw.amount);
    const price=numberOrNull(raw.unit_price);
    const issues=[];
    if(!category) issues.push('ไม่พบชื่อวัสดุใน Master Data กรุณาจับคู่ก่อนนำเข้า');
    if(weight===null) issues.push('น้ำหนักไม่ถูกต้องหรืออ่านไม่ได้');
    if(amount===null) issues.push('จำนวนเงินไม่ถูกต้องหรืออ่านไม่ได้');
    if(weight!==null && amount!==null && price!==null && Math.abs(weight*price-amount)>.11) issues.push('น้ำหนัก × ราคา ไม่ตรงกับจำนวนเงิน');
    const entry={ module:'recycle', category_code:category?.code || '', material_name:category?.name_th || materialName, entry_date:`${month}-01`, period_month:`${month}-01`, weight_kg:weight, unit:'kg', unit_price:price ?? (weight ? Number((amount/weight).toFixed(4)) : null), amount, metadata:{ import_kind:'monthly_image', document_type:'recycle_voucher', raw_label:materialName } };
    return previewRow({fileHash,identity:`recycle|${index}|${materialName}`,rawLabel:materialName,entry,issues,confidence:raw.confidence ?? extraction.confidence});
  });
  const sum=rows.reduce((total,row)=>total+Number(row.entry.amount||0),0);
  const net=numberOrNull(extraction.net_total);
  const documentIssues=[];
  if(net!==null && Math.abs(sum-net)>.11) documentIssues.push(`ผลรวมรายการ ${sum.toFixed(2)} ไม่ตรงกับยอดสุทธิ ${net.toFixed(2)}`);
  return {rows,documentIssues,calculated_total:Number(sum.toFixed(2)),document_total:net};
}

function buildDailyRows(extraction, categories, month, fileHash) {
  const columns=(extraction.columns || []).map(column=>({ ...column, mapping:matchHeader(column.label || column.key,categories) }));
  const rows=[]; const daysInMonth=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();
  for(const raw of extraction.rows || []) {
    const day=Number(raw.day); if(!Number.isInteger(day)||day<1||day>daysInMonth) continue;
    for(const column of columns) {
      const value=numberOrNull(raw.values?.[column.key]); if(value===null) continue;
      const mapping=column.mapping; const issues=[];
      if(!mapping?.category_code) issues.push(`ไม่รู้จักคอลัมน์ “${column.label || column.key}” กรุณาจับคู่ Master Data`);
      const module=mapping?.module || '';
      const entry={ module, category_code:mapping?.category_code || '', material_name:column.label || column.key, entry_date:`${month}-${String(day).padStart(2,'0')}`, period_month:`${month}-01`, quantity:value, unit:mapping?.unit || '', metadata:{ import_kind:'monthly_image', document_type:'daily_vertical_sheet', raw_header:column.label || column.key } };
      rows.push(previewRow({fileHash,identity:`daily|${day}|${column.key}`,rawLabel:column.label || column.key,entry,issues,confidence:Math.min(raw.confidence ?? 1,column.confidence ?? extraction.confidence ?? 1)}));
    }
  }
  return {rows,documentIssues:columns.filter(item=>!item.mapping?.category_code).map(item=>`พบคอลัมน์ใหม่: ${item.label || item.key}`)};
}

function buildMonthlyImagePreview({ extraction, categories = [], month, fileHash, fileName }) {
  if(!/^\d{4}-\d{2}$/.test(month||'')) throw new Error('เดือนรายงานไม่ถูกต้อง');
  const kind=extraction.document_type;
  const result=kind==='recycle_voucher' ? buildRecycleRows(extraction,categories,month,fileHash) : buildDailyRows(extraction,categories,month,fileHash);
  const summary=result.rows.reduce((acc,row)=>{acc.total++;acc[row.status]=(acc[row.status]||0)+1;return acc;},{total:0,ready:0,review:0,duplicate:0});
  return { file_name:fileName,file_hash:fileHash,document_type:kind,month,rows:result.rows,summary,document_issues:result.documentIssues,calculated_total:result.calculated_total,document_total:result.document_total };
}

module.exports={normalizeText,numberOrNull,matchCategory,matchHeader,buildMonthlyImagePreview};
