import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, Bot, CalendarDays, UsersRound, Settings, Table, ShieldCheck, Palette, Waves, Gem, Sparkles, Leaf, CircleDot, Wrench, MoreHorizontal, X } from 'lucide-react'
import { apiFetch } from '../api.js'
import Login from './Login.jsx'
import { getAuthClient } from '../lib/supabase.js'

const Dashboard = React.lazy(() => import('./Dashboard.jsx'))
const DataEntry = React.lazy(() => import('./DataEntry.jsx'))
const UsersRoles = React.lazy(() => import('./UsersRoles.jsx'))
const Automation = React.lazy(() => import('./Automation.jsx'))
const SettingsPage = React.lazy(() => import('./SettingsPage.jsx'))
const AnnualLedger = React.lazy(() => import('./AnnualLedger.jsx'))
const SystemCheck = React.lazy(() => import('./SystemCheck.jsx'))
const SpecialTools = React.lazy(() => import('./SpecialTools.jsx'))

const modules = [
  { id: 'dashboard', label: 'แดชบอร์ด', icon: BarChart3, component: Dashboard, permission: 'dashboard.read' },
  { id: 'data-entry', label: 'บันทึกข้อมูล', icon: CalendarDays, component: DataEntry, permission: 'entries.read' },
  { id: 'ledger', label: 'ค้นหาและวิเคราะห์ (Ledger)', icon: Table, component: AnnualLedger, permission: 'entries.read' },
  { id: 'special-tools', label: 'เครื่องมือพิเศษ', icon: Wrench, component: SpecialTools, permission: 'special-tools' },
  { id: 'users', label: 'Users / Roles', icon: UsersRound, component: UsersRoles, permission: 'users.read' },
  { id: 'automation', label: 'Automation', icon: Bot, component: Automation, permission: 'automation.read' },
  { id: 'settings', label: 'ตั้งค่าระบบ', icon: Settings, component: SettingsPage, permission: 'settings.manage' },
  { id: 'system-check', label: 'ตรวจสอบระบบ', icon: ShieldCheck, component: SystemCheck, permission: 'settings.manage' }
]

const systemThemes = [
  { id:'classic', name:'Classic Blue', description:'น้ำเงินมาตรฐาน', icon:CircleDot, colors:['#1d4ed8','#dbeafe','#f8fafc'] },
  { id:'gold-mint', name:'Minty Gold', description:'มิ้นต์และทอง', icon:Leaf, colors:['#0f766e','#14b8a6','#b58900'] },
  { id:'central-gold', name:'Central Gold', description:'ทองและครีม', icon:Sparkles, colors:['#9c793a','#b8924b','#f5eedc'] },
  { id:'krabi-coastal', name:'Krabi Coastal', description:'ทะเล เขียว ชมพู', icon:Waves, colors:['#0284c7','#10b981','#ec4899'] },
  { id:'andaman-prism', name:'Andaman Prism', description:'ม่วง เขียว ชมพู', icon:Gem, colors:['#4338ca','#059669','#ec4899'] }
]

