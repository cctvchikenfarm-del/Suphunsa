import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api.js'

const emptyUser = { email: '', display_name: '', role: 'viewer', active: true }

export default function UsersRoles() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('users')
  const [userForm, setUserForm] = useState(emptyUser)

  const usersQuery = useQuery({ queryKey: ['users'], queryFn: () => apiFetch('/api/users') })
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: () => apiFetch('/api/roles') })
  const auditQuery = useQuery({ queryKey: ['audit-logs'], queryFn: () => apiFetch('/api/audit-logs?limit=80') })

  const roles = rolesQuery.data?.roles || []
  const permissions = rolesQuery.data?.permissions || []
  const rolePermissions = rolesQuery.data?.role_permissions || []

  const permissionGroups = useMemo(() => {
    return permissions.reduce((acc, item) => {
      if (!acc[item.permission_group]) acc[item.permission_group] = []
      acc[item.permission_group].push(item)
      return acc
    }, {})
  }, [permissions])

  const saveUser = useMutation({
    mutationFn: (payload) => apiFetch('/api/users', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { setUserForm(emptyUser); queryClient.invalidateQueries({ queryKey: ['users'] }); queryClient.invalidateQueries({ queryKey: ['audit-logs'] }) }
  })

  const updateUser = useMutation({
    mutationFn: ({ id, patch }) => apiFetch(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); queryClient.invalidateQueries({ queryKey: ['audit-logs'] }) }
  })

  const deleteUser = useMutation({
    mutationFn: (id) => apiFetch(`/api/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); queryClient.invalidateQueries({ queryKey: ['audit-logs'] }) }
  })
  const resendInvite = useMutation({
    mutationFn: (id) => apiFetch(`/api/users/${id}/resend-invite`, { method: 'POST' })
  })

  const saveRolePermissions = useMutation({
    mutationFn: ({ roleKey, permissionKeys }) => apiFetch(`/api/roles/${roleKey}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions: permissionKeys }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['roles'] }); queryClient.invalidateQueries({ queryKey: ['audit-logs'] }) }
  })

  function roleHasPermission(roleKey, permissionKey) {
    return rolePermissions.some(item => item.role_key === roleKey && item.permission_key === permissionKey && item.allowed)
  }

  function togglePermission(roleKey, permissionKey) {
    const current = permissions.filter(p => roleHasPermission(roleKey, p.permission_key)).map(p => p.permission_key)
    const next = current.includes(permissionKey) ? current.filter(item => item !== permissionKey) : [...current, permissionKey]
    saveRolePermissions.mutate({ roleKey, permissionKeys: next })
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Access Control</p>
          <h2>Users / Roles / Audit Log</h2>
          <p className="muted">จัดการผู้ใช้ สิทธิ์แยกตามเมนู/ปุ่ม และดูประวัติการแก้ไข</p>
        </div>
      </div>

      <div className="tab-row left-tabs">
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Users</button>
        <button className={tab === 'roles' ? 'active' : ''} onClick={() => setTab('roles')}>Roles & Permissions</button>
        <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>Audit Log</button>
      </div>

      {usersQuery.error && <div className="alert error">โหลดผู้ใช้ไม่สำเร็จ: {usersQuery.error.message}</div>}
      {rolesQuery.error && <div className="alert error">โหลดสิทธิ์ไม่สำเร็จ: {rolesQuery.error.message}</div>}
      {auditQuery.error && <div className="alert error">โหลด audit log ไม่สำเร็จ: {auditQuery.error.message}</div>}

      {tab === 'users' && (
        <div className="split-grid">
          <div className="card">
            <h3>เพิ่มผู้ใช้</h3>
            <label className="field"><span>อีเมล</span><input value={userForm.email} onChange={e => setUserForm({ ...userForm, email: e.target.value })} /></label>
            <label className="field"><span>ชื่อผู้ใช้</span><input value={userForm.display_name} onChange={e => setUserForm({ ...userForm, display_name: e.target.value })} /></label>
            <label className="field"><span>Role</span><select value={userForm.role} onChange={e => setUserForm({ ...userForm, role: e.target.value })}>{roles.map(role => <option key={role.role_key} value={role.role_key}>{role.role_name_th}</option>)}</select></label>
            <label className="check-inline"><input type="checkbox" checked={userForm.active} onChange={e => setUserForm({ ...userForm, active: e.target.checked })} /> เปิดใช้งาน</label>
            <p className="muted">ระบบจะส่งอีเมลให้ผู้ใช้ตั้งรหัสผ่านด้วยตนเอง</p>
            <div className="form-actions bottom-actions"><button className="primary" onClick={() => saveUser.mutate(userForm)} disabled={saveUser.isPending}>ส่งคำเชิญ</button></div>
          </div>

          <div className="card wide-table-card">
            <div className="section-title-row"><h3>รายชื่อผู้ใช้</h3><span className="muted">{usersQuery.data?.length || 0} คน</span></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>ชื่อ</th><th>อีเมล</th><th>Role</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
                <tbody>
                  {(usersQuery.data || []).map(user => (
                    <tr key={user.id}>
                      <td>{user.display_name}</td>
                      <td>{user.email}</td>
                      <td>
                        <select value={user.role} onChange={e => updateUser.mutate({ id: user.id, patch: { role: e.target.value } })}>
                          {roles.map(role => <option key={role.role_key} value={role.role_key}>{role.role_name_th}</option>)}
                        </select>
                      </td>
                      <td><button className="tiny" onClick={() => updateUser.mutate({ id: user.id, patch: { active: !user.active } })}>{user.active ? 'เปิด' : 'ปิด'}</button></td>
                      <td><button className="tiny" onClick={() => resendInvite.mutate(user.id)}>ส่งคำเชิญใหม่</button> <button className="danger tiny" onClick={() => window.confirm('ลบผู้ใช้นี้หรือไม่?') && deleteUser.mutate(user.id)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'roles' && (
        <div className="card">
          <div className="section-title-row"><h3>Permission Matrix</h3><span className="muted">ติ๊กเพื่ออนุญาต API และปุ่มหน้าเว็บ</span></div>
          <div className="permission-matrix">
            {Object.entries(permissionGroups).map(([group, items]) => (
              <div key={group} className="permission-group">
                <h4>{group}</h4>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Permission</th>{roles.map(role => <th key={role.role_key}>{role.role_name_th}</th>)}</tr></thead>
                    <tbody>
                      {items.map(permission => (
                        <tr key={permission.permission_key}>
                          <td><strong>{permission.permission_name_th}</strong><br /><span className="muted">{permission.permission_key}</span></td>
                          {roles.map(role => (
                            <td key={role.role_key}>
                              <input type="checkbox" checked={roleHasPermission(role.role_key, permission.permission_key)} onChange={() => togglePermission(role.role_key, permission.permission_key)} disabled={role.role_key === 'owner'} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="card">
          <div className="section-title-row"><h3>Audit Log</h3><button className="ghost" onClick={() => auditQuery.refetch()}>Refresh</button></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>เวลา</th><th>Action</th><th>Table</th><th>Record</th><th>รายละเอียด</th></tr></thead>
              <tbody>
                {(auditQuery.data || []).map(item => (
                  <tr key={item.id}>
                    <td>{new Date(item.created_at).toLocaleString('th-TH')}</td>
                    <td>{item.action}</td>
                    <td>{item.table_name}</td>
                    <td>{item.record_id || '-'}</td>
                    <td><code>{JSON.stringify(item.new_data || item.old_data || {}).slice(0, 180)}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
