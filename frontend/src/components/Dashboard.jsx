import React, { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, LineChart, Line } from 'recharts'
import { apiFetch, currentMonth, formatNumber } from '../api.js'
import { thaiMonthLabel } from '../lib/report-builder.js'
import MonthPicker from './MonthPicker.jsx'
import InsightPanel from './InsightPanel.jsx'
import DynamicAnalytics from './DynamicAnalytics.jsx'
import {
  FileText, ChevronDown, ChevronUp, Scale, BadgeDollarSign, Package,
  Droplets, Recycle, ShieldCheck, Bot, BarChart3, Activity
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

const moduleLabels = {
  rdf: 'ขยะ RDF',
  dog_food: 'อาหารหมา',
  pig_feed: 'อาหารหมู',
  recycle: 'รีไซเคิล',
  tissue: 'กระดาษทิชชู่',
  black_bag: 'ถุงดำ',
  consumable: 'น้ำยาต่างๆ'
}

const moduleColors = {
  rdf: '#18181b',
  dog_food: '#22C55E',
  pig_feed: '#84CC16',
  recycle: '#ffd600',
  tissue: '#3b82f6',
  black_bag: '#64748B',
  consumable: '#8b5cf6'
}

const MODULE_CAPABILITIES = {
  rdf:       { metrics: ['weight'],           primary: 'weight',   hasBreakdown: false },
  dog_food:  { metrics: ['weight'],           primary: 'weight',   hasBreakdown: false },
  pig_feed:  { metrics: ['weight'],           primary: 'weight',   hasBreakdown: false },
  wet_waste: { metrics: ['weight'],           primary: 'weight',   hasBreakdown: false, isCalculated: true },
  recycle:   { metrics: ['weight', 'amount'], primary: 'weight',   hasBreakdown: true  },
  tissue:    { metrics: ['quantity'],         primary: 'quantity', hasBreakdown: true  },
  black_bag: { metrics: ['quantity'],         primary: 'quantity', hasBreakdown: true  },
  consumable:{ metrics: ['quantity'],         primary: 'quantity', hasBreakdown: true  }
}

// Modules grouped by metric for each tab
const WEIGHT_MODULES   = ['rdf', 'dog_food', 'pig_feed', 'recycle']
const QUANTITY_MODULES = ['tissue', 'black_bag', 'consumable', 'recycle']
const AMOUNT_MODULES   = ['recycle']

const TABS = [
  { id: 'dynamic',  label: 'ทุกโมดูล (Dynamic)', icon: Activity, color: '#0f766e' },
  { id: 'weight',   label: 'น้ำหนัก (kg)',   icon: Scale,       color: '#18181b' },
  { id: 'quantity', label: 'จำนวน (ชิ้น/ใบ)', icon: Package,     color: '#3b82f6' },
  { id: 'amount',   label: 'มูลค่า (บาท)',    icon: BadgeDollarSign, color: '#22c55e' },
  { id: 'quality',  label: 'คุณภาพข้อมูล',   icon: ShieldCheck,  color: '#f59e0b' },
  { id: 'insights', label: 'AI Insights',    icon: Bot,          color: '#8b5cf6' },
]

const qualityModuleLabels = {
  rdf: 'RDF',
  dog_food: 'อาหารหมา',
  pig_feed: 'อาหารหมู',
  recycle: 'รีไซเคิล',
  tissue: 'กระดาษทิชชู่',
  black_bag: 'ถุงดำ',
  consumable: 'ของใช้สิ้นเปลือง'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toNumber = (val) => {
  if (val === undefined || val === null || val === '') return 0
  const parsed = parseFloat(val)
  return isNaN(parsed) ? 0 : parsed
}

const monthlyValue = (row, field) => {
  const value = toNumber(row[field])
  const metadata = row.metadata || {}
  const actualDaily = metadata.value_type === 'actual_daily' || metadata.entry_mode === 'daily'
  const entryDay = Number(String(row.entry_date || row.period_month || '').slice(8, 10) || 1)
  const average = !actualDaily && ((row.module === 'pig_feed' && entryDay === 1) || metadata.value_type === 'daily_average' || metadata.entry_mode === 'daily_average' || metadata.input_mode === 'daily_average')
  const [year, month] = String(row.period_month || row.entry_date || '').slice(0, 7).split('-').map(Number)
  const calendarDays = year && month ? new Date(year, month, 0).getDate() : 1
  return average ? value * toNumber(metadata.days_in_month || calendarDays) : value
}

function getMonthsRangeForward(startMonthStr, count) {
  const list = []
  if (!startMonthStr) return list
  const [year, month] = startMonthStr.split('-').map(Number)
  for (let i = 0; i < count; i++) {
    const d = new Date(year, month - 1 + i, 1)
    list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return list
}

function getDbModule(moduleKey) {
  if (moduleKey === 'consumable') return 'cleaning_liquid'
  return moduleKey
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, unit, color = '#3b82f6', sub }) {
  return (
    <div className="card kpi-card" style={{
      display: 'flex', flexDirection: 'column', gap: '6px',
      borderTop: `3px solid ${color}`, transition: 'transform 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          background: `${color}18`, borderRadius: '10px',
          padding: '6px', display: 'grid', placeItems: 'center', color
        }}>
          <Icon size={16} />
        </div>
        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>{label}</span>
      </div>
      <strong style={{ fontSize: '20px', color: '#1e293b', fontWeight: '800' }}>
        {value}
        {unit && <span style={{ fontSize: '12px', fontWeight: '500', color: '#94a3b8', marginLeft: '4px' }}>{unit}</span>}
      </strong>
      {sub && <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>{sub}</span>}
    </div>
  )
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{
      display: 'flex', gap: '4px', padding: '6px',
      background: '#f1f5f9', borderRadius: '16px',
      overflowX: 'auto', flexShrink: 0,
    }}>
      {tabs.map(tab => {
        const Icon = tab.icon
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', borderRadius: '12px', border: 'none',
              cursor: 'pointer', fontWeight: isActive ? '700' : '500',
              fontSize: '13px', whiteSpace: 'nowrap',
              background: isActive ? 'white' : 'transparent',
              color: isActive ? tab.color : '#64748b',
              boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <Icon size={15} />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

function FilterSidebar({ modules, selected, onToggle, onAll, onNone, categories, selectedSub, onSubChange }) {
  return (
    <div className="chart-filter-panel-sidebar">
      <div className="filter-panel-header">
        <span>ประเภทข้อมูลที่แสดง</span>
      </div>
      <div className="filter-checkbox-list">
        {modules.map(key => {
          const isChecked = selected.includes(key)
          return (
            <label key={key} className={`filter-checkbox-item-row ${isChecked ? 'checked' : 'unchecked'}`}>
              <input type="checkbox" checked={isChecked} onChange={() => onToggle(key)} />
              <span className="color-indicator-swatch" style={{ backgroundColor: moduleColors[key] }} />
              <span className="checkbox-text-label">{moduleLabels[key]}</span>
            </label>
          )
        })}
      </div>
      <div className="filter-panel-actions">
        <button type="button" className="btn-select-all" onClick={onAll}>เลือกทั้งหมด</button>
        <button type="button" className="btn-select-none" onClick={onNone}>ล้างทั้งหมด</button>
      </div>
      {selected.length === 1 && MODULE_CAPABILITIES[selected[0]]?.hasBreakdown && (
        <div style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
          <span style={{ fontSize: '12.5px', fontWeight: '800', color: '#475569', display: 'block', marginBottom: '6px' }}>เจาะลึกชนิดย่อย</span>
          <select
            value={selectedSub}
            onChange={e => onSubChange(e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white', fontSize: '13px' }}
          >
            <option value="">แสดงทุกชนิดย่อย (Breakdown)</option>
            {categories.filter(c => c.module === getDbModule(selected[0])).map(cat => (
              <option key={cat.code} value={cat.code}>{cat.name_th}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

// Generic analysis chart tab (used for weight/quantity/amount)
function AnalysisTabContent({ entries, monthsList, metric, allModulesForTab, categories, unit, title }) {
  const [selected, setSelected] = useState(allModulesForTab)
  const [selectedSub, setSelectedSub] = useState('')

  const toggle = (key) => {
    setSelected(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
      return next
    })
  }

  const chartData = useMemo(() => {
    if (monthsList.length === 0) return []

    const group = {}
    monthsList.forEach(m => {
      group[m] = { name: thaiMonthLabel(m), rawModules: {} }
    })

    entries.forEach(row => {
      const pMonth = row.period_month ? row.period_month.slice(0, 7) : row.entry_date?.slice(0, 7)
      if (!pMonth || !group[pMonth]) return
      const m = row.module
      const cat = row.category_code
      if (!group[pMonth].rawModules[m]) {
        group[pMonth].rawModules[m] = { weight: 0, quantity: 0, amount: 0, categories: {} }
      }
      group[pMonth].rawModules[m].weight += monthlyValue(row, 'weight_kg')
      group[pMonth].rawModules[m].quantity += monthlyValue(row, 'quantity')
      group[pMonth].rawModules[m].amount += monthlyValue(row, 'amount')
      if (cat) {
        if (!group[pMonth].rawModules[m].categories[cat]) {
          group[pMonth].rawModules[m].categories[cat] = { weight: 0, quantity: 0, amount: 0 }
        }
        group[pMonth].rawModules[m].categories[cat].weight += monthlyValue(row, 'weight_kg')
        group[pMonth].rawModules[m].categories[cat].quantity += monthlyValue(row, 'quantity')
        group[pMonth].rawModules[m].categories[cat].amount += monthlyValue(row, 'amount')
      }
    })

    return monthsList.map(m => {
      const monthObj = group[m]
      const row = { name: monthObj.name }

      if (selected.length === 1) {
        const targetModule = selected[0]
        const cap = MODULE_CAPABILITIES[targetModule]
        const mData = monthObj.rawModules[targetModule] || { weight: 0, quantity: 0, amount: 0, categories: {} }
        if (cap?.hasBreakdown) {
          if (selectedSub) {
            row[selectedSub] = mData.categories[selectedSub]?.[metric] ?? null
          } else {
            const dbMod = getDbModule(targetModule)
            categories.filter(c => c.module === dbMod).forEach(cat => {
              const catData = mData.categories[cat.code] || { weight: 0, quantity: 0, amount: 0 }
              row[cat.code] = catData[metric] !== undefined ? catData[metric] : null
            })
          }
        } else {
          row[targetModule] = mData[metric] ?? null
        }
      } else {
        selected.forEach(mKey => {
          const cap = MODULE_CAPABILITIES[mKey]
          const mData = monthObj.rawModules[mKey] || { weight: 0, quantity: 0, amount: 0 }
          const isSupported = cap?.metrics.includes(metric)
          row[mKey] = isSupported ? mData[metric] : null
        })
      }

      return row
    })
  }, [monthsList, entries, selected, metric, categories, selectedSub])

  const hasData = chartData.length > 0 && selected.length > 0

  // Determine bars to render
  const bars = useMemo(() => {
    if (!hasData) return []
    if (selected.length === 1) {
      const targetModule = selected[0]
      const cap = MODULE_CAPABILITIES[targetModule]
      if (cap?.hasBreakdown && !selectedSub) {
        const dbMod = getDbModule(targetModule)
        return categories.filter(c => c.module === dbMod).map(cat => ({
          key: cat.code, name: cat.name_th, color: cat.color_hex || moduleColors[targetModule] || '#3b82f6'
        }))
      } else if (cap?.hasBreakdown && selectedSub) {
        const cat = categories.find(c => c.code === selectedSub)
        return [{ key: selectedSub, name: cat?.name_th || selectedSub, color: cat?.color_hex || '#3b82f6' }]
      } else {
        return [{ key: targetModule, name: moduleLabels[targetModule], color: moduleColors[targetModule] }]
      }
    } else {
      return selected
        .filter(mKey => MODULE_CAPABILITIES[mKey]?.metrics.includes(metric))
        .map(mKey => ({ key: mKey, name: moduleLabels[mKey], color: moduleColors[mKey] }))
    }
  }, [selected, categories, metric, hasData, selectedSub])

  const chartTitle = selected.length === 1
    ? `วิเคราะห์เจาะลึก: ${moduleLabels[selected[0]]}`
    : title

  return (
    <div className="card chart-card">
      <div className="card-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
        <div>
          <h3 style={{ margin: 0 }}>{chartTitle}</h3>
          <span className="muted" style={{ fontSize: '12.5px' }}>เปรียบเทียบรายเดือน · หน่วย: {unit}</span>
        </div>
      </div>

      <div className="chart-dashboard-layout-row">
        <div className="chart-wrap-container" style={{ minHeight: '320px' }}>
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={val => val >= 1000 ? `${(val/1000).toFixed(1)}k` : val} />
                <Tooltip
                  formatter={(value, name) => {
                    if (value === null || value === undefined) return ['-', name]
                    const barInfo = bars.find(b => b.key === name) || {}
                    return [`${formatNumber(value)} ${unit}`, barInfo.name || name]
                  }}
                  contentStyle={{ borderRadius: '10px', fontSize: '12px' }}
                />
                <Legend formatter={name => {
                  const barInfo = bars.find(b => b.key === name) || {}
                  return barInfo.name || name
                }} />
                {bars.map(b => (
                  <Bar key={b.key} dataKey={b.key} name={b.key} fill={b.color} radius={[4, 4, 0, 0]} maxBarSize={40} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="chart-empty-state">
              <p>กรุณาเลือกประเภทงานจากตัวกรองด้านขวาอย่างน้อย 1 ประเภท</p>
            </div>
          )}
        </div>

        <FilterSidebar
          modules={allModulesForTab}
          selected={selected}
          onToggle={toggle}
          onAll={() => setSelected(allModulesForTab)}
          onNone={() => setSelected([])}
          categories={categories}
          selectedSub={selectedSub}
          onSubChange={setSelectedSub}
        />
      </div>
    </div>
  )
}

// Data Quality embedded tab
function QualityTabContent({ startMonth }) {
  const [month, setMonth] = useState(startMonth || currentMonth())

  useEffect(() => {
    if (startMonth) setMonth(startMonth)
  }, [startMonth])

  const { data, isLoading, error } = useQuery({
    queryKey: ['data-quality-dash', month],
    queryFn: () => apiFetch(`/api/data-quality?month=${month}`)
  })
  const { data: insights } = useQuery({
    queryKey: ['quality-insights-dash', month],
    queryFn: () => apiFetch(`/api/insights?month=${month}`)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>คุณภาพข้อมูลรายเดือน</h3>
          <p className="muted" style={{ margin: '2px 0 0 0', fontSize: '12.5px' }}>คำนวณจากจำนวนวันที่มีข้อมูลและความสมบูรณ์ของฟิลด์</p>
        </div>
        <label className="field small-field" style={{ marginLeft: 'auto' }}>
          <span>เลือกเดือน</span>
          <MonthPicker value={month} onChange={setMonth} />
        </label>
      </div>

      {error && <div className="alert error">เชื่อมต่อ API ไม่สำเร็จ: {error.message}</div>}
      {isLoading && <div className="alert">กำลังโหลดข้อมูลคุณภาพ...</div>}

      <InsightPanel insights={insights} compact />

      <div className="quality-grid">
        {(data?.scores || []).map(item => (
          <div className="card quality-card" key={item.module}>
            <div className="card-title-row">
              <h3>{qualityModuleLabels[item.module] || item.module}</h3>
              <span>{item.entries} รายการ</span>
            </div>
            <div className="quality-score">{item.score}%</div>
            <div className="progress"><div style={{ width: `${item.score}%` }} /></div>
            <p className="muted">ครอบคลุม {item.covered_days}/{item.expected_days} วัน</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// AI Insights embedded tab
function InsightsTabContent({ startMonth }) {
  const [month, setMonth] = useState(startMonth || currentMonth())

  useEffect(() => {
    if (startMonth) setMonth(startMonth)
  }, [startMonth])

  const { data: insights, isLoading, error } = useQuery({
    queryKey: ['insights-dash', month],
    queryFn: () => apiFetch(`/api/insights?month=${month}`)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>AI Insights — วิเคราะห์แนวโน้มและข้อเสนอแนะ</h3>
          <p className="muted" style={{ margin: '2px 0 0 0', fontSize: '12.5px' }}>วิเคราะห์โดย AI จากข้อมูลขยะและทรัพยากรในระบบ</p>
        </div>
        <label className="field small-field" style={{ marginLeft: 'auto' }}>
          <span>เลือกเดือน</span>
          <MonthPicker value={month} onChange={setMonth} />
        </label>
      </div>

      {error && <div className="alert error">เชื่อมต่อ API ไม่สำเร็จ: {error.message}</div>}
      {isLoading && <div className="alert">กำลังวิเคราะห์ข้อมูล...</div>}

      <InsightPanel insights={insights} />
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Dashboard({ permissions = [], user = null }) {
  const [startMonth, setStartMonth] = useState('')
  const [monthTouched, setMonthTouched] = useState(false)
  const [snapshotOpen, setSnapshotOpen] = useState(true)
  const [activeTab, setActiveTab] = useState('weight')

  // Fetch all entries for earliest month detection + smart summary
  const { data: allEntries = [], isLoading: isLoadingMonths, error: monthsError } = useQuery({
    queryKey: ['entries', 'dashboard-months'],
    queryFn: () => apiFetch('/api/entries'),
    refetchOnMount: 'always',
    refetchOnWindowFocus: true
  })

  const availableMonths = useMemo(() => {
    return [...new Set(allEntries
      .map(row => String(row.period_month || row.entry_date || '').slice(0, 7))
      .filter(month => /^\d{4}-\d{2}$/.test(month))
    )].sort()
  }, [allEntries])

  useEffect(() => {
    if (isLoadingMonths || monthTouched) return
    setStartMonth(availableMonths.at(-1) || currentMonth())
  }, [availableMonths, isLoadingMonths, monthTouched])

  const { data: categories = [] } = useQuery({
    queryKey: ['master-categories'],
    queryFn: () => apiFetch('/api/master-categories')
  })

  const dateRange = useMemo(() => {
    if (!startMonth) return { start: '', end: '' }
    const [year, month] = startMonth.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()
    return { start: `${startMonth}-01`, end: `${startMonth}-${String(lastDay).padStart(2, '0')}` }
  }, [startMonth])

  const { data: entries = [], isLoading, error } = useQuery({
    queryKey: ['entries', 'dashboard-snapshot', startMonth],
    queryFn: () => apiFetch(`/api/entries?month=${startMonth}`),
    enabled: !!dateRange.start && !!dateRange.end
  })

  // Data quality score (for KPI card)
  const { data: qualityData } = useQuery({
    queryKey: ['data-quality-kpi', startMonth],
    queryFn: () => apiFetch(`/api/data-quality?month=${startMonth}`),
    enabled: !!startMonth
  })

  // KPI: current start-month totals
  const currentMonthEntries = useMemo(() => {
    if (!startMonth) return []
    const startStr = `${startMonth}-01`
    const [y, m] = startMonth.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const endStr = `${startMonth}-${String(lastDay).padStart(2, '0')}`
    return entries.filter(r => {
      const period = String(r.period_month || r.entry_date || '').slice(0, 7)
      return period === startMonth || (r.entry_date >= startStr && r.entry_date <= endStr)
    })
  }, [entries, startMonth])

  const smartSummary = useMemo(() => {
    if (!startMonth || currentMonthEntries.length === 0) return null
    let totalWaste = 0, recycleWeight = 0, rdfWeight = 0
    currentMonthEntries.forEach(r => {
      const weight = monthlyValue(r, 'weight_kg')
      if (r.module === 'rdf') rdfWeight += weight
      else if (r.module === 'recycle') recycleWeight += weight
      if (['rdf', 'recycle', 'dog_food', 'pig_feed'].includes(r.module)) totalWaste += weight
    })
    const rdfPct = totalWaste > 0 ? ((rdfWeight / totalWaste) * 100).toFixed(1) : 0
    return { month: startMonth, count: currentMonthEntries.length, recycleWeight, rdfPct, totalWaste }
  }, [startMonth, currentMonthEntries])

  const kpi = useMemo(() => {
    let weight = 0, amount = 0, count = 0, wetWaste = 0, recycleWeight = 0
    currentMonthEntries.forEach(r => {
      weight += monthlyValue(r, 'weight_kg')
      amount += monthlyValue(r, 'amount')
      count++
      if (r.module === 'dog_food' || r.module === 'pig_feed') wetWaste += monthlyValue(r, 'weight_kg')
      if (r.module === 'recycle') recycleWeight += monthlyValue(r, 'weight_kg')
    })
    return { weight, amount, count, wetWaste, recycleWeight }
  }, [currentMonthEntries])

  const qualityAvg = useMemo(() => {
    const scores = qualityData?.scores || []
    if (!scores.length) return null
    const avg = scores.reduce((s, i) => s + i.score, 0) / scores.length
    return avg.toFixed(1)
  }, [qualityData])

  const monthLabel = thaiMonthLabel(startMonth)

  return (
    <section className="page">
      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <p className="eyebrow">ภาพรวมระบบ</p>
          <h2>Dashboard Analysis</h2>
          <p className="muted">วิเคราะห์ข้อมูลขยะและทรัพยากรด้วย Tab Interface</p>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="field small-field" style={{ minWidth: '190px' }}>
            <span>เดือนที่ต้องการแสดง</span>
            <MonthPicker value={startMonth} onChange={value => { setMonthTouched(true); setStartMonth(value) }} />
          </label>
        </div>
      </div>

      {monthsError && <div className="alert error">โหลดรายการเดือนไม่สำเร็จ: {monthsError.message}</div>}
      {error && <div className="alert error">เชื่อมต่อ API ไม่สำเร็จ: {error.message}</div>}
      {(isLoadingMonths || isLoading) && <div className="alert">กำลังโหลดข้อมูล...</div>}

      {/* ── Section 1: Current Snapshot (collapsible) ────────── */}
      <div className="card" style={{
        borderRadius: '20px', marginBottom: '20px', overflow: 'hidden',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
      }}>
        {/* Snapshot Header */}
        <div
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '16px 20px', cursor: 'pointer',
            background: snapshotOpen
              ? 'linear-gradient(135deg, #f0fdf4 0%, #f8fafc 100%)'
              : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
            borderBottom: snapshotOpen ? '1px solid #e2e8f0' : 'none',
            transition: 'background 0.3s ease',
          }}
          onClick={() => setSnapshotOpen(v => !v)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              background: '#22c55e18', borderRadius: '10px', padding: '6px',
              display: 'grid', placeItems: 'center', color: '#16a34a'
            }}>
              <Activity size={16} />
            </div>
            <div>
              <span style={{ fontSize: '14px', fontWeight: '800', color: '#1e293b' }}>
                Current Snapshot — ข้อมูลปัจจุบัน
              </span>
              <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '12px' }}>
                {monthLabel} · {kpi.count} รายการ
              </span>
            </div>
          </div>
          <button
            type="button"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 14px', borderRadius: '10px', border: '1px solid #e2e8f0',
              background: 'white', cursor: 'pointer', fontSize: '12.5px',
              fontWeight: '600', color: '#475569',
            }}
          >
            {snapshotOpen ? <><ChevronUp size={14} /> ซ่อน</> : <><ChevronDown size={14} /> แสดง</>}
          </button>
        </div>

        {/* Snapshot Content (collapsible) */}
        <div style={{
          maxHeight: snapshotOpen ? '800px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 0.4s ease',
        }}>
          <div style={{ padding: '20px' }}>
            {/* Welcome + Smart Summary */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              {/* Welcome Card */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '20px',
                background: 'linear-gradient(135deg, var(--primary-light) 0%, rgba(255,255,255,0.95) 100%)',
                border: '1px solid var(--primary-color)', borderRadius: '16px',
                padding: '16px 20px',
              }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--eyebrow-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ยินดีต้อนรับกลับมา!</span>
                  <h3 style={{ fontSize: '16px', fontWeight: '900', margin: '4px 0 6px', color: '#1e293b' }}>
                    สวัสดีครับ! มาวิเคราะห์ข้อมูลขยะของ Central Krabi กันเลย
                  </h3>
                  <p style={{ fontSize: '12.5px', color: '#475569', margin: 0, lineHeight: '1.6' }}>
                    ระบบรองรับการคัดแยกวัสดุรีไซเคิลและของใช้สิ้นเปลือง เพื่อช่วยให้ Central Group บรรลุเป้าหมาย Carbon Neutrality
                  </p>
                </div>
                <img
                  src="/mascot.png" alt="Eco Mascot"
                  style={{ width: '80px', height: '80px', objectFit: 'contain', borderRadius: '14px', border: '2px solid #cbd5e1', background: 'white', flexShrink: 0 }}
                />
              </div>

              {/* Smart Summary */}
              {smartSummary && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                  border: '1px solid #bfdbfe', borderRadius: '14px', padding: '14px 18px',
                }}>
                  <div style={{ background: '#3b82f6', color: 'white', padding: '9px', borderRadius: '12px', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <FileText size={18} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e3a8a', margin: '0 0 3px 0' }}>
                      สรุปข้อมูลอัตโนมัติ (พ.ศ. {Number(smartSummary.month.slice(0, 4)) + 543})
                    </h4>
                    <p style={{ fontSize: '12px', color: '#1e40af', margin: 0, lineHeight: '1.5' }}>
                      ประจำเดือน <strong>{thaiMonthLabel(smartSummary.month)}</strong> · {smartSummary.count} รายการ · Recycle <strong>{formatNumber(smartSummary.recycleWeight)} kg</strong> · RDF <strong>{smartSummary.rdfPct}%</strong> ของขยะรวม ({formatNumber(smartSummary.totalWaste)} kg)
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* KPI Cards — 6 cards */}
            <div className="kpi-grid kpi-grid-6">
              <KpiCard icon={Scale} label={`น้ำหนักรวม (${monthLabel})`} value={formatNumber(kpi.weight)} unit="kg" color="#18181b" />
              <KpiCard icon={BadgeDollarSign} label={`รายได้รวม (${monthLabel})`} value={formatNumber(kpi.amount)} unit="บาท" color="#22c55e" />
              <KpiCard icon={BarChart3} label={`จำนวนรายการ (${monthLabel})`} value={formatNumber(kpi.count, 0)} color="#3b82f6" />
              <KpiCard icon={Droplets} label={`ขยะเปียกรวม (${monthLabel})`} value={formatNumber(kpi.wetWaste)} unit="kg" color="#06b6d4" />
              <KpiCard icon={Recycle} label={`น้ำหนัก Recycle (${monthLabel})`} value={formatNumber(kpi.recycleWeight)} unit="kg" color="#ffd600" sub="(รีไซเคิลทุกประเภท)" />
              <KpiCard
                icon={ShieldCheck}
                label="Data Quality Score"
                value={qualityAvg !== null ? `${qualityAvg}%` : '—'}
                color="#f59e0b"
                sub={qualityAvg !== null ? (qualityAvg >= 80 ? '✅ ข้อมูลสมบูรณ์' : '⚠️ ควรตรวจสอบ') : 'กำลังโหลด...'}
              />
            </div>
          </div>
        </div>
      </div>

    </section>
  )
}
