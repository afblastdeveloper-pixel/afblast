import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { apiFetch, TOKEN_KEYS, AUTH_KEYS } from '../utils/client'

const MemberAuthContext = createContext(null)

export function MemberAuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(TOKEN_KEYS.member) || null
    } catch {
      return null
    }
  })

  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(AUTH_KEYS.member)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  const [loading, setLoading] = useState(true)

  const saveSession = useCallback((newToken, newUser) => {
    setToken(newToken)
    setUser(newUser)
    try {
      if (newToken) {
        localStorage.setItem(TOKEN_KEYS.member, newToken)
      } else {
        localStorage.removeItem(TOKEN_KEYS.member)
      }
      if (newUser) {
        localStorage.setItem(AUTH_KEYS.member, JSON.stringify(newUser))
      } else {
        localStorage.removeItem(AUTH_KEYS.member)
      }
    } catch (err) {
      console.warn('Gagal menyimpan sesi member:', err)
    }
  }, [])

  const logout = useCallback(() => {
    saveSession(null, null)
  }, [saveSession])

  // Verifikasi sesi member saat aplikasi dimuat
  useEffect(() => {
    async function verifyMemberSession() {
      const storedToken = localStorage.getItem(TOKEN_KEYS.member)
      if (!storedToken) {
        setLoading(false)
        return
      }

      try {
        const response = await apiFetch('/api/auth/me')

        if (response.ok) {
          const data = await response.json()
          setUser(data.user)
          localStorage.setItem(AUTH_KEYS.member, JSON.stringify(data.user))
        } else if (response.status === 401 || response.status === 403) {
          logout()
        }
      } catch (err) {
        console.warn('Verifikasi sesi member offline:', err.message)
      } finally {
        setLoading(false)
      }
    }

    verifyMemberSession()
  }, [logout])

  /**
   * Login Member (menerima email atau username)
   */
  const login = useCallback(async (identifier, password) => {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: identifier, username: identifier, password }),
    })

    const data = await res.json()

    if (!res.ok) {
      const err = new Error(data.error || 'Login gagal')
      err.status = res.status
      err.data = data
      throw err
    }

    saveSession(data.token, data.user)
    return { success: true, user: data.user, token: data.token }
  }, [saveSession])

  /**
   * Registrasi Member
   */
  const register = useCallback(async ({ name, email, password, username, referralCode }) => {
    const res = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, username, referralCode }),
    })

    const data = await res.json()

    if (!res.ok) {
      const err = new Error(data.error || 'Pendaftaran gagal')
      err.status = res.status
      err.data = data
      throw err
    }

    saveSession(data.token, data.user)
    return { success: true, user: data.user, token: data.token }
  }, [saveSession])

  /**
   * Memperbarui data pengguna di state lokal dan localStorage tanpa re-login
   */
  const updateUser = useCallback((userData) => {
    setUser((prev) => {
      const updated = { ...(prev || {}), ...userData }
      localStorage.setItem(AUTH_KEYS.member, JSON.stringify(updated))
      return updated
    })
  }, [])

  const value = {
    user,
    token,
    role: user?.role || 'user',
    permissions: [],
    isAuthenticated: Boolean(token && user && user.role === 'user'),
    loading,
    login,
    register,
    updateUser,
    logout,
    portal: 'member',
    hasPermission: () => false,
  }

  return (
    <MemberAuthContext.Provider value={value}>
      {children}
    </MemberAuthContext.Provider>
  )
}

export function useMemberAuth() {
  const context = useContext(MemberAuthContext)
  if (!context) {
    throw new Error('useMemberAuth harus digunakan di dalam <MemberAuthProvider>')
  }
  return context
}

export default MemberAuthContext
