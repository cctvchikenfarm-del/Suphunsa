import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, Cell, LabelList
} from 'recharts'
import { apiFetch, currentDate, formatNumber, toNumber } from '../api.js'
import { 
  Table, Calendar, BarChart3, TrendingUp, Info, 
  ClipboardList, ShoppingBag, Droplet, Trash2, Milestone, DollarSign,
  Search, RefreshCw, Edit3, Plus, X, Download, FileText
} from 'lucide-react'
import { THAI_MONTHS_SHORT, MONTHS_OPTIONS, LEDGER_MODULE_LABELS, LEDGER_DB_MODULE_MAP, getDayFromDate, getWeekIndex, getModuleConfig, getGroupedConfig, monthlyEntryValue, getReportableMonths } from '../lib/ledger-config.js'
import MonthPicker from './MonthPicker.jsx'
import { toBlob, toPng, toSvg } from 'html-to-image'

function buildMonthRange(startMonth, count) {
  if (!/^\d{4}-\d{2}$/.test(startMonth || '')) return []
  const [year, month] = startMonth.split('-').map(Number)
  return Array.from({ length:count }, (_, index) => {
    const date = new Date(year, month - 1 + index, 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  })
}

const BAG_TYPES = [
  { key: 'large', code: 'black_bag_large', label: 'ถุงใหญ่ 30x40 สีดำ', unit: 'kg', color: '#18181b' },
  { key: 'medium', code: 'black_bag_medium', label: 'ถุงกลาง 28x36 สีชา', unit: 'kg', color: '#ea580c' },
  { key: 'small', code: 'black_bag_small', label: 'ถุงเล็ก 18x20 สีดำ', unit: 'kg', color: '#71717a' }
]
const normalizeBagCode = value => {
  const code = String(value || '').trim().toLowerCase()
  if (['bag_large', 'large', 'black_bag_large'].includes(code)) return 'black_bag_large'
  if (['bag_medium', 'medium', 'black_bag_medium'].includes(code)) return 'black_bag_medium'
  if (['bag_small', 'small', 'black_bag_small'].includes(code)) return 'black_bag_small'
  return code
}

const MONTH_POINT_COLORS = ['#0f766e', '#2563eb', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#65a30d', '#db2777', '#4f46e5', '#ea580c', '#059669', '#9333ea']
const REPORT_STUDIO_PRESETS = {
  wide:{ label:'PowerPoint 16:9', width:1280, height:720 },
  standard:{ label:'PowerPoint 4:3', width:1024, height:768 },
  a4:{ label:'A4 แนวนอน', width:1120, height:792 },
  compact:{ label:'กะทัดรัดสำหรับครอป', width:960, height:640 }
}
const REPORT_TABLE_THEMES = {
  teal:{ label:'เขียวอมฟ้า', header:'#0f766e', headerEnd:'#0891b2', stripe:'#f0fdfa', border:'#99f6e4' },
  blue:{ label:'น้ำเงิน', header:'#1d4ed8', headerEnd:'#2563eb', stripe:'#eff6ff', border:'#bfdbfe' },
  green:{ label:'เขียว', header:'#15803d', headerEnd:'#16a34a', stripe:'#f0fdf4', border:'#bbf7d0' },
  orange:{ label:'ส้ม', header:'#c2410c', headerEnd:'#ea580c', stripe:'#fff7ed', border:'#fed7aa' },
  slate:{ label:'เทาเข้ม', header:'#334155', headerEnd:'#475569', stripe:'#f8fafc', border:'#cbd5e1' }
}

export function ReportStudio({ section, onClose }) {
  const [presetKey,setPresetKey]=useState('wide')
  const [contentMode,setContentMode]=useState('both')
  const [fontScale,setFontScale]=useState(1)
  const [chartSize,setChartSize]=useState(section==='recycle-monthly'||section==='recycle'?240:320)
  const [tableThemeKey,setTableThemeKey]=useState('teal')
  const [exporting,setExporting]=useState('')
  const [exportError,setExportError]=useState('')
  const [readyFile,setReadyFile]=useState(null)
  const previewRef=useRef(null)
  const preset=REPORT_STUDIO_PRESETS[presetKey]
  const tableTheme=REPORT_TABLE_THEMES[tableThemeKey]

  useEffect(()=>{
    const source=document.querySelector(`[data-report-section="${section}"]`)
    if(!source||!previewRef.current)return
    const clone=source.cloneNode(true)
    clone.classList.remove('ledger-section-modal')
    clone.classList.add('report-studio-clone')
    clone.querySelectorAll('.ledger-section-controls,button').forEach(node=>node.remove())
    Object.assign(clone.style,{width:'100%',height:'100%',margin:'0',gridColumn:'auto',boxShadow:'none',border:'0',borderRadius:'0'})
    clone.style.setProperty('--studio-table-size',`${Math.round(13*fontScale)}px`)
    clone.style.setProperty('--studio-chart-size',`${Math.round(12*fontScale)}px`)
    clone.style.setProperty('--studio-table-header',tableTheme.header)
    clone.style.setProperty('--studio-table-header-end',tableTheme.headerEnd)
    clone.style.setProperty('--studio-table-stripe',tableTheme.stripe)
    clone.style.setProperty('--studio-table-border',tableTheme.border)
    if(contentMode==='chart') clone.querySelectorAll('.table-container,.monthly-recycle-table').forEach(node=>node.remove())
    if(contentMode==='table') {
      clone.querySelectorAll('.recharts-responsive-container,.monthly-recycle-chart').forEach(node=>{
        let target=node
        while(target.parentElement&&target.parentElement!==clone&&!target.parentElement.classList.contains('ledger-analysis-content')&&!target.parentElement.classList.contains('monthly-recycle-report-layout')) target=target.parentElement
        target.remove()
      })
    } else {
      clone.querySelectorAll('.recharts-responsive-container').forEach(node=>{
        let target=node.parentElement
        while(target&&target.parentElement&&target.parentElement!==clone&&!target.parentElement.classList.contains('ledger-analysis-content')&&!target.parentElement.classList.contains('monthly-recycle-report-layout')) target=target.parentElement
        if(target) target.style.height=`${chartSize}px`
      })
    }
    previewRef.current.replaceChildren(clone)
  },[section,presetKey,contentMode,fontScale,chartSize,tableTheme])
  useEffect(()=>{document.body.classList.add('ledger-popup-open');return()=>document.body.classList.remove('ledger-popup-open')},[])
  useEffect(()=>()=>{if(readyFile?.url)URL.revokeObjectURL(readyFile.url)},[readyFile])

  const fileBase=`CKAP-${section}-${presetKey}`
  const imageOptions={cacheBust:true,backgroundColor:'#ffffff',width:preset.width,height:preset.height,style:{margin:'0',transform:'none'}}
  const renderPng=()=>toPng(previewRef.current,{...imageOptions,pixelRatio:3})
  const prepareFile=(blob,name)=>{if(!blob)throw new Error('ไม่สามารถสร้างไฟล์ได้');setReadyFile(current=>{if(current?.url)URL.revokeObjectURL(current.url);return{url:URL.createObjectURL(blob),name}})}
  const runExport=async(kind,task)=>{setExportError('');setReadyFile(null);setExporting(kind);try{await task()}catch(error){console.error('Report export failed',error);setExportError(`ส่งออกไม่สำเร็จ: ${error?.message||'เบราว์เซอร์ไม่สามารถสร้างไฟล์ได้'}`)}finally{setExporting('')}}
  const exportSvg=()=>runExport('svg',async()=>{const dataUrl=await toSvg(previewRef.current,{...imageOptions,pixelRatio:1});prepareFile(await (await fetch(dataUrl)).blob(),`${fileBase}.svg`)})
  const exportPng=()=>runExport('png',async()=>prepareFile(await toBlob(previewRef.current,{...imageOptions,pixelRatio:3}),`${fileBase}-3x.png`))
  const exportPpt=()=>runExport('ppt',async()=>{const pptModule=await import('pptxgenjs');const PptxGenJS=pptModule.default||pptModule;const pptx=new PptxGenJS();pptx.layout=presetKey==='standard'?'LAYOUT_4X3':'LAYOUT_WIDE';pptx.author='CKAP System';const slide=pptx.addSlide();slide.background={color:'FFFFFF'};slide.addImage({data:await renderPng(),x:.15,y:.15,w:presetKey==='standard'?9.7:13.03,h:7.2});prepareFile(await pptx.write({outputType:'blob'}),`${fileBase}.pptx`)})

  return <div className="report-studio-modal" role="dialog" aria-modal="true" aria-label="เตรียมภาพรายงาน">
    <div className="report-studio-toolbar">
      <div><strong>เตรียมภาพรายงาน</strong><span>ปรับเฉพาะไฟล์ส่งออก ไม่กระทบหน้าสถานี</span></div>
      <label>ขนาด<select value={presetKey} onChange={event=>setPresetKey(event.target.value)}>{Object.entries(REPORT_STUDIO_PRESETS).map(([key,item])=><option value={key} key={key}>{item.label}</option>)}</select></label>
      <label>เนื้อหา<select value={contentMode} onChange={event=>setContentMode(event.target.value)}><option value="both">กราฟและตาราง</option><option value="chart">กราฟอย่างเดียว</option><option value="table">ตารางอย่างเดียว</option></select></label>
      <label>ตัวอักษรกราฟ/ตาราง<input type="range" min="0.9" max="1.6" step="0.05" value={fontScale} onChange={event=>setFontScale(Number(event.target.value))}/><small>{Math.round(fontScale*100)}%</small></label>
      {contentMode!=='chart'&&<label>สีตาราง<select value={tableThemeKey} onChange={event=>setTableThemeKey(event.target.value)}>{Object.entries(REPORT_TABLE_THEMES).map(([key,item])=><option value={key} key={key}>{item.label}</option>)}</select></label>}
      {contentMode!=='table'&&<label>ความสูงกราฟ<input type="range" min="220" max="440" step="20" value={chartSize} onChange={event=>setChartSize(Number(event.target.value))}/><small>{chartSize}px</small></label>}
      <div className="report-studio-actions"><button type="button" className="btn secondary small" onClick={exportSvg} disabled={!!exporting}>{exporting==='svg'?'กำลังสร้าง…':'สร้าง SVG'}</button><button type="button" className="btn secondary small" onClick={exportPng} disabled={!!exporting}>{exporting==='png'?'กำลังสร้าง…':'สร้าง PNG 3x'}</button><button type="button" className="btn primary small" onClick={exportPpt} disabled={!!exporting}>{exporting==='ppt'?'กำลังสร้าง…':'สร้าง PowerPoint'}</button><button type="button" className="btn danger small" onClick={onClose}>ปิด</button></div>
      {readyFile&&<a className="btn primary report-studio-download" href={readyFile.url} download={readyFile.name}>ดาวน์โหลดไฟล์ที่สร้างแล้ว: {readyFile.name}</a>}
      {exportError&&<div className="report-studio-error" role="alert">{exportError}</div>}
    </div>
    <div className="report-studio-viewport"><div ref={previewRef} className="report-studio-stage" style={{width:preset.width,height:preset.height}} /></div>
  </div>
}

function AdaptiveAccumulatedChart({ data, monthsCount, series, tooltipFormatter, left = -20, colorByMonth = false }) {
  if (!data.length) {
    return <div className="empty-state" style={{ height: '100%', display: 'grid', placeItems: 'center' }}>ยังไม่มีข้อมูลที่บันทึกในช่วงเดือนนี้</div>
  }
  const useBars = monthsCount <= 4
  const Chart = useBars ? BarChart : LineChart
  return (
    <ResponsiveContainer width="100%" height="100%">
      <Chart data={data} margin={{ top: 10, right: 10, left, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="name" style={{ fontSize: '12px', fill: '#1e293b', fontWeight: 'bold' }} tickLine={{ stroke: '#cbd5e1' }} axisLine={{ stroke: '#cbd5e1' }} />
        <YAxis style={{ fontSize: '12px', fill: '#1e293b', fontWeight: 'bold' }} tickLine={{ stroke: '#cbd5e1' }} axisLine={{ stroke: '#cbd5e1' }} />
        <Tooltip formatter={tooltipFormatter} contentStyle={{ borderRadius: '12px', fontSize: '13px', fontWeight: 'bold', color: '#0f172a' }} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: '12.5px', fontWeight: 'bold', color: '#1e293b', paddingTop: '8px' }} />}
        {series.map(item => useBars ? (
          <Bar key={item.key} dataKey={item.dataKey} fill={item.color} radius={[4, 4, 0, 0]}>
            {colorByMonth && data.map((_, index) => <Cell key={index} fill={MONTH_POINT_COLORS[index % MONTH_POINT_COLORS.length]} />)}
          </Bar>
        ) : colorByMonth ? (
          <Line
            key={item.key}
            type="linear"
            dataKey={item.dataKey}
            stroke={item.color}
            strokeWidth={3}
            dot={({ cx, cy, index }) => <circle cx={cx} cy={cy} r={4} fill={MONTH_POINT_COLORS[index % MONTH_POINT_COLORS.length]} stroke="#fff" strokeWidth={1.5} />}
            activeDot={{ r: 6 }}
            isAnimationActive={false}
          />
        ) : (
          <Line key={item.key} type="monotone" dataKey={item.dataKey} stroke={item.color} strokeWidth={3} strokeDasharray={item.dashed ? '5 5' : undefined} dot={{ r: item.dashed ? 4 : 3 }} />
        ))}
      </Chart>
    </ResponsiveContainer>
  )
}

export default function AnnualLedger({ permissions = [] }) {
  const can = (p) => permissions.includes(p)
  const queryClient = useQueryClient()

  const currentCE = Number(currentDate().slice(0, 4))
  const [selectedBE, setSelectedBE] = useState(currentCE + 543)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [viewMode, setViewMode] = useState('monthly') // 'monthly' (รายสัปดาห์) หรือ 'yearly' (12 เดือน)
  const [summaryStartMonth, setSummaryStartMonth] = useState(`${currentCE}-01`)
  const [summaryMonthsCount, setSummaryMonthsCount] = useState(12)
  const autoSelectedYearRef = useRef(null)

  const selectedCE = selectedBE - 543 // ค.ศ.

  // ดึงข้อมูล Master Categories
  const { data: categoriesData = [] } = useQuery({
    queryKey: ['master-categories'],
    queryFn: () => apiFetch('/api/master-categories')
  })
  const categories = useMemo(() => Array.isArray(categoriesData) ? categoriesData : [], [categoriesData])
  const { data: metadataModules = [] } = useQuery({
    queryKey: ['modules-active-ledger'],
    queryFn: () => apiFetch('/api/modules-active')
  })

  const requestedSummaryMonths = useMemo(() => buildMonthRange(summaryStartMonth, summaryMonthsCount), [summaryStartMonth, summaryMonthsCount])
  const summaryLastMonth = requestedSummaryMonths.at(-1) || summaryStartMonth
  const [summaryEndYear, summaryEndMonth] = summaryLastMonth.split('-').map(Number)
  const startDate = viewMode === 'yearly' ? `${summaryStartMonth}-01` : `${selectedCE}-01-01`
  const endDate = viewMode === 'yearly' ? `${summaryLastMonth}-${String(new Date(summaryEndYear, summaryEndMonth, 0).getDate()).padStart(2, '0')}` : `${selectedCE}-12-31`
  const { data: entriesData = [], isLoading } = useQuery({
    queryKey: ['entries', 'summary-ledger', startDate, endDate],
    queryFn: () => apiFetch(`/api/entries?startDate=${startDate}&endDate=${endDate}`),
    enabled: !!selectedCE,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true
  })
  const entries = useMemo(() => Array.isArray(entriesData) ? entriesData : [], [entriesData])
  useEffect(() => {
    if (isLoading || autoSelectedYearRef.current === selectedCE) return
    const yearMonths = buildMonthRange(`${selectedCE}-01`, 12)
    const latestRecordedMonth = getReportableMonths(entries, yearMonths).at(-1) || ''
    setSelectedMonth(latestRecordedMonth.slice(5, 7))
    autoSelectedYearRef.current = selectedCE
  }, [entries, isLoading, selectedCE])
  // Conditional Zero-Fill: show a month only when at least one active metric is
  // positive. Once shown, the individual summary sections may safely fill
  // missing categories with numeric zero for tables, totals and charts.
  const summaryMonths = useMemo(
    () => getReportableMonths(entries, requestedSummaryMonths),
    [entries, requestedSummaryMonths]
  )
  const summaryMonthLabels = useMemo(() => summaryMonths.map(value => {
    const [year, month] = value.split('-').map(Number)
    return `${THAI_MONTHS_SHORT[month - 1]} ${String(year + 543).slice(-2)}`
  }), [summaryMonths])
  const summaryMonthIndex = entry => summaryMonths.indexOf(String(entry.period_month || entry.entry_date || '').slice(0, 7))
  const feedReportMonths = useMemo(
    () => viewMode === 'monthly'
      ? (selectedMonth ? [`${selectedCE}-${selectedMonth}`] : [])
      : summaryMonths,
    [viewMode, selectedMonth, selectedCE, summaryMonths]
  )
  const feedReportMonthLabels = useMemo(() => feedReportMonths.map(value => {
    const [year, month] = value.split('-').map(Number)
    return `${THAI_MONTHS_SHORT[month - 1]} ${String(year + 543).slice(-2)}`
  }), [feedReportMonths])

  // Drill-down explorer states
  const [drillDownParams, setDrillDownParams] = useState(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [drawerSearchQuery, setDrawerSearchQuery] = useState('')

  // Modal forms
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('add') // 'add' or 'edit'
  const [form, setForm] = useState({
    id: '',
    module: 'rdf',
    category_code: '',
    entry_date: '',
    material_name: '',
    weight_kg: '',
    quantity: '',
    unit: 'kg',
    unit_price: '',
    amount: '',
    notes: ''
  })

  const [activeTab, setActiveTab] = useState('ledger') // 'ledger' or 'explorer'

  // Explorer filters
  const [expModule, setExpModule] = useState('all')
  const [expCategory, setExpCategory] = useState('')
  const [expStartDate, setExpStartDate] = useState('')
  const [expEndDate, setExpEndDate] = useState('')
  const [expSearchQuery, setExpSearchQuery] = useState('')
  const [expGroupBy, setExpGroupBy] = useState('daily') // 'daily', 'weekly', 'monthly', 'yearly'

  // Independent show/hide chart states (default: false - hidden)
  const [showTissueChart, setShowTissueChart] = useState(true)
  const [showBagsChart, setShowBagsChart] = useState(true)
  const [showConsumablesChart, setShowConsumablesChart] = useState(true)
  const [showWasteChart, setShowWasteChart] = useState(true)
  const [showFeedChart, setShowFeedChart] = useState(true)
  const [showRecycleChart, setShowRecycleChart] = useState(true)
  const [expandedSection, setExpandedSection] = useState(null)
  const [sectionLayouts, setSectionLayouts] = useState({})
  const [sectionGraphHeights, setSectionGraphHeights] = useState({})
  const [reportStudioSection,setReportStudioSection]=useState(null)

  const changeViewMode = mode => {
    setExpandedSection(null)
    setReportStudioSection(null)
    if (mode === 'yearly') {
      setSummaryStartMonth(`${selectedCE}-01`)
      setSummaryMonthsCount(12)
    }
    setViewMode(mode)
  }

  const openSectionPopup = section => {
    setExpandedSection(section)
  }
  const closeSectionPopup = () => setExpandedSection(null)
  const getSectionLayout = section => sectionLayouts[section] || 'full'
  const setSectionLayout = (section, layout) => setSectionLayouts(current => ({ ...current, [section]: layout }))
  const isRecycleReport = section => section === 'recycle-monthly' || section === 'recycle'
  const getSectionGraphHeight = section => ({ compact: 240, standard: 320, tall: 440 }[sectionGraphHeights[section] || (isRecycleReport(section) ? 'compact' : 'standard')])
  const setSectionGraphHeight = (section, height) => setSectionGraphHeights(current => ({ ...current, [section]: height }))
  const getSectionGridColumn = section => {
    if (expandedSection === section) return '1 / -1'
    return `span ${{ third: 2, half: 3, full: 6 }[getSectionLayout(section)]}`
  }
  const getSectionCardStyle = () => ({})

  useEffect(() => {
    if (!expandedSection) return undefined
    const handleKeyDown = event => {
      if (event.key === 'Escape') closeSectionPopup()
    }
    document.body.classList.add('ledger-popup-open')
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.classList.remove('ledger-popup-open')
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [expandedSection])

  const renderSectionControls = section => (
    <div className="ledger-section-controls">
      {expandedSection !== section && (
        <label>ขนาดการ์ด
          <select value={getSectionLayout(section)} onChange={event => setSectionLayout(section, event.target.value)}>
            <option value="third">1/3 แถว</option>
            <option value="half">1/2 แถว</option>
            <option value="full">เต็มแถว</option>
          </select>
        </label>
      )}
      <label>ความสูงกราฟ
        <select value={sectionGraphHeights[section] || (isRecycleReport(section) ? 'compact' : 'standard')} onChange={event => setSectionGraphHeight(section, event.target.value)}>
          <option value="compact">เตี้ย</option>
          <option value="standard">มาตรฐาน</option>
          <option value="tall">สูง</option>
        </select>
      </label>
      {expandedSection === section ? (
        <button type="button" className="btn danger small" onClick={closeSectionPopup}>กลับหน้ารวม</button>
      ) : (
        <button type="button" className="btn secondary small" onClick={() => openSectionPopup(section)}><BarChart3 size={14} /> ขยายเต็มหน้า</button>
      )}
      <button type="button" className="btn primary small" onClick={()=>setReportStudioSection(section)}><Download size={14}/> เตรียมภาพรายงาน</button>
    </div>
  )

  // Selected row states for custom trend graphing
  const [selectedTissueRow, setSelectedTissueRow] = useState(null)
  const [selectedBagsRow, setSelectedBagsRow] = useState(null)
  const [selectedConsumablesRow, setSelectedConsumablesRow] = useState(null)
  const [selectedWasteRow, setSelectedWasteRow] = useState(null)
  const [selectedFeedRow, setSelectedFeedRow] = useState(null)
  const [selectedRecycleRow, setSelectedRecycleRow] = useState(null)

  // Checkbox print selection states
  const [selectedExplorerRows, setSelectedExplorerRows] = useState([])

  // PDF Preview & configuration states
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false)
  const [pdfTitle, setPdfTitle] = useState('รายงานสรุปข้อมูลรายการ')
  const [pdfNotes, setPdfNotes] = useState('')
  const [pdfVisibleColumns, setPdfVisibleColumns] = useState(['date', 'module', 'category', 'name', 'weight', 'qty', 'amount', 'notes'])
  const [pdfOrientation, setPdfOrientation] = useState('portrait') // 'portrait' or 'landscape'
  const [isPdfGenerating, setIsPdfGenerating] = useState(false)
  const [pdfHasUnsavedChanges, setPdfHasUnsavedChanges] = useState(false)

  const dbModuleMap = LEDGER_DB_MODULE_MAP

  const expFilteredCategories = useMemo(() => {
    if (expModule === 'all') return categories
    const dbMod = dbModuleMap[expModule] || expModule
    let list = categories.filter(c => expModule === 'consumable'
      ? ['consumable', 'cleaning_liquid'].includes(c.module)
      : c.module === dbMod)
    if (expModule === 'dog_food') {
      list = list.filter(c => c.code === 'DOG_FOOD')
    } else if (expModule === 'pig_feed') {
      list = list.filter(c => c.code === 'PIG_FEED')
    } else if (expModule === 'rdf') {
      list = list.filter(c => c.code === 'RDF')
    }
    return list
  }, [categories, expModule])

  const explorerFilteredRows = useMemo(() => {
    return entries.filter(e => {
      // Filter by module
      if (expModule !== 'all') {
        const dbMod = dbModuleMap[expModule] || expModule
        if (expModule === 'consumable') {
          if (!['consumable', 'cleaning_liquid'].includes(e.module)) return false
        } else if (e.module !== dbMod) return false
      }
      // Filter by category
      if (expCategory && e.category_code !== expCategory) return false
      // Filter by date range
      if (expStartDate && e.entry_date < expStartDate) return false
      if (expEndDate && e.entry_date > expEndDate) return false
      // Filter by keyword
      if (expSearchQuery.trim()) {
        const q = expSearchQuery.toLowerCase()
        const matName = (e.material_name || '').toLowerCase()
        const notesText = (e.notes || '').toLowerCase()
        if (!matName.includes(q) && !notesText.includes(q)) return false
      }
      return true
    })
  }, [entries, expModule, expCategory, expStartDate, expEndDate, expSearchQuery])

  const explorerGroupedRows = useMemo(() => {
    if (expGroupBy === 'daily') {
      return [...explorerFilteredRows].sort((a, b) => b.entry_date.localeCompare(a.entry_date))
    }

    const groups = {}
    explorerFilteredRows.forEach(e => {
      let key = ''
      let label = ''
      
      const dateVal = new Date(e.entry_date)
      const yr = dateVal.getFullYear() + 543
      const mIdx = dateVal.getMonth()
      const mName = MONTHS_OPTIONS[mIdx]?.label || 'ไม่ระบุ'
      
      if (expGroupBy === 'weekly') {
        const day = getDayFromDate(e.entry_date)
        const wIdx = getWeekIndex(day)
        key = `${dateVal.getFullYear()}-${String(mIdx + 1).padStart(2, '0')}-W${wIdx + 1}`
        label = `สัปดาห์ที่ ${wIdx + 1} (${mName} ${yr})`
      } else if (expGroupBy === 'monthly') {
        key = `${dateVal.getFullYear()}-${String(mIdx + 1).padStart(2, '0')}`
        label = `เดือน ${mName} ${yr}`
      } else if (expGroupBy === 'yearly') {
        key = `${dateVal.getFullYear()}`
        label = `ปี พ.ศ. ${yr}`
      }

      if (!groups[key]) {
        groups[key] = {
          key,
          label,
          weight: 0,
          quantity: 0,
          amount: 0,
          count: 0,
          module: e.module === 'cleaning_liquid' ? 'consumable' : e.module,
          year: dateVal.getFullYear(),
          monthIndex: mIdx,
          weekIndex: expGroupBy === 'weekly' ? getWeekIndex(getDayFromDate(e.entry_date)) : null,
          unitGroups: {}
        }
      }
      
      groups[key].weight += toNumber(e.weight_kg)
      groups[key].quantity += toNumber(e.quantity)
      groups[key].amount += toNumber(e.amount)
      groups[key].count += 1

      // Track unit groups for count-based summation
      const unit = e.unit || 'หน่วย'
      const name = e.material_name || ''
      const subKey = `${name} (${unit})`
      if (!groups[key].unitGroups[subKey]) {
        groups[key].unitGroups[subKey] = { sum: 0, name, unit }
      }
      groups[key].unitGroups[subKey].sum += toNumber(e.quantity)
    })

    return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key))
  }, [explorerFilteredRows, expGroupBy])

  const handleExplorerRowDrillDown = (row) => {
    let startD = ''
    let endD = ''
    const year = row.year
    const mVal = String(row.monthIndex + 1).padStart(2, '0')
    const lastDay = new Date(year, row.monthIndex + 1, 0).getDate()

    if (expGroupBy === 'weekly') {
      const weekRanges = [
        { start: 1, end: 7 },
        { start: 8, end: 14 },
        { start: 15, end: 21 },
        { start: 22, end: 27 },
        { start: 28, end: lastDay }
      ]
      const range = weekRanges[row.weekIndex]
      startD = `${year}-${mVal}-${String(range.start).padStart(2, '0')}`
      endD = `${year}-${mVal}-${String(range.end).padStart(2, '0')}`
    } else if (expGroupBy === 'monthly') {
      startD = `${year}-${mVal}-01`
      endD = `${year}-${mVal}-${String(lastDay).padStart(2, '0')}`
    } else if (expGroupBy === 'yearly') {
      startD = `${year}-01-01`
      endD = `${year}-12-31`
    }

    setDrillDownParams({
      module: expModule === 'all' ? row.module : expModule,
      category_code: expCategory || null,
      startDate: startD,
      endDate: endD,
      label: `เจาะลึก: ${row.label}`
    })
    setDrawerSearchQuery('')
    setIsDrawerOpen(true)
  }

  const handleResetExplorerFilters = () => {
    setExpModule('all')
    setExpCategory('')
    setExpStartDate('')
    setExpEndDate('')
    setExpSearchQuery('')
    setExpGroupBy('daily')
  }

  const handleOpenAddModalFromExplorer = () => {
    const defaultModule = expModule === 'all' ? 'rdf' : expModule
    const cat = categories.find(c => (defaultModule === 'consumable' ? ['consumable', 'cleaning_liquid'].includes(c.module) : c.module === defaultModule) && (expCategory ? c.code === expCategory : true))
    setForm({
      id: '',
      module: defaultModule,
      category_code: cat ? cat.code : '',
      entry_date: expStartDate || currentDate(),
      material_name: cat ? cat.name_th : '',
      weight_kg: '',
      quantity: '',
      unit: cat ? cat.unit : 'kg',
      unit_price: '',
      amount: '',
      notes: ''
    })
    setModalMode('add')
    setIsModalOpen(true)
  }

  // Module label mapping
  const moduleLabels = useMemo(() => Object.fromEntries([
    ...Object.entries(LEDGER_MODULE_LABELS),
    ...(metadataModules || []).map(module => [module.code, module.name_th])
  ]), [metadataModules])
  const getExplorerConfig = (moduleCode) => {
    const definition = (metadataModules || []).find(module => module.code === moduleCode)
    if (!definition || definition.system_module !== false) return getModuleConfig(moduleCode)
    const fields = (definition.fields || []).filter(field => field.active !== false && field.data_type !== 'calculated')
    return {
      type: 'dynamic',
      headers: ['วันที่', 'รายการ', ...fields.map(field => `${field.label_th}${field.unit ? ` (${field.unit})` : ''}`), 'หมายเหตุ'],
      cols: ['date', 'name', ...fields.map(field => `dynamic:${field.field_key}`), 'notes']
    }
  }

  // Mutations
  const saveMutation = useMutation({
    mutationFn: (payload) => payload.id
      ? apiFetch(`/api/entries/${payload.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      : apiFetch('/api/entries', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setIsModalOpen(false)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => apiFetch(`/api/entries/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    }
  })

  const getGroupedItemQuantityTotals = (rows, isDaily) => {
    const totals = {}
    rows.forEach(r => {
      if (isDaily) {
        const qty = toNumber(r.quantity)
        const unit = r.unit || 'หน่วย'
        const name = r.material_name || ''
        if (qty > 0) {
          const key = `${name} (${unit})`
          if (!totals[key]) {
            totals[key] = { sum: 0, name, unit }
          }
          totals[key].sum += qty
        }
      } else {
        // Grouped rows
        if (r.unitGroups) {
          Object.values(r.unitGroups).forEach(ug => {
            const key = `${ug.name} (${ug.unit})`
            if (!totals[key]) {
              totals[key] = { sum: 0, name: ug.name, unit: ug.unit }
            }
            totals[key].sum += ug.sum
          })
        }
      }
    })
    return Object.values(totals)
      .map(t => `${t.name}: ${formatNumber(t.sum, 0)} ${t.unit}`)
      .join(' | ')
  }

  // PDF Preview & Print functions
  const handleOpenPdfPreview = () => {
    const moduleLabelTh = expModule === 'all' ? 'ทุกประเภท' : (moduleLabels[expModule] || expModule)
    
    // Format dates for display
    const formatDateThai = (dStr) => {
      if (!dStr) return ''
      const parts = dStr.split('-')
      if (parts.length !== 3) return dStr
      const yr = Number(parts[0]) + 543
      return `${parts[2]}/${parts[1]}/${yr}`
    }

    const startStr = expStartDate ? formatDateThai(expStartDate) : 'เริ่มต้น'
    const endStr = expEndDate ? formatDateThai(expEndDate) : 'ปัจจุบัน'
    
    // Suggestions
    setPdfTitle(`รายงานสรุปข้อมูล ${moduleLabelTh} (ช่วง ${startStr} ถึง ${endStr})`)
    setPdfNotes('')
    setPdfHasUnsavedChanges(false)
    
    // Auto-select orientation
    const defaultColsCount = pdfVisibleColumns.length
    if (defaultColsCount > 5) {
      setPdfOrientation('landscape')
    } else {
      setPdfOrientation('portrait')
    }
    
    setIsPdfModalOpen(true)
  }

  const handleClosePdfModal = () => {
    if (pdfHasUnsavedChanges) {
      if (window.confirm('คุณต้องการยกเลิกและปิดหน้าต่างพิมพ์รายงานหรือไม่? (ชื่อหัวข้อและหมายเหตุที่ปรับแต่งจะสูญหาย)')) {
        setIsPdfModalOpen(false)
      }
    } else {
      setIsPdfModalOpen(false)
    }
  }

  // Esc key listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isPdfModalOpen) {
        handleClosePdfModal()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPdfModalOpen, pdfHasUnsavedChanges])

  // Get printed rows based on selection or filters
  const getPrintDataRows = useMemo(() => {
    if (expGroupBy === 'daily') {
      if (selectedExplorerRows.length > 0) {
        return explorerFilteredRows.filter(r => selectedExplorerRows.includes(r.id))
      }
      return explorerFilteredRows
    }
    return explorerGroupedRows
  }, [selectedExplorerRows, explorerFilteredRows, explorerGroupedRows, expGroupBy])

  // Function to build PDF iframe HTML content
  const getPrintHtmlContent = () => {
    const rows = getPrintDataRows
    const nowStr = new Date().toLocaleDateString('th-TH', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    }) + ' ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })

    const totalWeight = rows.reduce((sum, r) => sum + toNumber(expGroupBy === 'daily' ? r.weight_kg : r.weight), 0)
    const totalQty = rows.reduce((sum, r) => sum + toNumber(expGroupBy === 'daily' ? r.quantity : r.quantity), 0)
    const totalAmount = rows.reduce((sum, r) => sum + toNumber(r.amount), 0)

    const config = getExplorerConfig(expModule)
    const groupedConfig = getGroupedConfig(expModule)

    let tableHeadersHtml = ''
    if (expGroupBy === 'daily') {
      tableHeadersHtml = '<tr>' + config.headers.map((h, hIdx) => {
        const alignRight = config.cols[hIdx] === 'weight' || config.cols[hIdx] === 'qty' || config.cols[hIdx] === 'price' || config.cols[hIdx] === 'amount'
        return `<th class="${alignRight ? 'text-right' : ''}">${h}</th>`
      }).join('') + '</tr>'
    } else {
      tableHeadersHtml = '<tr>' + groupedConfig.headers.map((h, hIdx) => {
        const colType = groupedConfig.cols[hIdx]
        const alignRight = colType === 'weight' || colType === 'qty' || colType === 'amount'
        const alignCenter = colType === 'count'
        return `<th class="${alignRight ? 'text-right' : alignCenter ? 'text-center' : ''}">${h}</th>`
      }).join('') + '</tr>'
    }

    let tableRowsHtml = ''
    if (rows.length === 0) {
      const colsSpan = expGroupBy === 'daily' ? config.headers.length : groupedConfig.headers.length
      tableRowsHtml = `
        <tr>
          <td colspan="${colsSpan}" class="text-center" style="padding: 24px; color: #94a3b8;">ไม่พบข้อมูลรายการสำหรับจัดทำรายงาน</td>
        </tr>
      `
    } else {
      rows.forEach(r => {
        if (expGroupBy === 'daily') {
          const dateStr = new Date(r.entry_date).toLocaleDateString('th-TH', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric' 
          })
          tableRowsHtml += '<tr>' + config.cols.map(col => {
            if (col === 'date') return `<td>${dateStr}</td>`
            if (col === 'module') return `<td>${moduleLabels[r.module === 'cleaning_liquid' ? 'consumable' : r.module] || r.module}</td>`
            if (col === 'name') return `<td class="bold">${r.material_name || '-'}</td>`
            if (col === 'weight') return `<td class="text-right bold">${r.weight_kg !== null ? formatNumber(r.weight_kg, 1) : '-'}</td>`
            if (col === 'qty') return `<td class="text-right">${r.quantity !== null ? formatNumber(r.quantity, 0) : '-'}</td>`
            if (col === 'unit') return `<td>${r.unit || '-'}</td>`
            if (col === 'price') return `<td class="text-right">${r.unit_price !== null ? formatNumber(r.unit_price, 2) : '-'}</td>`
            if (col === 'amount') return `<td class="text-right bold" style="color: ${r.amount > 0 ? '#10b981' : '#1e293b'}">${r.amount !== null ? formatNumber(r.amount, 2) : '-'}</td>`
            if (col === 'notes') return `<td style="color: #475569; font-size: 11px;">${r.notes || '-'}</td>`
            if (col.startsWith('dynamic:')) {
              const key = col.slice('dynamic:'.length)
              return `<td class="text-right">${r[key] ?? r.metadata?.dynamic_fields?.[key] ?? '-'}</td>`
            }
            return '<td>-</td>'
          }).join('') + '</tr>'
        } else {
          // Grouped rows
          tableRowsHtml += '<tr>' + groupedConfig.cols.map(col => {
            if (col === 'period') return `<td class="bold" style="color: var(--primary-color);">${r.label}</td>`
            if (col === 'module') return `<td>${moduleLabels[r.module] || r.module}</td>`
            if (col === 'weight') return `<td class="text-right bold">${r.weight > 0 ? formatNumber(r.weight, 1) : '-'}</td>`
            if (col === 'qty') {
              if (config.type === 'count') {
                return `<td class="text-right bold" style="font-size: 11px;">${getGroupedItemQuantityTotals([r], false)}</td>`
              }
              return `<td class="text-right">${r.quantity > 0 ? formatNumber(r.quantity, 0) : '-'}</td>`
            }
            if (col === 'amount') return `<td class="text-right bold" style="color: ${r.amount > 0 ? '#10b981' : '#1e293b'}">${r.amount > 0 ? formatNumber(r.amount, 2) : '-'}</td>`
            if (col === 'count') return `<td class="text-center">${r.count} รายการ</td>`
            return '<td>-</td>'
          }).join('') + '</tr>'
        }
      })
    }

    // Totals footer
    let totalsRowHtml = ''
    if (expGroupBy === 'daily') {
      const firstNumericIdx = config.cols.findIndex(c => ['weight', 'qty', 'amount'].includes(c))
      const labelSpan = firstNumericIdx > 0 ? firstNumericIdx : 1
      
      totalsRowHtml = `<tr style="background: #f8fafc; font-weight: bold; border-top: 2px solid #94a3b8;"><td colspan="${labelSpan}" class="text-right bold">ยอดรวมทั้งสิ้น:</td>`
      
      // Map remaining columns
      let i = labelSpan
      while (i < config.cols.length) {
        const col = config.cols[i]
        if (col === 'weight') {
          totalsRowHtml += `<td class="text-right bold" style="color: #2563eb; font-size: 12.5px;">${formatNumber(totalWeight, 1)}</td>`
          i++
        } else if (col === 'qty') {
          if (config.type === 'count') {
            totalsRowHtml += `<td colspan="2" class="text-right bold" style="font-size: 11.5px; color: #2563eb; white-space: normal;">${getGroupedItemQuantityTotals(rows, true)}</td>`
          } else {
            totalsRowHtml += `<td class="text-right bold">${formatNumber(totalQty, 0)}</td><td class="bold">${rows[0]?.unit || ''}</td>`
          }
          i += 2 // Skip qty and unit
        } else if (col === 'price') {
          totalsRowHtml += '<td></td>'
          i++
        } else if (col === 'amount') {
          totalsRowHtml += `<td class="text-right bold" style="color: #16a34a; font-size: 12.5px;">${formatNumber(totalAmount, 2)}</td>`
          i++
        } else if (col === 'notes') {
          totalsRowHtml += '<td></td>'
          i++
        } else {
          totalsRowHtml += '<td></td>'
          i++
        }
      }
      totalsRowHtml += '</tr>'
    } else {
      // Grouped totals footer
      const labelSpan = groupedConfig.cols.findIndex(c => ['weight', 'qty', 'amount'].includes(c))
      totalsRowHtml = `<tr style="background: #f8fafc; font-weight: bold; border-top: 2px solid #94a3b8;"><td colspan="${labelSpan > 0 ? labelSpan : 1}" class="text-right bold">ยอดรวมทั้งสิ้น:</td>`
      
      let i = labelSpan > 0 ? labelSpan : 1
      while (i < groupedConfig.cols.length) {
        const col = groupedConfig.cols[i]
        if (col === 'weight') {
          totalsRowHtml += `<td class="text-right bold" style="color: #2563eb; font-size: 12.5px;">${formatNumber(totalWeight, 1)}</td>`
        } else if (col === 'qty') {
          if (config.type === 'count') {
            totalsRowHtml += `<td class="text-right bold" style="font-size: 11.5px; color: #2563eb; white-space: normal;">${getGroupedItemQuantityTotals(rows, false)}</td>`
          } else {
            totalsRowHtml += `<td class="text-right bold">${formatNumber(totalQty, 0)}</td>`
          }
        } else if (col === 'amount') {
          totalsRowHtml += `<td class="text-right bold" style="color: #16a34a; font-size: 12.5px;">${formatNumber(totalAmount, 2)}</td>`
        } else if (col === 'count') {
          totalsRowHtml += `<td class="text-center">${rows.reduce((sum, r) => sum + r.count, 0)} รายการ</td>`
        }
        i++
      }
      totalsRowHtml += '</tr>'
    }

    const moduleText = expModule === 'all' ? 'ทุกประเภท' : (moduleLabels[expModule] || expModule)

    return `
      <div style="padding: 10px; box-sizing: border-box;">
        <table class="header-table">
          <tr>
            <td class="logo-cell">
              <!-- Minimalist vector logo of Central Krabi -->
              <svg width="64" height="64" viewBox="0 0 100 100" style="fill: #0f766e;">
                <circle cx="50" cy="50" r="46" fill="none" stroke="#0f766e" stroke-width="4"/>
                <path d="M50 15 L80 35 L80 75 L50 60 L20 75 L20 35 Z" fill="#0f766e" opacity="0.15"/>
                <text x="50" y="44" font-family="'Sarabun', sans-serif" font-size="12" font-weight="bold" text-anchor="middle" fill="#0f766e">CENTRAL</text>
                <text x="50" y="60" font-family="'Sarabun', sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="#0f766e">KRABI</text>
                <path d="M35 72 L65 72" stroke="#0f766e" stroke-width="3" stroke-linecap="round"/>
              </svg>
            </td>
            <td class="title-cell">
              <h1>${pdfTitle}</h1>
              <p>ระบบจัดการขยะและสถิติทรัพยากร (CKAP System) - ศูนย์การค้าเซ็นทรัล กระบี่</p>
            </td>
          </tr>
        </table>

        <div class="meta-section">
          <div>
            <strong>ข้อมูลโมดูล:</strong> ${moduleText} | 
            <strong>ประเภทรายงาน:</strong> ${expGroupBy === 'daily' ? 'รายงานประวัติรายบันทึก' : `รายงานจัดกลุ่ม (${expGroupBy === 'weekly' ? 'รายสัปดาห์' : expGroupBy === 'monthly' ? 'รายเดือน' : 'รายปี'})`}
          </div>
          <div>
            <strong>ข้อมูล ณ วันที่และเวลาที่ออกรายงาน:</strong> ${nowStr}
          </div>
        </div>

        <table class="report-table">
          <thead>
            ${tableHeadersHtml}
          </thead>
          <tbody>
            ${tableRowsHtml}
            ${totalsRowHtml}
          </tbody>
        </table>

        ${pdfNotes ? `
          <div style="margin-top: 15px; padding: 10px 14px; background: #f8fafc; border-left: 4px solid #94a3b8; font-size: 12px; border-radius: 4px;">
            <strong style="display: block; margin-bottom: 4px; color: #475569;">หมายเหตุท้ายรายงาน:</strong>
            <div style="white-space: pre-wrap; color: #334155; line-height: 1.5;">${pdfNotes}</div>
          </div>
        ` : ''}

        <div class="footer-section" style="display: flex; justify-content: space-between;">
          <span>ออกรายงานโดยระบบ CKAP System - ศูนย์การค้าเซ็นทรัล กระบี่</span>
          <span>เอกสารฉบับนี้พิมพ์โดยระบบอิเล็กทรอนิกส์</span>
        </div>
      </div>
    `
  }

  const handlePrintPdf = () => {
    if (isPdfGenerating) return
    setIsPdfGenerating(true)
    
    // Create print iframe
    let iframe = document.getElementById('pdf-print-iframe')
    if (!iframe) {
      iframe = document.createElement('iframe')
      iframe.id = 'pdf-print-iframe'
      iframe.style.position = 'fixed'
      iframe.style.right = '0'
      iframe.style.bottom = '0'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = 'none'
      document.body.appendChild(iframe)
    }

    const doc = iframe.contentDocument || iframe.contentWindow.document
    doc.open()
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${pdfTitle.replace(/[\/\\:*?"<>|]/g, '_')}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
          <style>
            @media print {
              @page {
                size: A4 ${pdfOrientation};
                margin: 12mm;
              }
              body {
                margin: 0;
                padding: 0;
              }
            }
            body {
              font-family: 'Sarabun', sans-serif;
              color: #1e293b;
              font-size: 12px;
              line-height: 1.4;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .header-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 15px;
            }
            .logo-cell {
              width: 70px;
              vertical-align: middle;
            }
            .title-cell {
              vertical-align: middle;
              padding-left: 15px;
            }
            .title-cell h1 {
              font-size: 16px;
              margin: 0;
              color: #0f172a;
              font-weight: 700;
            }
            .title-cell p {
              margin: 3px 0 0 0;
              font-size: 11px;
              color: #64748b;
            }
            .meta-section {
              display: flex;
              justify-content: space-between;
              font-size: 11px;
              color: #475569;
              border-bottom: 2px solid #cbd5e1;
              padding-bottom: 6px;
              margin-bottom: 12px;
            }
            .report-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 15px;
            }
            .report-table th {
              background: #f8fafc;
              border: 1px solid #cbd5e1;
              padding: 6px 8px;
              font-weight: 700;
              text-align: left;
              font-size: 11.5px;
            }
            .report-table td {
              border: 1px solid #cbd5e1;
              padding: 5px 8px;
              font-size: 11px;
              vertical-align: top;
            }
            .report-table tr {
              break-inside: avoid;
              page-break-inside: avoid;
            }
            thead {
              display: table-header-group;
            }
            tfoot {
              display: table-footer-group;
            }
            .text-right {
              text-align: right;
            }
            .text-center {
              text-align: center;
            }
            .bold {
              font-weight: 700;
            }
            .footer-section {
              margin-top: 25px;
              font-size: 10px;
              color: #64748b;
              border-top: 1px solid #e2e8f0;
              padding-top: 8px;
            }
          </style>
        </head>
        <body>
          ${getPrintHtmlContent()}
        </body>
      </html>
    `)
    doc.close()

    // Wait for document to load and call print dialog
    setTimeout(() => {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
      setIsPdfGenerating(false)
    }, 600)
  }

  const handleDrillDown = (moduleCode, categoryCode, colType, colIndex) => {
    let startD = ''
    let endD = ''
    let label = ''

    const year = selectedCE
    const monthStr = selectedMonth
    const lastDay = new Date(year, Number(monthStr), 0).getDate()

    if (viewMode === 'monthly') {
      if (colType === 'week') {
        const weekRanges = [
          { start: 1, end: 7 },
          { start: 8, end: 14 },
          { start: 15, end: 21 },
          { start: 22, end: 27 },
          { start: 28, end: lastDay }
        ]
        const range = weekRanges[colIndex]
        startD = `${year}-${monthStr}-${String(range.start).padStart(2, '0')}`
        endD = `${year}-${monthStr}-${String(range.end).padStart(2, '0')}`
        label = `สัปดาห์ที่ ${colIndex + 1} (${range.start}-${range.end} ${MONTHS_OPTIONS.find(m=>m.value === monthStr)?.label})`
      } else {
        startD = `${year}-${monthStr}-01`
        endD = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`
        label = `ประจำเดือน ${MONTHS_OPTIONS.find(m=>m.value === monthStr)?.label} ${selectedBE}`
      }
    } else {
      if (colType === 'month') {
        const period = summaryMonths[colIndex]
        const [periodYear, periodMonth] = period.split('-').map(Number)
        const lastDayVal = new Date(periodYear, periodMonth, 0).getDate()
        startD = `${period}-01`
        endD = `${period}-${String(lastDayVal).padStart(2, '0')}`
        label = `เดือน ${summaryMonthLabels[colIndex]}`
      } else {
        startD = `${summaryMonths[0]}-01`
        const [endYear, endMonth] = summaryMonths.at(-1).split('-').map(Number)
        const rangeLastDay = new Date(endYear, endMonth, 0).getDate()
        endD = `${summaryMonths.at(-1)}-${String(rangeLastDay).padStart(2, '0')}`
        label = `ช่วงสะสม ${summaryMonthLabels[0]}–${summaryMonthLabels.at(-1)}`
      }
    }

    setDrillDownParams({
      module: moduleCode,
      category_code: categoryCode,
      startDate: startD,
      endDate: endD,
      label
    })
    setDrawerSearchQuery('')
    setIsDrawerOpen(true)
  }

  const handleOpenAddModalInDrawer = () => {
    if (!drillDownParams) return
    const mapped = drillDownParams.module === 'cleaning_liquid' ? 'consumable' : drillDownParams.module
    const cat = categories.find(c => (mapped === 'consumable' ? ['consumable', 'cleaning_liquid'].includes(c.module) : c.module === mapped) && (drillDownParams.category_code ? c.code === drillDownParams.category_code : true))
    
    setForm({
      id: '',
      module: mapped,
      category_code: cat ? cat.code : '',
      entry_date: drillDownParams.startDate,
      material_name: cat ? cat.name_th : '',
      weight_kg: '',
      quantity: '',
      unit: cat ? cat.unit : 'kg',
      unit_price: '',
      amount: '',
      notes: ''
    })
    setModalMode('add')
    setIsModalOpen(true)
  }

  const handleOpenEditModalInDrawer = (row) => {
    setForm({
      id: row.id,
      module: row.module,
      category_code: row.category_code || '',
      entry_date: row.entry_date,
      material_name: row.material_name || '',
      weight_kg: row.weight_kg !== null ? String(row.weight_kg) : '',
      quantity: row.quantity !== null ? String(row.quantity) : '',
      unit: row.unit || 'kg',
      unit_price: row.unit_price !== null ? String(row.unit_price) : '',
      amount: row.amount !== null ? String(row.amount) : '',
      notes: row.notes || ''
    })
    setModalMode('edit')
    setIsModalOpen(true)
  }

  const handleDeleteInDrawer = (id) => {
    if (window.confirm('คุณต้องการลบรายการข้อมูลนี้ใช่หรือไม่?')) {
      deleteMutation.mutate(id)
    }
  }

  const handleModalSubmit = (e) => {
    e.preventDefault()
    const payload = {
      ...form,
      weight_kg: form.weight_kg !== '' ? toNumber(form.weight_kg) : null,
      quantity: form.quantity !== '' ? toNumber(form.quantity) : null,
      amount: form.amount !== '' ? toNumber(form.amount) : null,
      unit_price: form.unit_price !== '' ? toNumber(form.unit_price) : null
    }
    saveMutation.mutate(payload)
  }

  const drawerRows = useMemo(() => {
    if (!drillDownParams) return []
    const { module, category_code, startDate, endDate } = drillDownParams
    
    let filtered = entries.filter(e => {
      const d = e.entry_date
      const inDateRange = d >= startDate && d <= endDate
      if (!inDateRange) return false
      
      const moduleMatches = module === 'consumable'
        ? ['consumable', 'cleaning_liquid'].includes(e.module)
        : e.module === module
      if (!moduleMatches) return false
      
      if (category_code && e.category_code !== category_code) return false
      
      return true
    })

    if (drawerSearchQuery.trim()) {
      const q = drawerSearchQuery.toLowerCase()
      filtered = filtered.filter(e => 
        (e.material_name && e.material_name.toLowerCase().includes(q)) ||
        (e.notes && e.notes.toLowerCase().includes(q))
      )
    }

    return [...filtered].sort((a, b) => b.entry_date.localeCompare(a.entry_date))
  }, [entries, drillDownParams, drawerSearchQuery])

  const handleExportCSV = () => {
    let csvContent = '\uFEFF' // UTF-8 BOM
    const appendTable = (title, headers, rowsData) => {
      csvContent += `${title}\n`
      csvContent += `${headers.join(',')}\n`
      rowsData.forEach(r => csvContent += `${r.join(',')}\n`)
      csvContent += '\n'
    }

    if (viewMode === 'monthly') {
      appendTable(
        `1. ปริมาณการใช้กระดาษทิชชู่ประจำสัปดาห์ (${MONTHS_OPTIONS.find(m=>m.value===selectedMonth)?.label} ${selectedBE})`,
        ['ประเภททิชชู่', 'จำนวนรวม', 'Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'หน่วย'],
        tissueData.rows.map(r => [r.label, r.total, ...r.weeks, r.unit])
      )
      appendTable(
        `2. ปริมาณถุงขยะแยกขนาด (${MONTHS_OPTIONS.find(m=>m.value===selectedMonth)?.label} ${selectedBE})`,
        ['ขนาดถุงดำ', 'จำนวนรวมประจำเดือน', 'หน่วย'],
        garbageBagsData.rows.map(r => [r.label, r.total, r.unit])
      )
      appendTable(
        `3. ปริมาณการใช้ของใช้สิ้นเปลือง (${MONTHS_OPTIONS.find(m=>m.value===selectedMonth)?.label} ${selectedBE})`,
        ['น้ำยาต่างๆ', 'จำนวนรวมประจำเดือน', 'หน่วย'],
        consumablesData.rows.map(r => [r.label, r.total, r.unit])
      )
      appendTable(
        `4. ปริมาณขยะประจำสัปดาห์ (${MONTHS_OPTIONS.find(m=>m.value===selectedMonth)?.label} ${selectedBE})`,
        ['ประเภทขยะ', 'น้ำหนักรวม (kg)', 'Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'],
        monthlyWasteData.rows.map(r => [r.label, r.total, ...r.weeks])
      )
      appendTable(
        `5. ปริมาณอาหารสัตว์แปรรูปประจำเดือน (${MONTHS_OPTIONS.find(m=>m.value===selectedMonth)?.label} ${selectedBE})`,
        ['ประเภทอาหารสัตว์', ...feedReportMonthLabels, 'รวมประจำเดือน (kg)'],
        animalFeedData.rows.map(r => [r.label, ...r.monthsValues, r.total])
      )
      appendTable(
        `6. รายละเอียดการขายเศษวัสดุรีไซเคิลประจำเดือน (${MONTHS_OPTIONS.find(m=>m.value===selectedMonth)?.label} ${selectedBE})`,
        ['รายการ', 'จำนวน (กก.)', 'ราคาหน่วย (บาท)', 'จำนวนเงิน (บาท)'],
        monthlyRecycleSaleData.rows.map(r => [r.name, r.weight, r.avgPrice.toFixed(2), r.amount])
      )
    } else {
      appendTable(
        `1. ปริมาณการใช้กระดาษทิชชู่สะสม (${summaryMonthLabels[0]}–${summaryMonthLabels.at(-1)})`,
        ['ประเภททิชชู่', ...summaryMonthLabels, 'รวมสะสม', 'หน่วย'],
        yearlyTissueData.rows.map(r => [r.label, ...r.monthsValues, r.total, r.unit])
      )
      appendTable(
        `2. ปริมาณถุงขยะแยกขนาดรายเดือน (พ.ศ. ${selectedBE})`,
        ['ขนาดถุงดำ', ...summaryMonthLabels, 'รวมสะสม', 'หน่วย'],
        yearlyGarbageBagsData.rows.map(r => [r.label, ...r.monthsValues, r.total, r.unit])
      )
      appendTable(
        `3. ปริมาณของใช้สิ้นเปลืองรายเดือน (พ.ศ. ${selectedBE})`,
        ['น้ำยาต่างๆ', ...summaryMonthLabels, 'รวมสะสม', 'หน่วย'],
        yearlyConsumablesData.rows.map(r => [r.label, ...r.monthsValues, r.total, r.unit])
      )
      appendTable(
        `4. ปริมาณขยะเปรียบเทียบรายเดือน (พ.ศ. ${selectedBE})`,
        ['ประเภทขยะ', ...summaryMonthLabels, 'รวมสะสม (kg)'],
        multiMonthWasteData.rows.map(r => [r.label, ...r.monthsValues, r.total])
      )
      appendTable(
        `5. ปริมาณอาหารสัตว์แปรรูปรายเดือน (พ.ศ. ${selectedBE})`,
        ['ประเภทอาหารสัตว์', ...summaryMonthLabels, 'รวมสะสม (kg)'],
        animalFeedData.rows.map(r => [r.label, ...r.monthsValues, r.total])
      )
      appendTable(
        `6. ยอดขายเศษวัสดุรายเดือน (พ.ศ. ${selectedBE})`,
        ['ตัวชี้วัดรายรับ', ...summaryMonthLabels, 'รวมสะสม (บาท)'],
        accumulatedRecycleData.rows.map(r => [r.label, ...r.monthsValues, r.total])
      )
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', `CKAP_Summary_Report_${selectedBE}_${viewMode}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // ==========================================
  // SECTION 1: กระดาษทิชชู่ (Tissue Paper)
  // ==========================================
  const tissueData = useMemo(() => {
    const targetMonthStr = `${selectedCE}-${selectedMonth}`
    const monthEntries = entries.filter(e => e.module === 'tissue' && e.period_month.startsWith(targetMonthStr))
    
    const types = [
      { code: 'tissue_roll', label: 'ม้วน', unit: 'ม้วน' },
      { code: 'tissue_hand', label: 'มือ', unit: 'แพ็ค' },
      { code: 'tissue_popup', label: 'ป๊อปอัพ', unit: 'แพ็ค' }
    ]
    
    const rows = types.map(t => {
      const weeks = Array(5).fill(0)
      let total = 0
      
      monthEntries.forEach(e => {
        if (e.category_code === t.code) {
          const day = getDayFromDate(e.entry_date)
          const wIdx = getWeekIndex(day)
          const qty = Number(e.quantity || 0)
          weeks[wIdx] += qty
          total += qty
        }
      })
      
      return { ...t, weeks, total }
    })
    
    // X-axis: Weeks
    const chartData = ['Week 1', 'Week 2', 'Week 3', 'Week 4', '28-สิ้นเดือน'].map((wName, wIdx) => {
      const point = { name: wName }
      rows.forEach(r => {
        point[r.label] = r.weeks[wIdx]
        point[`${r.label}_unit`] = r.unit
      })
      return point
    })
    
    return { rows, chartData }
  }, [entries, selectedCE, selectedMonth])

  const yearlyTissueData = useMemo(() => {
    const months = summaryMonths.map(() => ({ roll: 0, hand: 0, popup: 0 }))
    
    entries.forEach(e => {
      if (e.module !== 'tissue') return
      const mIdx = summaryMonthIndex(e)
      if (mIdx < 0) return
      
      const qty = Number(e.quantity || 0)
      if (e.category_code === 'tissue_roll') months[mIdx].roll += qty
      else if (e.category_code === 'tissue_hand') months[mIdx].hand += qty
      else if (e.category_code === 'tissue_popup') months[mIdx].popup += qty
    })
    
    const types = [
      { key: 'roll', label: 'ม้วน', unit: 'ม้วน' },
      { key: 'hand', label: 'มือ', unit: 'แพ็ค' },
      { key: 'popup', label: 'ป๊อปอัพ', unit: 'แพ็ค' }
    ]
    
    const rows = types.map(t => {
      const monthsValues = months.map(m => m[t.key])
      const total = monthsValues.reduce((sum, v) => sum + v, 0)
      return { ...t, monthsValues, total }
    })
    
    const chartData = summaryMonthLabels.map((name, idx) => ({
      name,
      'ม้วน': months[idx].roll,
      'มือ': months[idx].hand,
      'ป๊อปอัพ': months[idx].popup
    }))
    
    return { rows, chartData }
  }, [entries, summaryMonths, summaryMonthLabels])

  // ==========================================
  // SECTION 2: ถุงดำ / ถุงขยะ (Garbage Bags)
  // ==========================================
  const garbageBagsData = useMemo(() => {
    const targetMonthStr = `${selectedCE}-${selectedMonth}`
    const monthEntries = entries.filter(e => e.module === 'black_bag' && e.period_month.startsWith(targetMonthStr))
    
    // Correct mapping: large -> 30x40, medium -> 28x36, small -> 18x20
    const types = BAG_TYPES
    
    const rows = types.map(t => {
      const weeks = Array(5).fill(0)
      let total = 0
      
      monthEntries.forEach(e => {
        if (normalizeBagCode(e.category_code) === t.code) {
          const day = getDayFromDate(e.entry_date)
          const wIdx = getWeekIndex(day)
          const qty = Number(e.quantity || 0)
          weeks[wIdx] += qty
          total += qty
        }
      })
      
      return { ...t, weeks, total }
    })
    
    // X-axis: Weeks
    const chartData = ['Week 1', 'Week 2', 'Week 3', 'Week 4', '28-สิ้นเดือน'].map((wName, wIdx) => {
      const point = { name: wName }
      rows.forEach(r => {
        point[r.label] = r.weeks[wIdx]
        point[`${r.label}_unit`] = r.unit
      })
      return point
    })
    
    return { rows, chartData }
  }, [entries, selectedCE, selectedMonth])

  const yearlyGarbageBagsData = useMemo(() => {
    const months = summaryMonths.map(() => ({ small: 0, medium: 0, large: 0 }))
    
    entries.forEach(e => {
      if (e.module !== 'black_bag') return
      const mIdx = summaryMonthIndex(e)
      if (mIdx < 0) return
      
      const qty = Number(e.quantity || 0)
      const categoryCode = normalizeBagCode(e.category_code)
      if (categoryCode === 'black_bag_large') months[mIdx].large += qty
      else if (categoryCode === 'black_bag_medium') months[mIdx].medium += qty
      else if (categoryCode === 'black_bag_small') months[mIdx].small += qty
    })
    
    const types = BAG_TYPES
    
    const rows = types.map(t => {
      const monthsValues = months.map(m => m[t.key])
      const total = monthsValues.reduce((sum, v) => sum + v, 0)
      return { ...t, monthsValues, total }
    })
    
    const chartData = summaryMonthLabels.map((name, idx) => ({
      name,
      'ถุงใหญ่ 30x40 สีดำ': months[idx].large,
      'ถุงกลาง 28x36 สีชา': months[idx].medium,
      'ถุงเล็ก 18x20 สีดำ': months[idx].small
    }))
    
    return { rows, chartData, types }
  }, [entries, summaryMonths, summaryMonthLabels])

  // ==========================================
  // SECTION 3: น้ำยา / Cleaning Liquid (Consumables)
  // ==========================================
  const consumablesData = useMemo(() => {
    const targetMonthStr = `${selectedCE}-${selectedMonth}`
    const monthEntries = entries.filter(e => ['consumable', 'cleaning_liquid'].includes(e.module) && e.period_month.startsWith(targetMonthStr))
    
    const consumableCats = categories.filter(c => ['consumable', 'cleaning_liquid'].includes(c.module))
    
    const types = consumableCats.map(c => ({
      code: c.code,
      label: c.name_th || c.name || c.code,
      unit: 'แกลลอน',
      color: c.color || c.color_hex || '#8b5cf6'
    }))
    
    if (types.length === 0) {
      types.push({ code: 'FOAM_SOAP', label: 'สบู่โฟม', unit: 'แกลลอน', color: '#06b6d4' })
      types.push({ code: 'TOILET_LID_CLEANER', label: 'น้ำยาเช็ดฝาโถ', unit: 'แกลลอน', color: '#ec4899' })
    }
    
    const rows = types.map(t => {
      const weeks = Array(5).fill(0)
      let total = 0
      
      monthEntries.forEach(e => {
        if (e.category_code === t.code) {
          const day = getDayFromDate(e.entry_date)
          const wIdx = getWeekIndex(day)
          const qty = Number(e.quantity || 0)
          weeks[wIdx] += qty
          total += qty
        }
      })
      
      return { ...t, weeks, total }
    })
    
    // X-axis: Weeks
    const chartData = ['Week 1', 'Week 2', 'Week 3', 'Week 4', '28-สิ้นเดือน'].map((wName, wIdx) => {
      const point = { name: wName }
      rows.forEach(r => {
        point[r.label] = r.weeks[wIdx]
        point[`${r.label}_unit`] = r.unit
      })
      return point
    })
    
    return { rows, chartData }
  }, [entries, categories, selectedCE, selectedMonth])

  const yearlyConsumablesData = useMemo(() => {
    const consumableCats = categories.filter(c => ['consumable', 'cleaning_liquid'].includes(c.module))
    const types = consumableCats.map(c => ({
      code: c.code,
      label: c.name_th || c.name || c.code,
      unit: 'แกลลอน',
      color: c.color || c.color_hex || '#8b5cf6'
    }))
    
    if (types.length === 0) {
      types.push({ code: 'FOAM_SOAP', label: 'สบู่โฟม', unit: 'แกลลอน', color: '#06b6d4' })
      types.push({ code: 'TOILET_LID_CLEANER', label: 'น้ำยาเช็ดฝาโถ', unit: 'แกลลอน', color: '#ec4899' })
    }
    
    const typeMonthValues = {}
    types.forEach(t => {
      typeMonthValues[t.code] = summaryMonths.map(() => 0)
    })
    
    entries.forEach(e => {
      if (!['consumable', 'cleaning_liquid'].includes(e.module)) return
      const mIdx = summaryMonthIndex(e)
      if (mIdx < 0) return
      
      const qty = Number(e.quantity || 0)
      if (typeMonthValues[e.category_code] !== undefined) {
        typeMonthValues[e.category_code][mIdx] += qty
      }
    })
    
    const rows = types.map(t => {
      const monthsValues = typeMonthValues[t.code] || summaryMonths.map(() => 0)
      const total = monthsValues.reduce((sum, v) => sum + v, 0)
      return { ...t, monthsValues, total }
    })
    
    const chartData = summaryMonthLabels.map((name, idx) => {
      const dataPoint = { name }
      types.forEach(t => {
        dataPoint[t.label] = (typeMonthValues[t.code] || summaryMonths.map(() => 0))[idx]
      })
      return dataPoint
    })
    
    return { rows, chartData, types }
  }, [entries, categories, summaryMonths, summaryMonthLabels])

  // ==========================================
  // SECTION 4: ปริมาณขยะประจำเดือน
  // ==========================================
  const monthlyWasteData = useMemo(() => {
    const targetMonthStr = `${selectedCE}-${selectedMonth}`
    const monthEntries = entries.filter(e => e.period_month.startsWith(targetMonthStr))
    
    let wet = 0
    let recycle = 0
    let rdf = 0
    
    monthEntries.forEach(e => {
      const w = monthlyEntryValue(e)
      if (e.module === 'rdf') rdf += w
      else if (e.module === 'recycle') recycle += w
      else if (e.module === 'dog_food' || e.module === 'pig_feed') wet += w
    })
    
    const total = wet + recycle + rdf
    
    const rows = [
      { name: 'ขยะเปียก (เศษอาหารสัตว์)', value: wet, unit: 'kg' },
      { name: 'ขยะรีไซเคิล', value: recycle, unit: 'kg' },
      { name: 'ขยะ RDF (ขยะเชื้อเพลิง)', value: rdf, unit: 'kg' },
      { name: 'ยอดรวมทั้งหมด', value: total, unit: 'kg', isTotal: true }
    ]
    
    // Adjusted colors matching the user-uploaded image:
    // Wet = Green (#388e3c), Recycle = Yellow (#ffd600), RDF = Black (#000000), Total = Blue (#38b6ff)
    const chartData = [
      { name: 'ขยะเปียก', value: wet, fill: '#388e3c' },
      { name: 'Recycle', value: recycle, fill: '#ffd600' },
      { name: 'ขยะ RDF', value: rdf, fill: '#000000' },
      { name: 'Total', value: total, fill: '#38b6ff' }
    ]
    
    return { rows, chartData }
  }, [entries, selectedCE, selectedMonth])

  // ==========================================
  // SECTION 5: เปรียบเทียบปริมาณขยะหลายเดือน (kg & ton)
  // ==========================================
  const multiMonthWasteData = useMemo(() => {
    const months = summaryMonths.map(() => ({
      rdf: 0,
      recycle: 0,
      wet: 0,
      total: 0
    }))
    
    entries.forEach(e => {
      const mIdx = summaryMonthIndex(e)
      if (mIdx < 0) return
      
      const w = monthlyEntryValue(e)
      if (e.module === 'rdf') {
        months[mIdx].rdf += w
      } else if (e.module === 'recycle') {
        months[mIdx].recycle += w
      } else if (e.module === 'dog_food' || e.module === 'pig_feed') {
        months[mIdx].wet += w
      }
    })
    
    months.forEach(m => {
      m.total = m.rdf + m.recycle + m.wet
    })
    
    const rowTypes = [
      { key: 'rdf', label: 'ขยะ RDF', unit: 'kg', scale: 1 },
      { key: 'rdf', label: 'ขยะ RDF', unit: 'ตัน (ton)', scale: 1000 },
      { key: 'recycle', label: 'ขยะรีไซเคิล', unit: 'kg', scale: 1 },
      { key: 'recycle', label: 'ขยะรีไซเคิล', unit: 'ตัน (ton)', scale: 1000 },
      { key: 'wet', label: 'ขยะเปียก (อาหารสัตว์)', unit: 'kg', scale: 1 },
      { key: 'wet', label: 'ขยะเปียก (อาหารสัตว์)', unit: 'ตัน (ton)', scale: 1000 },
      { key: 'total', label: 'ขยะรวมทั้งหมด', unit: 'kg', scale: 1, isTotal: true },
      { key: 'total', label: 'ขยะรวมทั้งหมด', unit: 'ตัน (ton)', scale: 1000, isTotal: true }
    ]
    
    const rows = rowTypes.map(rt => {
      const monthsValues = months.map(m => m[rt.key] / rt.scale)
      const total = monthsValues.reduce((sum, v) => sum + v, 0)
      return { ...rt, monthsValues, total }
    })
    
    const chartData = summaryMonthLabels.map((name, idx) => ({
      name,
      'ขยะ RDF': months[idx].rdf,
      'ขยะรีไซเคิล': months[idx].recycle,
      'ขยะเปียก': months[idx].wet,
      'ยอดรวมทั้งหมด': months[idx].total
    }))
    
    return { rows, chartData }
  }, [entries, summaryMonths, summaryMonthLabels])

  // ==========================================
  // SECTION 6: อาหารสัตว์
  // ==========================================
  const animalFeedData = useMemo(() => {
    const months = feedReportMonths.map(() => ({ pig: 0, dog: 0 }))
    
    entries.forEach(e => {
      const mIdx = feedReportMonths.indexOf(String(e.period_month || e.entry_date || '').slice(0, 7))
      if (mIdx < 0) return
      
      const w = monthlyEntryValue(e)
      if (e.module === 'pig_feed') {
        months[mIdx].pig += w
      } else if (e.module === 'dog_food') {
        months[mIdx].dog += w
      }
    })
    
    const rowTypes = [
      { key: 'pig', label: 'อาหารหมู', unit: 'kg' },
      { key: 'dog', label: 'อาหารสุนัข/อาหารหมา', unit: 'kg' }
    ]
    
    const rows = rowTypes.map(rt => {
      const monthsValues = months.map(m => m[rt.key])
      const total = monthsValues.reduce((sum, v) => sum + v, 0)
      return { ...rt, monthsValues, total }
    })
    
    const chartData = feedReportMonthLabels.map((name, idx) => ({
      name,
      'อาหารหมู': months[idx].pig,
      'อาหารสุนัข': months[idx].dog
    }))
    
    return { rows, chartData }
  }, [entries, feedReportMonths, feedReportMonthLabels])

  // ==========================================
  // SECTION 7: รายการขายเศษวัสดุประจำเดือน (High-Fidelity)
  // ==========================================
  const monthlyRecycleSaleData = useMemo(() => {
    const targetMonthStr = `${selectedCE}-${selectedMonth}`
    const monthEntries = entries.filter(e => e.module === 'recycle' && String(e.period_month || '').slice(0, 7) === targetMonthStr)
    
    const recycleCategories = new Map(
      categories.filter(category => category.module === 'recycle').map(category => [category.code, category])
    )

    // category_code is the stable identity. material_name is only a fallback
    // for legacy records that predate Master Data codes.
    const groups = new Map()
    monthEntries.forEach(e => {
      const categoryCode = String(e.category_code || '').trim()
      const legacyName = String(e.material_name || '').trim()
      const key = categoryCode || `legacy:${legacyName}`
      if (!categoryCode && !legacyName) return

      const category = recycleCategories.get(categoryCode)
      const current = groups.get(key) || {
        categoryCode,
        name: category?.name_th || legacyName || categoryCode,
        fill: category?.color || '#64748b',
        weight: 0,
        amount: 0
      }
      current.weight += Number(e.weight_kg || 0)
      current.amount += Number(e.amount || 0)
      groups.set(key, current)
    })

    // Only render records that exist for this month; never invent zero rows.
    const rows = Array.from(groups.values()).map(group => ({
      categoryCode: group.categoryCode,
      name: group.name,
      weight: group.weight,
      avgPrice: group.weight > 0 ? group.amount / group.weight : 0,
      amount: group.amount,
      fill: group.fill
    }))
    
    const totalWeight = rows.reduce((sum, r) => sum + r.weight, 0)
    const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0)
    
    // Overall average price per kg for all recyclables sold
    const overallAvgPrice = totalWeight > 0 ? totalAmount / totalWeight : 0
    
    // Each material keeps its Master Data color. The total is shown in the
    // summary table above instead of being mixed in as another material bar.
    const chartData = rows.map(r => ({
      name: r.name,
      'จำนวนเงิน (บาท)': r.amount,
      fill: r.fill
    }))
    
    return { rows, totalWeight, totalAmount, overallAvgPrice, chartData }
  }, [entries, categories, selectedCE, selectedMonth])

  // ==========================================
  // SECTION 8: รายการขายเศษวัสดุสะสม (amount)
  // ==========================================
  const accumulatedRecycleData = useMemo(() => {
    const months = summaryMonths.map(() => 0)
    
    entries.forEach(e => {
      if (e.module !== 'recycle') return
      const mIdx = summaryMonthIndex(e)
      if (mIdx < 0) return
      
      months[mIdx] += Number(e.amount || 0)
    })
    
    const rows = [
      {
        label: 'รายได้จากการขายเศษวัสดุ (บาท)',
        monthsValues: months,
        total: months.reduce((sum, v) => sum + v, 0),
        unit: 'บาท'
      }
    ]
    
    const chartData = summaryMonthLabels.map((name, idx) => ({
      name,
      'รายได้ (บาท)': months[idx]
    }))
    
    return { rows, chartData }
  }, [entries, summaryMonths, summaryMonthLabels])

  // Custom tooltips that display the correct unit dynamically
  const weeklyTooltipFormatter = (value, name, props) => {
    const item = props.payload
    const unit = item[`${name}_unit`] || ''
    return [`${value.toLocaleString()} ${unit}`, name]
  }

  const yearlyTooltipFormatter = (value, name) => {
    const unitMap = {
      'ม้วน': 'ม้วน', 'มือ': 'แผ่น', 'ป๊อปอัพ': 'แพ็ค',
      'ถุงใหญ่ 30x40 สีดำ': 'ใบ', 'ถุงกลาง 28x36 สีชา': 'ใบ', 'ถุงเล็ก 18x20 สีดำ': 'ใบ',
      'สบู่โฟม': 'แกลลอน', 'น้ำยาเช็ดฝาโถ': 'ขวด'
    }
    return [`${value.toLocaleString()} ${unitMap[name] || ''}`, name]
  }

  return (
    <section className="page" style={{ paddingBottom: '40px' }}>
      {/* ส่วนเลือกแท็บหลัก */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', marginBottom: '24px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('ledger')}
          style={{
            padding: '12px 24px',
            fontSize: '15px',
            fontWeight: 'bold',
            color: activeTab === 'ledger' ? 'var(--primary-color)' : '#64748b',
            border: 'none',
            borderBottom: activeTab === 'ledger' ? '3px solid var(--primary-color)' : '3px solid transparent',
            background: 'transparent',
            cursor: 'pointer',
            transition: 'all 0.2s',
            marginBottom: '-2px'
          }}
        >
          สถานีสรุปข้อมูล (Station Summary)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('explorer')}
          style={{
            padding: '12px 24px',
            fontSize: '15px',
            fontWeight: 'bold',
            color: activeTab === 'explorer' ? 'var(--primary-color)' : '#64748b',
            border: 'none',
            borderBottom: activeTab === 'explorer' ? '3px solid var(--primary-color)' : '3px solid transparent',
            background: 'transparent',
            cursor: 'pointer',
            transition: 'all 0.2s',
            marginBottom: '-2px'
          }}
        >
          ค้นหาและวิเคราะห์ย่อย (Search & Explorer)
        </button>
      </div>

      <style>{`
        .clickable-cell {
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .clickable-cell:hover {
          background-color: #e2e8f0 !important;
          color: var(--primary-color) !important;
          text-decoration: underline;
        }
      `}</style>

      {isLoading ? (
        <div className="alert" style={{ textAlign: 'center', padding: '40px' }}>
          <span>กำลังโหลดข้อมูลและสรุปตัวเลขทางสถิติ...</span>
        </div>
      ) : activeTab === 'ledger' ? (
        <>
          {/* ส่วนควบคุมและกรองข้อมูลหลัก */}
          <div className="page-header" style={{ marginBottom: '24px' }}>
            <div>
              <p className="eyebrow">Data Ledger & Analysis</p>
              <h2>สถานีสรุปข้อมูล</h2>
              <p className="muted">สรุปรายสัปดาห์สำหรับข้อมูลรายวัน และสรุปรายเดือนตามช่วง 1–12 เดือนสำหรับข้อมูลทุกประเภท</p>
            </div>
            
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* ปุ่มสลับโหมดรายเดือน / รายปี */}
              <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '4px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <button 
                  type="button"
                  onClick={() => changeViewMode('monthly')}
                  className={viewMode === 'monthly' ? 'btn primary small' : 'btn ghost small'}
                  style={{ borderRadius: '8px', fontSize: '12.5px', padding: '6px 14px', border: 'none', cursor: 'pointer' }}
                >
                  รายเดือน (สรุปรายสัปดาห์)
                </button>
                <button 
                  type="button"
                  onClick={() => changeViewMode('yearly')}
                  className={viewMode === 'yearly' ? 'btn primary small' : 'btn ghost small'}
                  style={{ borderRadius: '8px', fontSize: '12.5px', padding: '6px 14px', border: 'none', cursor: 'pointer' }}
                >
                  รายปีสะสม (สรุปรายเดือน)
                </button>
              </div>

              {viewMode === 'monthly' && <label className="field small-field">
                <span>เลือกปี พ.ศ.</span>
                <select 
                  value={selectedBE} 
                  onChange={e => setSelectedBE(Number(e.target.value))}
                  style={{ padding: '6px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontWeight: 'bold' }}
                >
                  <option value={2569}>พ.ศ. 2569</option>
                  <option value={2568}>พ.ศ. 2568</option>
                  <option value={2567}>พ.ศ. 2567</option>
                </select>
              </label>}

              {viewMode === 'monthly' && (
                <label className="field small-field">
                  <span>เลือกเดือนประมวลผล (รายสัปดาห์)</span>
                  <select 
                    value={selectedMonth} 
                    onChange={e => setSelectedMonth(e.target.value)}
                    style={{ padding: '6px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontWeight: 'bold' }}
                  >
                    <option value="">ยังไม่มีข้อมูล กรุณาเลือกเดือน</option>
                    {MONTHS_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
              )}
              {viewMode === 'yearly' && <>
                <label className="field small-field ledger-range-control">
                  <span><strong>ช่วงเวลาแสดงผล</strong><b>{summaryMonthsCount} เดือน</b></span>
                  <input type="range" min="1" max="12" value={summaryMonthsCount} onChange={e=>setSummaryMonthsCount(Number(e.target.value))}/>
                  <span className="range-end-labels"><small>1 เดือน</small><small>12 เดือน</small></span>
                </label>
                <label className="field small-field"><span>เดือนเริ่มต้น</span><MonthPicker value={summaryStartMonth} onChange={setSummaryStartMonth}/></label>
                <div className="chart-mode-badge" aria-live="polite">
                  <BarChart3 size={15} />
                  {summaryMonthsCount <= 4 ? 'กราฟแท่ง · เปรียบเทียบ 1–4 เดือน' : 'กราฟเส้น · ดูแนวโน้มมากกว่า 4 เดือน'}
                </div>
              </>}
            </div>
          </div>

          {viewMode === 'yearly' && summaryMonths.length === 0 ? (
            <div className="card empty-state" style={{ padding: '40px 24px', textAlign: 'center' }}>
              <BarChart3 size={34} style={{ color: '#94a3b8', marginBottom: '10px' }} />
              <h3 style={{ margin: '0 0 6px', color: '#334155' }}>ยังไม่มีข้อมูลในช่วงเดือนที่เลือก</h3>
              <p style={{ margin: 0, color: '#64748b' }}>ระบบจะไม่สร้างตารางหรือกราฟจนกว่าจะมีการบันทึกข้อมูลจริงอย่างน้อยหนึ่งเดือน</p>
            </div>
          ) : (
          <div className="ledger-report-grid">
          
          {/* ==========================================
              SECTION 1: กระดาษทิชชู่
              ========================================== */}
          <div data-report-section="tissue" className={`card ledger-analysis-card ${expandedSection === 'tissue' ? 'ledger-section-modal' : ''}`} style={{ gridColumn: getSectionGridColumn('tissue'), ...getSectionCardStyle('tissue'), padding: '24px', borderRadius: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ClipboardList size={22} style={{ color: 'var(--primary-color)' }} />
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>
                    1. ปริมาณการใช้กระดาษทิชชู่ {viewMode === 'monthly' ? `ประจำสัปดาห์ (${MONTHS_OPTIONS.find(m => m.value === selectedMonth)?.label})` : `สะสมรายเดือน (${summaryMonthLabels[0]}–${summaryMonthLabels.at(-1)})`}
                  </h3>
                  <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>เปรียบเทียบประเภทกระดาษทิชชู่ม้วน, ทิชชู่มือ และป๊อปอัพ แยกตามรายละเอียดประเภทปริมาณเบิกใช้</p>
                </div>
              </div>
              {renderSectionControls('tissue')}
            </div>

            <div className="ledger-analysis-content" style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr',
              gap: '24px',
              transition: 'all 0.3s ease'
            }}>
              <div className="table-container" style={{ overflowX: 'auto', order: 2 }}>
                {viewMode === 'monthly' ? (
                  <table className="table" style={{ fontSize: '13px', width: '100%' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th>ประเภททิชชู่</th>
                        <th style={{ textAlign: 'right' }}>จำนวนรวม</th>
                        <th style={{ textAlign: 'right' }}>Week 1 (1-7)</th>
                        <th style={{ textAlign: 'right' }}>Week 2 (8-14)</th>
                        <th style={{ textAlign: 'right' }}>Week 3 (15-21)</th>
                        <th style={{ textAlign: 'right' }}>Week 4 (22-27)</th>
                        <th style={{ textAlign: 'right' }}>28-สิ้นเดือน</th>
                        <th>หน่วย</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tissueData.rows.map(row => (
                        <tr 
                          key={row.code}
                          style={{
                            background: selectedTissueRow === row.code ? '#f0f9ff' : 'transparent',
                            outline: selectedTissueRow === row.code ? '1.5px solid #0284c7' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <td 
                            style={{ fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', height: '36px' }}
                            onClick={() => {
                              if (!showTissueChart) setShowTissueChart(true)
                              setSelectedTissueRow(selectedTissueRow === row.code ? null : row.code)
                            }}
                            className="clickable-cell"
                          >
                            <span style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              background: row.code === 'tissue_roll' ? '#3b82f6' : row.code === 'tissue_hand' ? '#10b981' : '#f59e0b',
                              display: 'inline-block'
                            }}></span>
                            {row.label}
                          </td>
                          <td 
                            className="clickable-cell"
                            style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--primary-color)' }}
                            onClick={() => handleDrillDown('tissue', row.code, 'total', null)}
                          >
                            {formatNumber(row.total, 0)}
                          </td>
                          {[0, 1, 2, 3, 4].map(wIdx => (
                            <td 
                              key={wIdx}
                              className="clickable-cell"
                              style={{ textAlign: 'right' }}
                              onClick={() => handleDrillDown('tissue', row.code, 'week', wIdx)}
                            >
                              {formatNumber(row.weeks[wIdx], 0)}
                            </td>
                          ))}
                          <td style={{ color: '#64748b' }}>{row.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="table" style={{ fontSize: '12px', width: '100%', whiteSpace: 'nowrap' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th>ประเภททิชชู่</th>
                        {summaryMonthLabels.map(m => <th key={m} style={{ textAlign: 'right' }}>{m}</th>)}
                        <th style={{ textAlign: 'right' }}>รวมสะสม</th>
                        <th>หน่วย</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearlyTissueData.rows.map(row => (
                        <tr 
                          key={row.key}
                          style={{
                            background: selectedTissueRow === row.code ? '#f0f9ff' : 'transparent',
                            outline: selectedTissueRow === row.code ? '1.5px solid #0284c7' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <td 
                            style={{ fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', height: '36px' }}
                            onClick={() => {
                              if (!showTissueChart) setShowTissueChart(true)
                              setSelectedTissueRow(selectedTissueRow === row.code ? null : row.code)
                            }}
                            className="clickable-cell"
                          >
                            <span style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              background: row.code === 'tissue_roll' ? '#3b82f6' : row.code === 'tissue_hand' ? '#10b981' : '#f59e0b',
                              display: 'inline-block'
                            }}></span>
                            {row.label}
                          </td>
                          {row.monthsValues.map((val, idx) => (
                            <td 
                              key={idx}
                              className="clickable-cell"
                              style={{ textAlign: 'right' }}
                              onClick={() => handleDrillDown('tissue', row.code, 'month', idx)}
                            >
                              {formatNumber(val, 0)}
                            </td>
                          ))}
                          <td 
                            className="clickable-cell"
                            style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--primary-color)' }}
                            onClick={() => handleDrillDown('tissue', row.code, 'total', null)}
                          >
                            {formatNumber(row.total, 0)}
                          </td>
                          <td style={{ color: '#64748b' }}>{row.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {showTissueChart && (
                <div style={{ order: 1, height: `${getSectionGraphHeight('tissue')}px`, width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedTissueRow && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>
                        แสดงสถิติเฉพาะ: {selectedTissueRow === 'tissue_roll' ? 'ม้วน' : selectedTissueRow === 'tissue_hand' ? 'มือ' : 'ป๊อปอัพ'}
                      </span>
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() => setSelectedTissueRow(null)}
                        style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px' }}
                      >
                        กลับไปดูภาพรวม
                      </button>
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      {viewMode === 'monthly' ? (
                        <BarChart data={tissueData.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" style={{ fontSize: '12px', fill: '#1e293b', fontWeight: 'bold' }} tickLine={{ stroke: '#cbd5e1' }} axisLine={{ stroke: '#cbd5e1' }} />
                          <YAxis style={{ fontSize: '12px', fill: '#1e293b', fontWeight: 'bold' }} tickLine={{ stroke: '#cbd5e1' }} axisLine={{ stroke: '#cbd5e1' }} />
                          <Tooltip formatter={weeklyTooltipFormatter} contentStyle={{ borderRadius: '12px', fontSize: '13px', fontWeight: 'bold', color: '#0f172a' }} />
                          <Legend wrapperStyle={{ fontSize: '12.5px', fontWeight: 'bold', color: '#1e293b', paddingTop: '8px' }} />
                          {(!selectedTissueRow || selectedTissueRow === 'tissue_roll') && <Bar dataKey="ม้วน" fill="#3b82f6" radius={[4, 4, 0, 0]} />}
                          {(!selectedTissueRow || selectedTissueRow === 'tissue_hand') && <Bar dataKey="มือ" fill="#10b981" radius={[4, 4, 0, 0]} />}
                          {(!selectedTissueRow || selectedTissueRow === 'tissue_popup') && <Bar dataKey="ป๊อปอัพ" fill="#f59e0b" radius={[4, 4, 0, 0]} />}
                        </BarChart>
                      ) : summaryMonthsCount <= 4 ? (
                        <BarChart data={yearlyTissueData.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" style={{ fontSize: '12px', fill: '#1e293b', fontWeight: 'bold' }} tickLine={{ stroke: '#cbd5e1' }} axisLine={{ stroke: '#cbd5e1' }} />
                          <YAxis style={{ fontSize: '12px', fill: '#1e293b', fontWeight: 'bold' }} tickLine={{ stroke: '#cbd5e1' }} axisLine={{ stroke: '#cbd5e1' }} />
                          <Tooltip formatter={yearlyTooltipFormatter} contentStyle={{ borderRadius: '12px', fontSize: '13px', fontWeight: 'bold', color: '#0f172a' }} />
                          <Legend wrapperStyle={{ fontSize: '12.5px', fontWeight: 'bold', color: '#1e293b', paddingTop: '8px' }} />
                          {(!selectedTissueRow || selectedTissueRow === 'tissue_roll') && <Bar dataKey="ม้วน" fill="#3b82f6" radius={[4, 4, 0, 0]} />}
                          {(!selectedTissueRow || selectedTissueRow === 'tissue_hand') && <Bar dataKey="มือ" fill="#10b981" radius={[4, 4, 0, 0]} />}
                          {(!selectedTissueRow || selectedTissueRow === 'tissue_popup') && <Bar dataKey="ป๊อปอัพ" fill="#f59e0b" radius={[4, 4, 0, 0]} />}
                        </BarChart>
                      ) : (
                        <LineChart data={yearlyTissueData.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" style={{ fontSize: '12px', fill: '#1e293b', fontWeight: 'bold' }} tickLine={{ stroke: '#cbd5e1' }} axisLine={{ stroke: '#cbd5e1' }} />
                          <YAxis style={{ fontSize: '12px', fill: '#1e293b', fontWeight: 'bold' }} tickLine={{ stroke: '#cbd5e1' }} axisLine={{ stroke: '#cbd5e1' }} />
                          <Tooltip formatter={yearlyTooltipFormatter} contentStyle={{ borderRadius: '12px', fontSize: '13px', fontWeight: 'bold', color: '#0f172a' }} />
                          <Legend wrapperStyle={{ fontSize: '12.5px', fontWeight: 'bold', color: '#1e293b', paddingTop: '8px' }} />
                          {(!selectedTissueRow || selectedTissueRow === 'tissue_roll') && <Line type="monotone" dataKey="ม้วน" stroke="#3b82f6" strokeWidth={3} dot={{ r: 3 }} />}
                          {(!selectedTissueRow || selectedTissueRow === 'tissue_hand') && <Line type="monotone" dataKey="มือ" stroke="#10b981" strokeWidth={3} dot={{ r: 3 }} />}
                          {(!selectedTissueRow || selectedTissueRow === 'tissue_popup') && <Line type="monotone" dataKey="ป๊อปอัพ" stroke="#f59e0b" strokeWidth={3} dot={{ r: 3 }} />}
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ==========================================
              SECTION 2: ถุงดำ / ถุงขยะ
              ========================================== */}
          <div data-report-section="bags" className={`card ledger-analysis-card ${expandedSection === 'bags' ? 'ledger-section-modal' : ''}`} style={{ gridColumn: getSectionGridColumn('bags'), ...getSectionCardStyle('bags'), padding: '24px', borderRadius: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShoppingBag size={22} style={{ color: '#4f46e5' }} />
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>
                    2. ปริมาณการใช้ถุงดำ / ถุงขยะ {viewMode === 'monthly' ? `ประจำเดือน (${MONTHS_OPTIONS.find(m => m.value === selectedMonth)?.label})` : `สะสมรายเดือน (${summaryMonthLabels[0]}–${summaryMonthLabels.at(-1)})`}
                  </h3>
                  <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>จำนวนเบิกใช้ถุงขยะแยกตามขนาดต่าง ๆ ของศูนย์การค้า (Small, Medium, Large)</p>
                </div>
              </div>
              {renderSectionControls('bags')}
            </div>

            <div className="ledger-analysis-content" style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr',
              gap: '24px',
              transition: 'all 0.3s ease'
            }}>
              <div className="table-container" style={{ overflowX: 'auto', order: 2 }}>
                {viewMode === 'monthly' ? (
                  <table className="table" style={{ fontSize: '13px', width: '100%' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th>ขนาดถุงขยะ</th>
                        <th style={{ textAlign: 'right' }}>ยอดเบิกประจำเดือน</th>
                        <th>หน่วย</th>
                      </tr>
                    </thead>
                    <tbody>
                      {garbageBagsData.rows.map(row => (
                        <tr 
                          key={row.code}
                          style={{
                            background: selectedBagsRow === row.code ? '#f0f9ff' : 'transparent',
                            outline: selectedBagsRow === row.code ? '1.5px solid #0284c7' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <td 
                            style={{ fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', height: '36px' }}
                            onClick={() => {
                              if (!showBagsChart) setShowBagsChart(true)
                              setSelectedBagsRow(selectedBagsRow === row.code ? null : row.code)
                            }}
                            className="clickable-cell"
                          >
                            <span style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              background: row.color,
                              display: 'inline-block'
                            }}></span>
                            {row.label}
                          </td>
                          <td 
                            className="clickable-cell"
                            style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--primary-color)' }}
                            onClick={() => handleDrillDown('black_bag', row.code, 'total', null)}
                          >
                            {formatNumber(row.total, 0)}
                          </td>
                          <td style={{ color: '#64748b' }}>{row.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="table" style={{ fontSize: '12px', width: '100%', whiteSpace: 'nowrap' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th>ขนาดถุงขยะ</th>
                        {summaryMonthLabels.map(m => <th key={m} style={{ textAlign: 'right' }}>{m}</th>)}
                        <th style={{ textAlign: 'right' }}>รวมสะสม</th>
                        <th>หน่วย</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearlyGarbageBagsData.rows.map(row => (
                        <tr 
                          key={row.key}
                          style={{
                            background: selectedBagsRow === row.code ? '#f0f9ff' : 'transparent',
                            outline: selectedBagsRow === row.code ? '1.5px solid #0284c7' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <td 
                            style={{ fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', height: '36px' }}
                            onClick={() => {
                              if (!showBagsChart) setShowBagsChart(true)
                              setSelectedBagsRow(selectedBagsRow === row.code ? null : row.code)
                            }}
                            className="clickable-cell"
                          >
                            <span style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              background: row.color,
                              display: 'inline-block'
                            }}></span>
                            {row.label}
                          </td>
                          {row.monthsValues.map((val, idx) => (
                            <td 
                              key={idx}
                              className="clickable-cell"
                              style={{ textAlign: 'right' }}
                              onClick={() => handleDrillDown('black_bag', row.code, 'month', idx)}
                            >
                              {formatNumber(val, 0)}
                            </td>
                          ))}
                          <td 
                            className="clickable-cell"
                            style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--primary-color)' }}
                            onClick={() => handleDrillDown('black_bag', row.code, 'total', null)}
                          >
                            {formatNumber(row.total, 0)}
                          </td>
                          <td style={{ color: '#64748b' }}>{row.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {showBagsChart && (
                <div style={{ order: 1, height: `${getSectionGraphHeight('bags')}px`, width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedBagsRow && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>
                        แสดงสถิติเฉพาะ: {BAG_TYPES.find(type => type.code === selectedBagsRow)?.label || selectedBagsRow}
                      </span>
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() => setSelectedBagsRow(null)}
                        style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px' }}
                      >
                        กลับไปดูภาพรวม
                      </button>
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    {viewMode === 'monthly' ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={garbageBagsData.rows.map(row=>({name:row.label,'จำนวน (ใบ)':row.total}))} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" style={{ fontSize: '12px', fill: '#1e293b', fontWeight: 'bold' }} tickLine={{ stroke: '#cbd5e1' }} axisLine={{ stroke: '#cbd5e1' }} />
                          <YAxis style={{ fontSize: '12px', fill: '#1e293b', fontWeight: 'bold' }} tickLine={{ stroke: '#cbd5e1' }} axisLine={{ stroke: '#cbd5e1' }} />
                          <Tooltip formatter={value=>[`${formatNumber(value,0)} ใบ`,'จำนวน']} contentStyle={{ borderRadius: '12px', fontSize: '13px', fontWeight: 'bold', color: '#0f172a' }} />
                          <Bar dataKey="จำนวน (ใบ)" radius={[4, 4, 0, 0]}>
                            {garbageBagsData.rows.map(row => (
                              <Cell
                                key={row.code}
                                fill={row.color}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <AdaptiveAccumulatedChart
                        data={yearlyGarbageBagsData.chartData}
                        monthsCount={summaryMonthsCount}
                        tooltipFormatter={yearlyTooltipFormatter}
                        series={yearlyGarbageBagsData.types
                          .filter(type => !selectedBagsRow || type.code === selectedBagsRow)
                          .map(type => ({ key: type.key, dataKey: type.label, color: type.color }))}
                      />
                      )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ==========================================
              SECTION 3: น้ำยาทำความสะอาด (Consumables)
              ========================================== */}
          <div data-report-section="consumables" className={`card ledger-analysis-card ${expandedSection === 'consumables' ? 'ledger-section-modal' : ''}`} style={{ gridColumn: getSectionGridColumn('consumables'), ...getSectionCardStyle('consumables'), padding: '24px', borderRadius: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Droplet size={22} style={{ color: '#06b6d4' }} />
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>
                    3. ของใช้สิ้นเปลือง {viewMode === 'monthly' ? `ประจำเดือน (${MONTHS_OPTIONS.find(m => m.value === selectedMonth)?.label})` : `สะสมรายเดือน (${summaryMonthLabels[0]}–${summaryMonthLabels.at(-1)})`}
                  </h3>
                  <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>ปริมาณการเบิกใช้งานสบู่โฟม, น้ำยาเช็ดฝาโถส้วม และของใช้สิ้นเปลืองประเภทสารเคมีอื่น ๆ</p>
                </div>
              </div>
              {renderSectionControls('consumables')}
            </div>

            <div className="ledger-analysis-content" style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr',
              gap: '24px',
              transition: 'all 0.3s ease'
            }}>
              <div className="table-container" style={{ overflowX: 'auto', order: 2 }}>
                {viewMode === 'monthly' ? (
                  <table className="table" style={{ fontSize: '13px', width: '100%' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th>ชื่อน้ำยา</th>
                        <th style={{ textAlign: 'right' }}>ยอดเบิกประจำเดือน</th>
                        <th>หน่วย</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consumablesData.rows.map((row, idx) => {
                        const colors = ['#06b6d4', '#ec4899', '#f59e0b', '#10b981', '#8b5cf6']
                        return (
                          <tr 
                            key={row.code}
                            style={{
                              background: selectedConsumablesRow === row.code ? '#f0f9ff' : 'transparent',
                              outline: selectedConsumablesRow === row.code ? '1.5px solid #0284c7' : 'none',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <td 
                              style={{ fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', height: '36px' }}
                              onClick={() => {
                                if (!showConsumablesChart) setShowConsumablesChart(true)
                                setSelectedConsumablesRow(selectedConsumablesRow === row.code ? null : row.code)
                              }}
                              className="clickable-cell"
                            >
                              <span style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: colors[idx % colors.length],
                                display: 'inline-block'
                              }}></span>
                              {row.label}
                            </td>
                            <td 
                              className="clickable-cell"
                              style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--primary-color)' }}
                              onClick={() => handleDrillDown('consumable', row.code, 'total', null)}
                            >
                              {formatNumber(row.total, 0)}
                            </td>
                            <td style={{ color: '#64748b' }}>{row.unit}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : (
                  <table className="table" style={{ fontSize: '12px', width: '100%', whiteSpace: 'nowrap' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th>ชื่อน้ำยา</th>
                        {summaryMonthLabels.map(m => <th key={m} style={{ textAlign: 'right' }}>{m}</th>)}
                        <th style={{ textAlign: 'right' }}>รวมสะสม</th>
                        <th>หน่วย</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearlyConsumablesData.rows.map((row, idx) => {
                        const colors = ['#06b6d4', '#ec4899', '#f59e0b', '#10b981', '#8b5cf6']
                        return (
                          <tr 
                            key={row.code}
                            style={{
                              background: selectedConsumablesRow === row.code ? '#f0f9ff' : 'transparent',
                              outline: selectedConsumablesRow === row.code ? '1.5px solid #0284c7' : 'none',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <td 
                              style={{ fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', height: '36px' }}
                              onClick={() => {
                                if (!showConsumablesChart) setShowConsumablesChart(true)
                                setSelectedConsumablesRow(selectedConsumablesRow === row.code ? null : row.code)
                              }}
                              className="clickable-cell"
                            >
                              <span style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: colors[idx % colors.length],
                                display: 'inline-block'
                              }}></span>
                              {row.label}
                            </td>
                            {row.monthsValues.map((val, idxVal) => (
                              <td 
                                key={idxVal}
                                className="clickable-cell"
                                style={{ textAlign: 'right' }}
                                onClick={() => handleDrillDown('consumable', row.code, 'month', idxVal)}
                              >
                                {formatNumber(val, 0)}
                              </td>
                            ))}
                            <td 
                              className="clickable-cell"
                              style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--primary-color)' }}
                              onClick={() => handleDrillDown('consumable', row.code, 'total', null)}
                            >
                              {formatNumber(row.total, 0)}
                            </td>
                            <td style={{ color: '#64748b' }}>{row.unit}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {showConsumablesChart && (
                <div style={{ order: 1, height: `${getSectionGraphHeight('consumables')}px`, width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedConsumablesRow && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>
                        แสดงสถิติเฉพาะ: {consumablesData.rows.find(r => r.code === selectedConsumablesRow)?.label || selectedConsumablesRow}
                      </span>
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() => setSelectedConsumablesRow(null)}
                        style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px' }}
                      >
                        กลับไปดูภาพรวม
                      </button>
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    {viewMode === 'monthly' ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={consumablesData.rows.map(row=>({name:row.label,'จำนวน':row.total,unit:row.unit}))} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" style={{ fontSize: '12px', fill: '#1e293b', fontWeight: 'bold' }} tickLine={{ stroke: '#cbd5e1' }} axisLine={{ stroke: '#cbd5e1' }} />
                          <YAxis style={{ fontSize: '12px', fill: '#1e293b', fontWeight: 'bold' }} tickLine={{ stroke: '#cbd5e1' }} axisLine={{ stroke: '#cbd5e1' }} />
                          <Tooltip formatter={(value,_name,props)=>[`${formatNumber(value,0)} ${props.payload.unit}`,'จำนวน']} contentStyle={{ borderRadius: '12px', fontSize: '13px', fontWeight: 'bold', color: '#0f172a' }} />
                          <Bar dataKey="จำนวน" radius={[4,4,0,0]}>{consumablesData.rows.map(row => <Cell key={row.code} fill={row.color}/>)}</Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <AdaptiveAccumulatedChart
                        data={yearlyConsumablesData.chartData}
                        monthsCount={summaryMonthsCount}
                        tooltipFormatter={yearlyTooltipFormatter}
                        series={yearlyConsumablesData.types
                          .filter(t => !selectedConsumablesRow || t.code === selectedConsumablesRow)
                          .map((t, idx) => ({
                            key: t.code,
                            dataKey: t.label,
                            color: t.color || ['#06b6d4', '#ec4899', '#f59e0b', '#10b981', '#8b5cf6'][idx % 5]
                          }))}
                      />
                      )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ==========================================
              SECTION 4: ปริมาณขยะประจำเดือน
              ========================================== */}
          {/* ==========================================
              SECTION 4: ปริมาณขยะประจำเดือน (Unified Card with Graph on Top)
              ========================================== */}
          <div data-report-section="waste" className={`card ledger-analysis-card ${expandedSection === 'waste' ? 'ledger-section-modal' : ''}`} style={{ gridColumn: getSectionGridColumn('waste'), ...getSectionCardStyle('waste'), padding: '24px', borderRadius: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Trash2 size={22} style={{ color: '#e11d48' }} />
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>
                    {viewMode === 'monthly' 
                      ? `4. ปริมาณน้ำหนักขยะแยกประเภทประจำเดือน (${MONTHS_OPTIONS.find(m => m.value === selectedMonth)?.label})` 
                      : `4. ตารางเปรียบเทียบแนวโน้มขยะรายเดือน (${summaryMonthLabels[0]}–${summaryMonthLabels.at(-1)})`
                    }
                  </h3>
                  <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>
                    {viewMode === 'monthly'
                      ? "น้ำหนักรวมขยะเปียก (เศษอาหารสุนัข/หมู), ขยะรีไซเคิล และขยะ RDF ในรอบเดือนประมวลผล"
                      : "เปรียบเทียบสัดส่วนน้ำหนักขยะสะสมในหน่วย กิโลกรัม (kg) และ ตัน (ton) ตลอดปีเพื่อวางแผนจัดการขยะ"
                    }
                  </p>
                </div>
              </div>
              {renderSectionControls('waste')}
            </div>

            <div className="ledger-analysis-content" style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr',
              gap: '24px',
              transition: 'all 0.3s ease'
            }}>
              <div className="table-container" style={{ overflowX: 'auto', order: 2 }}>
                {viewMode === 'monthly' ? (
                  <table className="table" style={{ fontSize: '13px', width: '100%' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th>ประเภทขยะ</th>
                        <th style={{ textAlign: 'right' }}>น้ำหนักสะสม (kg)</th>
                        <th>หน่วยวัด</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyWasteData.rows.map((row, idx) => (
                        <tr key={idx} style={{ fontWeight: row.isTotal ? 'bold' : 'normal', background: row.isTotal ? '#f8fafc' : 'transparent' }}>
                          <td>{row.name}</td>
                          <td 
                            className={row.isTotal ? '' : 'clickable-cell'}
                            style={{ textAlign: 'right', color: row.isTotal ? 'var(--primary-color)' : '#1e293b' }}
                            onClick={() => {
                              if (row.isTotal) return;
                              const mod = row.name === 'ขยะ RDF' ? 'rdf' : row.name === 'ขยะรีไซเคิล' ? 'recycle' : 'wet_waste';
                              handleDrillDown(mod, null, 'month', Number(selectedMonth) - 1);
                            }}
                          >
                            {formatNumber(row.value, 1)}
                          </td>
                          <td style={{ color: '#64748b' }}>{row.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="table" style={{ fontSize: '12px', width: '100%', whiteSpace: 'nowrap' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th>ประเภทขยะ / หน่วย</th>
                        {summaryMonthLabels.map(m => <th key={m} style={{ textAlign: 'right' }}>{m}</th>)}
                        <th style={{ textAlign: 'right' }}>รวมสะสม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {multiMonthWasteData.rows.map((row, idx) => {
                        const isSelected = selectedWasteRow === row.key;
                        return (
                          <tr 
                            key={idx} 
                            style={{ 
                              fontWeight: row.isTotal ? 'bold' : 'normal',
                              background: isSelected ? '#f0f9ff' : row.unit.includes('ตัน') ? '#f0fdf4' : 'transparent',
                              outline: isSelected ? '1.5px solid #0284c7' : 'none',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <td 
                              style={{ fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', height: '36px' }}
                              onClick={() => {
                                if (!showWasteChart) setShowWasteChart(true);
                                setSelectedWasteRow(selectedWasteRow === row.key ? null : row.key);
                              }}
                              className="clickable-cell"
                            >
                              <span style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: row.key === 'rdf' ? '#000000' : row.key === 'recycle' ? '#eab308' : row.key === 'wet' ? '#388e3c' : '#38b6ff',
                                display: 'inline-block'
                              }}></span>
                              {row.label} ({row.unit})
                            </td>
                            {row.monthsValues.map((val, mIdx) => (
                              <td 
                                key={mIdx} 
                                className={row.isTotal ? '' : 'clickable-cell'}
                                style={{ textAlign: 'right' }}
                                onClick={() => {
                                  if (row.isTotal) return;
                                  const mod = row.key === 'rdf' ? 'rdf' : row.key === 'recycle' ? 'recycle' : 'wet_waste';
                                  handleDrillDown(mod, null, 'month', mIdx);
                                }}
                              >
                                {formatNumber(val, row.scale === 1000 ? 3 : 0)}
                              </td>
                            ))}
                            <td 
                              className={row.isTotal ? '' : 'clickable-cell'}
                              style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--primary-color)' }}
                              onClick={() => {
                                if (row.isTotal) return;
                                const mod = row.key === 'rdf' ? 'rdf' : row.key === 'recycle' ? 'recycle' : 'wet_waste';
                                handleDrillDown(mod, null, 'total', null);
                              }}
                            >
                              {formatNumber(row.total, row.scale === 1000 ? 3 : 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              
              {showWasteChart && (
                <div style={{ order: 1, height: `${getSectionGraphHeight('waste')}px`, width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {viewMode === 'monthly' ? (
                    <div style={{ flex: 1 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthlyWasteData.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" style={{ fontSize: '12px', fill: '#1e293b', fontWeight: 'bold' }} tickLine={{ stroke: '#cbd5e1' }} axisLine={{ stroke: '#cbd5e1' }} />
                          <YAxis style={{ fontSize: '12px', fill: '#1e293b', fontWeight: 'bold' }} tickLine={{ stroke: '#cbd5e1' }} axisLine={{ stroke: '#cbd5e1' }} />
                          <Tooltip formatter={(v) => [`${v.toLocaleString()} kg`, 'น้ำหนัก']} contentStyle={{ borderRadius: '12px', fontSize: '13px', fontWeight: 'bold', color: '#0f172a' }} />
                          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                            {monthlyWasteData.chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <>
                      {selectedWasteRow && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>
                            แสดงสถิติเฉพาะ: {multiMonthWasteData.rows.find(r => r.key === selectedWasteRow)?.label || selectedWasteRow}
                          </span>
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() => setSelectedWasteRow(null)}
                            style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px' }}
                          >
                            กลับไปดูภาพรวม
                          </button>
                        </div>
                      )}
                      <div style={{ flex: 1 }}>
                        <AdaptiveAccumulatedChart
                          data={multiMonthWasteData.chartData}
                          monthsCount={summaryMonthsCount}
                          left={-10}
                          tooltipFormatter={(v) => [`${v.toLocaleString()} kg`, 'น้ำหนัก']}
                          series={[
                            ...(!selectedWasteRow || selectedWasteRow === 'rdf' ? [{ key: 'rdf', dataKey: 'ขยะ RDF', color: '#000000' }] : []),
                            ...(!selectedWasteRow || selectedWasteRow === 'recycle' ? [{ key: 'recycle', dataKey: 'ขยะรีไซเคิล', color: '#eab308' }] : []),
                            ...(!selectedWasteRow || selectedWasteRow === 'wet' ? [{ key: 'wet', dataKey: 'ขยะเปียก', color: '#388e3c' }] : []),
                            ...(!selectedWasteRow || selectedWasteRow === 'total' ? [{ key: 'total', dataKey: 'ยอดรวมทั้งหมด', color: '#38b6ff', dashed: true }] : [])
                          ]}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ==========================================
              SECTION 6: อาหารสัตว์ (Animal Feed)
              ========================================== */}
          <div data-report-section="feed" className={`card ledger-analysis-card ${expandedSection === 'feed' ? 'ledger-section-modal' : ''}`} style={{ gridColumn: getSectionGridColumn('feed'), ...getSectionCardStyle('feed'), padding: '24px', borderRadius: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Droplet size={22} style={{ color: '#0284c7' }} />
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>5. สรุปสถิติปริมาณอาหารสัตว์แปรรูปจากเศษอาหาร ({viewMode === 'monthly' ? `${MONTHS_OPTIONS.find(m => m.value === selectedMonth)?.label} ${selectedBE}` : `${summaryMonthLabels[0]}–${summaryMonthLabels.at(-1)}`})</h3>
                  <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>ตารางและกราฟเปรียบเทียบน้ำหนักขยะเศษอาหารสัตว์แยกประเภท (อาหารหมู vs อาหารหมา)</p>
                </div>
              </div>
              {renderSectionControls('feed')}
            </div>

            <div className="ledger-analysis-content" style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr',
              gap: '24px',
              transition: 'all 0.3s ease'
            }}>
              <div className="table-container" style={{ overflowX: 'auto', order: 2 }}>
                <table className="table" style={{ fontSize: '12.5px', width: '100%' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th>ประเภทอาหารสัตว์</th>
                      {feedReportMonthLabels.map(m => <th key={m} style={{ textAlign: 'right' }}>{m}</th>)}
                      <th style={{ textAlign: 'right' }}>{viewMode === 'monthly' ? 'รวมประจำเดือน (kg)' : 'รวมสะสม (kg)'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {animalFeedData.rows.map(row => (
                      <tr 
                        key={row.key}
                        style={{
                          background: selectedFeedRow === row.key ? '#f0f9ff' : 'transparent',
                          outline: selectedFeedRow === row.key ? '1.5px solid #0284c7' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <td 
                          style={{ fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', height: '36px' }}
                          onClick={() => {
                            if (!showFeedChart) setShowFeedChart(true)
                            setSelectedFeedRow(selectedFeedRow === row.key ? null : row.key)
                          }}
                          className="clickable-cell"
                        >
                          <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: row.key === 'pig_feed' ? '#fb923c' : '#60a5fa',
                            display: 'inline-block'
                          }}></span>
                          {row.label}
                        </td>
                        {row.monthsValues.map((val, idx) => (
                          <td 
                            key={idx} 
                            style={{ textAlign: 'right' }}
                            className="clickable-cell"
                            onClick={() => handleDrillDown(row.key, null, 'month', idx)}
                          >
                            {formatNumber(val, 0)}
                          </td>
                        ))}
                        <td 
                          style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--primary-color)' }}
                          className="clickable-cell"
                          onClick={() => handleDrillDown(row.key, null, 'total', null)}
                        >
                          {formatNumber(row.total, 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {showFeedChart && (
                <div style={{ order: 1, height: `${getSectionGraphHeight('feed')}px`, width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedFeedRow && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>
                        แสดงสถิติเฉพาะ: {selectedFeedRow === 'pig_feed' ? 'อาหารหมู' : 'อาหารสุนัข'}
                      </span>
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() => setSelectedFeedRow(null)}
                        style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px' }}
                      >
                        กลับไปดูภาพรวม
                      </button>
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <AdaptiveAccumulatedChart
                      data={animalFeedData.chartData}
                      monthsCount={feedReportMonths.length}
                      tooltipFormatter={(v) => [`${v.toLocaleString()} kg`, 'น้ำหนัก']}
                      series={[
                        ...(!selectedFeedRow || selectedFeedRow === 'pig_feed' ? [{ key: 'pig', dataKey: 'อาหารหมู', color: '#fb923c' }] : []),
                        ...(!selectedFeedRow || selectedFeedRow === 'dog_food' ? [{ key: 'dog', dataKey: 'อาหารสุนัข', color: '#60a5fa' }] : [])
                      ]}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ==========================================
              SECTION 7: รายการขายเศษวัสดุประจำเดือน (High-Fidelity)
              ========================================== */}
          {viewMode === 'monthly' && (
            <div data-report-section="recycle-monthly" className={`card ledger-analysis-card ${expandedSection === 'recycle-monthly' ? 'ledger-section-modal' : ''}`} style={{ gridColumn:getSectionGridColumn('recycle-monthly'), ...getSectionCardStyle('recycle-monthly'), padding: '24px', borderRadius: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', justifyContent:'space-between', alignItems: 'center', gap: '10px', marginBottom: '18px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', flexWrap:'wrap' }}>
                <DollarSign size={22} style={{ color: '#d97706' }} />
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>6. รายละเอียดการขายเศษวัสดุรีไซเคิลประจำเดือน ({MONTHS_OPTIONS.find(m => m.value === selectedMonth)?.label})</h3>
                  <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>รายการวัสดุรีไซเคิล น้ำหนัก อัตราค่าประเมิน และยอดรวมรายรับของเดือนในรอบบันทึก</p>
                </div>
                {renderSectionControls('recycle-monthly')}
              </div>

              <div className="monthly-recycle-report-layout" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
                <div className="table-container monthly-recycle-table" style={{ order: 2 }}>
                  <table className="table" style={{ fontSize: '13px', width: '100%' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th>รายการ</th>
                        <th style={{ textAlign: 'right' }}>จำนวน (กก.)</th>
                        <th style={{ textAlign: 'right' }}>ราคาหน่วย (บาท)</th>
                        <th style={{ textAlign: 'right' }}>จำนวนเงิน (บาท)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyRecycleSaleData.rows.map((row, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 'bold' }}>{row.name}</td>
                          <td style={{ textAlign: 'right' }}>{formatNumber(row.weight, 1)}</td>
                          <td style={{ textAlign: 'right' }}>{row.weight > 0 ? formatNumber(row.avgPrice, 2) : '0'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#10b981' }}>{formatNumber(row.amount, 2)}</td>
                        </tr>
                      ))}
                      {/* Total Row showing overall average price */}
                      <tr style={{ background: '#f8fafc', fontWeight: 'bold' }}>
                        <td>รวม / ค่าเฉลี่ยรวม</td>
                        <td style={{ textAlign: 'right', color: 'var(--primary-color)' }}>{formatNumber(monthlyRecycleSaleData.totalWeight, 1)}</td>
                        <td style={{ textAlign: 'right', color: '#16a34a', background: '#f0fdf4' }}>
                          {formatNumber(monthlyRecycleSaleData.overallAvgPrice, 2)} <span style={{ fontSize: '10px', fontWeight: 'normal', color: '#64748b' }}>บ./กก.</span>
                        </td>
                        <td style={{ textAlign: 'right', color: '#dc2626' }}>{formatNumber(monthlyRecycleSaleData.totalAmount, 2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                <div className="monthly-recycle-chart" style={{ height: `${getSectionGraphHeight('recycle-monthly')}px`, order: 1 }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', display: 'block', textAlign: 'center', marginBottom: '8px' }}>
                    จำนวนเงิน (บาท)
                  </span>
                  <div
                    aria-label="คำอธิบายสีรายการรีไซเคิล"
                    style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: '6px 16px', minHeight: '34px', margin: '0 12px 6px' }}
                  >
                    {monthlyRecycleSaleData.chartData.map(entry => (
                      <span key={entry.name} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#475569', fontSize: '11px', whiteSpace: 'nowrap' }}>
                        <span aria-hidden="true" style={{ width: '10px', height: '10px', borderRadius: '2px', background: entry.fill, flex: '0 0 auto' }} />
                        {entry.name}
                      </span>
                    ))}
                  </div>
                  <ResponsiveContainer width="100%" height="78%">
                    <BarChart data={monthlyRecycleSaleData.chartData} margin={{ top: 20, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={false} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} height={8} />
                      <YAxis style={{ fontSize: '12px', fill: '#1e293b', fontWeight: 'bold' }} tickLine={{ stroke: '#cbd5e1' }} axisLine={{ stroke: '#cbd5e1' }} />
                      <Tooltip formatter={(v) => [`${v.toLocaleString()} บาท`, 'ยอดเงิน']} labelFormatter={(label) => `รายการ: ${label}`} contentStyle={{ borderRadius: '12px', fontSize: '13px', fontWeight: 'bold', color: '#0f172a' }} />
                      <Bar dataKey="จำนวนเงิน (บาท)" radius={[4, 4, 0, 0]}>
                        {monthlyRecycleSaleData.chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                        <LabelList 
                          dataKey="จำนวนเงิน (บาท)" 
                          position="top" 
                          style={{ fontSize: '10px', fill: '#1e293b', fontWeight: 'bold' }} 
                          formatter={(v) => v > 0 ? formatNumber(v, 1) : '0'} 
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* ==========================================
              SECTION 8: รายการขายเศษวัสดุสะสม (amount)
              ========================================== */}
          {viewMode === 'yearly' && (
          <div data-report-section="recycle" className={`card ledger-analysis-card ${expandedSection === 'recycle' ? 'ledger-section-modal' : ''}`} style={{ gridColumn: getSectionGridColumn('recycle'), ...getSectionCardStyle('recycle'), padding: '24px', borderRadius: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <TrendingUp size={22} style={{ color: '#0d9488' }} />
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>
                    6. ยอดจำหน่ายเศษวัสดุรีไซเคิลสะสมรายเดือน ({summaryMonthLabels[0]}–{summaryMonthLabels.at(-1)})
                  </h3>
                  <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>สรุปรายได้สะสมจากการจำหน่ายวัสดุประเภทรีไซเคิลเปรียบเทียบในแต่ละเดือนตลอดทั้งปี</p>
                </div>
              </div>
              {renderSectionControls('recycle')}
            </div>

            <div className="ledger-analysis-content" style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr',
              gap: '24px',
              transition: 'all 0.3s ease'
            }}>
              <div className="table-container" style={{ overflowX: 'auto', order: 2 }}>
                <table className="table" style={{ fontSize: '12.5px', width: '100%' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th>ตัวชี้วัดรายรับ</th>
                      {summaryMonthLabels.map(m => <th key={m} style={{ textAlign: 'right' }}>{m}</th>)}
                      <th style={{ textAlign: 'right' }}>รวมสะสม (บาท)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accumulatedRecycleData.rows.map((row, idx) => (
                      <tr 
                        key={idx}
                        style={{
                          background: selectedRecycleRow === 'recycle_total' ? '#f0f9ff' : 'transparent',
                          outline: selectedRecycleRow === 'recycle_total' ? '1.5px solid #0284c7' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <td 
                          style={{ fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', height: '36px' }}
                          onClick={() => {
                            if (!showRecycleChart) setShowRecycleChart(true)
                            setSelectedRecycleRow(selectedRecycleRow === 'recycle_total' ? null : 'recycle_total')
                          }}
                          className="clickable-cell"
                        >
                          <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: '#0f766e',
                            display: 'inline-block'
                          }}></span>
                          {row.label}
                        </td>
                        {row.monthsValues.map((val, mIdx) => (
                          <td 
                            key={mIdx} 
                            className="clickable-cell"
                            style={{ textAlign: 'right', color: '#10b981' }}
                            onClick={() => handleDrillDown('recycle', null, 'month', mIdx)}
                          >
                            {formatNumber(val, 0)}
                          </td>
                        ))}
                        <td 
                          className="clickable-cell"
                          style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--primary-color)' }}
                          onClick={() => handleDrillDown('recycle', null, 'total', null)}
                        >
                          {formatNumber(row.total, 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {showRecycleChart && (
                <div style={{ order: 1, height: `${getSectionGraphHeight('recycle')}px`, width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedRecycleRow && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>
                        แสดงสถิติเฉพาะ: รายรับสะสมจากการจำหน่าย
                      </span>
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() => setSelectedRecycleRow(null)}
                        style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px' }}
                      >
                        กลับไปดูภาพรวม
                      </button>
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <AdaptiveAccumulatedChart
                      data={accumulatedRecycleData.chartData}
                      monthsCount={summaryMonths.length}
                      tooltipFormatter={(v) => [`${v.toLocaleString()} บาท`, 'รายได้']}
                      series={[{ key: 'income', dataKey: 'รายได้ (บาท)', color: '#0f766e' }]}
                      colorByMonth
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          )}

          </div>
          )}
        </>
      ) : (
        /* Explorer Tab */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="card" style={{ padding: '24px', borderRadius: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>ค้นหาและวิเคราะห์รายการข้อมูล</h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>กรอง ค้นหา และวิเคราะห์ข้อมูลในรูปแบบ รายวัน รายสัปดาห์ รายเดือน หรือรายปี</p>
              </div>
              {can('write') && (
                <button
                  type="button"
                  onClick={handleOpenAddModalFromExplorer}
                  className="btn primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '12px', padding: '10px 18px', fontSize: '13.5px' }}
                >
                  <Plus size={16} /> <span>เพิ่มรายการใหม่</span>
                </button>
              )}
            </div>

            {/* Filter Panel */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
              <label className="field">
                <span style={{ fontWeight: '600', fontSize: '12.5px', color: '#475569' }}>ประเภทโมดูล</span>
                <select
                  value={expModule}
                  onChange={e => {
                    setExpModule(e.target.value)
                    setExpCategory('')
                  }}
                  style={{ padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '13px' }}
                >
                  <option value="all">ทั้งหมด ทุกประเภท</option>
                  {(metadataModules || []).map(module => <option key={module.code} value={module.code}>{module.name_th}</option>)}
                  {!metadataModules.some(module => module.code === 'wet_waste') && <option value="wet_waste">ขยะเปียก</option>}
                </select>
              </label>

              <label className="field">
                <span style={{ fontWeight: '600', fontSize: '12.5px', color: '#475569' }}>หมวดหมู่ย่อย</span>
                <select
                  value={expCategory}
                  onChange={e => setExpCategory(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '13px' }}
                >
                  <option value="">ทั้งหมด</option>
                  {expFilteredCategories.map(c => (
                    <option key={c.code} value={c.code}>{c.name_th} ({c.code})</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span style={{ fontWeight: '600', fontSize: '12.5px', color: '#475569' }}>ตั้งแต่วันที่</span>
                <input
                  type="date"
                  value={expStartDate}
                  onChange={e => setExpStartDate(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '13px' }}
                />
              </label>

              <label className="field">
                <span style={{ fontWeight: '600', fontSize: '12.5px', color: '#475569' }}>ถึงวันที่</span>
                <input
                  type="date"
                  value={expEndDate}
                  onChange={e => setExpEndDate(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '13px' }}
                />
              </label>

              <label className="field">
                <span style={{ fontWeight: '600', fontSize: '12.5px', color: '#475569' }}>คำค้นหา (Keyword)</span>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อวัสดุ หรือหมายเหตุ..."
                    value={expSearchQuery}
                    onChange={e => setExpSearchQuery(e.target.value)}
                    style={{ padding: '8px 12px 8px 32px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '13px', width: '100%' }}
                  />
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                </div>
              </label>

              <label className="field">
                <span style={{ fontWeight: '600', fontSize: '12.5px', color: '#475569' }}>การจัดกลุ่ม (Group By)</span>
                <select
                  value={expGroupBy}
                  onChange={e => setExpGroupBy(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '13px', fontWeight: 'bold', color: 'var(--primary-color)' }}
                >
                  <option value="daily">รายวัน (ดูทีละรายการ)</option>
                  <option value="weekly">รายสัปดาห์ (ภาพรวมกลุ่ม)</option>
                  <option value="monthly">รายเดือน (ภาพรวมกลุ่ม)</option>
                  <option value="yearly">รายปี (ภาพรวมกลุ่ม)</option>
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button
                type="button"
                className="btn ghost small"
                onClick={handleResetExplorerFilters}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '10px', padding: '6px 14px' }}
              >
                <RefreshCw size={14} /> <span>รีเซ็ตตัวกรอง</span>
              </button>
            </div>
          </div>

          {/* Results Grid / Table */}
          <div className="card" style={{ padding: '24px', borderRadius: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <span style={{ fontSize: '14.5px', fontWeight: 'bold', color: '#475569' }}>
                พบทั้งหมด {expGroupBy === 'daily' ? explorerFilteredRows.length : explorerGroupedRows.length} รายการ
                {expGroupBy === 'daily' && selectedExplorerRows.length > 0 && (
                  <span style={{ color: 'var(--primary-color)', marginLeft: '8px' }}>
                    (เลือกพิมพ์เฉพาะข้อมูลที่ติ๊กอยู่ {selectedExplorerRows.length} รายการ)
                  </span>
                )}
              </span>
              
              <button
                type="button"
                className="btn primary"
                disabled={(expGroupBy === 'daily' ? explorerFilteredRows.length : explorerGroupedRows.length) === 0}
                onClick={handleOpenPdfPreview}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  borderRadius: '10px', 
                  padding: '8px 18px', 
                  fontSize: '13px',
                  background: '#0ea5e9', // Sky Blue for PDF Action
                  borderColor: '#0284c7'
                }}
              >
                <FileText size={16} /> <span>บันทึกเป็น PDF</span>
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              {expGroupBy === 'daily' ? (
                <table className="table" style={{ fontSize: '13px', width: '100%' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ width: '40px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={explorerFilteredRows.length > 0 && selectedExplorerRows.length === explorerFilteredRows.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedExplorerRows(explorerFilteredRows.map(r => r.id))
                            } else {
                              setSelectedExplorerRows([])
                            }
                          }}
                          style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                        />
                      </th>
                      <th>วันที่</th>
                      <th>โมดูล</th>
                      <th>หมวดหมู่</th>
                      <th>ชื่อรายการ / รายละเอียด</th>
                      <th style={{ textAlign: 'right' }}>น้ำหนัก (กก.)</th>
                      <th style={{ textAlign: 'right' }}>จำนวน</th>
                      <th>หน่วย</th>
                      <th style={{ textAlign: 'right' }}>จำนวนเงิน (บาท)</th>
                      <th>หมายเหตุ</th>
                      {can('write') && <th style={{ textAlign: 'center', width: '100px' }}>การจัดการ</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {explorerFilteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={11} style={{ textAlign: 'center', color: '#94a3b8', padding: '32px' }}>ไม่พบข้อมูลรายการที่ตรงตามเงื่อนไขการค้นหา</td>
                      </tr>
                    ) : (
                      explorerFilteredRows.map(row => (
                        <tr 
                          key={row.id}
                          style={{
                            background: selectedExplorerRows.includes(row.id) ? '#f0f9ff' : 'transparent',
                            transition: 'background-color 0.15s ease'
                          }}
                        >
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={selectedExplorerRows.includes(row.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedExplorerRows([...selectedExplorerRows, row.id])
                                } else {
                                  setSelectedExplorerRows(selectedExplorerRows.filter(id => id !== row.id))
                                }
                              }}
                              style={{ cursor: 'pointer', transform: 'scale(1.1)' }}
                            />
                          </td>
                          <td>{new Date(row.entry_date).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                          <td>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              background: row.module === 'rdf' ? '#f4f4f5' : row.module === 'recycle' ? '#fef9c3' : '#dbeafe',
                              color: row.module === 'rdf' ? '#27272a' : row.module === 'recycle' ? '#854d0e' : '#1e40af'
                            }}>
                              {moduleLabels[row.module === 'cleaning_liquid' ? 'consumable' : row.module] || row.module}
                            </span>
                          </td>
                          <td>{row.category_code}</td>
                          <td style={{ fontWeight: '600' }}>{row.material_name || '-'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{row.weight_kg !== null ? formatNumber(row.weight_kg, 1) : '-'}</td>
                          <td style={{ textAlign: 'right' }}>{row.quantity !== null ? formatNumber(row.quantity, 0) : '-'}</td>
                          <td>{row.unit}</td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold', color: row.amount > 0 ? '#10b981' : '#1e293b' }}>
                            {row.amount !== null ? formatNumber(row.amount, 2) : '-'}
                          </td>
                          <td style={{ color: '#64748b', fontSize: '12px' }}>{row.notes || '-'}</td>
                          {can('write') && (
                            <td style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              <button
                                type="button"
                                className="btn ghost small"
                                onClick={() => handleOpenEditModalInDrawer(row)}
                                style={{ padding: '4px 8px', color: '#3b82f6' }}
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                type="button"
                                className="btn ghost small"
                                onClick={() => handleDeleteInDrawer(row.id)}
                                style={{ padding: '4px 8px', color: '#ef4444' }}
                              >
                                <X size={14} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="table" style={{ fontSize: '13px', width: '100%' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th>ช่วงเวลาที่จัดกลุ่ม</th>
                      <th>โมดูล</th>
                      <th style={{ textAlign: 'right' }}>น้ำหนักรวม (กก.)</th>
                      <th style={{ textAlign: 'right' }}>จำนวนหน่วยรวม</th>
                      <th style={{ textAlign: 'right' }}>ยอดเงินรวม (บาท)</th>
                      <th style={{ textAlign: 'center' }}>จำนวนรายการบันทึก</th>
                      <th style={{ textAlign: 'center', width: '120px' }}>การดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {explorerGroupedRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8', padding: '32px' }}>ไม่พบข้อมูลช่วงเวลาที่ค้นหา</td>
                      </tr>
                    ) : (
                      explorerGroupedRows.map(row => (
                        <tr key={row.key} className="clickable-cell" onClick={() => handleExplorerRowDrillDown(row)}>
                          <td style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>{row.label}</td>
                          <td>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              background: '#f1f5f9',
                              color: '#475569'
                            }}>
                              {moduleLabels[row.module] || row.module}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{row.weight > 0 ? formatNumber(row.weight, 1) : '-'}</td>
                          <td style={{ textAlign: 'right' }}>{row.quantity > 0 ? formatNumber(row.quantity, 0) : '-'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold', color: row.amount > 0 ? '#10b981' : '#1e293b' }}>
                            {row.amount > 0 ? formatNumber(row.amount, 2) : '-'}
                          </td>
                          <td style={{ textAlign: 'center' }}>{row.count} รายการ</td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn primary small"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleExplorerRowDrillDown(row)
                              }}
                              style={{ padding: '4px 10px', fontSize: '11.5px', borderRadius: '8px' }}
                            >
                              เจาะลึกเรียกดู
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DETAIL DRILL-DOWN DRAWER OVERLAY */}
      {reportStudioSection&&<ReportStudio section={reportStudioSection} onClose={()=>setReportStudioSection(null)}/>}

      {isDrawerOpen && drillDownParams && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          background: 'rgba(15,23,42,0.3)',
          backdropFilter: 'blur(4px)',
          zIndex: 999,
          display: 'flex',
          justifyContent: 'flex-end',
          animation: 'fadeIn 0.2s ease-out'
        }} onClick={() => setIsDrawerOpen(false)}>
          <div style={{
            width: '80%',
            maxWidth: '960px',
            height: '100%',
            background: '#ffffff',
            boxShadow: '-8px 0 32px rgba(15,23,42,0.12)',
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
          }} onClick={e => e.stopPropagation()}>
            
            {/* Drawer Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--primary-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ข้อมูลสถิติย่อย: {moduleLabels[drillDownParams.module] || drillDownParams.module}
                </span>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>
                  {drillDownParams.label}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#64748b'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Filter Controls */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', background: '#ffffff' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                <input
                  type="text"
                  placeholder="ค้นหาชื่อรายการวัสดุ หรือหมายเหตุในรายการกลุ่มนี้..."
                  value={drawerSearchQuery}
                  onChange={e => setDrawerSearchQuery(e.target.value)}
                  style={{ padding: '8px 12px 8px 32px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '13px', width: '100%' }}
                />
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              </div>
              {can('write') && (
                <button
                  type="button"
                  onClick={handleOpenAddModalInDrawer}
                  className="btn primary small"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '10px', padding: '8px 14px', fontSize: '12.5px' }}
                >
                  <Plus size={14} /> <span>เพิ่มรายการในช่วงนี้</span>
                </button>
              )}
            </div>

            {/* Drawer Table Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              <table className="table" style={{ fontSize: '13px', width: '100%' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th>วันที่บันทึก</th>
                    <th>รายการ</th>
                    <th style={{ textAlign: 'right' }}>น้ำหนัก (กก.)</th>
                    <th style={{ textAlign: 'right' }}>จำนวน</th>
                    <th>หน่วย</th>
                    <th style={{ textAlign: 'right' }}>จำนวนเงิน (บาท)</th>
                    <th>หมายเหตุ</th>
                    {can('write') && <th style={{ textAlign: 'center', width: '90px' }}>การจัดการ</th>}
                  </tr>
                </thead>
                <tbody>
                  {drawerRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: '40px' }}>ไม่มีข้อมูลย่อยอยู่ในขอบเขตช่วงเวลาที่เลือก</td>
                    </tr>
                  ) : (
                    drawerRows.map(row => (
                      <tr key={row.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {new Date(row.entry_date).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </td>
                        <td style={{ fontWeight: '600' }}>{row.material_name || '-'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{row.weight_kg !== null ? formatNumber(row.weight_kg, 1) : '-'}</td>
                        <td style={{ textAlign: 'right' }}>{row.quantity !== null ? formatNumber(row.quantity, 0) : '-'}</td>
                        <td>{row.unit}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: row.amount > 0 ? '#10b981' : '#1e293b' }}>
                          {row.amount !== null ? formatNumber(row.amount, 2) : '-'}
                        </td>
                        <td style={{ color: '#64748b', fontSize: '12px' }}>{row.notes || '-'}</td>
                        {can('write') && (
                          <td style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button
                              type="button"
                              className="btn ghost small"
                              onClick={() => handleOpenEditModalInDrawer(row)}
                              style={{ padding: '4px 6px', color: '#3b82f6' }}
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              type="button"
                              className="btn ghost small"
                              onClick={() => handleDeleteInDrawer(row.id)}
                              style={{ padding: '4px 6px', color: '#ef4444' }}
                            >
                              <X size={13} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Drawer Footer summary */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', fontWeight: 'bold' }}>
              <span>สรุปภาพรวมในขอบเขต:</span>
              <div style={{ display: 'flex', gap: '20px' }}>
                <span>น้ำหนักรวม: <span style={{ color: 'var(--primary-color)' }}>{formatNumber(drawerRows.reduce((a, b) => a + toNumber(b.weight_kg), 0), 1)} kg</span></span>
                <span>จำนวนเงินรวม: <span style={{ color: '#10b981' }}>{formatNumber(drawerRows.reduce((a, b) => a + toNumber(b.amount), 0), 2)} บาท</span></span>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ADD/EDIT ENTRY MODAL OVERLAY */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          background: 'rgba(15,23,42,0.4)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeIn 0.2s'
        }} onClick={() => setIsModalOpen(false)}>
          <div style={{
            background: '#ffffff',
            borderRadius: '24px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            width: '100%',
            maxWidth: '560px',
            overflow: 'hidden',
            animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }} onClick={e => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>
                {modalMode === 'add' ? 'เพิ่มรายการบันทึกข้อมูลใหม่' : 'แก้ไขรายการบันทึกข้อมูล'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleModalSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <label className="field">
                  <span style={{ fontWeight: 'bold', fontSize: '13px' }}>วันที่บันทึก *</span>
                  <input
                    type="date"
                    required
                    value={form.entry_date}
                    onChange={e => setForm({ ...form, entry_date: e.target.value })}
                    style={{ padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1' }}
                  />
                </label>

                <label className="field">
                  <span style={{ fontWeight: 'bold', fontSize: '13px' }}>ประเภทโมดูล *</span>
                  <select
                    disabled={modalMode === 'edit'}
                    value={form.module}
                    onChange={e => {
                      const mod = e.target.value
                      const filtered = categories.filter(c => mod === 'consumable'
                        ? ['consumable', 'cleaning_liquid'].includes(c.module)
                        : c.module === mod)
                      const firstCat = filtered[0]
                      setForm({
                        ...form,
                        module: mod,
                        category_code: firstCat ? firstCat.code : '',
                        material_name: firstCat ? firstCat.name_th : '',
                        unit: firstCat ? firstCat.unit : 'kg'
                      })
                    }}
                    style={{ padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', background: modalMode === 'edit' ? '#f1f5f9' : '#ffffff' }}
                  >
                    <option value="rdf">ขยะ RDF</option>
                    <option value="dog_food">อาหารสุนัข</option>
                    <option value="pig_feed">อาหารหมู</option>
                    <option value="wet_waste">ขยะเปียก</option>
                    <option value="recycle">ขยะรีไซเคิล</option>
                    <option value="tissue">กระดาษทิชชู่</option>
                    <option value="black_bag">ถุงดำ</option>
                    <option value="consumable">น้ำยาต่างๆ</option>
                  </select>
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <label className="field">
                  <span style={{ fontWeight: 'bold', fontSize: '13px' }}>หมวดหมู่หลัก *</span>
                  <select
                    value={form.category_code}
                    onChange={e => {
                      const catCode = e.target.value
                      const cat = categories.find(c => c.code === catCode)
                      setForm({
                        ...form,
                        category_code: catCode,
                        material_name: cat ? cat.name_th : form.material_name,
                        unit: cat ? cat.unit : form.unit
                      })
                    }}
                    style={{ padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1' }}
                  >
                    {categories.filter(c => c.module === form.module).map(cat => (
                      <option key={cat.code} value={cat.code}>{cat.name_th} ({cat.code})</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span style={{ fontWeight: 'bold', fontSize: '13px' }}>ชื่อรายการ / รายละเอียดวัสดุ *</span>
                  <input
                    type="text"
                    required
                    value={form.material_name}
                    onChange={e => setForm({ ...form, material_name: e.target.value })}
                    placeholder="ระบุชื่อเรียกวัสดุ..."
                    style={{ padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1' }}
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 1fr', gap: '12px' }}>
                <label className="field">
                  <span style={{ fontWeight: 'bold', fontSize: '13px' }}>น้ำหนัก (กิโลกรัม)</span>
                  <input
                    type="number"
                    step="any"
                    value={form.weight_kg}
                    onChange={e => {
                      const wVal = e.target.value
                      const amt = wVal !== '' && form.unit_price !== '' ? Number(wVal) * Number(form.unit_price) : form.amount
                      setForm({ ...form, weight_kg: wVal, amount: amt !== '' ? String(amt) : '' })
                    }}
                    placeholder="0.00"
                    style={{ padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1' }}
                  />
                </label>

                <label className="field">
                  <span style={{ fontWeight: 'bold', fontSize: '13px' }}>จำนวนชิ้น / ปริมาณ</span>
                  <input
                    type="number"
                    step="any"
                    value={form.quantity}
                    onChange={e => {
                      const qVal = e.target.value
                      const amt = qVal !== '' && form.unit_price !== '' && form.unit !== 'kg' ? Number(qVal) * Number(form.unit_price) : form.amount
                      setForm({ ...form, quantity: qVal, amount: amt !== '' ? String(amt) : '' })
                    }}
                    placeholder="0"
                    style={{ padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1' }}
                  />
                </label>

                <label className="field">
                  <span style={{ fontWeight: 'bold', fontSize: '13px' }}>หน่วยวัด</span>
                  <input
                    type="text"
                    value={form.unit}
                    onChange={e => setForm({ ...form, unit: e.target.value })}
                    placeholder="kg"
                    style={{ padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1' }}
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <label className="field">
                  <span style={{ fontWeight: 'bold', fontSize: '13px' }}>ราคาต่อหน่วย (บาท)</span>
                  <input
                    type="number"
                    step="any"
                    value={form.unit_price}
                    onChange={e => {
                      const upVal = e.target.value
                      const refVal = form.unit === 'kg' ? form.weight_kg : form.quantity
                      const amt = upVal !== '' && refVal !== '' ? Number(upVal) * Number(refVal) : form.amount
                      setForm({ ...form, unit_price: upVal, amount: amt !== '' ? String(amt) : '' })
                    }}
                    placeholder="0.00"
                    style={{ padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1' }}
                  />
                </label>

                <label className="field">
                  <span style={{ fontWeight: 'bold', fontSize: '13px' }}>จำนวนเงินสุทธิ (บาท)</span>
                  <input
                    type="number"
                    step="any"
                    value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })}
                    placeholder="0.00"
                    style={{ padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontWeight: 'bold', color: '#10b981' }}
                  />
                </label>
              </div>

              <label className="field">
                <span style={{ fontWeight: 'bold', fontSize: '13px' }}>หมายเหตุ / รายละเอียดเพิ่มเติม</span>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="ระบุข้อความสั้น ๆ (ถ้ามี)..."
                  rows={2}
                  style={{ padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', resize: 'vertical' }}
                />
              </label>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setIsModalOpen(false)}
                  style={{ borderRadius: '12px', padding: '10px 20px' }}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="btn primary"
                  style={{ borderRadius: '12px', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {saveMutation.isPending ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* PDF PREVIEW & CONFIGURATION MODAL OVERLAY */}
      {isPdfModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          background: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 1050,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          animation: 'fadeIn 0.2s'
        }} onClick={handleClosePdfModal}>
          <div style={{
            background: '#ffffff',
            borderRadius: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            width: '95vw',
            height: '92vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }} onClick={e => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={20} style={{ color: '#0ea5e9' }} />
                <h3 style={{ fontSize: '16.5px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>ตัวอย่างรายงานก่อนบันทึกเป็น PDF</h3>
              </div>
              <button
                type="button"
                className="btn ghost small"
                onClick={handleClosePdfModal}
                style={{ padding: '6px', border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={22} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              
              {/* Left pane: Options/Settings */}
              <div style={{ width: '320px', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', background: '#ffffff', padding: '20px', gap: '18px', overflowY: 'auto' }}>
                <div>
                  <h4 style={{ fontSize: '13.5px', fontWeight: 'bold', color: '#334155', margin: '0 0 12px 0' }}>ตั้งค่าหัวข้อและหมายเหตุ</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>หัวข้อรายงาน</span>
                      <input
                        type="text"
                        value={pdfTitle}
                        onChange={e => {
                          setPdfTitle(e.target.value)
                          setPdfHasUnsavedChanges(true)
                        }}
                        style={{ padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '12.5px' }}
                      />
                    </label>

                    <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>หมายเหตุท้ายรายงาน</span>
                      <textarea
                        value={pdfNotes}
                        onChange={e => {
                          setPdfNotes(e.target.value)
                          setPdfHasUnsavedChanges(true)
                        }}
                        placeholder="ระบุข้อความอธิบาย หรือหมายเหตุท้ายเอกสาร..."
                        rows={3}
                        style={{ padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '12px', resize: 'vertical' }}
                      />
                    </label>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                  <h4 style={{ fontSize: '13.5px', fontWeight: 'bold', color: '#334155', margin: '0 0 12px 0' }}>การจัดวางและขนาด</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <label className="field" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>แนวการจัดวางหน้า</span>
                      <select
                        value={pdfOrientation}
                        onChange={e => setPdfOrientation(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '12.5px' }}
                      >
                        <option value="portrait">แนวตั้ง (A4 Portrait)</option>
                        <option value="landscape">แนวนอน (A4 Landscape)</option>
                      </select>
                    </label>

                    {pdfOrientation === 'landscape' && (
                      <span style={{ fontSize: '11px', color: '#0284c7', background: '#e0f2fe', padding: '6px 10px', borderRadius: '6px' }}>
                        💡 ระบบแนะนำแนวนอนอัตโนมัติ เนื่องจากมีจำนวนคอลัมน์แสดงผลปริมาณมาก
                      </span>
                    )}
                  </div>
                </div>

                {expGroupBy === 'daily' && expModule === 'all' && (
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                    <h4 style={{ fontSize: '13.5px', fontWeight: 'bold', color: '#334155', margin: '0 0 12px 0' }}>เลือกคอลัมน์ข้อมูล</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '160px', overflowY: 'auto' }}>
                      {[
                        { key: 'date', label: 'วันที่' },
                        { key: 'module', label: 'ประเภทโมดูล' },
                        { key: 'category', label: 'หมวดหมู่' },
                        { key: 'name', label: 'ชื่อรายการ' },
                        { key: 'weight', label: 'น้ำหนัก (กก.)' },
                        { key: 'qty', label: 'จำนวนและหน่วยวัด' },
                        { key: 'amount', label: 'จำนวนเงิน' },
                        { key: 'notes', label: 'หมายเหตุ' }
                      ].map(col => (
                        <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#475569', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={pdfVisibleColumns.includes(col.key)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setPdfVisibleColumns([...pdfVisibleColumns, col.key])
                              } else {
                                setPdfVisibleColumns(pdfVisibleColumns.filter(c => c !== col.key))
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                          <span>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Helpful Tip */}
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '14px', border: '1px solid #e2e8f0', marginTop: 'auto' }}>
                  <span style={{ fontSize: '11.5px', color: '#475569', display: 'block', lineHeight: '1.5' }}>
                    <strong>💡 คำแนะนำการพิมพ์:</strong><br />
                    ในหน้าต่างเบราว์เซอร์พิมพ์ โปรดเลือกเครื่องพิมพ์เป็น <strong>"Save as PDF"</strong>, ขนาดกระดาษ <strong>A4</strong>, มาตราส่วน <strong>100%</strong>, เปิด <strong>Background graphics</strong> และปิด Header/Footer ของเบราว์เซอร์
                  </span>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={isPdfGenerating}
                    onClick={handlePrintPdf}
                    style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', fontSize: '13.5px', background: '#0284c7', borderColor: '#0369a1', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    {isPdfGenerating ? 'กำลังเตรียมเอกสาร...' : 'พิมพ์ / บันทึกเป็น PDF'}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={handleClosePdfModal}
                    style={{ width: '100%', padding: '10px 16px', borderRadius: '12px', fontSize: '13.5px' }}
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>

              {/* Right pane: Document A4 scrollable preview */}
              <div style={{ flex: 1, overflowY: 'auto', background: '#64748b', padding: '30px', display: 'flex', justifyContent: 'center' }}>
                <div style={{
                  width: pdfOrientation === 'portrait' ? '210mm' : '297mm',
                  minHeight: pdfOrientation === 'portrait' ? '297mm' : '210mm',
                  background: '#ffffff',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
                  padding: '15mm 12mm',
                  boxSizing: 'border-box',
                  fontFamily: '"Sarabun", sans-serif',
                  color: '#1e293b',
                  fontSize: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.3s ease'
                }}>
                  {/* Vector Logo Header */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '15px' }}>
                    <tbody>
                      <tr>
                        <td style={{ width: '70px', verticalAlign: 'middle' }}>
                          <svg width="60" height="60" viewBox="0 0 100 100" style={{ fill: '#0f766e' }}>
                            <circle cx="50" cy="50" r="46" fill="none" stroke="#0f766e" strokeWidth="4"/>
                            <path d="M50 15 L80 35 L80 75 L50 60 L20 75 L20 35 Z" fill="#0f766e" opacity="0.15"/>
                            <text x="50" y="44" fontFamily="'Sarabun', sans-serif" fontSize="12" fontWeight="bold" textAnchor="middle" fill="#0f766e">CENTRAL</text>
                            <text x="50" y="60" fontFamily="'Sarabun', sans-serif" fontSize="14" fontWeight="bold" textAnchor="middle" fill="#0f766e">KRABI</text>
                            <path d="M35 72 L65 72" stroke="#0f766e" strokeWidth="3" strokeLinecap="round"/>
                          </svg>
                        </td>
                        <td style={{ verticalAlign: 'middle', paddingLeft: '15px' }}>
                          <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 3px 0' }}>{pdfTitle}</h2>
                          <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>ระบบจัดการขยะและสถิติทรัพยากร (CKAP System) - ศูนย์การค้าเซ็นทรัล กระบี่</p>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Metadata section */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#475569', borderBottom: '2px solid #cbd5e1', paddingBottom: '6px', marginBottom: '12px' }}>
                    <div>
                      <strong>ข้อมูลประเภท:</strong> {expModule === 'all' ? 'ทุกประเภท' : (moduleLabels[expModule] || expModule)} | 
                      <strong>จัดกลุ่มโดย:</strong> {expGroupBy === 'daily' ? 'รายรายการบันทึก' : `สรุปผล (${expGroupBy === 'weekly' ? 'รายสัปดาห์' : expGroupBy === 'monthly' ? 'รายเดือน' : 'รายปี'})`}
                    </div>
                    <div>
                      <strong>ข้อมูลออก ณ วันที่:</strong> {new Date().toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </div>
                  </div>

                  {/* Preview Table */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '15px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {expGroupBy === 'daily' ? (
                          getExplorerConfig(expModule).headers.map((h, hIdx) => {
                            const config = getExplorerConfig(expModule)
                            const alignRight = config.cols[hIdx] === 'weight' || config.cols[hIdx] === 'qty' || config.cols[hIdx] === 'price' || config.cols[hIdx] === 'amount'
                            return (
                              <th 
                                key={hIdx} 
                                style={{ 
                                  border: '1px solid #cbd5e1', 
                                  padding: '6px 8px', 
                                  textAlign: alignRight ? 'right' : 'left', 
                                  fontSize: '11px' 
                                }}
                              >
                                {h}
                              </th>
                            )
                          })
                        ) : (
                          getGroupedConfig(expModule).headers.map((h, hIdx) => {
                            const groupedConfig = getGroupedConfig(expModule)
                            const colType = groupedConfig.cols[hIdx]
                            const alignRight = colType === 'weight' || colType === 'qty' || colType === 'amount'
                            const alignCenter = colType === 'count'
                            return (
                              <th 
                                key={hIdx} 
                                style={{ 
                                  border: '1px solid #cbd5e1', 
                                  padding: '6px 8px', 
                                  textAlign: alignRight ? 'right' : alignCenter ? 'center' : 'left', 
                                  fontSize: '11px' 
                                }}
                              >
                                {h}
                              </th>
                            )
                          })
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {getPrintDataRows.length === 0 ? (
                        <tr>
                          <td 
                            colSpan={expGroupBy === 'daily' ? getExplorerConfig(expModule).headers.length : getGroupedConfig(expModule).headers.length} 
                            style={{ border: '1px solid #cbd5e1', padding: '24px', textAlign: 'center', color: '#94a3b8' }}
                          >
                            ไม่มีรายการข้อมูล
                          </td>
                        </tr>
                      ) : (
                        getPrintDataRows.map((r, rIdx) => {
                          const config = getExplorerConfig(expModule)
                          const groupedConfig = getGroupedConfig(expModule)
                          return (
                            <tr key={rIdx}>
                              {expGroupBy === 'daily' ? (
                                config.cols.map((col, cIdx) => {
                                  let cellVal = '-'
                                  let style = { border: '1px solid #cbd5e1', padding: '5px 8px' }
                                  if (col === 'date') {
                                    cellVal = new Date(r.entry_date).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                  } else if (col === 'module') {
                                    cellVal = moduleLabels[r.module === 'cleaning_liquid' ? 'consumable' : r.module] || r.module
                                  } else if (col === 'name') {
                                    cellVal = r.material_name || '-'
                                    style.fontWeight = 'bold'
                                  } else if (col === 'weight') {
                                    cellVal = r.weight_kg !== null ? formatNumber(r.weight_kg, 1) : '-'
                                    style.textAlign = 'right'
                                    style.fontWeight = 'bold'
                                  } else if (col === 'qty') {
                                    cellVal = r.quantity !== null ? formatNumber(r.quantity, 0) : '-'
                                    style.textAlign = 'right'
                                  } else if (col === 'unit') {
                                    cellVal = r.unit || '-'
                                  } else if (col === 'price') {
                                    cellVal = r.unit_price !== null ? formatNumber(r.unit_price, 2) : '-'
                                    style.textAlign = 'right'
                                  } else if (col === 'amount') {
                                    cellVal = r.amount !== null ? formatNumber(r.amount, 2) : '-'
                                    style.textAlign = 'right'
                                    style.fontWeight = 'bold'
                                    if (r.amount > 0) style.color = '#10b981'
                                  } else if (col === 'notes') {
                                    cellVal = r.notes || '-'
                                    style.color = '#64748b'
                                    style.fontSize = '11px'
                                  } else if (col.startsWith('dynamic:')) {
                                    const key = col.slice('dynamic:'.length)
                                    cellVal = r[key] ?? r.metadata?.dynamic_fields?.[key] ?? '-'
                                    style.textAlign = 'right'
                                  }
                                  return <td key={cIdx} style={style}>{cellVal}</td>
                                })
                              ) : (
                                groupedConfig.cols.map((col, cIdx) => {
                                  let cellVal = '-'
                                  let style = { border: '1px solid #cbd5e1', padding: '5px 8px' }
                                  if (col === 'period') {
                                    cellVal = r.label
                                    style.fontWeight = 'bold'
                                    style.color = 'var(--primary-color)'
                                  } else if (col === 'module') {
                                    cellVal = moduleLabels[r.module] || r.module
                                  } else if (col === 'weight') {
                                    cellVal = r.weight > 0 ? formatNumber(r.weight, 1) : '-'
                                    style.textAlign = 'right'
                                    style.fontWeight = 'bold'
                                  } else if (col === 'qty') {
                                    if (config.type === 'count') {
                                      cellVal = getGroupedItemQuantityTotals([r], false)
                                    } else {
                                      cellVal = r.quantity > 0 ? formatNumber(r.quantity, 0) : '-'
                                    }
                                    style.textAlign = 'right'
                                    if (config.type === 'count') {
                                      style.fontWeight = 'bold'
                                      style.fontSize = '11px'
                                    }
                                  } else if (col === 'amount') {
                                    cellVal = r.amount > 0 ? formatNumber(r.amount, 2) : '-'
                                    style.textAlign = 'right'
                                    style.fontWeight = 'bold'
                                    if (r.amount > 0) style.color = '#10b981'
                                  } else if (col === 'count') {
                                    cellVal = `${r.count} รายการ`
                                    style.textAlign = 'center'
                                  }
                                  return <td key={cIdx} style={style}>{cellVal}</td>
                                })
                              )}
                            </tr>
                          )
                        })
                      )}
                      {/* Preview totals row */}
                      {(() => {
                        const config = getExplorerConfig(expModule)
                        const groupedConfig = getGroupedConfig(expModule)
                        if (expGroupBy === 'daily') {
                          const firstNumericIdx = config.cols.findIndex(c => ['weight', 'qty', 'amount'].includes(c))
                          const labelSpan = firstNumericIdx > 0 ? firstNumericIdx : 1
                          
                          const cells = []
                          cells.push(
                            <td 
                              key="label" 
                              colSpan={labelSpan} 
                              style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}
                            >
                              ยอดรวมทั้งสิ้น:
                            </td>
                          )
                          
                          let i = labelSpan
                          while (i < config.cols.length) {
                            const col = config.cols[i]
                            const cellKey = `total-${col}-${i}`
                            if (col === 'weight') {
                              cells.push(
                                <td 
                                  key={cellKey} 
                                  style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', color: '#2563eb', fontSize: '12.5px' }}
                                >
                                  {formatNumber(getPrintDataRows.reduce((sum, r) => sum + toNumber(r.weight_kg), 0), 1)}
                                </td>
                              )
                              i++
                            } else if (col === 'qty') {
                              if (config.type === 'count') {
                                cells.push(
                                  <td 
                                    key={cellKey} 
                                    colSpan={2} 
                                    style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: '11.5px', color: '#2563eb', whiteSpace: 'normal' }}
                                  >
                                    {getGroupedItemQuantityTotals(getPrintDataRows, true)}
                                  </td>
                                )
                              } else {
                                cells.push(
                                  <td 
                                    key={cellKey} 
                                    style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}
                                  >
                                    {formatNumber(getPrintDataRows.reduce((sum, r) => sum + toNumber(r.quantity), 0), 0)}
                                  </td>
                                )
                                cells.push(
                                  <td 
                                    key={`${cellKey}-unit`} 
                                    style={{ border: '1px solid #cbd5e1', padding: '6px 8px', fontWeight: 'bold' }}
                                  >
                                    {getPrintDataRows[0]?.unit || ''}
                                  </td>
                                )
                              }
                              i += 2
                            } else if (col === 'price') {
                              cells.push(<td key={cellKey} style={{ border: '1px solid #cbd5e1', padding: '6px 8px' }}></td>)
                              i++
                            } else if (col === 'amount') {
                              cells.push(
                                <td 
                                  key={cellKey} 
                                  style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', color: '#16a34a', fontSize: '12.5px' }}
                                >
                                  {formatNumber(getPrintDataRows.reduce((sum, r) => sum + toNumber(r.amount), 0), 2)}
                                </td>
                              )
                              i++
                            } else if (col === 'notes') {
                              cells.push(<td key={cellKey} style={{ border: '1px solid #cbd5e1', padding: '6px 8px' }}></td>)
                              i++
                            } else {
                              cells.push(<td key={cellKey} style={{ border: '1px solid #cbd5e1', padding: '6px 8px' }}></td>)
                              i++
                            }
                          }
                          return <tr style={{ background: '#f8fafc', fontWeight: 'bold', borderTop: '2px solid #94a3b8' }}>{cells}</tr>
                        } else {
                          // Grouped view
                          const labelSpan = groupedConfig.cols.findIndex(c => ['weight', 'qty', 'amount'].includes(c))
                          const cells = []
                          cells.push(
                            <td 
                              key="label" 
                              colSpan={labelSpan > 0 ? labelSpan : 1} 
                              style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}
                            >
                              ยอดรวมทั้งสิ้น:
                            </td>
                          )
                          
                          let i = labelSpan > 0 ? labelSpan : 1
                          while (i < groupedConfig.cols.length) {
                            const col = groupedConfig.cols[i]
                            const cellKey = `total-grouped-${col}-${i}`
                            if (col === 'weight') {
                              cells.push(
                                <td 
                                  key={cellKey} 
                                  style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', color: '#2563eb', fontSize: '12.5px' }}
                                >
                                  {formatNumber(getPrintDataRows.reduce((sum, r) => sum + toNumber(r.weight), 0), 1)}
                                </td>
                              )
                            } else if (col === 'qty') {
                              if (config.type === 'count') {
                                cells.push(
                                  <td 
                                    key={cellKey} 
                                    style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: '11.5px', color: '#2563eb', whiteSpace: 'normal' }}
                                  >
                                    {getGroupedItemQuantityTotals(getPrintDataRows, false)}
                                  </td>
                                )
                              } else {
                                cells.push(
                                  <td 
                                    key={cellKey} 
                                    style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}
                                  >
                                    {formatNumber(getPrintDataRows.reduce((sum, r) => sum + toNumber(r.quantity), 0), 0)}
                                  </td>
                                )
                              }
                            } else if (col === 'amount') {
                              cells.push(
                                <td 
                                  key={cellKey} 
                                  style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', color: '#16a34a', fontSize: '12.5px' }}
                                >
                                  {formatNumber(getPrintDataRows.reduce((sum, r) => sum + toNumber(r.amount), 0), 2)}
                                </td>
                              )
                            } else if (col === 'count') {
                              cells.push(
                                <td 
                                  key={cellKey} 
                                  style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center', fontWeight: 'bold' }}
                                >
                                  {getPrintDataRows.reduce((sum, r) => sum + r.count, 0)} รายการ
                                </td>
                              )
                            }
                            i++
                          }
                          return <tr style={{ background: '#f8fafc', fontWeight: 'bold', borderTop: '2px solid #94a3b8' }}>{cells}</tr>
                        }
                      })()}
                    </tbody>
                  </table>

                  {/* Notes area */}
                  {pdfNotes && (
                    <div style={{ marginTop: '12px', padding: '10px 14px', background: '#f8fafc', borderLeft: '4px solid #94a3b8', fontSize: '11.5px', borderRadius: '4px' }}>
                      <strong style={{ display: 'block', marginBottom: '3px', color: '#475569' }}>หมายเหตุท้ายรายงาน:</strong>
                      <div style={{ whiteSpace: 'pre-wrap', color: '#334155', lineHeight: '1.4' }}>{pdfNotes}</div>
                    </div>
                  )}

                  {/* Footer */}
                  <div style={{ marginTop: 'auto', borderTop: '1px solid #e2e8f0', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b' }}>
                    <span>ออกรายงานโดยระบบ CKAP System - ศูนย์การค้าเซ็นทรัล กระบี่</span>
                    <span>เอกสารฉบับนี้พิมพ์โดยระบบอิเล็กทรอนิกส์</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </section>
  )
}
