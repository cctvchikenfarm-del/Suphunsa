import React, { useState } from 'react'
import { apiFetch } from '../api.js'

function readableLoginError(error) {
  const message = error?.message || String(error);
  if (/invalid login credentials/iu.test(message) || /อีเมลหรือรหัสผ่านไม่ถูกต้อง/iu.test(message)) {
    return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  }
  return message;
}

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [resetMessage, setResetMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  async function resetPassword() {
    if (!email.trim()) return setError('กรุณากรอกอีเมลก่อน')
    setError('')
    try {
      const result = await apiFetch('/api/auth/password-reset', { method: 'POST', body: JSON.stringify({ email: email.trim() }) })
      setResetMessage(result.message)
    } catch (resetError) {
      setError(readableLoginError(resetError))
    }
  }

  async function submit(event) {
    event.preventDefault()
    setError("")
    setSubmitting(true)
    try {
      await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) })
      onLoginSuccess()
    } catch (nextError) {
      setError(readableLoginError(nextError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-visual" aria-hidden="true">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
          <div className="brand-card">CENTRAL<br />KRABI</div>
          <img src="/mascot.png" alt="Central Mascot" style={{ width: '80px', height: '80px', objectFit: 'contain', background: 'rgba(255, 255, 255, 0.95)', padding: '6px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }} />
        </div>
        <div style={{ marginTop: '20px' }}>
          <p className="eyebrow">Waste & Resource Management</p>
          <h1>ข้อมูลที่ชัดเจน<br />เริ่มจากระบบที่เชื่อถือได้</h1>
          <p>ระบบจัดการขยะและทรัพยากรสำหรับ Central Krabi</p>
        </div>
        <small>Central Krabi Environmental Operations v3.2.5 TISSUE + THEME</small>
      </section>

      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <p className="eyebrow">Secure Access</p>
          <h2>เข้าสู่ระบบ</h2>
          <p className="muted">สำหรับผู้ใช้งาน Central Krabi Analytics Platform</p>

          {error && <div className="alert error" role="alert">{error}</div>}
          {resetMessage && <div className="alert">{resetMessage}</div>}

          <div className="field">
            <span>อีเมล</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <span>รหัสผ่าน</span>
            <div className="password-input-row">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button type="button" className="tiny" onClick={() => setShowPassword(value => !value)}>{showPassword ? 'ซ่อน' : 'แสดง'}</button>
            </div>
          </div>
          <button className="primary" style={{ width: '100%', marginTop: '14px', minHeight: '48px' }} disabled={submitting}>
            {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
          <button type="button" className="tiny" style={{ width: '100%', marginTop: '10px' }} onClick={resetPassword}>ลืมรหัสผ่าน</button>
        </form>
      </section>
    </main>
  )
}
