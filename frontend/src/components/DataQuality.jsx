import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch, currentMonth } from '../api.js'
import InsightPanel from './InsightPanel.jsx'
import MonthPicker from './MonthPicker.jsx'


const labels = {
  rdf: 'RDF',
  dog_food: 'อาหารหมา',
  pig_feed: 'อาหารหมู',
  recycle: 'รีไซเคิล',
  tissue: 'กระดาษทิชชู่',
  black_bag: 'ถุงดำ',
  consumable: 'ของใช้สิ้นเปลือง'
}

export default function DataQuality() {
  const [month, setMonth] = useState(currentMonth())
  const { data, isLoading, error } = useQuery({
    queryKey: ['data-quality', month],
    queryFn: () => apiFetch(`/api/data-quality?month=${month}`)
  })
  const { data: insights } = useQuery({
    queryKey: ['quality-insights', month],
    queryFn: () => apiFetch(`/api/insights?month=${month}`)
  })

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Data Governance</p>
          <h2>ตรวจคุณภาพข้อมูล</h2>
          <p className="muted">คำนวณจากจำนวนวันที่มีข้อมูลและความสมบูรณ์ของฟิลด์</p>
        </div>
        <label className="field small-field">
          <span>เลือกเดือน</span>
          <MonthPicker value={month} onChange={setMonth} />
        </label>
      </div>

      {error && <div className="alert error">เชื่อมต่อ API ไม่สำเร็จ: {error.message}</div>}
      {isLoading && <div className="alert">กำลังโหลดข้อมูล...</div>}

      <InsightPanel insights={insights} compact />

      <div className="quality-grid">
        {(data?.scores || []).map(item => (
          <div className="card quality-card" key={item.module}>
            <div className="card-title-row">
              <h3>{labels[item.module] || item.module}</h3>
              <span>{item.entries} รายการ</span>
            </div>
            <div className="quality-score">{item.score}%</div>
            <div className="progress"><div style={{ width: `${item.score}%` }} /></div>
            <p className="muted">ครอบคลุม {item.covered_days}/{item.expected_days} วัน</p>
          </div>
        ))}
      </div>
    </section>
  )
}