export default function Workspace() {
  const [activeModule, setActiveModule] = useState('dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('ckap_theme') || 'classic')
  const { data: me, isLoading, refetch } = useQuery({ queryKey: ['me'], queryFn: () => apiFetch('/api/me') })

  React.useEffect(() => {
    const rootEl = document.querySelector('.app-shell')
    if (rootEl) {
      rootEl.classList.remove('theme-gold-mint', 'theme-central-gold', 'theme-krabi-coastal', 'theme-andaman-prism')
      if (theme === 'gold-mint') {
        rootEl.classList.add('theme-gold-mint')
      } else if (theme === 'central-gold') {
        rootEl.classList.add('theme-central-gold')
      } else if (theme === 'krabi-coastal') {
        rootEl.classList.add('theme-krabi-coastal')
      } else if (theme === 'andaman-prism') {
        rootEl.classList.add('theme-andaman-prism')
      }
    }
  }, [theme])

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme)
    localStorage.setItem('ckap_theme', newTheme)
  }

  if (isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', background: '#f1f5f9' }}>
        <div>กำลังยืนยันตัวตน...</div>
      </div>
    )
  }

  if (!me || me.role === 'blocked') {
    return <Login onLoginSuccess={refetch} />
  }

  const permissions = me?.permissions || []
  const can = permission => me?.role === 'owner' || permissions.includes(permission)
  const specialPermissions = ['fmhy.import','entries.import','charts.read','reports.preview']
  const visibleModules = modules.filter(item => item.permission === 'special-tools' ? (me?.role === 'owner' || specialPermissions.some(can)) : can(item.permission))
  const mobilePrimaryModules = visibleModules.slice(0, 4)
  const mobileMoreModules = visibleModules.slice(4)
  const ActiveComponent = visibleModules.find(item => item.id === activeModule)?.component || visibleModules[0]?.component || Dashboard

  const openModule = id => {
    setActiveModule(id)
    setMobileMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="brand" style={{ justifyContent: 'center', padding: '10px 0', marginBottom: '24px' }}>
          <img src="/central-krabi-logo.png" alt="Central Krabi" style={{ maxWidth: '100%', height: 'auto', maxHeight: '56px', objectFit: 'contain' }} />
        </div>

        <nav className="nav-list">
          {visibleModules.map(item => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openModule(item.id)}
                className={`nav-item ${activeModule === item.id ? 'active' : ''}`}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        {me?.role === 'owner' && <div className="system-theme-panel">
          <span className="theme-panel-title"><Palette size={15}/> ธีมของระบบ</span>
          <div className="system-theme-grid">{systemThemes.map(item => {
            const Icon = item.icon
            return <button type="button" key={item.id} className={`system-theme-card ${theme===item.id?'active':''}`} onClick={()=>handleThemeChange(item.id)} aria-pressed={theme===item.id}>
              <Icon size={18}/><span className="theme-card-copy"><strong>{item.name}</strong><small>{item.description}</small><span className="theme-swatches">{item.colors.map(color=><i key={color} style={{background:color}}/>)}</span></span>
            </button>
          })}</div>
        </div>}

        <div className="user-profile-card" style={{
          background: 'var(--primary-light)',
          border: '1px solid var(--primary-color)',
          opacity: 0.95,
          borderRadius: '16px',
          padding: '12px',
          margin: '16px 0',
          display: 'grid',
          gap: '4px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'var(--primary-color)',
              color: 'white',
              display: 'grid',
              placeItems: 'center',
              fontWeight: '700',
              fontSize: '14px'
            }}>
              {(me?.display_name || me?.email || 'O')[0].toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              <div style={{ fontWeight: '700', fontSize: '13.5px', color: '#1e293b' }}>
                {me?.display_name || me?.email?.split('@')[0]}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {me?.email || 'owner@central-krabi.local'}
              </div>
            </div>
          </div>
          <div style={{ borderTop: '1.5px solid rgba(255, 255, 255, 0.5)', marginTop: '8px', paddingTop: '8px', fontSize: '11px', display: 'grid', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#475569', fontWeight: 'bold' }}>บทบาท:</span>
              <span style={{
                background: 'white',
                color: 'var(--primary-color)',
                border: '1px solid var(--primary-color)',
                padding: '2px 8px',
                borderRadius: '999px',
                fontWeight: '900',
                fontSize: '10px',
                textTransform: 'uppercase'
              }}>{me?.role || 'owner'}</span>
            </div>
            <details>
              <summary style={{ color: '#64748b', cursor: 'pointer' }}>ดูสิทธิ์เข้าถึง ({permissions.length})</summary>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '90px', overflowY: 'auto', marginTop: '6px' }}>
                {permissions.map(p => <span key={p} className="permission-chip">{p}</span>)}
              </div>
            </details>
          </div>
        </div>

        <div className="sidebar-footer">
          Render + Supabase Ready
          <button
            type="button"
            onClick={async () => {
              await apiFetch('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) }).catch(() => null)
              const authClient = await getAuthClient().catch(() => null)
              if (authClient) await authClient.auth.signOut({ scope: 'local' }).catch(() => null)
              refetch()
            }}
            style={{
              background: 'transparent',
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              padding: '6px 10px',
              marginTop: '12px',
              fontSize: '12px',
              fontWeight: '700',
              color: '#dc2626',
              width: '100%',
              cursor: 'pointer'
            }}
          >
            ออกจากระบบ
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <React.Suspense fallback={<div className="card">กำลังเปิดหน้าจอ...</div>}>
          <ActiveComponent permissions={permissions} user={me} />
        </React.Suspense>
      </main>

      {mobileMenuOpen && mobileMoreModules.length > 0 && (
        <div className="mobile-more-backdrop" onClick={() => setMobileMenuOpen(false)}>
          <section className="mobile-more-sheet" role="dialog" aria-modal="true" aria-label="เมนูเพิ่มเติม" onClick={event => event.stopPropagation()}>
            <div className="mobile-more-heading"><strong>เมนูเพิ่มเติม</strong><button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="ปิดเมนู"><X size={20}/></button></div>
            <div className="mobile-more-grid">{mobileMoreModules.map(item => {
              const Icon = item.icon
              return <button key={item.id} type="button" className={activeModule === item.id ? 'active' : ''} onClick={() => openModule(item.id)}><Icon size={21}/><span>{item.label}</span></button>
            })}</div>
          </section>
        </div>
      )}

      <nav className="mobile-bottom-nav" aria-label="เมนูหลักบนมือถือ">
        {mobilePrimaryModules.map(item => {
          const Icon = item.icon
          const cleanLabel = item.label
            .replace(' (Ledger)', '')
            .replace('บันทึกข้อมูล', 'บันทึก')
            .replace('รายงาน & วิเคราะห์', 'รายงาน')
            .replace('ผู้ใช้งาน & สิทธิ์', 'ผู้ใช้/สิทธิ์')
            .replace('เครื่องมือพิเศษ', 'เครื่องมือ')
            .replace('นำเข้า Multi-Sheet', 'นำเข้า Sheet')
            .replace('นำเข้า Hygiene', 'นำเข้า Excel')
            .replace('นำเข้า Tissue', 'นำเข้า Tissue')
            .replace('สร้างรายงาน PPT', 'สร้าง PPT')
            .replace('ตั้งค่าระบบ', 'ตั้งค่า')
          return <button key={item.id} type="button" className={activeModule === item.id ? 'active' : ''} onClick={() => openModule(item.id)}><Icon size={20}/><span>{cleanLabel}</span></button>
        })}
        {mobileMoreModules.length > 0 && <button type="button" className={mobileMoreModules.some(item => item.id === activeModule) ? 'active' : ''} onClick={() => setMobileMenuOpen(true)}><MoreHorizontal size={20}/><span>เพิ่มเติม</span></button>}
      </nav>
    </div>
  )
}
