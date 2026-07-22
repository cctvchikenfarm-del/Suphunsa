import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download } from 'lucide-react'
import { apiFetch, currentMonth, formatNumber, MODULE_LABELS, MODULE_ORDER } from '../api.js'
import MonthPicker from './MonthPicker.jsx'
import { exportChartReportPowerPoint } from '../lib/chart-report-export.js'
import { downloadChartPng, downloadChartSvg, safeName } from '../lib/export-report.js'
import { ReportStudio } from './AnnualLedger.jsx'

const PALETTE = ['#18181b','#388e3c','#4ade80','#0ea5e9','#ffd600','#3b82f6','#64748b','#8b5cf6','#ea580c','#db2777']
const METRICS = [
  ['weight_kg','น้ำหนัก','kg'],['quantity','จำนวน','ตามหน่วยรายการ'],['amount','ยอดเงิน','บาท']
]
const CHART_TYPES = [['bar','กราฟแท่ง'],['line','กราฟเส้น'],['pie','กราฟวงกลม']]
const QUANTITY_MODULES = new Set(['tissue','black_bag','consumable'])
const WEIGHT_MODULES = new Set(['rdf','dog_food','pig_feed','wet_waste','recycle'])

function tokenModule(token) { return String(token).split('~')[0] }
function tokenCategory(token) { return String(token).split('~').slice(1).join('~') }
function categoryToken(module, code) { return `${module}~${code}` }

/* Custom HTML Legend — renders entirely outside Recharts SVG/wrapper to avoid
   the position:absolute overlap bug when many series are selected.
   Recharts built-in <Legend> uses position:absolute inside recharts-wrapper
   and cannot reliably accommodate multi-row legends without overlapping the plot area. */
function ChartLegend({ series, colors }) {
  if (!series || series.length === 0) return null
  const visible = series.filter(item => item.total !== 0 || item.records > 0)
  if (visible.length === 0) return null
  return (
    <div className="cb-legend">
      {visible.map(item => (
        <span key={item.key} className="cb-legend-item">
          <span className="cb-legend-dot" style={{ background: colors[item.key] || '#2563eb' }} />
          <span className="cb-legend-label">{item.label}</span>
          <small className="cb-legend-unit">{item.unit}</small>
        </span>
      ))}
    </div>
  )
}

