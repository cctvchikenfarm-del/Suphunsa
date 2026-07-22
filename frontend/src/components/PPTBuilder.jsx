// PPTBuilder.jsx - Premium PowerPoint Report Builder
import React, { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { 
  FileText, Play, Download, ChevronUp, ChevronDown, 
  Eye, Settings, EyeOff, Layout, Palette, Calendar, Plus, Trash2, Edit3, BarChart3
} from 'lucide-react'
import { apiFetch, currentMonth, formatNumber } from '../api.js'
import { 
  reportThemeOptions, 
  buildReportSlideOutline, 
  exportReportBuilderPowerPoint, 
  getReportTheme,
  thaiMonthLabel,
  moduleLabels
} from '../lib/report-builder.js'
import MonthPicker from './MonthPicker.jsx'
import { monthlyEntryValue } from '../lib/ledger-config.js'

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
]

function getMonthlyDataForModule(entries, moduleCode, metricKey = 'quantity') {
  const series = Array(12).fill(0);
  (entries || []).forEach(row => {
    if (row.module !== moduleCode) return;
    const date = new Date(row.entry_date);
    const m = date.getMonth();
    if (m >= 0 && m < 12) {
      const field = metricKey === 'weight' ? 'weight_kg' : (metricKey === 'amount' ? 'amount' : 'quantity');
      const val = metricKey === 'weight' ? monthlyEntryValue(row, field) : (row[field] || 0);
      series[m] += Number(val);
    }
  });
  return series;
}

function getMonthlyDataForCategory(entries, moduleCode, categoryCode, metricKey = 'quantity') {
  const series = Array(12).fill(0);
  (entries || []).forEach(row => {
    if (row.module !== moduleCode) return;
    if (categoryCode && row.category_code !== categoryCode) return;
    const date = new Date(row.entry_date);
    const m = date.getMonth();
    if (m >= 0 && m < 12) {
      const field = metricKey === 'weight' ? 'weight_kg' : (metricKey === 'amount' ? 'amount' : 'quantity');
      const val = metricKey === 'weight' ? monthlyEntryValue(row, field) : (row[field] || 0);
      series[m] += Number(val);
    }
  });
  return series;
}

