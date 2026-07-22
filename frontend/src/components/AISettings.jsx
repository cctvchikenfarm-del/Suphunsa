import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Save, ShieldCheck } from 'lucide-react'
import { apiFetch } from '../api.js'

const splitFields=value=>String(value||'').split(',').map(item=>item.trim()).filter(Boolean)

export default function AISettings(){
  const qc=useQueryClient(); const [code,setCode]=useState(''); const [message,setMessage]=useState(''); const [form,setForm]=useState(null)
  const query=useQuery({queryKey:['module-ai-settings'],queryFn:()=>apiFetch('/api/module-ai-settings')})
  const records=query.data||[]; const selected=useMemo(()=>records.find(item=>item.module.code===(code||records[0]?.module.code)),[records,code])
  useEffect(()=>{if(selected)setForm({...selected.settings,allowed_fields_text:(selected.settings.allowed_fields||[]).join(', '),excluded_fields_text:(selected.settings.excluded_fields||[]).join(', ')})},[selected])
  const save=useMutation({mutationFn:payload=>apiFetch(`/api/module-ai-settings/${selected.module.code}`,{method:'PUT',body:JSON.stringify(payload)}),onSuccess:()=>{setMessage('บันทึกการตั้งค่า AI สำเร็จ');qc.invalidateQueries({queryKey:['module-ai-settings']});qc.invalidateQueries({queryKey:['insights']})},onError:error=>setMessage(error.message)})
  if(query.isLoading)return <div className="alert">กำลังโหลดการตั้งค่า AI...</div>
  if(query.error)return <div className="alert error">{query.error.message}</div>
  if(!selected||!form)return <div className="alert">ไม่พบโมดูล</div>
  const submit=e=>{e.preventDefault();setMessage('');const {allowed_fields_text,excluded_fields_text,...payload}=form;save.mutate({...payload,warning_change_percent:Number(payload.warning_change_percent||0),allowed_fields:splitFields(allowed_fields_text),excluded_fields:splitFields(excluded_fields_text)})}
  return <div style={{display:'grid',gap:16}}>
    <div className="card"><div className="section-title-row"><div><h3><Bot size={18}/> Metadata-Aware AI Insight</h3><p className="muted">ระบบคำนวณตัวเลขก่อน แล้วส่งเฉพาะยอดสรุปที่อนุญาตให้ AI อธิบาย AI ไม่มีสิทธิ์แก้ข้อมูลหรือรัน SQL</p></div><label style={{display:'flex',gap:8,alignItems:'center',fontWeight:700}}><input type="checkbox" checked={Boolean(form.enabled)} onChange={e=>setForm({...form,enabled:e.target.checked})}/> เปิดใช้ AI สำหรับโมดูลนี้</label></div></div>
    <div className="card"><form onSubmit={submit} style={{display:'grid',gap:14}}>
      {message&&<div className={save.isError?'alert error':'alert'}>{message}</div>}
      <label className="field"><span>โมดูล</span><select value={selected.module.code} onChange={e=>setCode(e.target.value)}>{records.map(item=><option key={item.module.code} value={item.module.code}>{item.module.name_th}</option>)}</select></label>
      <label className="field"><span>บริบทภาษาไทย</span><textarea rows="3" value={form.context_th||''} onChange={e=>setForm({...form,context_th:e.target.value})} placeholder="อธิบายว่าตัวเลขนี้ใช้วัดอะไรและควรตีความอย่างไร"/></label>
      <div className="split-grid"><label className="field"><span>ตัวชี้วัดหลัก</span><input value={form.primary_metric||''} onChange={e=>setForm({...form,primary_metric:e.target.value})} required pattern="[a-z][a-z0-9_]*"/></label><label className="field"><span>วิธีสรุป</span><select value={form.aggregation||'sum'} onChange={e=>setForm({...form,aggregation:e.target.value})}>{['sum','average','latest','count','calculated'].map(item=><option key={item}>{item}</option>)}</select></label></div>
      <div className="split-grid"><label className="field"><span>ทิศทางที่ต้องการ</span><select value={form.better_direction||'neutral'} onChange={e=>setForm({...form,better_direction:e.target.value})}><option value="lower">ยิ่งต่ำยิ่งดี</option><option value="higher">ยิ่งสูงยิ่งดี</option><option value="neutral">เป็นกลาง</option></select></label><label className="field"><span>แจ้งเตือนเมื่อเปลี่ยนเกิน (%)</span><input type="number" min="0" max="1000" step="0.1" value={form.warning_change_percent??15} onChange={e=>setForm({...form,warning_change_percent:e.target.value})}/></label></div>
      <label className="field"><span>ฟิลด์ที่อนุญาตให้ใช้วิเคราะห์</span><input value={form.allowed_fields_text||''} onChange={e=>setForm({...form,allowed_fields_text:e.target.value})} placeholder="quantity, amount"/><small className="muted">คั่นด้วยเครื่องหมายจุลภาค</small></label>
      <label className="field"><span>ฟิลด์ต้องห้าม</span><input value={form.excluded_fields_text||''} onChange={e=>setForm({...form,excluded_fields_text:e.target.value})} placeholder="created_by"/></label>
      <label className="field"><span>คำแนะนำเพิ่มเติมสำหรับ AI</span><textarea rows="3" value={form.instructions||''} onChange={e=>setForm({...form,instructions:e.target.value})}/></label>
      <div className="alert"><ShieldCheck size={16}/> ข้อมูลที่ส่งออกจาก Backend มีเฉพาะชื่อโมดูล ยอดรวม เดือนก่อน เปอร์เซ็นต์เปลี่ยนแปลง และบริบทที่กำหนด ไม่มีข้อมูลผู้ใช้ ไม่มี Service Role Key และไม่มีเครื่องมือ SQL</div>
      <div className="form-actions bottom-actions"><button className="primary" disabled={save.isPending}><Save size={16}/> {save.isPending?'กำลังบันทึก...':'บันทึกการตั้งค่า AI'}</button></div>
    </form></div>
  </div>
}