export default function ChartBuilder({ permissions = [], user }) {
  const [startMonth, setStartMonth] = useState(currentMonth())
  const [endMonth, setEndMonth] = useState(currentMonth())
  const [selectedSeries, setSelectedSeries] = useState(MODULE_ORDER)
  const [metric, setMetric] = useState('weight_kg')
  const [groupBy, setGroupBy] = useState('monthly')
  const [chartType, setChartType] = useState('bar')
  const [colors, setColors] = useState({})
  const [showTable, setShowTable] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showColors, setShowColors] = useState(false)
  const [showReportStudio, setShowReportStudio] = useState(false)
  const [reportTitle, setReportTitle] = useState('รายงานกราฟข้อมูลประจำสถานี')
  const [slideLayout, setSlideLayout] = useState('LAYOUT_WIDE')
  const [isExporting, setIsExporting] = useState(false)
  const chartExportRef = useRef(null)

  const { data: categories = [] } = useQuery({ queryKey:['master-categories'], queryFn:()=>apiFetch('/api/master-categories') })
  const seriesQuery = selectedSeries.join(',')
  const selectedModules = useMemo(() => [...new Set(selectedSeries.map(tokenModule))], [seriesQuery])
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey:['custom-chart-builder',startMonth,endMonth,metric,groupBy,seriesQuery],
    queryFn:()=>apiFetch(`/api/chart-builder/data?startMonth=${startMonth}&endMonth=${endMonth}&metric=${metric}&groupBy=${groupBy}&series=${encodeURIComponent(seriesQuery)}`),
    enabled:selectedSeries.length > 0
  })

  const resultSeries = data?.series || []
  const chartData = useMemo(() => (data?.points || []).map(point => ({ label:point.label, ...point.values })), [data])

  useEffect(() => {
    setColors(current => {
      const next = { ...current }
      resultSeries.forEach((item, index) => { if (!next[item.key]) next[item.key] = PALETTE[index % PALETTE.length] })
      return next
    })
  }, [resultSeries])

  useEffect(() => {
    if (!selectedModules.length) return
    if (selectedModules.every(module => QUANTITY_MODULES.has(module))) {
      if (metric === 'weight_kg') setMetric('quantity')
    } else if (selectedModules.every(module => WEIGHT_MODULES.has(module))) {
      if (metric === 'quantity') setMetric('weight_kg')
    }
  }, [selectedModules])

  const categoriesByModule = useMemo(() => {
    const grouped = {}
    for (const category of categories) {
      const module = category.module === 'cleaning_liquid' ? 'consumable' : category.module
      if (!grouped[module]) grouped[module] = []
      if (!grouped[module].some(item => item.code === category.code)) grouped[module].push(category)
    }
    return grouped
  }, [categories])

  function toggleModule(module) {
    setSelectedSeries(current => {
      const active = current.some(token => tokenModule(token) === module)
      return active ? current.filter(token => tokenModule(token) !== module) : [...current, module]
    })
  }
  function toggleCategory(module, code) {
    const token = categoryToken(module, code)
    setSelectedSeries(current => {
      if (current.includes(token)) {
        const next = current.filter(item => item !== token)
        return next.some(item => tokenModule(item) === module) ? next : [...next, module]
      }
      return [...current.filter(item => item !== module), token]
    })
  }
  function selectAll() { setSelectedSeries(MODULE_ORDER) }
  function clearAll() { setSelectedSeries([]) }
  function selectOnlyWithData() {
    const active = resultSeries.filter(item => item.records > 0).map(item => item.key)
    setSelectedSeries(active)
  }
  function resetColors() {
    const next = {}
    resultSeries.forEach((item, index) => { next[item.key] = PALETTE[index % PALETTE.length] })
    setColors(next)
  }

  const allZero = !data?.has_data || resultSeries.every(item => item.total === 0)
  const incompatible = data?.compatible_units === false
  const metricLabel = METRICS.find(item => item[0] === metric)?.[1]
  const canExport = user?.role === 'owner' || permissions.includes('reports.export')
  const selectedCount = selectedSeries.length
  const maxBarSize = useMemo(() => Math.min(28, Math.max(6, Math.floor(240 / Math.max(1, resultSeries.length)))), [resultSeries.length])

  async function handlePowerPointExport() {
    if (!canExport || allZero || incompatible) return
    setIsExporting(true)
    try {
      const formattedSeries = resultSeries.map(item => ({ ...item, name: item.label }))
      await exportChartReportPowerPoint({
        title: reportTitle,
        periodLabel: startMonth === endMonth ? startMonth : `${startMonth} – ${endMonth}`,
        chartType,
        series: formattedSeries,
        points: data?.points || [],
        colors,
        layout: slideLayout
      })
      await apiFetch('/api/reports/client-export', {
        method: 'POST',
        body: JSON.stringify({ month: endMonth, title: reportTitle, modules: [...new Set(resultSeries.map(item => item.module))], outline: [{ id: 'chart-builder', title: reportTitle, type: 'chart_table', enabled: true }] })
      })
    } catch (exportError) {
      window.alert(`ส่งออก PowerPoint ไม่สำเร็จ: ${exportError.message}`)
    } finally {
      setIsExporting(false)
    }
  }

  async function handleImageExport(format) {
    const svg = chartExportRef.current?.querySelector('svg')
    const baseName = safeName(`${reportTitle}_${startMonth}_${endMonth}`) || 'CKAP-chart'
    try {
      if (format === 'svg') downloadChartSvg(svg, `${baseName}.svg`)
      else await downloadChartPng(svg, `${baseName}@3x.png`, 3)
    } catch (imageError) {
      window.alert(`ส่งออกภาพไม่สำเร็จ: ${imageError.message}`)
    }
  }

  return (
    <section className="page custom-chart-builder">
      <div className="page-header">
        <div>
          <p className="eyebrow">Custom Chart Builder</p>
          <h2>สร้างกราฟจากฐานข้อมูล</h2>
          <p className="muted">เลือกช่วงเวลา ประเภท ชนิดย่อย ตัวชี้วัด รูปแบบกราฟ และสีได้โดยไม่แก้ไขข้อมูลต้นทาง</p>
        </div>
      </div>

      <div className="card chart-builder-controls">
        <div className="chart-step-heading">
          <span>1</span>
          <div><h3>เลือกข้อมูล</h3><p className="muted no-margin">กำหนดช่วงเวลา แล้วเลือกเฉพาะข้อมูลที่ต้องการเปรียบเทียบ</p></div>
        </div>
        <div className="chart-filter-grid">
          <label className="field"><span>เดือนเริ่มต้น</span><MonthPicker value={startMonth} onChange={value => { setStartMonth(value); if (value > endMonth) setEndMonth(value) }}/></label>
          <label className="field"><span>เดือนสิ้นสุด</span><MonthPicker value={endMonth} onChange={value => { setEndMonth(value); if (value < startMonth) setStartMonth(value) }}/></label>
          <label className="field">
            <span>ตัวชี้วัดข้อมูลจริง</span>
            <select value={metric} onChange={e => setMetric(e.target.value)}>
              {METRICS.map(([value, label, unit]) => <option key={value} value={value}>{label} ({unit})</option>)}
            </select>
            <small className="muted">ระบบเลือกจำนวนหรือน้ำหนักให้เหมาะกับประเภทข้อมูลอัตโนมัติ</small>
          </label>
        </div>

        <div className="section-title-row chart-series-heading">
          <div><h3>ประเภทข้อมูล <span className="selection-count">เลือก {selectedCount} ชุด</span></h3><p className="muted no-margin">กดประเภทหลักเพื่อดูและเลือกชนิดย่อย</p></div>
          <div className="inline-actions chart-quick-actions">
            <button className="ghost" onClick={selectAll}>เลือกทั้งหมด</button>
            <button className="ghost" onClick={clearAll}>เคลียร์ทั้งหมด</button>
            <button className="ghost" onClick={selectOnlyWithData} disabled={!resultSeries.length}>เฉพาะที่มีข้อมูล</button>
            <button className="ghost" onClick={() => refetch()} disabled={isFetching || !selectedSeries.length}>รีเฟรช</button>
          </div>
        </div>
        <div className="check-grid chart-module-grid">
          {MODULE_ORDER.map(module => (
            <div className="chart-module-choice" key={module}>
              <label className="check-pill">
                <input type="checkbox" checked={selectedSeries.some(token => tokenModule(token) === module)} onChange={() => toggleModule(module)}/>
                <span>{MODULE_LABELS[module]}</span>
              </label>
              {(categoriesByModule[module] || []).length > 0 && selectedSeries.some(token => tokenModule(token) === module) && (
                <div className="chart-subcategory-list">
                  {(categoriesByModule[module] || []).map(category => (
                    <label key={category.code}>
                      <input type="checkbox" checked={selectedSeries.includes(categoryToken(module, category.code))} onChange={() => toggleCategory(module, category.code)}/>
                      <span>{category.name_th}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <button type="button" className="chart-advanced-toggle" onClick={() => setShowAdvanced(v => !v)} aria-expanded={showAdvanced}>
          {showAdvanced ? 'ซ่อนตัวเลือกเพิ่มเติม' : 'ตัวเลือกเพิ่มเติม'} <span>{showAdvanced ? '▲' : '▼'}</span>
        </button>
        {showAdvanced && (
          <div className="chart-advanced-panel">
            <label className="field"><span>จัดกลุ่มข้อมูล</span><select value={groupBy} onChange={e => setGroupBy(e.target.value)}><option value="daily">รายวัน</option><option value="monthly">รายเดือน</option></select></label>
            <label className="field"><span>รูปแบบกราฟ</span><select value={chartType} onChange={e => setChartType(e.target.value)}>{CHART_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
        )}
      </div>

      {!selectedSeries.length && <div className="alert">กรุณาเลือกประเภทหรือชนิดย่อยอย่างน้อยหนึ่งรายการ</div>}
      {error && <div className="alert error">โหลดข้อมูลกราฟไม่สำเร็จ: {error.message}</div>}
      {isLoading && selectedSeries.length > 0 && <div className="alert">กำลังรวมข้อมูลจากฐานข้อมูล...</div>}
      {incompatible && <div className="alert error">ข้อมูลที่เลือกมีหลายหน่วย ({(data?.units || []).join(', ') || 'พบหลายหน่วยในประเภทเดียว'}) กรุณาเลือกชนิดย่อยที่มีหน่วยเดียวกัน หรือเปลี่ยนตัวชี้วัด</div>}
      {!isLoading && selectedSeries.length > 0 && allZero && (
        <div className="card empty-state">
          <strong>ไม่พบข้อมูลสำหรับเงื่อนไขที่เลือก</strong>
          <span>ระบบจะไม่สร้างข้อสรุปหรือระบุว่าประเภทใดสูงสุดเมื่อทุกค่าเป็นศูนย์</span>
        </div>
      )}

      {!allZero && !incompatible && (
        <>
          <div className="card custom-chart-preview" data-report-section="chart-builder">
            <div className="chart-step-heading">
              <span>2</span>
              <div>
                <h3>ตรวจกราฟและตารางข้อมูล</h3>
                <p className="muted no-margin">{metricLabel} · {startMonth === endMonth ? startMonth : `${startMonth} – ${endMonth}`} · {groupBy === 'daily' ? 'รายวัน' : 'รายเดือน'}</p>
              </div>
              <span className="chart-type-badge">{chartType.toUpperCase()}</span>
            </div>

            {/* Chart area — NO built-in <Legend> inside ResponsiveContainer.
                Recharts Legend uses position:absolute and cannot handle multi-row layouts
                without overlapping the plot area when many series are selected. */}
            <div ref={chartExportRef} className="chart-preview-box large report-chart-frame">
              {chartType === 'bar' && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} maxBarSize={maxBarSize} barGap={2} margin={{ top: 16, right: 20, left: 10, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3"/>
                    <XAxis dataKey="label" tick={{ fontSize: 12 }}/>
                    <YAxis tick={{ fontSize: 12 }}/>
                    <Tooltip formatter={(value, name) => [formatNumber(value), resultSeries.find(item => item.key === name)?.label || name]}/>
                    {resultSeries.map(item => (
                      <Bar key={item.key} dataKey={item.key} fill={colors[item.key]} radius={[4, 4, 0, 0]} maxBarSize={maxBarSize}/>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
              {chartType === 'line' && (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 16, right: 20, left: 10, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3"/>
                    <XAxis dataKey="label" tick={{ fontSize: 12 }}/>
                    <YAxis tick={{ fontSize: 12 }}/>
                    <Tooltip formatter={(value, name) => [formatNumber(value), resultSeries.find(item => item.key === name)?.label || name]}/>
                    {resultSeries.map(item => (
                      <Line key={item.key} dataKey={item.key} name={item.key} stroke={colors[item.key]} strokeWidth={2.5} dot={{ r: 3 }} type="monotone"/>
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
              {chartType === 'pie' && (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 8, right: 20, left: 20, bottom: 8 }}>
                    <Pie
                      data={resultSeries.filter(item => item.total !== 0)}
                      dataKey="total"
                      nameKey="label"
                      outerRadius={140}
                      label={({ label, percent }) => `${label} ${(percent * 100).toFixed(0)}%`}
                    >
                      {resultSeries.filter(item => item.total !== 0).map(item => (
                        <Cell key={item.key} fill={colors[item.key]}/>
                      ))}
                    </Pie>
                    <Tooltip formatter={value => formatNumber(value)}/>
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Custom HTML Legend — outside SVG/wrapper, never overlaps plot area,
                wraps naturally to as many rows as needed */}
            <ChartLegend series={resultSeries} colors={colors}/>

            <div className="chart-preview-tools">
              <button className="ghost" onClick={() => setShowColors(v => !v)}>{showColors ? 'ซ่อนการปรับสี' : 'ปรับสีกราฟ'}</button>
              <button className="ghost" onClick={() => setShowTable(v => !v)}>{showTable ? 'ซ่อนตารางข้อมูล' : 'แสดงตารางข้อมูล'}</button>
              <button type="button" className="btn primary small" onClick={() => setShowReportStudio(true)}><Download size={14}/> เตรียมภาพรายงาน</button>
            </div>
          </div>

          {showColors && (
            <div className="card chart-style-card">
              <div className="section-title-row">
                <div><h3>ปรับสีกราฟ</h3><p className="muted no-margin">ไม่มีผลต่อข้อมูลต้นทาง</p></div>
                <button className="ghost" onClick={resetColors}>คืนค่าสีเริ่มต้น</button>
              </div>
              <div className="chart-color-grid">
                {resultSeries.map(item => (
                  <label key={item.key}>
                    <input type="color" value={colors[item.key] || '#2563eb'} onChange={e => setColors(current => ({ ...current, [item.key]: e.target.value }))}/>
                    <span>{item.label}</span>
                    <small>{item.unit}</small>
                  </label>
                ))}
              </div>
            </div>
          )}

          {showTable && (
            <div className="card chart-data-table table-container">
              <div className="section-title-row">
                <div><h3>ตารางตรวจสอบข้อมูลกราฟ</h3><p className="muted no-margin">ตรวจข้อมูลจริงก่อนนำไปทำรายงาน</p></div>
              </div>
              <div className="table-wrap">
                <table className="table" style={{ fontSize: '13px', width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'linear-gradient(135deg, #0f766e, #0891b2)', color: '#ffffff' }}>
                      <th style={{ color: '#ffffff', fontWeight: 'bold' }}>ช่วงเวลา</th>
                      {resultSeries.map(item => (
                        <th key={item.key} style={{ textAlign: 'right', color: '#ffffff', fontWeight: 'bold' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: colors[item.key] || '#2563eb', border: '1.5px solid #fff', display: 'inline-block' }}/>
                            {item.label} <small style={{ color: '#e0f2fe', fontWeight: 'normal' }}>({item.unit})</small>
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((row, idx) => (
                      <tr key={row.label} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                        <td style={{ fontWeight: 'bold', borderBottom: '1px solid #e2e8f0' }}>{row.label}</td>
                        {resultSeries.map(item => (
                          <td key={item.key} className="num" style={{ textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>{formatNumber(row[item.key] || 0)}</td>
                        ))}
                      </tr>
                    ))}
                    <tr className="total-row" style={{ background: '#f0fdfa', fontWeight: 'bold', borderTop: '2px solid #0f766e' }}>
                      <td style={{ color: '#0f766e', fontWeight: 'bold' }}>รวมทั้งหมด</td>
                      {resultSeries.map(item => (
                        <td key={item.key} className="num" style={{ textAlign: 'right', color: '#0f766e', fontWeight: 'bold' }}>
                          <strong>{formatNumber(item.total)}</strong>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card chart-export-card">
            <div className="chart-step-heading">
              <span>3</span>
              <div><h3>ส่งออกรายงาน</h3><p className="muted no-margin">ตั้งชื่อและเลือกไฟล์ที่ต้องการนำไปใช้</p></div>
            </div>
            <div className="chart-report-controls">
              <label className="field"><span>ชื่อรายงาน</span><input value={reportTitle} onChange={e => setReportTitle(e.target.value)}/></label>
              <label className="field"><span>ขนาด PowerPoint</span><select value={slideLayout} onChange={e => setSlideLayout(e.target.value)}><option value="LAYOUT_WIDE">16:9</option><option value="LAYOUT_4X3">4:3</option></select></label>
              <button type="button" className="btn primary" onClick={handlePowerPointExport} disabled={!canExport || allZero || incompatible || isExporting}>{isExporting ? 'กำลังสร้าง PowerPoint...' : 'ส่งออก PowerPoint คมชัด'}</button>
              <button type="button" className="btn secondary" onClick={() => handleImageExport('png')} disabled={!canExport || allZero || incompatible}>PNG 3x</button>
              <button type="button" className="btn secondary" onClick={() => handleImageExport('svg')} disabled={!canExport || allZero || incompatible}>SVG</button>
            </div>
          </div>
        </>
      )}
      {showReportStudio && <ReportStudio section="chart-builder" onClose={() => setShowReportStudio(false)}/>}
    </section>
  )
}
