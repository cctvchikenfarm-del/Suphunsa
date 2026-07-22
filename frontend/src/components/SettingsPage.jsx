import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  Settings, Sliders, Database, Trash2, Edit3, Plus, 
  ToggleLeft, ToggleRight, Save, X, Bot
} from 'lucide-react'
import { apiFetch } from '../api.js'
import { moduleLabels } from '../lib/report-builder.js'
import { COMMON_UNITS, suggestUnit } from '../lib/unit-suggestions.js'
import ModuleBuilder from './ModuleBuilder.jsx'
import AISettings from './AISettings.jsx'

const moduleOptions = [
  { value: 'rdf', label: 'RDF' },
  { value: 'dog_food', label: 'อาหารหมา' },
  { value: 'pig_feed', label: 'อาหารหมู' },
  { value: 'wet_waste', label: 'ขยะเปียก' },
  { value: 'recycle', label: 'รีไซเคิล' },
  { value: 'tissue', label: 'กระดาษทิชชู่' },
  { value: 'black_bag', label: 'ถุงดำ' },
  { value: 'consumable', label: 'น้ำยาต่างๆ' }
]

export const dbModuleMap = {
  rdf: 'rdf',
  dog_food: 'dog_food',
  pig_feed: 'pig_feed',
  wet_waste: 'wet_waste',
  recycle: 'recycle',
  tissue: 'tissue',
  black_bag: 'black_bag',
  consumable: 'consumable'
}

