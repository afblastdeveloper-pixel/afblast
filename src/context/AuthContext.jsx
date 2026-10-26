import { createContext, useContext } from 'react'
import { useLocation } from 'react-router-dom'
import { isStaffPath } from '../utils/portal'
import { MemberAuthProvider, useMemberAuth } from './MemberAuthContext'
import { StaffAuthProvider, useStaffAuth } from './StaffAuthContext'

const UnifiedAuthContext = createContext(null)

/**
 * AuthProvider – Membungkus aplikasi dengan MemberAuthProvider DAN StaffAuthProvider secara bersamaan.
 * Kedua sesi berjalan terpisah dan independen di satu domain:
 * - Member: afblast.member.token & afblast.member.auth
 * - Staff: afblast.staff.token, afblast.staff.auth & afblast.staff.permissions
 * Login atau logout di satu area tidak memengaruhi area lainnya.
 */
export function AuthProvider({ children }) {
  return (
    <MemberAuthProvider>
      <StaffAuthProvider>
        {children}
      </StaffAuthProvider>
    </MemberAuthProvider>
  )
}

/**
 * Hook useAuth serbaguna.
 * Mengembalikan sesi Staff jika rute aktif berada di area STAFF_BASE (/staff*),
 * selain itu mengembalikan sesi Member (/app*, /login, dsb).
 */
export function useAuth() {
  let isStaff = false
  try {
    const location = useLocation()
    isStaff = isStaffPath(location?.pathname)
  } catch {
    if (typeof window !== 'undefined') {
      isStaff = isStaffPath(window.location.pathname)
    }
  }

  const staffAuth = useStaffAuth()
  const memberAuth = useMemberAuth()

  return isStaff ? staffAuth : memberAuth
}

export { useMemberAuth, useStaffAuth, MemberAuthProvider, StaffAuthProvider }
export default UnifiedAuthContext
