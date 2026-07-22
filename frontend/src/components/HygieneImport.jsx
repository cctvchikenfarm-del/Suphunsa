import React, { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, History, RotateCcw, UploadCloud } from 'lucide-react'
import { apiFetch, formatNumber, MODULE_LABELS } from '../api.js'

const STATUS_LABELS = { ready: 'พร้อมนำเข้า', review: 'รอตรวจสอบ', reference: 'ยอดอ้างอิง', duplicate: 'มีในฐานข้อมูลแล้ว' }

export default function HygieneImport({ permissions = [], user }) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [statusFilter, setStatusFilter] = useState('all')
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const canRollback = user?.role === 'owner' || permissions.includes('entries.delete')

  async function loadHistory() {
    try { setHistory(await apiFetch('/api/imports/hygiene/history')) }
    catch (nextError) { if (!/P1_HYGIENE|import_batches/i.test(nextError.message)) setError(nextError.message) }
  }
  useEffect(() => { loadHistory() }, [])

  async function analyze() {
    if (!file) return setError('กรุณาเลือกไฟล์ .xlsx')
    setBusy(true); setError(''); setSuccess('')
    try {
      const form = new FormData()
      form.append('file', file)
      const result = await apiFetch('/api/imports/hygiene/preview', { method: 'POST', body: form })
      setPreview(result)
      setSelected(new Set(result.rows.filter(row => row.status === 'ready').map(row => row.row_id)))
    } catch (nextError) { setError(nextError.message) }
    finally { setBusy(false) }
  }

  async function commit() {
    const rows = (preview?.rows || []).filter(row => row.status === 'ready' && selected.has(row.row_id))
    if (!rows.length) return setError('ไม่มีรายการที่เลือกสำหรับนำเข้า')
    if (!window.confirm(`ยืนยันนำเข้าข้อมูล ${rows.length} รายการเข้าฐานข้อมูล?`)) return
    setBusy(true); setError(''); setSuccess('')
    try {
      const result = await apiFetch('/api/imports/hygiene/commit', {
        method: 'POST',
        body: JSON.stringify({
          file_name: preview.file_name, file_hash: preview.file_hash, preview_summary: preview.summary,
          rows: rows.map(row => ({ source_key: row.source_key, entry: row.entry }))
        })
      })
      setSuccess(`นำเข้าสำเร็จ ${result.imported} รายการ · ข้ามรายการเดิม ${result.skipped}`)
      await queryClient.invalidateQueries({ queryKey:['entries'] })
      setPreview(null); setFile(null); setSelected(new Set())
      await loadHistory()
    } catch (nextError) { setError(nextError.message) }
    finally { setBusy(false) }
  }

  async function rollback(batch) {
    if (!window.confirm(`ย้อนกลับชุด ${batch.file_name} จำนวน ${batch.imported_rows} รายการ?`)) return
    setBusy(true); setError(''); setSuccess('')
    try {
      const result = await apiFetch(`/api/imports/hygiene/${batch.id}/rollback`, { method: 'POST', body: '{}' })
      setSuccess(`ย้อนกลับสำเร็จ ${result.removed} รายการ`)
      await queryClient.invalidateQueries({ queryKey:['entries'] })
      await loadHistory()
    } catch (nextError) { setError(nextError.message) }
    finally { setBusy(false) }
  }

  const visibleRows = useMemo(() => (preview?.rows || []).filter(row => statusFilter === 'all' || row.status === statusFilter), [preview, statusFilter])
  function toggleAllReady(checked) {
    setSelected(checked ? new Set((preview?.rows || []).filter(row => row.status === 'ready').map(row => row.row_id)) : new Set())
  }

  return <section className="page">
    <div className="page-header"><div><p className="eyebrow">Audited Database Import</p><h2>นำเข้า Hygiene Enterprise Excel</h2><p className="muted">ตรวจข้อมูลซ้ำ ยอดเงิน และเดือนกำกวมก่อนบันทึก พร้อมประวัติและย้อนกลับเป็นชุด</p></div></div>
    {error && <div className="alert error" role="alert"><AlertTriangle size={18}/> {error}</div>}
    {success && <div className="alert" style={{ background:'#ecfdf5', color:'#047857', border:'1px solid #a7f3d0' }}><CheckCircle2 size={18}/> {success}</div>}

    {!preview && <div className="card" style={{ maxWidth:760 }}>
      <div style={{ display:'flex', gap:16, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ width:54, height:54, display:'grid', placeItems:'center', borderRadius:16, background:'#ecfdf5', color:'#047857' }}><FileSpreadsheet size={28}/></div>
        <div style={{ flex:1, minWidth:240 }}><h3 style={{ margin:'0 0 5px' }}>เลือกไฟล์ Hygiene Enterprise</h3><p className="muted" style={{ margin:0 }}>รองรับ .xlsx สูงสุด 15 MB และอ่านเฉพาะชีท OP_* ที่กำหนด</p></div>
        <label className="ghost" style={{ cursor:'pointer' }}><UploadCloud size={17}/> เลือกไฟล์<input type="file" accept=".xlsx" hidden onChange={event => setFile(event.target.files?.[0] || null)}/></label>
      </div>
      {file && <div style={{ marginTop:16, padding:12, background:'#f8fafc', borderRadius:12 }}>{file.name} · {formatNumber(file.size / 1024, 1)} KB</div>}
      <div className="form-actions bottom-actions"><button className="primary" disabled={!file || busy} onClick={analyze}>{busy ? 'กำลังตรวจสอบ...' : 'วิเคราะห์และแสดง Preview'}</button></div>
    </div>}

    {preview && <>
      <div className="stats-grid" style={{ marginBottom:16 }}>{[
        ['ทั้งหมด',preview.summary.total,'#0f172a'],['พร้อมนำเข้า',preview.summary.ready,'#047857'],['รอตรวจสอบ',preview.summary.review,'#b45309'],
        ['ยอดอ้างอิง',preview.summary.reference,'#475569'],['ข้อมูลเดิม',preview.summary.duplicate||0,'#7c3aed']
      ].map(([label,value,color])=><div className="card" key={label} style={{ padding:16 }}><div className="muted">{label}</div><strong style={{ fontSize:25,color }}>{formatNumber(value,0)}</strong></div>)}</div>
      <div className="card">
        <div className="section-title-row" style={{ gap:12, flexWrap:'wrap' }}><div><h3>ตรวจสอบรายการ</h3><span className="muted">เลือกแล้ว {selected.size} รายการ · แถวเตือนจะไม่ถูกเลือก</span></div><div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
          <select value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option value="all">ทุกสถานะ</option>{Object.entries(STATUS_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
          <button className="ghost" onClick={()=>toggleAllReady(true)}>เลือกพร้อมนำเข้าทั้งหมด</button><button className="ghost" onClick={()=>toggleAllReady(false)}>ล้างที่เลือก</button>
        </div></div>
        <div className="table-wrap" style={{ maxHeight:520 }}><table><thead><tr><th></th><th>ชีท/แถว</th><th>สถานะ</th><th>เดือน/วันที่</th><th>โมดูล</th><th>รายการ</th><th>ค่า</th><th>ข้อสังเกต</th></tr></thead><tbody>
          {visibleRows.map(row=><tr key={row.row_id}><td><input type="checkbox" disabled={row.status!=='ready'} checked={selected.has(row.row_id)} onChange={event=>setSelected(current=>{const next=new Set(current);event.target.checked?next.add(row.row_id):next.delete(row.row_id);return next})}/></td>
            <td>{row.sheet}<br/><span className="muted">แถว {row.row_number}</span></td><td><span className={`import-status ${row.status}`}>{STATUS_LABELS[row.status]||row.status}</span></td>
            <td>{row.entry?.entry_date||'-'}</td><td>{MODULE_LABELS[row.entry?.module]||row.entry?.module||'-'}</td><td>{row.entry?.material_name||'-'}</td>
            <td>{formatNumber(row.entry?.weight_kg??row.entry?.quantity??0)} {row.entry?.unit||''}</td><td style={{maxWidth:300}}>{row.issues?.join(' · ')||'ผ่านการตรวจสอบ'}</td></tr>)}
        </tbody></table></div>
        <div className="form-actions bottom-actions"><button className="ghost" onClick={()=>{setPreview(null);setSelected(new Set())}}>ยกเลิก</button><button className="primary" disabled={!selected.size||busy} onClick={commit}>{busy?'กำลังบันทึก...':`ยืนยันนำเข้า ${selected.size} รายการ`}</button></div>
      </div>
    </>}

    <div className="card" style={{ marginTop:18 }}><div className="section-title-row"><h3><History size={18}/> ประวัติการนำเข้า</h3><button className="ghost" onClick={loadHistory}>รีเฟรช</button></div>
      {!history.length?<p className="muted">ยังไม่มีประวัติ หรือยังไม่ได้รัน migration P1</p>:<div className="table-wrap"><table><thead><tr><th>วันที่</th><th>ไฟล์</th><th>สถานะ</th><th>นำเข้า</th><th>ข้าม</th><th></th></tr></thead><tbody>
        {history.map(batch=><tr key={batch.id}><td>{new Date(batch.created_at).toLocaleString('th-TH')}</td><td>{batch.file_name}</td><td>{batch.status}</td><td>{batch.imported_rows}</td><td>{batch.skipped_rows}</td><td>{canRollback&&batch.status==='committed'&&<button className="ghost" disabled={busy} onClick={()=>rollback(batch)}><RotateCcw size={15}/> ย้อนกลับ</button>}</td></tr>)}
      </tbody></table></div>}
    </div>
  </section>
}