const emptyCategory = {
  module: 'recycle',
  code: '',
  name_th: '',
  name_en: '',
  unit: 'kg',
  color: '#3B82F6',
  sort_order: 10,
  active: true
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [activeSubTab, setActiveSubTab] = useState('master-data')
  const [selectedModule, setSelectedModule] = useState('recycle')

  // Form states for creating new category
  const [form, setForm] = useState(emptyCategory)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [unitEditedManually, setUnitEditedManually] = useState(false)
  const [unitSuggestionLabel, setUnitSuggestionLabel] = useState('')
  
  // Row being edited inline
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({
    name_th: '',
    unit: '',
    color: '#3B82F6',
    sort_order: 10,
    active: true
  })

  // Queries
  const { data: categories = [], isLoading, error } = useQuery({
    queryKey: ['master-categories-all'],
    queryFn: () => apiFetch('/api/master-categories/all')
  })

  // Filter categories by selected module
  const filteredCategories = categories.filter(c => {
    const dbModule = dbModuleMap[selectedModule] || selectedModule
    let match = selectedModule === 'consumable'
      ? ['consumable', 'cleaning_liquid'].includes(c.module)
      : c.module === dbModule
    if (selectedModule === 'dog_food') {
      match = match && c.code === 'DOG_FOOD'
    } else if (selectedModule === 'pig_feed') {
      match = match && c.code === 'PIG_FEED'
    } else if (selectedModule === 'rdf') {
      match = match && c.code === 'RDF'
    }
    return match
  })

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload) => apiFetch('/api/master-categories', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['master-categories-all'] })
      queryClient.invalidateQueries({ queryKey: ['master-categories'] })
      setForm({ ...emptyCategory, module: selectedModule })
      setUnitEditedManually(false); setUnitSuggestionLabel('')
      setFormError('')
      setFormSuccess('เพิ่ม Master Data สำเร็จแล้ว')
    },
    onError: (err) => { setFormSuccess(''); setFormError(err.message || 'เพิ่ม Master Data ไม่สำเร็จ') }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }) => apiFetch(`/api/master-categories/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['master-categories-all'] })
      queryClient.invalidateQueries({ queryKey: ['master-categories'] })
      setEditingId(null)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => apiFetch(`/api/master-categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['master-categories-all'] })
      queryClient.invalidateQueries({ queryKey: ['master-categories'] })
    },
    onError: (err) => {
      window.alert(err.message || 'ไม่สามารถลบรายการนี้ได้ เนื่องจากมีข้อมูลถูกกรอกใช้งานในระบบแล้ว')
    }
  })

  const startInlineEdit = (cat) => {
    setEditingId(cat.id)
    setEditForm({
      name_th: cat.name_th,
      unit: cat.unit,
      color: cat.color || '#3b82f6',
      sort_order: cat.sort_order || 10,
      active: cat.active ?? true
    })
  }

  const saveInlineEdit = (id) => {
    updateMutation.mutate({ id, patch: editForm })
  }

  const toggleActiveState = (cat) => {
    updateMutation.mutate({
      id: cat.id,
      patch: { active: !cat.active }
    })
  }

  const handleCreateSubmit = (e) => {
    e.preventDefault()
    setFormError(''); setFormSuccess('')
    if (!form.code.trim() || !/^[A-Za-z0-9_-]+$/.test(form.code.trim())) return setFormError('รหัสชนิดย่อยใช้ได้เฉพาะภาษาอังกฤษ ตัวเลข _ และ -')
    if (!form.name_th.trim()) return setFormError('กรุณากรอกชื่อชนิดย่อยภาษาไทย')
    if (!form.unit.trim()) return setFormError('กรุณากรอกหน่วยนับ')
    if (!/^#[0-9A-Fa-f]{6}$/.test(form.color)) return setFormError('รหัสสีต้องเป็นรูปแบบ #RRGGBB เช่น #3B82F6')
    const dbModule = dbModuleMap[form.module] || form.module
    // Ensure code includes module prefix for uniqueness
    const finalCode = form.code.startsWith(dbModule + '_') 
      ? form.code 
      : `${dbModule}_${form.code.trim().toLowerCase()}`
    
    createMutation.mutate({
      ...form,
      module: dbModule,
      code: finalCode
    })
  }

  const applySuggestedUnit = (nextModule, nextName, force = false) => {
    if (unitEditedManually && !force) return
    const suggestion = suggestUnit(nextModule, nextName)
    setForm(prev => ({ ...prev, module: nextModule, name_th: nextName, unit: suggestion.unit }))
    setUnitSuggestionLabel(suggestion.unit ? `หน่วยแนะนำอัตโนมัติ: ${suggestion.unit}` : 'ไม่สามารถระบุหน่วยอัตโนมัติ กรุณาเลือกหน่วย')
  }

  return (
    <section className="page settings-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">System Settings</p>
          <h2>ตั้งค่าระบบ (Settings)</h2>
          <p className="muted">จัดการชนิดข้อมูลกลาง (Master Data) และค่าควบคุมทั่วไปของระบบ</p>
        </div>
      </div>

      <div className="tab-row left-tabs">
        <button className={activeSubTab === 'master-data' ? 'active' : ''} onClick={() => setActiveSubTab('master-data')}>
          <Sliders size={15} style={{ marginRight: '6px', display: 'inline' }} /> รายการข้อมูลหลัก (Master Data)
        </button>
        <button className={activeSubTab === 'system' ? 'active' : ''} onClick={() => setActiveSubTab('system')}>
          <Database size={15} style={{ marginRight: '6px', display: 'inline' }} /> ข้อมูลและสถานะระบบ
        </button>
        <button className={activeSubTab === 'module-builder' ? 'active' : ''} onClick={() => setActiveSubTab('module-builder')}><Plus size={15}/> Module Builder</button>
        <button className={activeSubTab === 'ai-settings' ? 'active' : ''} onClick={() => setActiveSubTab('ai-settings')}><Bot size={15}/> AI Insight</button>
      </div>

      {activeSubTab === 'module-builder' && <ModuleBuilder />}
      {activeSubTab === 'ai-settings' && <AISettings />}

      {activeSubTab === 'master-data' && (
        <div className="split-grid">
          
          {/* Left panel: Add Category */}
          <div className="card">
            <h3>เพิ่มข้อมูลประเภท/ชนิดย่อย (Master Data)</h3>
            <p className="muted" style={{ marginBottom: '14px', fontSize: '12.5px' }}>
              ข้อมูลกลางที่จะนำไปใช้เป็นตัวเลือกหลักในการบันทึกข้อมูลและกรองแดชบอร์ด
            </p>
            
            <form onSubmit={handleCreateSubmit} style={{ display: 'grid', gap: '14px' }}>
              {formError && <div className="alert error" role="alert">{formError}</div>}
              {formSuccess && <div className="alert" style={{ color: '#15803d' }}>{formSuccess}</div>}
              <div className="field">
                <span>หมวดหมู่หลัก</span>
                <select value={form.module} onChange={e => { setUnitEditedManually(false); applySuggestedUnit(e.target.value, form.name_th, true) }}>
                  {moduleOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>

              <div className="field">
                <span>รหัสชนิดย่อย (Code)</span>
                <input 
                  value={form.code} 
                  onChange={e => setForm({ ...form, code: e.target.value })} 
                  placeholder="เช่น cup, cardboard, standard"
                  required
                />
                <span className="muted" style={{ fontSize: '11px', fontWeight: 'normal' }}>
                  * ภาษาอังกฤษเท่านั้น ระบบจะต่อรหัสตามหน้างานอัตโนมัติเป็น {form.module}_(รหัส)
                </span>
              </div>

              <div className="field">
                <span>ชื่อชนิดย่อยภาษาไทย</span>
                <input 
                  value={form.name_th} 
                  onChange={e => { const name=e.target.value; setForm(prev=>({...prev,name_th:name})); applySuggestedUnit(form.module,name) }}
                  placeholder="เช่น ถ้วยพลาสติก, ลังกระดาษ"
                  required
                />
              </div>

              <div className="field">
                <span>หน่วยนับกลาง</span>
                <input
                  list="master-unit-options"
                  value={form.unit} 
                  onChange={e => { setUnitEditedManually(true); setUnitSuggestionLabel('กำหนดหน่วยเอง'); setForm({ ...form, unit: e.target.value }) }}
                  placeholder="เช่น kg, ม้วน, ชิ้น, แพ็ค"
                  required
                />
                <datalist id="master-unit-options">{COMMON_UNITS.map(unit=><option key={unit} value={unit}/>)}</datalist>
                <span className="muted" style={{fontSize:'11px',fontWeight:'normal'}}>{unitSuggestionLabel || 'ระบบจะแนะนำหน่วยจากหมวดและชื่อรายการ และยังแก้ไขได้'}</span>
              </div>

              <div className="field">
                <span>รหัสสีประจำประเภท (Hex Color)</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} style={{ width: '46px', height: '46px', padding: 0, border: 0, cursor: 'pointer' }} />
                  <input value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} style={{ flex: 1 }} />
                </div>
              </div>

              <div className="field">
                <span>เรียงลำดับการแสดงผล</span>
                <input 
                  type="number" 
                  value={form.sort_order} 
                  onChange={e => setForm({ ...form, sort_order: Number(e.target.value) })} 
                />
              </div>

              <div className="form-actions bottom-actions">
                <button type="submit" className="primary" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'กำลังบันทึก...' : 'เพิ่ม Master Data'}
                </button>
              </div>
            </form>
          </div>

          {/* Right panel: Category List */}
          <div className="card wide-table-card">
            <div className="section-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3>รายการชนิดย่อยแบ่งตามหมวดหมู่</h3>
                <p className="muted no-margin">ห้ามลบรายการที่เปิดกรอกข้อมูลแล้ว ให้ใช้ตัวเลือกปิดใช้งานแทน</p>
              </div>
              <select value={selectedModule} onChange={e => setSelectedModule(e.target.value)} style={{ width: '160px' }}>
                {moduleOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>

            <div className="table-wrap" style={{ marginTop: '16px' }}>
              <table>
                <thead>
                  <tr>
                    <th>ลำดับ</th>
                    <th>รหัสเรียก (Code)</th>
                    <th>ชื่อวัสดุ (ไทย)</th>
                    <th>หน่วยนับ</th>
                    <th>สีประจำตัว</th>
                    <th>สถานะ</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && <tr><td colSpan="7" className="empty-cell">กำลังโหลดข้อมูล...</td></tr>}
                  {!isLoading && !filteredCategories.length && (
                    <tr><td colSpan="7" className="empty-cell" style={{ textAlign: 'center', padding: '24px' }}>ยังไม่มีชนิดย่อยในหมวดหมู่นี้</td></tr>
                  )}
                  {filteredCategories.map(cat => {
                    const isEditing = editingId === cat.id
                    
                    return (
                      <tr key={cat.id}>
                        <td>
                          {isEditing ? (
                            <input 
                              type="number" 
                              value={editForm.sort_order} 
                              onChange={e => setEditForm({ ...editForm, sort_order: Number(e.target.value) })}
                              style={{ width: '60px', padding: '6px' }}
                            />
                          ) : (
                            cat.sort_order || 0
                          )}
                        </td>
                        <td><code>{cat.code}</code></td>
                        <td>
                          {isEditing ? (
                            <input 
                              value={editForm.name_th} 
                              onChange={e => setEditForm({ ...editForm, name_th: e.target.value })}
                              style={{ padding: '6px' }}
                            />
                          ) : (
                            <strong>{cat.name_th}</strong>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input 
                              value={editForm.unit} 
                              onChange={e => setEditForm({ ...editForm, unit: e.target.value })}
                              style={{ width: '80px', padding: '6px' }}
                            />
                          ) : (
                            cat.unit
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input 
                              type="color" 
                              value={editForm.color} 
                              onChange={e => setEditForm({ ...editForm, color: e.target.value })}
                              style={{ border: 0, padding: 0, cursor: 'pointer' }}
                            />
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ display: 'inline-block', width: '16px', height: '16px', borderRadius: '4px', background: cat.color || '#CBD5E1' }} />
                              <code style={{ fontSize: '11px' }}>{cat.color}</code>
                            </div>
                          )}
                        </td>
                        <td>
                          <button 
                            type="button" 
                            className="tiny"
                            onClick={() => toggleActiveState(cat)}
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', background: cat.active ? '#eff6ff' : '#f1f5f9', color: cat.active ? '#1d4ed8' : '#64748b', borderColor: cat.active ? '#bfdbfe' : '#cbd5e1' }}
                          >
                            {cat.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                            {cat.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                          </button>
                        </td>
                        <td className="actions-cell">
                          {isEditing ? (
                            <>
                              <button type="button" className="tiny" onClick={() => saveInlineEdit(cat.id)} style={{ marginRight: '6px', color: '#16a34a', borderColor: '#bbf7d0', background: '#f0fdf4' }}>บันทึก</button>
                              <button type="button" className="tiny" onClick={() => setEditingId(null)}>ยกเลิก</button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="tiny" onClick={() => startInlineEdit(cat)} style={{ marginRight: '6px' }}>แก้ไข</button>
                              <button type="button" className="tiny danger" onClick={() => window.confirm('ยืนยันลบชนิดวัสดุกลางนี้?') && deleteMutation.mutate(cat.id)}>ลบ</button>
                            </>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {activeSubTab === 'system' && (
        <div className="card">
          <h3>สถานะการเชื่อมต่อฐานข้อมูล</h3>
          <p className="muted" style={{ marginTop: '6px' }}>ระบบขับเคลื่อนด้วยฐานข้อมูลกลาง Supabase (PostgreSQL)</p>
          
          <div style={{ display: 'grid', gap: '12px', marginTop: '20px', maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#f8fafc', borderRadius: '8px' }}>
              <span>เวอร์ชันระบบเบื้องหลัง:</span>
              <strong>3.0.9-production-ready</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#f8fafc', borderRadius: '8px' }}>
              <span>สถานะเชื่อมต่อ Supabase:</span>
              <span style={{ color: '#16a34a', fontWeight: 'bold' }}>เชื่อมต่อสำเร็จ (Online)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#f8fafc', borderRadius: '8px' }}>
              <span>ตารางข้อมูลกลางที่พร้อมใช้งาน:</span>
              <span>profiles, data_entries, master_categories</span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