export default function PPTBuilder({ permissions = [] }) {
  const canExport = permissions.includes('reports.export')
  const [month, setMonth] = useState(currentMonth())
  const [title, setTitle] = useState('รายงานสรุปปริมาณขยะและทรัพยากร')
  const [selectedTheme, setSelectedTheme] = useState('central_pattana') // Default to Central Pattana!
  
  // Slide settings
  const [includeCharts, setIncludeCharts] = useState(true)
  const [includeQuality, setIncludeQuality] = useState(true)
  const [includeTables, setIncludeTables] = useState(true)
  
  // Custom slide overrides & custom slides state
  const [slideOverrides, setSlideOverrides] = useState({})
  const [customSlides, setCustomSlides] = useState([
    {
      id: 'custom_cpn_1',
      title: 'เป้าหมายการประหยัดพลังงานและการแยกขยะ CPN',
      description: 'สไลด์กำหนดเองสำหรับองค์กร',
      bullets: [
        '• ระบุเป้าหมายที่ผ่านการอนุมัติขององค์กรก่อนนำเสนอ',
        '• ใช้ข้อมูลจริงจากรายงานเพื่อกำหนดกิจกรรมลดและคัดแยกขยะ',
        '• ระบุผู้รับผิดชอบ ระยะเวลา และตัวชี้วัดที่สามารถตรวจสอบได้'
      ],
      enabled: true
    }
  ])
  const [activePreviewIndex, setActivePreviewIndex] = useState(0)
  const [reportType, setReportType] = useState('standard') // 'standard' หรือ 'fmhy'
  
  // Slides state for fully customizable PPT report builder
  const [slides, setSlides] = useState([])
  
  // Fetch dashboard data
  const { data: dashboardData, isLoading: isDashLoading, error: dashError } = useQuery({
    queryKey: ['dashboard', month],
    queryFn: () => apiFetch(`/api/dashboard?month=${month}&forExport=true`)
  })

  // Fetch quality data
  const { data: qualityData, isLoading: isQualityLoading, error: qualityError } = useQuery({
    queryKey: ['data-quality', month],
    queryFn: () => apiFetch(`/api/data-quality?month=${month}`)
  })

  // ดึงข้อมูลรายการขยะทั้งปีเพื่อนำไปแสดงบนตารางประมวลผลเปรียบเทียบใน PPT FM-HY
  const { data: entriesForYear = [] } = useQuery({
    queryKey: ['entries-year-ppt', month],
    queryFn: () => {
      const year = month.slice(0, 4)
      return apiFetch(`/api/entries?startDate=${year}-01-01&endDate=${year}-12-31&forExport=true`)
    }
  })

  const currentThemeConfig = useMemo(() => getReportTheme(selectedTheme), [selectedTheme])

  // Build current slide outline
  const outline = useMemo(() => {
    const settings = {
      title,
      theme: selectedTheme,
      includeCharts,
      includeQuality,
      includeTables,
      slideOutlineOverrides: slideOverrides,
      customSlides, // Pass custom slides!
      reportType // ระบุรูปแบบรายงาน
    }
    return buildReportSlideOutline(dashboardData, qualityData, settings)
  }, [dashboardData, qualityData, title, selectedTheme, includeCharts, includeQuality, includeTables, slideOverrides, customSlides, reportType])

  // Sync slides state with outline and auto-draft default bullets
  useEffect(() => {
    if (outline.length > 0) {
      setSlides(prev => {
        return outline.map(s => {
          const existing = prev.find(p => p.id === s.id)
          
          let bullets = []
          if (existing?.bullets) {
            bullets = existing.bullets
          } else {
            if (s.type === 'fmhy_tissue') {
              bullets = [
                '• ติดตามและเปรียบเทียบยอดการใช้กระดาษทิชชู่รายเดือนแยกประเภท',
                '• เปรียบเทียบสัดส่วนแต่ละประเภทจากตัวเลขจริงก่อนสรุปประเภทที่ใช้สูงสุด',
                '• ตรวจสอบความครบถ้วนของข้อมูลก่อนกำหนดมาตรการลดการใช้'
              ]
            } else if (s.type === 'fmhy_waste') {
              bullets = [
                '• สรุปสัดส่วนขยะแห้ง ขยะเปียก และการแปรสภาพขยะ RDF',
                '• เปรียบเทียบปริมาณ RDF กับเดือนก่อนเพื่อประเมินแนวโน้มจากข้อมูลจริง',
                '• ตรวจสอบสัดส่วนการนำขยะเปียกไปใช้ประโยชน์ก่อนสรุปผล'
              ]
            } else if (s.type === 'fmhy_feed') {
              bullets = [
                '• ปริมาณอาหารหมูและอาหารหมาที่ได้จากการแปรรูปเศษอาหาร',
                '• ใช้ยอดจริงในการคำนวณสัดส่วนขยะเศษอาหารที่นำไปใช้ประโยชน์',
                '• ระบุผลลัพธ์ด้านสิ่งแวดล้อมเมื่อมีหลักฐานรองรับ'
              ]
            } else if (s.type === 'fmhy_recycle_rev') {
              bullets = [
                '• สรุปสัดส่วนและแนวโน้มมูลค่าเงินที่ได้รับจากการขายเศษวัสดุรีไซเคิล',
                '• ตรวจสอบแนวโน้มรายได้รายเดือนก่อนระบุว่าเพิ่มขึ้นหรือลดลง',
                '• เปรียบเทียบรายได้ตามชนิดวัสดุจากข้อมูลขายจริง'
              ]
            } else if (s.type === 'fmhy_bags') {
              bullets = [
                '• ควบคุมปริมาณความต้องการเบิกใช้ถุงขยะแยกขนาดของแม่บ้าน',
                '• ใช้ตารางข้อมูลจริงเพื่อระบุขนาดที่มีการใช้สูงสุด',
                '• กำหนดมาตรการลดการใช้เมื่อข้อมูลเปรียบเทียบยืนยันแนวโน้ม'
              ]
            } else if (s.type === 'summary') {
              bullets = [
                '• สรุปสถิติน้ำหนักสะสมและยอดประเมินรวมของเดือนล่าสุด',
                '• เปรียบเทียบผลจริงกับค่าเป้าหมายที่องค์กรกำหนด',
                '• ระบุคะแนนคุณภาพข้อมูลและรายการที่ต้องตรวจสอบก่อนอนุมัติรายงาน'
              ]
            } else if (s.type === 'custom') {
              bullets = s.content || []
            }
          }

          return {
            ...s,
            title: existing?.title || s.title,
            bullets: bullets
          }
        })
      })
    }
  }, [outline])

  // Filter enabled slides for preview
  const enabledSlides = useMemo(() => slides.filter(s => s.enabled), [slides])

  // Ensure active preview index is within range
  useEffect(() => {
    if (activePreviewIndex >= enabledSlides.length) {
      setActivePreviewIndex(Math.max(0, enabledSlides.length - 1))
    }
  }, [enabledSlides, activePreviewIndex])

  // Key event listener for slide preview navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') {
        setActivePreviewIndex(prev => Math.min(enabledSlides.length - 1, prev + 1))
      } else if (e.key === 'ArrowLeft') {
        setActivePreviewIndex(prev => Math.max(0, prev - 1))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabledSlides])

  // Toggle slide enabled state
  const toggleSlide = (slideId, currentState) => {
    setSlides(prev => prev.map(s => {
      if (s.id === slideId) return { ...s, enabled: !currentState }
      return s
    }))
  }

  // Rename slide
  const renameSlide = (slideId, newTitle) => {
    setSlides(prev => prev.map(s => {
      if (s.id === slideId) return { ...s, title: newTitle }
      return s
    }))
  }

  // Reorder slides
  const moveSlide = (slideId, direction) => {
    const currentIndex = slides.findIndex(s => s.id === slideId)
    const targetIndex = currentIndex + direction
    if (targetIndex < 0 || targetIndex >= slides.length) return

    setSlides(prev => {
      const nextSlides = [...prev]
      const temp = nextSlides[currentIndex]
      nextSlides[currentIndex] = nextSlides[targetIndex]
      nextSlides[targetIndex] = temp
      return nextSlides
    })
  }

  // Add custom slide
  const addCustomSlide = () => {
    const newSlideId = `custom_${Date.now()}`
    const newSlide = {
      id: newSlideId,
      title: 'ข้อเสนอนำเสนอเพิ่มเติมประจำสัปดาห์',
      description: 'สไลด์ที่เพิ่มเนื้อหาเองโดยผู้ใช้งาน',
      type: 'custom',
      bullets: [
        '• เพิ่มข้อความวิเคราะห์ของคุณที่นี่ บรรทัดละ 1 ข้อ',
        '• บรรทัดที่ 2 สำหรับเป้าหมายโครงการ'
      ],
      enabled: true
    }
    setSlides(prev => [...prev, newSlide])
    setTimeout(() => {
      setActivePreviewIndex(slides.length)
    }, 100)
  }

  // Delete custom slide
  const deleteCustomSlide = (slideId) => {
    setSlides(prev => prev.filter(s => s.id !== slideId))
  }

  // Update slide bullets for custom slide
  const updateSlideBullets = (slideId, fullText) => {
    const lines = fullText.split('\n')
    setSlides(prev => prev.map(s => {
      if (s.id === slideId) return { ...s, bullets: lines }
      return s
    }))
  }

  // Update specific bullet point for a slide
  const updateSlideBulletPoint = (slideId, bulletIdx, value) => {
    setSlides(prev => prev.map(s => {
      if (s.id === slideId) {
        const nextBullets = [...(s.bullets || [])]
        if (value.trim()) {
          nextBullets[bulletIdx] = `• ${value}`
        } else {
          nextBullets[bulletIdx] = ''
        }
        return { ...s, bullets: nextBullets.filter(b => b !== '') }
      }
      return s
    }))
  }

  // Generate and download PowerPoint file
  const handleDownload = async () => {
    const settings = {
      title,
      theme: selectedTheme,
      includeCharts,
      includeQuality,
      includeTables,
      customSlideOutline: slides, // Pass the user-customized slide outline!
      month,
      reportType,
      entriesForYear
    }
    const context = {
      organizationName: 'Central Pattana', // Updated to Central Pattana
      title: 'รายงานการจัดการขยะและทรัพยากร',
      periodLabel: month,
      theme: selectedTheme
    }

    try {
      await exportReportBuilderPowerPoint(dashboardData, qualityData, settings, context)
      const modules = (dashboardData?.dynamic_modules || []).map(item => item.code)
      await apiFetch('/api/reports/client-export', {
        method: 'POST',
        body: JSON.stringify({ month, title, modules, outline: slides.map(({ id, title: slideTitle, type, enabled }) => ({ id, title: slideTitle, type, enabled })) })
      })
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการสร้างไฟล์ PowerPoint: ' + err.message)
    }
  }

  const activeSlide = enabledSlides[activePreviewIndex]

  return (
    <section className="page ppt-builder-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Report Generator</p>
          <h2>สร้างรายงานสไลด์อัจฉริยะ</h2>
          <p className="muted">ตั้งค่า ปรับแต่งเอาท์ไลน์ และตรวจดูพรีวิวก่อนดาวน์โหลดไฟล์ PowerPoint แบบแก้ไขต่อได้</p>
        </div>
        <label className="field small-field">
          <span>เลือกเดือนรายงาน</span>
          <MonthPicker value={month} onChange={setMonth} />
        </label>
      </div>

      <div className="ppt-layout-grid">
        
        {/* คอลัมน์ซ้าย: แผงควบคุมและเอาท์ไลน์แก้ไขได้ */}
        <div className="ppt-sidebar-panel">
          
          {/* ส่วนการตั้งค่าธีมและข้อมูลทั่วไป */}
          <div className="card builder-settings-card">
            <h3 className="panel-section-title"><Settings size={18} /> ตั้งค่าสไลด์และเทมเพลต</h3>
            
            <label className="field">
              <span>ชื่อหัวข้อรายงานหลัก</span>
              <input 
                type="text" 
                value={title} 
                onChange={e => setTitle(e.target.value)} 
                placeholder="กรอกชื่อหัวข้อใหญ่สำหรับแสดงบนหน้าปก"
              />
            </label>

            <label className="field" style={{ marginBottom: '16px' }}>
              <span>รูปแบบเอกสารและเทมเพลต (Report Template)</span>
              <select
                value={reportType}
                onChange={e => setReportType(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', width: '100%', fontSize: '13px', background: 'white' }}
              >
                <option value="standard">รายงานสรุปขยะและทรัพยากรปกติ (Standard Layout)</option>
                <option value="fmhy">รายงานมาตรฐานสไตล์ FM-HY (6 สไลด์ตามเอกสารตัวอย่าง)</option>
              </select>
            </label>

            <div className="theme-selector-section">
              <span>เลือกสไตล์ธีมรายงาน (Corporate Theme)</span>
              <div className="theme-cards-grid">
                {reportThemeOptions.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    className={`theme-card-btn ${selectedTheme === t.id ? 'active' : ''}`}
                    onClick={() => setSelectedTheme(t.id)}
                  >
                    <div className="theme-color-preview">
                      <span className="dot-primary" style={{ backgroundColor: `#${t.primary}` }}></span>
                      <span className="dot-accent" style={{ backgroundColor: `#${t.accent}` }}></span>
                    </div>
                    <div className="theme-info">
                      <strong>{t.label}</strong>
                      <p>{t.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="section-visibility-toggles">
              <span>เลือกหมวดสไลด์ที่จัดเก็บ</span>
              <div className="checkbox-group-row">
                <label className="checkbox-label">
                  <input type="checkbox" checked={includeCharts} onChange={e => setIncludeCharts(e.target.checked)} />
                  <span>สไลด์กราฟ</span>
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={includeQuality} onChange={e => setIncludeQuality(e.target.checked)} />
                  <span>สไลด์ตรวจคุณภาพ</span>
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={includeTables} onChange={e => setIncludeTables(e.target.checked)} />
                  <span>สไลด์ตารางสรุป</span>
                </label>
              </div>
            </div>
          </div>

          {/* ส่วนเอาท์ไลน์สไลด์ (Editable Outline) */}
          <div className="card outline-card">
            <div className="card-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 className="panel-section-title" style={{ borderBottom: 0, margin: 0, paddingBottom: 0 }}><Layout size={18} /> โครงสร้างสไลด์รายงาน ({slides.length} สไลด์)</h3>
                <p className="hint" style={{ margin: '4px 0 0 0' }}>จัดระเบียบ ตรวจสอบ และเรียงลำดับหน้าได้</p>
              </div>
              <button 
                type="button" 
                className="secondary" 
                style={{ padding: '6px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '8px' }}
                onClick={addCustomSlide}
              >
                <Plus size={14} /> เพิ่มสไลด์
              </button>
            </div>

            <div className="outline-list">
              {slides.map((slide, idx) => {
                const isEnabled = slide.enabled
                const isLocked = slide.locked
                const isCustom = slide.type === 'custom'
                
                return (
                  <div key={slide.id} className={`outline-item-row ${isEnabled ? 'enabled' : 'disabled'} ${activeSlide?.id === slide.id ? 'active-outline' : ''}`} style={activeSlide?.id === slide.id ? { borderColor: `#${currentThemeConfig.accent}`, backgroundColor: '#EFF6FF' } : {}}>
                    <div className="outline-item-drag-actions">
                      <button 
                        type="button" 
                        disabled={idx === 0} 
                        onClick={() => moveSlide(slide.id, -1)}
                        title="เลื่อนขึ้น"
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button 
                        type="button" 
                        disabled={idx === slides.length - 1} 
                        onClick={() => moveSlide(slide.id, 1)}
                        title="เลื่อนลง"
                      >
                        <ChevronDown size={16} />
                      </button>
                    </div>

                    <div className="outline-item-content" onClick={() => {
                      const enabledIdx = enabledSlides.findIndex(s => s.id === slide.id)
                      if (enabledIdx !== -1) setActivePreviewIndex(enabledIdx)
                    }} style={{ cursor: 'pointer' }}>
                      <input 
                        type="text" 
                        value={slide.title} 
                        onChange={e => renameSlide(slide.id, e.target.value)}
                        disabled={!isEnabled}
                        title="ดับเบิ้ลคลิกเพื่อแก้ไขชื่อสไลด์หน้านี้"
                      />
                      <span className="outline-item-desc">{slide.description || 'สไลด์นำเสนอข้อความ'}</span>
                    </div>

                    <div className="outline-item-visibility-action" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {isCustom && (
                        <button
                          type="button"
                          className="btn-delete-slide"
                          style={{ border: 0, background: 'transparent', color: '#EF4444', padding: '4px', cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteCustomSlide(slide.id)
                          }}
                          title="ลบสไลด์นี้"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      {!isLocked ? (
                        <button 
                          type="button" 
                          className={`btn-visibility-toggle ${isEnabled ? 'visible' : 'hidden'}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleSlide(slide.id, isEnabled)
                          }}
                          title={isEnabled ? "ซ่อนสไลด์หน้านี้" : "เปิดสไลด์หน้านี้"}
                        >
                          {isEnabled ? <Eye size={18} /> : <EyeOff size={18} />}
                        </button>
                      ) : (
                        <span className="locked-badge" title="หน้านี้จำเป็นสำหรับโครงสร้างสไลด์">บังคับ</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="download-action-block">
              <button 
                type="button" 
                className="primary download-ppt-btn" 
                onClick={handleDownload}
                disabled={!canExport || isDashLoading || enabledSlides.length === 0}
              >
                <Download size={20} />
                <span>{canExport ? 'Download Editable PowerPoint (.pptx)' : 'ไม่มีสิทธิ์ส่งออกรายงาน'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* คอลัมน์ขวา: พรีวิวสไลด์สด (High-Fidelity Preview) */}
        <div className="ppt-preview-panel">
          <div className="preview-header-bar">
            <span>💻 Slide Preview (ผลลัพธ์แบบกึ่งเรียลไทม์)</span>
            <span className="hint">กดแป้นพิมพ์ ◄ / ► เพื่อเปลี่ยนหน้าสไลด์</span>
          </div>

          <div className="preview-slide-aspect-container">
            {isDashLoading || isQualityLoading ? (
              <div className="slide-loading-overlay">
                <div className="spinner"></div>
                <p>กำลังเตรียมข้อมูลสไลด์และเรนเดอร์กราฟิก...</p>
              </div>
            ) : enabledSlides.length === 0 ? (
              <div className="slide-empty-overlay">
                <p>ไม่มีสไลด์ที่เปิดใช้งาน กรุณาเปิดใช้งานสไลด์ด้านซ้ายอย่างน้อย 1 หน้า</p>
              </div>
            ) : (
              <div 
                className="slide-content-canvas"
                style={{ 
                  backgroundColor: activeSlide?.type === 'cover' ? `#${currentThemeConfig.primary}` : `#${currentThemeConfig.surface}`,
                  color: activeSlide?.type === 'cover' ? `#${currentThemeConfig.textLight}` : `#${currentThemeConfig.textDark}`
                }}
              >
                {/* Logo in standard slide previews (สไลด์หน้าที่สองเป็นต้นไป) */}
                {activeSlide?.type !== 'cover' && (
                  <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 10 }}>
                    <img src="/central-krabi-logo.png" alt="Central Krabi Logo" style={{ height: '34px', objectFit: 'contain' }} />
                  </div>
                )}

                {/* 1. Cover Slide Preview */}
                {activeSlide?.type === 'cover' && (
                  <div className="slide-cover-preview">
                    <div className="slide-cover-stripe" style={{ backgroundColor: `#${currentThemeConfig.accent}` }}></div>
                    <div className="slide-cover-body">
                      {selectedTheme === 'central_pattana' ? (
                        <div className="slide-cover-org" style={{ letterSpacing: '4px' }}>
                          <span style={{ color: '#FFFFFF', fontWeight: 'bold' }}>CENTRAL</span>{' '}
                          <span style={{ color: `#${currentThemeConfig.accent}`, fontWeight: 'bold' }}>PATTANA</span>
                        </div>
                      ) : (
                        <div className="slide-cover-org">CENTRAL KRABI</div>
                      )}
                      <h1 className="slide-cover-title">{activeSlide.title}</h1>
                      <div className="slide-cover-period">รายงานสรุปผลข้อมูลประจำเดือน {thaiMonthLabel(month)}</div>
                      <div className="slide-cover-footer">จัดทำขึ้นโดยระบบอัตโนมัติประจำสถานี</div>
                    </div>
                  </div>
                )}

                {/* 2. Summary Slide Preview */}
                {activeSlide?.type === 'summary' && (
                  <div className="slide-standard-preview">
                    <div className="slide-header">
                      <h2>{activeSlide.title}</h2>
                      <p className="slide-subtitle">ภาพรวมยอดสะสมรวมน้ำหนักและรายได้ของเดือน {thaiMonthLabel(month)}</p>
                    </div>
                    
                    <div className="preview-kpi-grid">
                      <div className="preview-kpi-card" style={{ borderLeftColor: `#${currentThemeConfig.accent}` }}>
                        <span className="kpi-label">น้ำหนักสะสมรวม</span>
                        <strong className="kpi-value">{formatNumber(dashboardData?.totals?.total_weight_kg || 0)} kg</strong>
                        <span className="kpi-desc">น้ำหนักขยะ/ทรัพยากรทุกรายการ</span>
                      </div>
                      <div className="preview-kpi-card" style={{ borderLeftColor: `#${currentThemeConfig.accent}` }}>
                        <span className="kpi-label">รายได้ประเมินรวม</span>
                        <strong className="kpi-value">{formatNumber(dashboardData?.totals?.total_amount || 0)} บาท</strong>
                        <span className="kpi-desc">จากการคัดแยกขยะรีไซเคิล</span>
                      </div>
                      <div className="preview-kpi-card" style={{ borderLeftColor: `#${currentThemeConfig.accent}` }}>
                        <span className="kpi-label">รายการคีย์ข้อมูล</span>
                        <strong className="kpi-value">{formatNumber(dashboardData?.totals?.entry_count || 0, 0)} รายการ</strong>
                        <span className="kpi-desc">ความถี่การบันทึกฐานข้อมูล</span>
                      </div>
                      <div className="preview-kpi-card" style={{ borderLeftColor: `#${currentThemeConfig.accent}` }}>
                        <span className="kpi-label">ขยะเปียก (หมู+หมา)</span>
                        <strong className="kpi-value">{formatNumber(dashboardData?.totals?.wet_waste_weight_kg || 0)} kg</strong>
                        <span className="kpi-desc">สัดส่วนขยะเปียกที่แยกได้</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Chart Slide Preview */}
                {activeSlide?.type === 'chart' && (
                  <div className="slide-standard-preview">
                    <div className="slide-header">
                      <h2>{activeSlide.title}</h2>
                      <p className="slide-subtitle">กราฟเปรียบเทียบตัวชี้วัดหลักของทุกโมดูลจาก Metadata</p>
                    </div>

                    <div className="preview-chart-container">
                      <div className="preview-y-axis-title">ค่าตัวชี้วัดหลัก</div>
                      <div className="preview-bar-chart-bars">
                        {(dashboardData?.dynamic_modules?.length ? dashboardData.dynamic_modules : (dashboardData?.modules || [])).map(m => {
                          const reportModules = dashboardData?.dynamic_modules?.length ? dashboardData.dynamic_modules : (dashboardData?.modules || [])
                          const val = Number(m.metric_value ?? m.weight_kg ?? 0)
                          const maxVal = Math.max(...reportModules.map(item => Number(item.metric_value ?? item.weight_kg ?? 0)), 1)
                          const pct = (val / maxVal) * 100
                          
                          return (
                            <div key={m.code || m.module} className="preview-chart-bar-column">
                              <div className="preview-chart-bar-value">{val.toLocaleString()}</div>
                              <div 
                                className="preview-chart-bar-fill" 
                                style={{ 
                                  height: `${Math.max(8, pct * 0.75)}%`,
                                  backgroundColor: `#${currentThemeConfig.accent}`
                                }}
                              ></div>
                              <div className="preview-chart-bar-label">{m.name_th || moduleLabels[m.module] || m.module || m.code}</div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Quality Slide Preview */}
                {activeSlide?.type === 'quality' && (
                  <div className="slide-standard-preview">
                    <div className="slide-header">
                      <h2>{activeSlide.title}</h2>
                      <p className="slide-subtitle">แสดงความสมบูรณ์และครบถ้วนของข้อมูลก่อนนำเสนอในรายงาน</p>
                    </div>

                    <div className="preview-quality-layout">
                      <div className="preview-quality-left-score-card">
                        <span>คะแนนคุณภาพข้อมูลเฉลี่ย</span>
                        <h3 style={{ color: `#${currentThemeConfig.accent}` }}>
                          {qualityData?.scores?.length 
                            ? Math.round(qualityData.scores.reduce((sum, s) => sum + (s.score || 0), 0) / qualityData.scores.length)
                            : 0}%
                        </h3>
                        <p>ประเมินครบถ้วน 6 หมวดข้อมูลหลัก</p>
                      </div>

                      <div className="preview-quality-right-table">
                        <div className="preview-table-row header">
                          <div>ประเภทงาน</div>
                          <div>ความครอบคลุมวัน</div>
                          <div>คะแนนเฉลี่ย</div>
                        </div>
                        {(qualityData?.scores || []).map(item => (
                          <div key={item.module} className="preview-table-row">
                            <div>{moduleLabels[item.module] || item.module}</div>
                            <div>{item.covered_days}/{item.expected_days} วัน</div>
                            <div style={{ fontWeight: 'bold' }}>{item.score}%</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. Table Slide Preview */}
                {activeSlide?.type === 'table' && (
                  <div className="slide-standard-preview">
                    <div className="slide-header">
                      <h2>{activeSlide.title}</h2>
                      <p className="slide-subtitle">สรุปตัวชี้วัดหลัก หน่วย และจำนวนรายการตาม Metadata</p>
                    </div>

                    <div className="preview-table-container">
                      <table className="preview-kpi-table">
                        <thead>
                          <tr>
                            <th>โมดูล</th>
                            <th className="align-right">ตัวชี้วัดหลัก</th>
                            <th className="align-right">หน่วย</th>
                            <th className="align-right">จำนวนคีย์ข้อมูล</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(dashboardData?.dynamic_modules?.length ? dashboardData.dynamic_modules : (dashboardData?.modules || [])).map(m => (
                            <tr key={m.code || m.module}>
                              <td><strong>{m.name_th || moduleLabels[m.module] || m.module || m.code}</strong></td>
                              <td className="align-right">{formatNumber(m.metric_value ?? m.weight_kg ?? 0)}</td>
                              <td className="align-right">{m.metric_unit || 'kg'}</td>
                              <td className="align-right">{m.count || 0} ครั้ง</td>
                            </tr>
                          ))}
                          <tr className="grand-total-row">
                            <td>ยอดรวมทั้งหมด</td>
                            <td className="align-right">{formatNumber(dashboardData?.totals?.total_weight_kg || 0)}</td>
                            <td className="align-right">{formatNumber(dashboardData?.totals?.total_amount || 0)}</td>
                            <td className="align-right">{dashboardData?.totals?.entry_count || 0} ครั้ง</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* FM-HY Tissue Preview */}
                {activeSlide?.type === 'fmhy_tissue' && (
                  <div className="slide-standard-preview">
                    <div className="slide-header">
                      <h2>{activeSlide.title}</h2>
                      <p className="slide-subtitle">สถิติตารางเปรียบเทียบการใช้งานกระดาษทิชชู่รายเดือนแยกประเภท</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginTop: '10px' }}>
                      <div className="preview-table-container" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                        <table className="preview-kpi-table" style={{ fontSize: '11px' }}>
                          <thead>
                            <tr>
                              <th>เดือน</th>
                              <th className="align-right">ม้วน (ม้วน)</th>
                              <th className="align-right">มือ (แพ็ค)</th>
                              <th className="align-right">ป๊อปอัพ (แพ็ค)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {THAI_MONTHS_SHORT.map((m, idx) => {
                              const roll = getMonthlyDataForCategory(entriesForYear, 'tissue', 'tissue_roll', 'quantity')[idx];
                              const hand = getMonthlyDataForCategory(entriesForYear, 'tissue', 'tissue_hand', 'quantity')[idx];
                              const popup = getMonthlyDataForCategory(entriesForYear, 'tissue', 'tissue_popup', 'quantity')[idx];
                              return (
                                <tr key={m}>
                                  <td>{m}</td>
                                  <td className="align-right">{formatNumber(roll, 0)}</td>
                                  <td className="align-right">{formatNumber(hand, 0)}</td>
                                  <td className="align-right">{formatNumber(popup, 0)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#f8fafc', borderRadius: '16px', padding: '16px', border: '1px solid #e2e8f0' }}>
                        <BarChart3 size={32} style={{ color: 'var(--primary-color)', marginBottom: '8px' }} />
                        <span style={{ fontSize: '12px', fontWeight: 'bold' }}>แนวโน้มกระดาษทิชชู่รายเดือน</span>
                        <span style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', marginTop: '4px' }}>กราฟเส้นเปรียบเทียบ 3 ประเภทจะแสดงผลบนไฟล์ดาวน์โหลด</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* FM-HY Waste Preview */}
                {activeSlide?.type === 'fmhy_waste' && (
                  <div className="slide-standard-preview">
                    <div className="slide-header">
                      <h2>{activeSlide.title}</h2>
                      <p className="slide-subtitle">เปรียบเทียบปริมาณขยะขยะเปียก ขยะรีไซเคิล และขยะ RDF ประจำเดือน</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginTop: '10px' }}>
                      <div className="preview-table-container" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                        <table className="preview-kpi-table" style={{ fontSize: '11px' }}>
                          <thead>
                            <tr>
                              <th>เดือน</th>
                              <th className="align-right">ขยะเปียก (kg)</th>
                              <th className="align-right">Recycle (kg)</th>
                              <th className="align-right">RDF (kg)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {THAI_MONTHS_SHORT.map((m, idx) => {
                              const wet = getMonthlyDataForModule(entriesForYear, 'wet_waste', 'weight')[idx];
                              const rec = getMonthlyDataForModule(entriesForYear, 'recycle', 'weight')[idx];
                              const rdf = getMonthlyDataForModule(entriesForYear, 'rdf', 'weight')[idx];
                              return (
                                <tr key={m}>
                                  <td>{m}</td>
                                  <td className="align-right">{formatNumber(wet, 1)}</td>
                                  <td className="align-right">{formatNumber(rec, 1)}</td>
                                  <td className="align-right">{formatNumber(rdf, 1)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#f8fafc', borderRadius: '16px', padding: '16px', border: '1px solid #e2e8f0' }}>
                        <BarChart3 size={32} style={{ color: 'var(--primary-color)', marginBottom: '8px' }} />
                        <span style={{ fontSize: '12px', fontWeight: 'bold' }}>กราฟแท่งปริมาณขยะรวม</span>
                        <span style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', marginTop: '4px' }}>เปรียบเทียบสัดส่วนขยะ 3 ประเภทรายเดือนบนสไลด์จริง</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* FM-HY Animal Feed Preview */}
                {activeSlide?.type === 'fmhy_feed' && (
                  <div className="slide-standard-preview">
                    <div className="slide-header">
                      <h2>{activeSlide.title}</h2>
                      <p className="slide-subtitle">สถิติปริมาณเศษอาหารที่นำมาแปรรูปเป็นอาหารสัตว์รายเดือน</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginTop: '10px' }}>
                      <div className="preview-table-container" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                        <table className="preview-kpi-table" style={{ fontSize: '11px' }}>
                          <thead>
                            <tr>
                              <th>เดือน</th>
                              <th className="align-right">อาหารหมู (kg)</th>
                              <th className="align-right">อาหารสุนัข (kg)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {THAI_MONTHS_SHORT.map((m, idx) => {
                              const pig = getMonthlyDataForCategory(entriesForYear, 'pig_feed', 'PIG_FEED', 'weight')[idx];
                              const dog = getMonthlyDataForCategory(entriesForYear, 'dog_food', 'DOG_FOOD', 'weight')[idx];
                              return (
                                <tr key={m}>
                                  <td>{m}</td>
                                  <td className="align-right">{formatNumber(pig, 1)}</td>
                                  <td className="align-right">{formatNumber(dog, 1)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#f8fafc', borderRadius: '16px', padding: '16px', border: '1px solid #e2e8f0' }}>
                        <BarChart3 size={32} style={{ color: 'var(--primary-color)', marginBottom: '8px' }} />
                        <span style={{ fontSize: '12px', fontWeight: 'bold' }}>เปรียบเทียบอาหารสัตว์สะสม</span>
                        <span style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', marginTop: '4px' }}>แสดงผลกราฟแท่งแนวคู่ (Double Bar) บนไฟล์ดาวน์โหลด</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* FM-HY Recycle Revenue Preview */}
                {activeSlide?.type === 'fmhy_recycle_rev' && (
                  <div className="slide-standard-preview">
                    <div className="slide-header">
                      <h2>{activeSlide.title}</h2>
                      <p className="slide-subtitle">รายได้ประเมินสะสมจากการจำหน่ายวัสดุรีไซเคิลรายเดือน</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginTop: '10px' }}>
                      <div className="preview-table-container" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                        <table className="preview-kpi-table" style={{ fontSize: '11px' }}>
                          <thead>
                            <tr>
                              <th>เดือน</th>
                              <th className="align-right">รายได้วัสดุรีไซเคิล (บาท)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {THAI_MONTHS_SHORT.map((m, idx) => {
                              const rev = getMonthlyDataForModule(entriesForYear, 'recycle', 'amount')[idx];
                              return (
                                <tr key={m}>
                                  <td>{m}</td>
                                  <td className="align-right">{formatNumber(rev, 2)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#f8fafc', borderRadius: '16px', padding: '16px', border: '1px solid #e2e8f0' }}>
                        <BarChart3 size={32} style={{ color: 'var(--primary-color)', marginBottom: '8px' }} />
                        <span style={{ fontSize: '12px', fontWeight: 'bold' }}>กราฟรายได้สะสมรายปี</span>
                        <span style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', marginTop: '4px' }}>กราฟเส้นความคืบหน้ารายได้สะสม 12 เดือนในสไลด์จริง</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* FM-HY Garbage Bags Preview */}
                {activeSlide?.type === 'fmhy_bags' && (
                  <div className="slide-standard-preview">
                    <div className="slide-header">
                      <h2>{activeSlide.title}</h2>
                      <p className="slide-subtitle">รายงานสรุปจำนวนการใช้ถุงขยะสีชาและถุงดำขนาดต่าง ๆ</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginTop: '10px' }}>
                      <div className="preview-table-container" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                        <table className="preview-kpi-table" style={{ fontSize: '11px' }}>
                          <thead>
                            <tr>
                              <th>เดือน</th>
                              <th className="align-right">30x40 (ใบ)</th>
                              <th className="align-right">28x36 (ใบ)</th>
                              <th className="align-right">18x20 (ใบ)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {THAI_MONTHS_SHORT.map((m, idx) => {
                              const s = getMonthlyDataForCategory(entriesForYear, 'black_bag', 'black_bag_small', 'quantity')[idx];
                              const med = getMonthlyDataForCategory(entriesForYear, 'black_bag', 'black_bag_medium', 'quantity')[idx];
                              const l = getMonthlyDataForCategory(entriesForYear, 'black_bag', 'black_bag_large', 'quantity')[idx];
                              return (
                                <tr key={m}>
                                  <td>{m}</td>
                                  <td className="align-right">{formatNumber(l, 0)}</td>
                                  <td className="align-right">{formatNumber(med, 0)}</td>
                                  <td className="align-right">{formatNumber(s, 0)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#f8fafc', borderRadius: '16px', padding: '16px', border: '1px solid #e2e8f0' }}>
                        <BarChart3 size={32} style={{ color: 'var(--primary-color)', marginBottom: '8px' }} />
                        <span style={{ fontSize: '12px', fontWeight: 'bold' }}>แนวโน้มการสั่งใช้ถุงดำ</span>
                        <span style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', marginTop: '4px' }}>เปรียบเทียบอัตราการเติบโตรายขนาดบนสไลด์จริง</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 6. Recommendations Slide Preview */}
                {activeSlide?.type === 'recommendations' && (
                  <div className="slide-standard-preview">
                    <div className="slide-header">
                      <h2>{activeSlide.title}</h2>
                      <p className="slide-subtitle">บทวิเคราะห์แนวทางการบริหารจัดการทรัพยากรสำหรับรอบงวดถัดไป</p>
                    </div>

                    <div className="preview-recommendations-list">
                      <div className="reco-item">
                        <strong>1. การจัดการขยะ RDF:</strong> ติดตามปริมาณขยะ RDF และปรับปรุงกระบวนการบดอัดเพื่อเพิ่มประสิทธิภาพในการส่งเตาเผาขยะอย่างต่อเนื่อง
                      </div>
                      <div className="reco-item">
                        <strong>2. การตลาดขยะรีไซเคิล:</strong> วิเคราะห์แนวโน้มขยะรีไซเคิลรายสัปดาห์ เพื่อหาโอกาสเจรจาต่อรองราคากับร้านค้ารายใหญ่ในเครือข่าย
                      </div>
                      <div className="reco-item">
                        <strong>3. เศษอาหารสัตว์เปียก:</strong> ควรรักษามาตรฐานความสะอาดและรอบการจัดส่งอาหารสัตว์ เพื่อควบคุมกลิ่นสะสมในพื้นที่จัดการ
                      </div>
                      <div className="reco-item text-muted">
                        <em>* คำชี้แจง: บทสรุปนี้สังเคราะห์โดยอัลกอริทึมวิเคราะห์ข้อมูลอัตโนมัติ ควรตรวจสอบความถูกต้องกับวิศวกรโรงงานก่อนนำเสนอแก่ผู้บริหารระดับสูง</em>
                      </div>
                    </div>
                  </div>
                )}

                {/* 7. Custom Slide Preview */}
                {activeSlide?.type === 'custom' && (
                  <div className="slide-standard-preview">
                    <div className="slide-header">
                      <h2>{activeSlide.title}</h2>
                      <p className="slide-subtitle">สไลด์เนื้อหากำหนดเองโดยผู้จัดทำรายงาน</p>
                    </div>

                    <div className="preview-recommendations-list">
                      {activeSlide.bullets && activeSlide.bullets.length > 0 ? (
                        activeSlide.bullets.map((line, idx) => (
                           <div key={idx} className="reco-item" style={{ fontSize: '13px' }}>
                            {line}
                          </div>
                        ))
                      ) : (
                        <div className="reco-item text-muted" style={{ fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>
                          (ไม่มีข้อมูลข้อความ กรุณาพิมพ์แก้ไขข้อความในช่องด้านล่าง)
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Slide canvas badge for page number */}
                <div className="slide-watermark">
                  Central Pattana Report Dashboard
                </div>
              </div>
            )}
          </div>

          {/* ตัวควบคุมการเปลี่ยนสไลด์ด้านล่าง */}
          <div className="preview-pagination-control-row">
            <button 
              type="button" 
              className="btn-prev-slide"
              disabled={activePreviewIndex === 0}
              onClick={() => setActivePreviewIndex(prev => Math.max(0, prev - 1))}
            >
              ◄ สไลด์ก่อนหน้า
            </button>
            <span className="slide-number-indicator">
              หน้า {activePreviewIndex + 1} จาก {enabledSlides.length}
            </span>
            <button 
              type="button" 
              className="btn-next-slide"
              disabled={activePreviewIndex === enabledSlides.length - 1}
              onClick={() => setActivePreviewIndex(prev => Math.min(enabledSlides.length - 1, prev + 1))}
            >
              สไลด์ถัดไป ►
            </button>
          </div>

          {/* Universal Slide Details Editor */}
          {activeSlide && (
            <div className="card custom-slide-editor-card" style={{ padding: '16px', marginTop: '14px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1E293B', fontWeight: 'bold', fontSize: '14px', marginBottom: '12px' }}>
                <Edit3 size={16} /> <span>ปรับแต่งหัวเรื่อง & บทวิเคราะห์ในสไลด์ที่เลือก</span>
              </div>
              
              <div style={{ display: 'grid', gap: '12px' }}>
                <label className="field" style={{ margin: 0 }}>
                  <span style={{ fontSize: '11px', color: '#64748B' }}>หัวเรื่องสไลด์ (Slide Title)</span>
                  <input
                    type="text"
                    value={activeSlide.title}
                    onChange={e => renameSlide(activeSlide.id, e.target.value)}
                    style={{ fontSize: '13px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  />
                </label>

                {activeSlide.type === 'custom' ? (
                  <label className="field" style={{ margin: 0 }}>
                    <span style={{ fontSize: '11px', color: '#64748B' }}>เนื้อหาข้อความ (ขึ้นบรรทัดใหม่เพื่อแยกข้อความย่อย)</span>
                    <textarea
                      rows="4"
                      style={{ fontSize: '13px', fontFamily: 'monospace', borderRadius: '8px' }}
                      value={activeSlide.bullets?.join('\n') || ''}
                      onChange={(e) => updateSlideBullets(activeSlide.id, e.target.value)}
                      placeholder="พิมพ์ข้อความที่ต้องการแสดง..."
                    />
                  </label>
                ) : (
                  <div>
                    <span style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '6px' }}>การวิเคราะห์ / ข้อแนะนำเพิ่มเติมด้านขวาสไลด์ (สูงสุด 3 ข้อความ)</span>
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {[0, 1, 2].map(idx => (
                        <input
                          key={idx}
                          type="text"
                          placeholder={`ข้อความวิเคราะห์ที่ ${idx + 1} (ปล่อยว่างได้)`}
                          value={activeSlide.bullets?.[idx]?.replace(/^•\s*/, '') || ''}
                          onChange={e => updateSlideBulletPoint(activeSlide.id, idx, e.target.value)}
                          style={{ fontSize: '12.5px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

      </div>
    </section>
  )
}
