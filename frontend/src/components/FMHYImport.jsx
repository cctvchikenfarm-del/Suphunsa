import React, { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiFetch, formatNumber } from '../api.js'
import { UploadCloud, CheckCircle2, AlertTriangle, ArrowRight, Loader2, FileText, ChevronRight } from 'lucide-react'

export default function FMHYImport() {
  const queryClient = useQueryClient()
  const [file, setFile] = useState(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // ผลลัพธ์หลังวิเคราะห์ (Stage 1)
  const [previewData, setPreviewData] = useState(null)
  
  // ตัวเลือกจัดการแถวซ้ำ (ข้าม = Skip, เขียนทับ = Overwrite)
  const [duplicateMode, setDuplicateMode] = useState('skip') // 'skip' เป็นค่าเริ่มต้นตามที่ผู้ใช้สั่งการ
  const [importSummary, setImportSummary] = useState(null)

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true)
    } else if (e.type === 'dragleave') {
      setIsDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0])
    }
  }

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  // ส่งไฟล์ไปวิเคราะห์ (Stage 1)
  const handleAnalyze = async () => {
    if (!file) return
    setIsLoading(true)
    setError(null)
    setImportSummary(null)

    const formData = new FormData()
    formData.append('file', file)

    const rawApiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
    const API_BASE = rawApiBase && !rawApiBase.startsWith('http') ? `https://${rawApiBase}` : rawApiBase
    try {
      const response = await fetch(`${API_BASE}/api/fmhy/import`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'วิเคราะห์เอกสารไม่สำเร็จ')
      }
      setPreviewData(result)
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  // กดยืนยันบันทึกข้อมูล (Stage 2)
  const handleConfirmImport = async () => {
    if (!previewData) return
    setIsLoading(true)
    setError(null)

    try {
      const payload = {
        commit: true,
        overwrite: duplicateMode === 'overwrite',
        entries: previewData.entries
      }

      const result = await apiFetch('/api/fmhy/import', {
        method: 'POST',
        body: JSON.stringify(payload)
      })

      setImportSummary(result.summary)
      await queryClient.invalidateQueries({ queryKey:['entries'] })
      // ล้างพรีวิวหลังบันทึกสำเร็จ
      setPreviewData(null)
      setFile(null)
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setPreviewData(null)
    setError(null)
    setImportSummary(null)
  }

  // สลับการระบุหมวดหมู่หลัก
  const getModuleLabel = (module) => {
    const labels = {
      rdf: 'RDF / ขยะเชื้อเพลิง',
      dog_food: 'ขยะเปียก (อาหารสุนัข)',
      pig_feed: 'ขยะเปียก (อาหารหมู)',
      recycle: 'รีไซเคิล',
      tissue: 'กระดาษทิชชู่',
      black_bag: 'ถุงดำ',
      consumable: 'ของใช้สิ้นเปลือง'
    }
    return labels[module] || module
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">ระบบนำเข้าเอกสารอัจฉริยะ</p>
          <h2>นำเข้าข้อมูล FM-HY (PDF)</h2>
          <p className="muted">ลดภาระการพิมพ์ข้อมูลด้วยการลากวางไฟล์ PDF รายงาน Facility Monthly - Hygiene เพื่อให้ AI แกะข้อมูลเข้าแดชบอร์ด</p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      
      {importSummary && (
        <div className="card" style={{ padding: '24px', textAlign: 'center', borderRadius: '24px', border: '1px solid #10b981', background: '#ecfdf5', marginBottom: '20px' }}>
          <CheckCircle2 size={48} style={{ color: '#10b981', margin: '0 auto 12px auto' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#065f46', margin: '0 0 8px 0' }}>นำเข้าข้อมูลสำเร็จ!</h3>
          <p style={{ color: '#047857', fontSize: '14px', margin: '0 0 16px 0' }}>{importSummary}</p>
          <button type="button" className="primary" onClick={handleReset} style={{ borderRadius: '12px' }}>นำเข้าไฟล์ใหม่</button>
        </div>
      )}

      {/* สเตจที่ 1: หน้าจอรับอัปโหลดไฟล์ */}
      {!previewData && !importSummary && (
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div 
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            style={{
              border: '2px dashed',
              borderColor: isDragActive ? 'var(--primary-color)' : '#cbd5e1',
              borderRadius: '24px',
              padding: '40px 24px',
              textAlign: 'center',
              background: isDragActive ? 'var(--primary-light)' : '#white',
              transition: 'all 0.2s ease',
              cursor: 'pointer',
              boxShadow: '0 8px 30px rgba(0,0,0,0.02)'
            }}
          >
            <input 
              id="pdf-file-input"
              type="file" 
              accept=".pdf" 
              onChange={handleFileChange} 
              style={{ display: 'none' }}
            />
            <label htmlFor="pdf-file-input" style={{ cursor: 'pointer', display: 'block' }}>
              <UploadCloud size={64} style={{ color: file ? 'var(--primary-color)' : '#94a3b8', margin: '0 auto 16px auto', transition: 'transform 0.2s' }} />
              
              {file ? (
                <div>
                  <h4 style={{ fontSize: '15px', fontWeight: 'bold', margin: '0 0 4px 0', color: '#1e293b' }}>
                    {file.name}
                  </h4>
                  <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>
                    ขนาดไฟล์: {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <div>
                  <h4 style={{ fontSize: '15px', fontWeight: 'bold', margin: '0 0 8px 0', color: '#1e293b' }}>
                    ลากและวางไฟล์ PDF รายงาน FM-HY ตรงนี้
                  </h4>
                  <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px 0' }}>
                    หรือคลิกเพื่อเลือกไฟล์จากคอมพิวเตอร์ของคุณ
                  </p>
                  <span style={{ fontSize: '11px', padding: '6px 12px', background: '#f1f5f9', borderRadius: '8px', color: '#64748b', fontWeight: '600' }}>
                    รองรับไฟล์เอกสาร PDF เท่านั้น
                  </span>
                </div>
              )}
            </label>
          </div>

          <div style={{ marginTop: '20px', display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button 
              type="button" 
              className="primary" 
              disabled={!file || isLoading} 
              onClick={handleAnalyze}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '14px' }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  <span>กำลังวิเคราะห์เอกสาร...</span>
                </>
              ) : (
                <>
                  <span>วิเคราะห์และพรีวิวข้อมูล</span>
                  <ChevronRight size={18} />
                </>
              )}
            </button>
            {file && !isLoading && (
              <button type="button" className="secondary" onClick={() => setFile(null)} style={{ borderRadius: '14px' }}>ยกเลิก</button>
            )}
          </div>
        </div>
      )}

      {/* สเตจที่ 2: แสดงตารางพรีวิวก่อนนำเข้า (Reconciliation Table) */}
      {previewData && (
        <div className="card" style={{ padding: '24px', borderRadius: '24px', animation: 'fadeIn 0.3s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--primary-color)', textTransform: 'uppercase' }}>สแกนพบข้อมูลปี พ.ศ. {previewData.year_be}</span>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: '4px 0 0 0', color: '#1e293b' }}>
                พรีวิวข้อมูลประจำเดือน {previewData.thai_month} {previewData.year_be}
              </h3>
            </div>

            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#475569' }}>
                ⚙️ การจัดการกรณีพบข้อมูลซ้ำ:
              </div>
              <div style={{ display: 'flex', gap: '8px', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
                <button
                  type="button"
                  onClick={() => setDuplicateMode('skip')}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    borderRadius: '8px',
                    border: 'none',
                    fontWeight: 'bold',
                    background: duplicateMode === 'skip' ? 'white' : 'transparent',
                    color: duplicateMode === 'skip' ? '#0f172a' : '#64748b',
                    boxShadow: duplicateMode === 'skip' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                    cursor: 'pointer'
                  }}
                >
                  ข้าม (Skip - แนะนำ)
                </button>
                <button
                  type="button"
                  onClick={() => setDuplicateMode('overwrite')}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    borderRadius: '8px',
                    border: 'none',
                    fontWeight: 'bold',
                    background: duplicateMode === 'overwrite' ? 'white' : 'transparent',
                    color: duplicateMode === 'overwrite' ? '#ef4444' : '#64748b',
                    boxShadow: duplicateMode === 'overwrite' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                    cursor: 'pointer'
                  }}
                >
                  เขียนทับ (Overwrite)
                </button>
              </div>
            </div>
          </div>

          {previewData.hasConflicts && duplicateMode === 'skip' && (
            <div className="alert warning" style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
              <AlertTriangle size={18} />
              <span>ตรวจพบข้อมูลบางหมวดหมู่ของเดือนนี้มีอยู่ในระบบแล้ว แถวที่ซ้ำจะถูก **"ข้ามโดยอัตโนมัติ"** เมื่อกดยืนยันนำเข้า</span>
            </div>
          )}

          <table className="table" style={{ width: '100%', fontSize: '13px', marginBottom: '20px' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th>ประเภทข้อมูลหลัก</th>
                <th>ชนิดรายการ</th>
                <th style={{ textAlign: 'right' }}>ค่าที่จะนำเข้า</th>
                <th>หน่วยวัด</th>
                <th>สถานะการนำเข้า</th>
              </tr>
            </thead>
            <tbody>
              {previewData.entries.map((entry, idx) => {
                const val = entry.quantity !== null ? entry.quantity : (entry.weight_kg !== null ? entry.weight_kg : entry.amount)
                const isConflict = entry.isDuplicate

                return (
                  <tr key={idx} style={{ 
                    borderBottom: '1px solid #f1f5f9',
                    opacity: isConflict && duplicateMode === 'skip' ? 0.6 : 1,
                    background: isConflict && duplicateMode === 'skip' ? '#fffbeb' : 'transparent'
                  }}>
                    <td style={{ fontWeight: 'bold' }}>{getModuleLabel(entry.module)}</td>
                    <td>{entry.material_name}</td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--primary-color)' }}>
                      {formatNumber(val, entry.module === 'recycle' && entry.amount !== null ? 2 : 1)}
                    </td>
                    <td>{entry.unit}</td>
                    <td>
                      {isConflict ? (
                        duplicateMode === 'skip' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', background: '#fef3c7', color: '#b45309', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }}>
                            <AlertTriangle size={12} /> ข้าม (ซ้ำในระบบ)
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }}>
                            <AlertTriangle size={12} /> เขียนทับข้อมูลเก่า
                          </span>
                        )
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', background: '#d1fae5', color: '#047857', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }}>
                          <CheckCircle2 size={12} /> ข้อมูลใหม่พร้อมนำเข้า
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" className="secondary" onClick={handleReset} disabled={isLoading}>ยกเลิก</button>
            <button 
              type="button" 
              className="primary" 
              onClick={handleConfirmImport} 
              disabled={isLoading}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  <span>กำลังนำเข้าข้อมูล...</span>
                </>
              ) : (
                <>
                  <span>ยืนยันและนำเข้าข้อมูลเข้า Dashboard</span>
                  <CheckCircle2 size={18} />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
