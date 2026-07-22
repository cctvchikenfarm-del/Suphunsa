import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import { apiFetch } from '../api.js'

function Status({ ok }) {
  return ok ? <span style={{color:'#15803d',display:'inline-flex',gap:6,alignItems:'center'}}><CheckCircle2 size={17}/>พร้อม</span>
    : <span style={{color:'#dc2626',display:'inline-flex',gap:6,alignItems:'center'}}><XCircle size={17}/>ต้องตรวจสอบ</span>
}

export default function SystemCheck() {
  const query = useQuery({ queryKey:['system-check'], queryFn:()=>apiFetch('/api/system-check'), retry:0 })
  const data = query.data
  const frontend = {
    api_url: Boolean(import.meta.env.VITE_API_BASE_URL),
    supabase_url: Boolean(import.meta.env.VITE_SUPABASE_URL),
    anon_key: Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY)
  }
  return <section className="page">
    <div className="page-header"><div><p className="eyebrow">Stabilization · Phase 1</p><h2>ตรวจสอบระบบ</h2><p className="muted">ตรวจสถานะแบบอ่านอย่างเดียว ไม่มีการแก้ไขข้อมูล</p></div>
      <button className="primary" onClick={()=>query.refetch()} disabled={query.isFetching}><RefreshCw size={16}/> ตรวจใหม่</button></div>
    {query.error && <div className="alert error">ตรวจระบบไม่สำเร็จ: {query.error.message}</div>}
    <div className="summary-grid">
      <div className="card"><h3>Frontend</h3>{Object.entries(frontend).map(([k,v])=><p key={k}><Status ok={v}/> <span className="muted">{k}</span></p>)}</div>
      <div className="card"><h3>Backend</h3><p><Status ok={data?.backend?.ok}/> เวอร์ชัน {data?.backend?.version || '-'}</p><p className="muted">Node {data?.backend?.node || '-'}</p><p className="muted">Session: {data?.backend?.auth_mode || '-'}</p><p className="muted">เวลา: {data?.backend?.timezone || '-'}</p></div>
      <div className="card"><h3>Authentication / Profile</h3><p><Status ok={data?.authentication?.ok}/></p><p>Auth User: {data?.authentication?.auth_user_found ? 'พบ' : 'ไม่พบ'}</p><p>Profile: {data?.authentication?.profile_found ? 'พบ' : 'ไม่พบ'}</p><p>UUID: {data?.authentication?.uuid_matches ? 'ตรงกัน' : 'ไม่ตรงกัน'}</p><p>Role: {data?.authentication?.role || '-'}</p></div>
      <div className="card"><h3>Environment</h3>{Object.entries(data?.environment || {}).map(([k,v])=><p key={k}><Status ok={v}/> <span className="muted">{k}</span></p>)}</div>
    </div>
    <div className="card"><div className="section-title-row"><h3>ตารางฐานข้อมูล</h3><span className="muted">{data?.supabase?.project_host || '-'}</span></div>
      <div className="table-wrap"><table><thead><tr><th>ตาราง</th><th>สถานะ</th><th>รายละเอียด</th></tr></thead><tbody>
        {(data?.supabase?.tables || []).map(row=><tr key={row.table}><td>{row.table}</td><td><Status ok={row.ok}/></td><td className="muted">{row.error || '-'}</td></tr>)}
      </tbody></table></div></div>
  </section>
}
