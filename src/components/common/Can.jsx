import { useAuth } from '../../context/AuthContext'

/**
 * Komponen <Can> – Menyaring tampilan elemen UI berdasarkan permission pengguna.
 *
 * Contoh penggunaan:
 * <Can permission="withdrawal.approve">
 *   <button onClick={handleApprove}>Setujui</button>
 * </Can>
 *
 * <Can permission="user.view" fallback={<p>Tidak ada izin</p>}>
 *   <UserTable />
 * </Can>
 *
 * @param {string} permission - Nama izin yang dibutuhkan (contoh: 'staff.approve')
 * @param {React.ReactNode} children - Elemen yang akan dirender jika diizinkan
 * @param {React.ReactNode} [fallback=null] - Elemen yang dirender jika tidak diizinkan
 */
export default function Can({ permission, children, fallback = null }) {
  const { hasPermission, role } = useAuth()

  if (!permission || role === 'superadmin') {
    return children
  }

  if (hasPermission(permission)) {
    return children
  }

  return fallback
}
