import React, { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CalendarDays, CheckCircle2, FileSpreadsheet, History, RotateCcw, UploadCloud } from 'lucide-react'
import { apiFetch, formatNumber } from '../api.js'

const STATUS_LABELS = { ready:'พร้อมนำเข้า', review:'ต้องตรวจสอบ', duplicate:'มีในฐานข้อมูลแล้ว' }
const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
const monthLabel = value => { const [year, month] = value.split('-').map(Number); return `${MONTHS_TH[month - 1]} ${year + 543}` }

export default function TissueImport({ permissions = [], user }) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [mode, setMode] = useState('month')
  const [month, setMonth] = useState('')
  const [day, setDay] = useState(1)
  const [week, setWeek] = useState(1)
  const [selected, setSelected] = useState(new Set())
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const canRollback = user?.role === 'owner' || permissions.includes('entries.delete')

  async function loadHistory() {
    try { setHistory(await apiFetch('/api/imports/tissue/history')) }
    catch (nextError) { if (!/P2_TISSUE/i.test(nextError.message)) setError(nextError.message) }
  }
  useEffect(() => { loadHistory() }, [])

  async function analyze() {
    if (!file) return setError('กรุณาเลือกไฟล์ Tissue .xlsx')
    setBusy(true); setError(''); setSuccess('')
    try {
      const form = new FormData(); form.append('file', file)
      const result = await apiFetch('/api/imports/tissue/preview', { method:'POST', body:form })
      setPreview(result); setMonth(result.months[0] || ''); setSelected(new Set())
    } catch (nextError) { setError(nextError.message) }
    finally { setBusy(false) }
  }

  const scopedRows = useMemo(() => {
    if (!preview || !month) return []
    return preview.rows.filter(row => row.month === month && (
      mode === 'month' || (mode === 'day' && row.day === Number(day)) || (mode === 'week' && row.week === Number(week))
    ))
  }, [preview, month, mode, day, week])

  useEffect(() => {
    setSelected(new Set(scopedRows.filter(row => row.status === 'ready').map(row => row.row_id)))
  }, [preview, month, mode, day, week])

  const scopeSummary = useMemo(() => scopedRows.reduce((result, row) => {
    result.total += 1; result[row.status] = (result[row.status] || 0) + 1; return result
  }, { total:0, ready:0, review:0, duplicate:0 }), [scopedRows])
  const reconciliation = preview?.reconciliation?.find(item => item.month === month)

  async function commit() {
    const rows = scopedRows.filter(row => row.status === 'ready' && selected.has(row.row_id))
    if (!rows.length) return setError('ไม่มีรายการพร้อมนำเข้าในช่วงที่เลือก')
    if (!window.confirm(`ยืนยันนำเข้าข้อมูล Tissue ${rows.length} รายการ?`)) return
    setBusy(true); setError(''); setSuccess('')
    try {
      const result = await apiFetch('/api/imports/tissue/commit', { method:'POST', body:JSON.stringify({
        file_name:preview.file_name, file_hash:preview.file_hash,
        preview_summary:{ ...scopeSummary, mode, month, day:Number(day), week:Number(week) },
        rows:rows.map(row => ({ source_key:row.source_key, entry:row.entry }))
      }) })
      setSuccess(`นำเข้าสำเร็จ ${result.imported} รายการ · ข้ามข้อมูลเดิม ${result.skipped}`)
      await queryClient.invalidateQueries({ queryKey:['entries'] })
      setPreview(null); setFile(null); setSelected(new Set()); await loadHistory()
    } catch (nextError) { setError(nextError.message) }
    finally { setBusy(false) }
  }

  async function rollback(batch) {
    if (!window.confirm(`ย้อนกลับชุด ${batch.file_name} จำนวน ${batch.imported_rows} รายการ?`)) return
    setBusy(true); setError(''); setSuccess('')
    try {
      const result = await apiFetch(`/api/imports/tissue/${batch.id}/rollback`, { method:'POST', body:'{}' })
      setSuccess(`ย้อนกลับสำเร็จ ${result.removed} รายการ`); await queryClient.invalidateQueries({ queryKey:['entries'] }); await loadHistory()
    } catch (nextError) { setError(nextError.message) }
    finally { setBusy(false) }
  }

  return <section className="page">
    <div className="page-header"><div><p className="eyebrow">Tissue Excel Import</p><h2>นำเข้าข้อมูลกระดาษทิชชู่</h2><p className="muted">รองรับรายวัน รายสัปดาห์ และทั้งเดือน พร้อมตรวจปี พ.ศ. ยอดรวม ข้อมูลซ้ำ และ Rollback</p></div></div>
    {error && <div className="alert error"><AlertTriangle size={18}/>{error}</div>}
    {success && <div className="alert success"><CheckCircle2 size={18}/>{success}</div>}

    {!preview && <div className="card" style={{maxWidth:760}}>
      <div style={{display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}><div className="feature-icon"><FileSpreadsheet size={28}/></div><div style={{flex:1,minWidth:240}}><h3 style={{margin:0}}>เลือกไฟล์ Tissue</h3><p className="muted">หัวเดือนรูปแบบ Nov-68 และคอลัมน์ ม้วน / เช็ดมือ / ป๊อปอัพ</p></div><label className="ghost"><UploadCloud size={17}/> เลือกไฟล์<input type="file" accept=".xlsx" hidden onChange={event=>setFile(event.target.files?.[0]||null)}/></label></div>
      {file && <div className="file-chip">{file.name} · {formatNumber(file.size/1024,1)} KB</div>}
      <div className="form-actions bottom-actions"><button className="primary" disabled={!file||busy} onClick={analyze}>{busy?'กำลังวิเคราะห์...':'วิเคราะห์ไฟล์'}</button></div>
    </div>}

    {preview && <>
      <div className="card import-scope-card"><div className="section-title-row"><h3><CalendarDays size={18}/> เลือกช่วงนำเข้า</h3></div><div className="form-grid">
        <label className="field"><span>รูปแบบ</span><select value={mode} onChange={event=>setMode(event.target.value)}><option value="day">รายวัน/แถว</option><option value="week">รายสัปดาห์</option><option value="month">ทั้งเดือน</option></select></label>
        <label className="field"><span>เดือน</span><select value={month} onChange={event=>setMonth(event.target.value)}>{preview.months.map(value=><option key={value} value={value}>{monthLabel(value)}</option>)}</select></label>
        {mode==='day'&&<label className="field"><span>วันที่</span><input type="number" min="1" max="31" value={day} onChange={event=>setDay(event.target.value)}/></label>}
        {mode==='week'&&<label className="field"><span>ช่วงสัปดาห์</span><select value={week} onChange={event=>setWeek(event.target.value)}><option value="1">วันที่ 1–7</option><option value="2">วันที่ 8–14</option><option value="3">วันที่ 15–21</option><option value="4">วันที่ 22–28</option><option value="5">ปลายเดือน</option></select></label>}
      </div></div>
      <div className="stats-grid">{[['รายการในช่วง',scopeSummary.total],['พร้อมนำเข้า',scopeSummary.ready],['ต้องตรวจสอบ',scopeSummary.review],['ข้อมูลเดิม',scopeSummary.duplicate]].map(([label,value])=><div className="card" key={label}><span className="muted">{label}</span><strong className="stat-number">{formatNumber(value,0)}</strong></div>)}</div>
      {mode==='month'&&reconciliation&&<div className="card"><h3>ตรวจยอดรวม {monthLabel(month)}</h3><div className="reconcile-grid">{reconciliation.values.map(item=><div className={`reconcile-item ${item.matches?'ok':'warning'}`} key={item.category_code}><strong>{item.label}</strong><span>คำนวณ {formatNumber(item.calculated,0)} / Excel {formatNumber(item.expected,0)}</span><small>{item.matches?'ยอดตรงกัน':'ยอดไม่ตรงหรือมีช่องว่าง'}</small></div>)}</div></div>}
      <div className="card"><div className="section-title-row"><div><h3>Preview รายการ</h3><span className="muted">เลือกแล้ว {selected.size} รายการ</span></div></div><div className="table-wrap" style={{maxHeight:520}}><table><thead><tr><th></th><th>วันที่</th><th>ประเภท</th><th>จำนวน</th><th>สถานะ</th><th>ข้อสังเกต</th></tr></thead><tbody>{scopedRows.map(row=><tr key={row.row_id}><td><input type="checkbox" disabled={row.status!=='ready'} checked={selected.has(row.row_id)} onChange={event=>setSelected(current=>{const next=new Set(current);event.target.checked?next.add(row.row_id):next.delete(row.row_id);return next})}/></td><td>{row.entry?.entry_date||`${row.month}-${String(row.day).padStart(2,'0')}`}</td><td>{row.entry?.material_name||row.row_id.split(':').at(-1)}</td><td>{row.entry?`${formatNumber(row.entry.quantity,0)} ${row.entry.unit}`:'-'}</td><td><span className={`import-status ${row.status}`}>{STATUS_LABELS[row.status]}</span></td><td>{row.issues.join(' · ')||'ผ่านการตรวจสอบ'}</td></tr>)}</tbody></table></div><div className="form-actions bottom-actions"><button className="ghost" onClick={()=>setPreview(null)}>เลือกไฟล์ใหม่</button><button className="primary" disabled={!selected.size||busy} onClick={commit}>{busy?'กำลังบันทึก...':`นำเข้า ${selected.size} รายการ`}</button></div></div>
    </>}

    <div className="card" style={{marginTop:18}}><div className="section-title-row"><h3><History size={18}/> ประวัติ Tissue Import</h3><button className="ghost" onClick={loadHistory}>รีเฟรช</button></div>{!history.length?<p className="muted">ยังไม่มีประวัติ หรือยังไม่ได้รัน P2_TISSUE_EXCEL_IMPORT.sql</p>:<div className="table-wrap"><table><thead><tr><th>วันที่</th><th>ไฟล์</th><th>สถานะ</th><th>นำเข้า</th><th>ข้าม</th><th></th></tr></thead><tbody>{history.map(batch=><tr key={batch.id}><td>{new Date(batch.created_at).toLocaleString('th-TH')}</td><td>{batch.file_name}</td><td>{batch.status}</td><td>{batch.imported_rows}</td><td>{batch.skipped_rows}</td><td>{canRollback&&batch.status==='committed'&&<button className="ghost" disabled={busy} onClick={()=>rollback(batch)}><RotateCcw size={15}/> ย้อนกลับ</button>}</td></tr>)}</tbody></table></div>}</div>
  </section>
}
