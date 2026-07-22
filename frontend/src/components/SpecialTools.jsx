import React, { useMemo, useState } from 'react'
import { BarChart3, Camera, Presentation } from 'lucide-react'

const MonthlyImageImport = React.lazy(() => import('./MonthlyImageImport.jsx'))
const ChartBuilder = React.lazy(() => import('./ChartBuilder.jsx'))
const PPTBuilder = React.lazy(() => import('./PPTBuilder.jsx'))

const definitions = [
  { id:'monthly-image', label:'นำเข้ารายเดือน', description:'อ่านภาพ ตรวจสอบ และยืนยันข้อมูล', icon:Camera, component:MonthlyImageImport, permission:'entries.import' },
  { id:'charts', label:'สร้างกราฟ', description:'วิเคราะห์และจัดกราฟ', icon:BarChart3, component:ChartBuilder, permission:'charts.read' },
  { id:'powerpoint', label:'PowerPoint', description:'สร้างรายงานนำเสนอ', icon:Presentation, component:PPTBuilder, permission:'reports.preview' }
]

export default function SpecialTools({ permissions = [], user }) {
  const can = permission => user?.role === 'owner' || permissions.includes(permission)
  const tools = useMemo(() => definitions.filter(item => can(item.permission)), [permissions, user?.role])
  const initial = localStorage.getItem('ckap_special_tool')
  const [active, setActive] = useState(() => tools.some(item=>item.id===initial) ? initial : tools[0]?.id)
  const selected = tools.find(item=>item.id===active) || tools[0]
  const ActiveComponent = selected?.component

  function selectTool(id) {
    setActive(id)
    localStorage.setItem('ckap_special_tool', id)
  }

  return <section className="page special-tools-page">
    <div className="page-header"><div><p className="eyebrow">Special Tools</p><h2>เครื่องมือพิเศษ</h2><p className="muted">เลือกเครื่องมือจากแถบด้านบน เนื้อหาจะเปิดในหน้าเดียวกัน</p></div></div>
    {!tools.length ? <div className="alert error">บัญชีนี้ไม่มีสิทธิ์ใช้งานเครื่องมือพิเศษ</div> : <>
      <nav className="tool-card-navbar" aria-label="เครื่องมือพิเศษ">{tools.map(item=>{
        const Icon=item.icon
        return <button key={item.id} type="button" className={`tool-nav-card ${selected?.id===item.id?'active':''}`} onClick={()=>selectTool(item.id)} aria-pressed={selected?.id===item.id}>
          <span className="tool-nav-icon"><Icon size={20}/></span><span><strong>{item.label}</strong><small>{item.description}</small></span>
        </button>
      })}</nav>
      <div className="embedded-tool-content"><React.Suspense fallback={<div className="card">กำลังเปิดเครื่องมือ...</div>}>{ActiveComponent&&<ActiveComponent permissions={permissions} user={user} embedded/>}</React.Suspense></div>
    </>}
  </section>
}
