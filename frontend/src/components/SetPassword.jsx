import React, { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { getAuthClient } from '../lib/supabase.js'

function recoveryTokensFromUrl() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return { access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token') }
}

export default function SetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [message, setMessage] = useState('กำลังตรวจสอบลิงก์ตั้งรหัสผ่าน...')
  const [recoveryReady, setRecoveryReady] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    let authClient
    const markReady = session => {
      if (!active || !session?.access_token) return false
      setRecoveryReady(true)
      setMessage('ลิงก์พร้อมใช้งาน กรุณาตั้งรหัสผ่านใหม่')
      return true
    }
    const initializeRecovery = async () => {
      try {
        authClient = await getAuthClient()
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')
        if (code) {
          const exchanged = await authClient.auth.exchangeCodeForSession(code)
          if (exchanged.error) throw exchanged.error
          if (markReady(exchanged.data?.session)) return
        }
        const tokens = recoveryTokensFromUrl()
        if (tokens.access_token && tokens.refresh_token) {
          const restored = await authClient.auth.setSession(tokens)
          if (restored.error) throw restored.error
          if (markReady(restored.data?.session)) return
        }
        const current = await authClient.auth.getSession()
        if (current.error) throw current.error
        if (!markReady(current.data?.session)) setMessage('ลิงก์ตั้งรหัสผ่านหมดอายุหรือถูกเปิดใช้งานแล้ว กรุณาขอลิงก์ใหม่จากหน้าเข้าสู่ระบบ')
      } catch (error) {
        if (active) setMessage(/session missing/i.test(error.message) ? 'ไม่พบ Session สำหรับตั้งรหัสผ่าน กรุณาขอลิงก์ใหม่และเปิดลิงก์ล่าสุดเพียงครั้งเดียว' : error.message)
      }
    }
    initializeRecovery()
    return () => { active = false }
  }, [])

  async function submit(event) {
    event.preventDefault(); setMessage('')
    if (!recoveryReady) return setMessage('Session สำหรับตั้งรหัสผ่านไม่พร้อม กรุณาขอลิงก์ใหม่จากหน้าเข้าสู่ระบบ')
    if (password.length < 8) return setMessage('รหัสผ่านต้องมีอย่างน้อย 8 ตัว')
    if (password !== confirm) return setMessage('รหัสผ่านทั้งสองช่องไม่ตรงกัน')
    setBusy(true)
    const authClient = await getAuthClient()
    const { error } = await authClient.auth.updateUser({ password })
    setBusy(false)
    if (error) return setMessage(/session missing/i.test(error.message) ? 'ลิงก์หมดอายุ กรุณาขอลิงก์ตั้งรหัสผ่านใหม่' : error.message)
    await authClient.auth.signOut({ scope: 'local' }).catch(() => null)
    setRecoveryReady(false)
    setMessage('ตั้งรหัสผ่านสำเร็จแล้ว กำลังกลับไปหน้าเข้าสู่ระบบ')
    window.setTimeout(() => { window.location.href = '/' }, 1200)
  }

  return <main className="login-page"><section className="login-form-wrap"><form className="login-form" onSubmit={submit}>
    <p className="eyebrow">First-time access</p><h2>ตั้งรหัสผ่าน</h2>
    {message && <div className={`alert ${recoveryReady ? '' : 'error'}`} role="status">{message}</div>}
    <label className="field"><span>รหัสผ่านใหม่</span><div className="password-input-row"><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength="8" value={password} onChange={event=>setPassword(event.target.value)} disabled={!recoveryReady || busy} required/><button type="button" className="tiny password-visibility" aria-label={showPassword ? 'ซ่อนรหัสผ่านใหม่' : 'แสดงรหัสผ่านใหม่'} onClick={()=>setShowPassword(value=>!value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}<span>{showPassword ? 'ซ่อน' : 'แสดง'}</span></button></div></label>
    <label className="field"><span>ยืนยันรหัสผ่าน</span><div className="password-input-row"><input type={showConfirm ? 'text' : 'password'} autoComplete="new-password" minLength="8" value={confirm} onChange={event=>setConfirm(event.target.value)} disabled={!recoveryReady || busy} required/><button type="button" className="tiny password-visibility" aria-label={showConfirm ? 'ซ่อนการยืนยันรหัสผ่าน' : 'แสดงการยืนยันรหัสผ่าน'} onClick={()=>setShowConfirm(value=>!value)}>{showConfirm ? <EyeOff size={18}/> : <Eye size={18}/>}<span>{showConfirm ? 'ซ่อน' : 'แสดง'}</span></button></div></label>
    <button className="primary" disabled={busy || !recoveryReady}>{busy ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่าน'}</button>
    <a href="/">กลับหน้าเข้าสู่ระบบ</a>
  </form></section></main>
}
