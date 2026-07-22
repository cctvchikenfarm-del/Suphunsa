import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, currentMonth } from '../api.js'
import MonthPicker from './MonthPicker.jsx'


const actionOptions = [
  { value: 'data_quality_check', label: 'ตรวจคุณภาพข้อมูล' },
  { value: 'monthly_summary', label: 'สรุปรายเดือน' },
  { value: 'report_preview', label: 'เตรียมพรีวิวรายงาน' },
  { value: 'ai_insight_check', label: 'วิเคราะห์ AI Insight' },
  { value: 'chart_preview', label: 'เตรียมกราฟรายงาน' }
]

export default function Automation() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ name: '', action_type: 'data_quality_check', interval_minutes: 1440, enabled: false, config: { month: currentMonth() } })

  const jobsQuery = useQuery({ queryKey: ['automation-jobs'], queryFn: () => apiFetch('/api/automation/jobs') })
  const runsQuery = useQuery({ queryKey: ['automation-runs'], queryFn: () => apiFetch('/api/automation/runs') })

  const createJob = useMutation({
    mutationFn: payload => apiFetch('/api/automation/jobs', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { setForm({ name: '', action_type: 'data_quality_check', interval_minutes: 1440, enabled: false, config: { month: currentMonth() } }); queryClient.invalidateQueries({ queryKey: ['automation-jobs'] }) }
  })

  const updateJob = useMutation({
    mutationFn: ({ id, patch }) => apiFetch(`/api/automation/jobs/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automation-jobs'] })
  })

  const runJob = useMutation({
    mutationFn: id => apiFetch(`/api/automation/jobs/${id}/run`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['automation-jobs'] }); queryClient.invalidateQueries({ queryKey: ['automation-runs'] }) }
  })

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Automation</p>
          <h2>Automation Jobs</h2>
          <p className="muted">ตั้งงานอัตโนมัติพื้นฐาน: ตรวจคุณภาพข้อมูล สรุปรายเดือน เตรียมพรีวิวรายงาน วิเคราะห์ AI Insight และเตรียมกราฟรายงาน</p>
        </div>
      </div>

      {(jobsQuery.error || runsQuery.error || createJob.error || runJob.error) && (
        <div className="alert error">Automation error: {(jobsQuery.error || runsQuery.error || createJob.error || runJob.error)?.message}</div>
      )}

      <div className="split-grid">
        <div className="card">
          <h3>สร้าง Automation</h3>
          <label className="field"><span>ชื่องาน</span><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="เช่น สรุปรายเดือน" /></label>
          <label className="field"><span>ประเภทงาน</span><select value={form.action_type} onChange={e => setForm({ ...form, action_type: e.target.value })}>{actionOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="field"><span>เดือนข้อมูล</span><MonthPicker value={form.config.month} onChange={val => setForm({ ...form, config: { ...form.config, month: val } })} /></label>
          <label className="field"><span>รอบเวลา / นาที</span><input type="number" value={form.interval_minutes} onChange={e => setForm({ ...form, interval_minutes: e.target.value })} /></label>
          <label className="check-inline"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} /> เปิดให้ระบบรันตามเวลา</label>
          <div className="muted note-box">หมายเหตุ: ถ้าต้องการให้ Render รันเองตามเวลา ให้ตั้ง ENV backend: AUTOMATION_RUNNER_ENABLED=true</div>
          <div className="form-actions bottom-actions"><button className="primary" onClick={() => createJob.mutate(form)} disabled={createJob.isPending}>Save Automation</button></div>
        </div>

        <div className="card wide-table-card">
          <div className="section-title-row"><h3>รายการ Automation</h3><span className="muted">{jobsQuery.data?.length || 0} งาน</span></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>ชื่องาน</th><th>ประเภท</th><th>สถานะ</th><th>รอบเวลา</th><th>รันล่าสุด</th><th>จัดการ</th></tr></thead>
              <tbody>
                {(jobsQuery.data || []).map(job => (
                  <tr key={job.id}>
                    <td>{job.name}</td>
                    <td>{actionOptions.find(item => item.value === job.action_type)?.label || job.action_type}</td>
                    <td><button className="tiny" onClick={() => updateJob.mutate({ id: job.id, patch: { enabled: !job.enabled } })}>{job.enabled ? 'เปิด' : 'ปิด'}</button></td>
                    <td>{job.interval_minutes} นาที</td>
                    <td>{job.last_run_at ? new Date(job.last_run_at).toLocaleString('th-TH') : '-'}</td>
                    <td><button className="primary tiny" onClick={() => runJob.mutate(job.id)} disabled={runJob.isPending}>Run</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title-row"><h3>Automation Run History</h3><button className="ghost" onClick={() => runsQuery.refetch()}>Refresh</button></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>เวลาเริ่ม</th><th>สถานะ</th><th>ผลลัพธ์</th></tr></thead>
            <tbody>
              {(runsQuery.data || []).map(run => (
                <tr key={run.id}>
                  <td>{new Date(run.started_at).toLocaleString('th-TH')}</td>
                  <td>{run.status}</td>
                  <td><code>{JSON.stringify(run.result || {}).slice(0, 240)}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
