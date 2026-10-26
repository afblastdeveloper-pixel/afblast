import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { apiFetch, TOKEN_KEYS, AUTH_KEYS, PERMISSION_KEYS } from '../utils/client'

const StaffAuthContext = createContext(null)

export function StaffAuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(TOKEN_KEYS.staff) || null
    } catch {
      return null
    }
  })

  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(AUTH_KEYS.staff)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  const [permissions, setPermissions] = useState(() => {
    try {
      const stored = localStorage.getItem(PERMISSION_KEYS.staff)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  const [loading, setLoading] = useState(true)

  const saveSession = useCallback((newToken, newUser, newPermissions = []) => {
    setToken(newToken)
    setUser(newUser)
    setPermissions(newPermissions)
    try {
      if (newToken) {
        localStorage.setItem(TOKEN_KEYS.staff, newToken)
      } else {
        localStorage.removeItem(TOKEN_KEYS.staff)
      }
      if (newUser) {
        localStorage.setItem(AUTH_KEYS.staff, JSON.stringify(newUser))
      } else {
        localStorage.removeItem(AUTH_KEYS.staff)
      }
      if (newPermissions && newPermissions.length > 0) {
        localStorage.setItem(PERMISSION_KEYS.staff, JSON.stringify(newPermissions))
      } else {
        localStorage.removeItem(PERMISSION_KEYS.staff)
      }
    } catch (err) {
      console.warn('Gagal menyimpan sesi staf ke localStorage:', err)
    }
  }, [])

  const logout = useCallback(() => {
    saveSession(null, null, [])
  }, [saveSession])

  // Verifikasi sesi staf saat aplikasi dimuat
  useEffect(() => {
    async function verifyStaffSession() {
      const storedToken = localStorage.getItem(TOKEN_KEYS.staff)
      if (!storedToken) {
        setLoading(false)
        return
      }

      try {
        const response = await apiFetch('/api/staff/me')

        if (response.ok) {
          const data = await response.json()
          setUser(data.user)
          setPermissions(data.permissions || [])
          localStorage.setItem(AUTH_KEYS.staff, JSON.stringify(data.user))
          localStorage.setItem(PERMISSION_KEYS.staff, JSON.stringify(data.permissions || []))
        } else if (response.status === 401 || response.status === 403) {
          logout()
        }
      } catch (err) {
        console.warn('Verifikasi sesi staf offline:', err.message)
      } finally {
        setLoading(false)
      }
    }

    verifyStaffSession()
  }, [logout])

  /**
   * Login Staf (/api/staff/login)
   */
  const staffLogin = useCallback(async (username, password) => {
    const res = await apiFetch('/api/staff/login', {
      method: 'POST',
      body: JSON.stringify({
        username: (username || '').trim().toLowerCase(),
        password,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      const err = new Error(data.error || 'Login gagal')
      err.status = res.status
      err.data = data
      throw err
    }

    saveSession(data.token, data.user, data.permissions || [])
    return data
  }, [saveSession])

  /**
   * Registrasi Staf (/api/staff/register)
   */
  const staffRegister = useCallback(async ({ nama, password, role }) => {
    const res = await apiFetch('/api/staff/register', {
      method: 'POST',
      body: JSON.stringify({ nama, password, role }),
    })

    const data = await res.json()

    if (!res.ok) {
      const err = new Error(data.error || 'Pendaftaran gagal')
      err.status = res.status
      err.data = data
      throw err
    }

    return data
  }, [])

  const hasPermission = useCallback((permissionKey) => {
    if (!permissionKey) return true
    if (user?.role === 'superadmin') return true
    if (!permissions || !Array.isArray(permissions)) return false

    if (permissionKey.endsWith('.*')) {
      const prefix = permissionKey.slice(0, -1)
      return permissions.some((p) => p.startsWith(prefix))
    }

    return permissions.includes(permissionKey)
  }, [permissions, user?.role])

  const value = {
    user,
    token,
    role: user?.role || null,
    permissions,
    isAuthenticated: Boolean(user && token && user.role !== 'user'),
    loading,
    staffLogin,
    staffRegister,
    login: staffLogin,
    register: staffRegister,
    hasPermission,
    logout,
    portal: 'staff',
  }

  return (
    <StaffAuthContext.Provider value={value}>
      {children}
    </StaffAuthContext.Provider>
  )
}

export function useStaffAuth() {
  const context = useContext(StaffAuthContext)
  if (!context) {
    throw new Error('useStaffAuth harus digunakan di dalam <StaffAuthProvider>')
  }
  return context
}

export default StaffAuthContext
