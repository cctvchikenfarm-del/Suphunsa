const HEADERS = ['รหัสรายการ','หมวด','วันที่','เดือน','รหัสประเภท','ชื่อรายการ','น้ำหนัก_กก','จำนวน','หน่วย','ราคา_ต่อ_กก','ยอดเงิน','หมายเหตุ','รูปแบบข้อมูล']

function safeCell(value) {
  let text = value == null ? '' : String(value)
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function exportEntriesCsv(rows, module, month) {
  const lines = [HEADERS.map(safeCell).join(',')]
  for (const row of rows) lines.push([
    row.id, row.module || module, row.entry_date, String(row.period_month || month).slice(0,7), row.category_code,
    row.material_name, row.weight_kg, row.quantity, row.unit, row.unit_price, row.amount, row.notes,
    row.metadata?.value_type || row.metadata?.entry_mode || ''
  ].map(safeCell).join(','))
  return `\uFEFF${lines.join('\r\n')}`
}

export function downloadCsv(content, filename) {
  const url = URL.createObjectURL(new Blob([content], { type:'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url)
}

function parseRows(text) {
  const rows=[]; let row=[]; let cell=''; let quoted=false
  const source=String(text).replace(/^\uFEFF/,'')
  for(let i=0;i<source.length;i++) { const c=source[i]
    if(c==='"' && quoted && source[i+1]==='"'){cell+='"';i++}
    else if(c==='"') quoted=!quoted
    else if(c===',' && !quoted){row.push(cell);cell=''}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&source[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v!==''))rows.push(row);row=[];cell=''}
    else cell+=c
  }
  row.push(cell); if(row.some(v=>v!=='')) rows.push(row); return rows
}

export function parseEntriesCsv(text, expectedModule, expectedMonth) {
  const matrix=parseRows(text); if(!matrix.length) return []
  const headers=matrix[0].map(v=>v.trim()); const index=name=>headers.indexOf(name)
  const required=['หมวด','วันที่','เดือน']; const missing=required.filter(h=>index(h)<0)
  if(missing.length) throw new Error(`ไม่พบคอลัมน์: ${missing.join(', ')}`)
  return matrix.slice(1).map((cells,i)=>{
    const get=name=>(cells[index(name)] ?? '').trim(); const errors=[]
    const module=get('หมวด'); const date=get('วันที่'); const month=get('เดือน').slice(0,7)
    if(module!==expectedModule) errors.push(`หมวดต้องเป็น ${expectedModule}`)
    if(month!==expectedMonth || date.slice(0,7)!==expectedMonth) errors.push(`วันที่/เดือนไม่ตรงกับ ${expectedMonth}`)
    const numeric = name => { const raw=get(name); if(!raw) return null; const n=Number(raw); if(!Number.isFinite(n)||n<0){errors.push(`${name} ไม่ถูกต้อง`);return null} return n }
    return { line:i+2, errors, entry:{ id:get('รหัสรายการ')||undefined,module,entry_date:date,period_month:`${month}-01`,category_code:get('รหัสประเภท')||null,material_name:get('ชื่อรายการ')||null,weight_kg:numeric('น้ำหนัก_กก'),quantity:numeric('จำนวน'),unit:get('หน่วย')||'kg',unit_price:numeric('ราคา_ต่อ_กก'),amount:numeric('ยอดเงิน'),notes:get('หมายเหตุ').replace(/^'/,''),metadata:{ value_type:get('รูปแบบข้อมูล')||undefined } } }
  })
}

export function exportDynamicCsv(rows, definition, month) {
  const fields=definition.fields||[]; const headers=['รหัสรายการ','วันที่','เดือน',...fields.map(f=>f.label_th)]
  const lines=[headers.map(safeCell).join(',')]
  for(const row of rows){const custom=row.metadata?.dynamic_fields||{};lines.push([row.id,row.entry_date,month,...fields.map(f=>row[f.field_key]??custom[f.field_key]??'')].map(safeCell).join(','))}
  return `\uFEFF${lines.join('\r\n')}`
}

export function parseDynamicCsv(text, definition, month) {
  const matrix=parseRows(text); if(!matrix.length)return[]; const headers=matrix[0].map(v=>v.trim()); const idx=name=>headers.indexOf(name)
  if(idx('วันที่')<0||idx('เดือน')<0)throw new Error('CSV ต้องมีคอลัมน์ วันที่ และ เดือน')
  return matrix.slice(1).map((cells,index)=>{const get=name=>(cells[idx(name)]??'').trim();const errors=[];const date=get('วันที่');if(get('เดือน').slice(0,7)!==month||date.slice(0,7)!==month)errors.push(`วันที่/เดือนไม่ตรงกับ ${month}`);const values={}
    for(const field of definition.fields||[]){let value=get(field.label_th);if(field.required&&!value)errors.push(`กรุณากรอก${field.label_th}`);if(value&&['integer','decimal'].includes(field.data_type)){const n=Number(value);if(!Number.isFinite(n)||(field.data_type==='integer'&&!Number.isInteger(n))||n<(field.validation?.min??0))errors.push(`${field.label_th} ไม่ถูกต้อง`);else value=n}values[field.field_key]=value}
    return{line:index+2,id:get('รหัสรายการ')||undefined,date,values,errors}
  })
}
