import React, { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, FileText, Table2, TrendingUp } from 'lucide-react'
import { apiFetch, currentMonth, formatNumber } from '../api.js'
import { aggregateModuleRows, buildModuleMonthlySeries, moduleTableFields, percentChange, readEntryValue } from '../lib/metadata-analytics.js'
import { exportDynamicCsv, downloadCsv } from '../lib/csv-engine.js'
import { thaiMonthLabel } from '../lib/report-builder.js'

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const monthOffset=(month,delta)=>{const [y,m]=month.split('-').map(Number);const d=new Date(y,m-1+delta,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}

export default function DynamicAnalytics({month,monthsCount=12,permissions=[],user=null}){
  const [selectedCode,setSelectedCode]=useState(''); const [chartType,setChartType]=useState('bar'); const [pdfOpen,setPdfOpen]=useState(false); const frameRef=useRef(null)
  const modulesQuery=useQuery({queryKey:['modules-active-analytics'],queryFn:()=>apiFetch('/api/modules-active')})
  const modules=modulesQuery.data||[]; const definition=modules.find(item=>item.code===(selectedCode||modules[0]?.code)); const code=definition?.code
  const safeMonth=month||currentMonth()
  const start=monthOffset(safeMonth,-Math.max(0,monthsCount-1)); const end=`${safeMonth}-31`
  const entriesQuery=useQuery({queryKey:['dynamic-analytics-entries',code,start,end],queryFn:()=>apiFetch(`/api/entries?module=${code}&startDate=${start}-01&endDate=${end}`),enabled:Boolean(month&&code)})
  const rows=entriesQuery.data||[]; const months=useMemo(()=>Array.from({length:monthsCount},(_,index)=>monthOffset(start,index)),[start,monthsCount])
  const series=useMemo(()=>buildModuleMonthlySeries(rows,definition,months).map(item=>({...item,label:thaiMonthLabel(item.month)})),[rows,definition,months])
  const current=series.at(-1)||{value:0,count:0}; const previous=series.at(-2)||{value:0,count:0}; const change=percentChange(current.value,previous.value); const fields=moduleTableFields(definition)
  const monthRows=rows.filter(row=>String(row.period_month||row.entry_date||'').slice(0,7)===month)
  const pdfHtml=useMemo(()=>`<!doctype html><html lang="th"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;padding:28px;color:#1e293b}h1{font-size:22px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left}th{background:#f1f5f9}.summary{display:flex;gap:24px;margin:18px 0}.summary b{font-size:20px}@media print{body{padding:0}}</style></head><body><h1>${escapeHtml(definition?.name_th)} — ${escapeHtml(thaiMonthLabel(month))}</h1><div class="summary"><div>ยอดรวม<br><b>${escapeHtml(formatNumber(current.value))} ${escapeHtml(current.unit)}</b></div><div>จำนวนรายการ<br><b>${monthRows.length}</b></div><div>เทียบเดือนก่อน<br><b>${change>0?'+':''}${change}%</b></div></div><table><thead><tr><th>วันที่</th>${fields.map(f=>`<th>${escapeHtml(f.label)}${f.unit?` (${escapeHtml(f.unit)})`:''}</th>`).join('')}</tr></thead><tbody>${monthRows.map(row=>`<tr><td>${escapeHtml(row.entry_date)}</td>${fields.map(f=>`<td>${escapeHtml(readEntryValue(row,f.key))}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${fields.length+1}">ไม่มีข้อมูล</td></tr>`}</tbody></table></body></html>`,[definition,month,current.value,current.unit,change,fields,monthRows])
  if(!month)return <div className="alert">กรุณาเลือกเดือนก่อนแสดงผล</div>
  if(modulesQuery.isLoading)return <div className="alert">กำลังโหลด Metadata...</div>
  if(!modules.length)return <div className="alert">ไม่มีโมดูลที่ได้รับสิทธิ์ให้แสดงผล</div>
  const Chart=chartType==='line'?LineChart:BarChart; const DataShape=chartType==='line'?Line:Bar
  const canExport=user?.role==='owner'||(permissions.includes('entries.export')&&permissions.includes(`modules.${code}.export`))
  return <div style={{display:'grid',gap:16}}>
    <div className="card"><div className="section-title-row"><div><h3>Dynamic Dashboard & Report</h3><p className="muted">ตาราง กราฟ และยอดสรุปสร้างจาก Metadata โดยอัตโนมัติ</p></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><select value={code||''} onChange={e=>setSelectedCode(e.target.value)}>{modules.map(item=><option key={item.code} value={item.code}>{item.name_th}</option>)}</select><button className="ghost" onClick={()=>setChartType(chartType==='bar'?'line':'bar')}><TrendingUp size={15}/> {chartType==='bar'?'กราฟเส้น':'กราฟแท่ง'}</button>{definition?.allow_csv_export&&canExport&&<button className="ghost" onClick={()=>downloadCsv(exportDynamicCsv(monthRows,definition,month),`${code}_${month}.csv`)}><Download size={15}/> CSV</button>}{canExport&&<button className="ghost" onClick={()=>setPdfOpen(true)}><FileText size={15}/> PDF</button>}</div></div></div>
    <div className="kpi-grid"><div className="card"><span className="muted">ยอดเดือนปัจจุบัน</span><h2>{formatNumber(current.value)} <small>{current.unit}</small></h2></div><div className="card"><span className="muted">เทียบเดือนก่อน</span><h2 style={{color:change>0?'#dc2626':change<0?'#15803d':'#64748b'}}>{change>0?'+':''}{change}%</h2></div><div className="card"><span className="muted">จำนวนรายการ</span><h2>{current.count}</h2></div></div>
    <div className="card" style={{height:360}}><h3>{definition?.name_th} · {definition?.aggregation}</h3><ResponsiveContainer width="100%" height="88%"><Chart data={series}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="label"/><YAxis/><Tooltip formatter={value=>[`${formatNumber(value)} ${current.unit}`,definition?.name_th]}/><Legend/><DataShape dataKey="value" name={definition?.name_th} fill={definition?.color||'#3B82F6'} stroke={definition?.color||'#3B82F6'} strokeWidth={3}/></Chart></ResponsiveContainer></div>
    <div className="card"><h3><Table2 size={17}/> ตารางข้อมูลจาก Metadata</h3><div className="table-wrap"><table><thead><tr><th>วันที่</th>{fields.map(field=><th key={field.key}>{field.label}{field.unit?` (${field.unit})`:''}</th>)}</tr></thead><tbody>{monthRows.map(row=><tr key={row.id}><td>{row.entry_date}</td>{fields.map(field=><td key={field.key}>{String(readEntryValue(row,field.key)??'')}</td>)}</tr>)}{!monthRows.length&&<tr><td colSpan={fields.length+1} className="muted">ไม่มีข้อมูลเดือนนี้</td></tr>}</tbody></table></div></div>
    {pdfOpen&&<div className="modal-backdrop"><div className="modal-card" style={{width:'min(1100px,95vw)',height:'88vh'}}><div className="section-title-row"><div><h3>ตัวอย่างรายงาน PDF</h3><p className="muted">รายงานใช้ตัวกรองโมดูลและเดือนที่เลือกอยู่</p></div><button className="ghost" onClick={()=>setPdfOpen(false)}>ปิด</button></div><iframe ref={frameRef} title="PDF preview" srcDoc={pdfHtml} style={{width:'100%',height:'calc(100% - 100px)',border:'1px solid #cbd5e1',borderRadius:12}}/><div className="form-actions bottom-actions"><button className="primary" onClick={()=>frameRef.current?.contentWindow?.print()}>พิมพ์ / บันทึกเป็น PDF</button></div></div></div>}
  </div>
}
