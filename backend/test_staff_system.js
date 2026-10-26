const http = require('http')
const app = require('./src/server')
const prisma = require('./src/config/db')

async function runTests() {
  const PORT = 4005
  const server = http.createServer(app)

  await new Promise((resolve) => server.listen(PORT, resolve))
  const BASE_URL = `http://127.0.0.1:${PORT}`
  console.log(`Test server running at ${BASE_URL}`)

  const results = []

  function assert(condition, message) {
    if (!condition) {
      console.error(`❌ FAILED: ${message}`)
      results.push({ test: message, status: 'FAILED' })
      throw new Error(message)
    } else {
      console.log(`✅ PASSED: ${message}`)
      results.push({ test: message, status: 'PASSED' })
    }
  }

  try {
    // 0. Test Public Config
    console.log('\n--- 0. Test GET /api/config (Public) ---')
    const configRes = await fetch(`${BASE_URL}/api/config`)
    const configData = await configRes.json()
    assert(configRes.status === 200, 'GET /api/config returns 200')
    assert(configData.flags !== undefined, 'Config contains feature flags')
    assert(configData.theme !== undefined, 'Config contains theme')
    assert(configData.version !== undefined, 'Config contains version')
    assert(configData.maintenance !== undefined, 'Config contains maintenance info')

    // 1. Test Registrasi Superadmin Ditolak
    console.log('\n--- 1. Test Registrasi Superadmin (Harus Ditolak) ---')
    const regSuperRes = await fetch(`${BASE_URL}/api/staff/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nama: 'hacker',
        password: 'password123',
        role: 'superadmin',
      }),
    })
    assert(regSuperRes.status === 400, 'Registrasi superadmin ditolak dengan status 400')

    // Bersihkan data tes terdahulu jika ada
    await prisma.user.deleteMany({
      where: {
        username: {
          in: ['faisal@adminfinance', 'alex@developer', 'testreject@adminfinance'],
        },
      },
    })

    // 2. Daftar Finance
    console.log('\n--- 2. Daftar Staff Finance ---')
    const regFinanceRes = await fetch(`${BASE_URL}/api/staff/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nama: 'faisal',
        password: 'FinancePassword123!',
        role: 'adminfinance',
      }),
    })
    const regFinanceData = await regFinanceRes.json()
    assert(regFinanceRes.status === 201, 'Daftar finance berhasil dengan status 201')
    assert(regFinanceData.user.username === 'faisal@adminfinance', 'Username berformat nama@role: faisal@adminfinance')
    assert(regFinanceData.user.staffStatus === 'pending', 'Status akun awal adalah pending')
    assert(regFinanceData.token === undefined, 'Registrasi TIDAK mengembalikan token')
    const financeId = regFinanceData.user.id

    // 3. Coba Login Finance (Harus Ditolak, Pending)
    console.log('\n--- 3. Coba Login Finance Sebelum ACC (Harus Ditolak, Pending) ---')
    const loginPendingRes = await fetch(`${BASE_URL}/api/staff/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'faisal@adminfinance',
        password: 'FinancePassword123!',
      }),
    })
    const loginPendingData = await loginPendingRes.json()
    assert(loginPendingRes.status === 403, 'Login finance pending ditolak dengan status 403')
    assert(loginPendingData.staffStatus === 'pending', 'Pesan error mengindikasikan status pending')

    // 4. Test Suffix Mismatch & Pesan Seragam
    console.log('\n--- 4. Test Suffix Mismatch & Pesan Error Seragam ---')
    const loginMismatchRes = await fetch(`${BASE_URL}/api/staff/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'faisal@developer', // Suffix beda dengan role di DB
        password: 'FinancePassword123!',
      }),
    })
    const loginMismatchData = await loginMismatchRes.json()
    assert(loginMismatchRes.status === 401, 'Suffix mismatch ditolak dengan status 401')
    assert(loginMismatchData.error === 'Username atau password salah', 'Pesan error seragam "Username atau password salah"')

    // 5. Login Superadmin (Seed Budi)
    console.log('\n--- 5. Login Superadmin (budi@superadmin) ---')
    const superPassword = process.env.SEED_SUPERADMIN_PASSWORD || 'SuperPassword123!'
    const superLoginRes = await fetch(`${BASE_URL}/api/staff/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'budi@superadmin',
        password: superPassword,
      }),
    })
    const superLoginData = await superLoginRes.json()
    assert(superLoginRes.status === 200, 'Login superadmin budi@superadmin berhasil (200)')
    assert(superLoginData.token !== undefined, 'Login mengembalikan JWT token')
    assert(superLoginData.user.role === 'superadmin', 'Role user adalah superadmin')
    assert(superLoginData.user.mustChangePassword === true, 'Akun budi wajib diganti password saat login pertama')
    assert(
      !superLoginData.user.permissions.some((p) => p.startsWith('dev.')),
      'Superadmin memiliki semua izin KECUALI dev.*'
    )
    assert(superLoginData.user.permissions.includes('staff.approve'), 'Superadmin memiliki izin staff.approve')
    const superToken = superLoginData.token

    // 6. Superadmin Cek Daftar Pending Staff
    console.log('\n--- 6. Superadmin Cek Daftar Staff Pending ---')
    const staffListRes = await fetch(`${BASE_URL}/api/admin/staff?status=pending`, {
      headers: { Authorization: `Bearer ${superToken}` },
    })
    const staffListData = await staffListRes.json()
    assert(staffListRes.status === 200, 'GET /api/admin/staff?status=pending returns 200')
    const foundFinance = staffListData.staff.find((s) => s.id === financeId)
    assert(foundFinance !== undefined, 'Staf faisal@adminfinance ditemukan di daftar pending')

    // 7. Superadmin ACC Staff Finance
    console.log('\n--- 7. ACC Superadmin terhadap Staff Finance ---')
    const approveRes = await fetch(`${BASE_URL}/api/admin/staff/${financeId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${superToken}` },
    })
    const approveData = await approveRes.json()
    assert(approveRes.status === 200, 'Superadmin berhasil ACC staf finance (200)')
    assert(approveData.user.staffStatus === 'approved', 'Status staf berubah menjadi approved')
    assert(approveData.user.approvedById !== null, 'approvedById terisi dengan ID superadmin')

    // 8. Finance Login Berhasil
    console.log('\n--- 8. Finance Login Berhasil Setelah di-ACC ---')
    const financeLoginRes = await fetch(`${BASE_URL}/api/staff/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'faisal@adminfinance',
        password: 'FinancePassword123!',
      }),
    })
    const financeLoginData = await financeLoginRes.json()
    assert(financeLoginRes.status === 200, 'Login finance berhasil setelah di-ACC (200)')
    assert(financeLoginData.token !== undefined, 'Login finance mengembalikan JWT token')
    assert(financeLoginData.user.role === 'adminfinance', 'Role finance adalah adminfinance')
    const expectedFinancePerms = [
      'dashboard.finance',
      'withdrawal.view',
      'withdrawal.approve',
      'withdrawal.reject',
      'commission.view',
      'plan.view',
      'withdrawPreset.manage',
      'withdrawSetting.manage',
      'payoutChange.manage',
      'paymentGroup.view',
      'paymentGroup.manage',
    ]
    assert(
      JSON.stringify(financeLoginData.user.permissions.sort()) === JSON.stringify(expectedFinancePerms.sort()),
      'Permission adminfinance sesuai matriks permissions.js'
    )
    const financeToken = financeLoginData.token

    // 9. Finance Memanggil Endpoint Me
    console.log('\n--- 9. GET /api/staff/me oleh Finance ---')
    const meRes = await fetch(`${BASE_URL}/api/staff/me`, {
      headers: { Authorization: `Bearer ${financeToken}` },
    })
    const meData = await meRes.json()
    assert(meRes.status === 200, 'GET /api/staff/me returns 200')
    assert(meData.user.username === 'faisal@adminfinance', 'Profil me mengembalikan username yang benar')
    assert(meData.role === 'adminfinance', 'Profil me mengembalikan role adminfinance')

    // 10. Finance Memanggil Endpoint Pengguna (Harus 403)
    console.log('\n--- 10. Finance Memanggil Endpoint Pengguna (Harus 403) ---')
    const financeUsersRes = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${financeToken}` },
    })
    assert(financeUsersRes.status === 403, 'Finance memanggil endpoint pengguna /api/admin/users DITOLAK (403 Forbidden)')

    // 11. Finance Memanggil Endpoint Penarikan (Harus 200)
    console.log('\n--- 11. Finance Memanggil Endpoint Penarikan (Harus 200 Berhasil) ---')
    const financeWdRes = await fetch(`${BASE_URL}/api/admin/withdrawals`, {
      headers: { Authorization: `Bearer ${financeToken}` },
    })
    assert(financeWdRes.status === 200, 'Finance memanggil endpoint penarikan /api/admin/withdrawals BERHASIL (200)')

    // 12. Developer Workflow
    console.log('\n--- 12. Developer Workflow (Register -> Approve -> Login -> Developer Permissions) ---')
    // Register dev
    const regDevRes = await fetch(`${BASE_URL}/api/staff/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nama: 'alex',
        password: 'DevPassword123!',
        role: 'developer',
      }),
    })
    const regDevData = await regDevRes.json()
    assert(regDevRes.status === 201, 'Daftar developer berhasil (201)')
    const devId = regDevData.user.id

    // Approve dev
    await fetch(`${BASE_URL}/api/admin/staff/${devId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${superToken}` },
    })

    // Login dev
    const devLoginRes = await fetch(`${BASE_URL}/api/staff/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'alex@developer',
        password: 'DevPassword123!',
      }),
    })
    const devLoginData = await devLoginRes.json()
    assert(devLoginRes.status === 200, 'Login developer berhasil (200)')
    assert(
      !devLoginData.user.permissions.includes('staff.approve'),
      'Developer TIDAK memiliki izin staff.approve'
    )
    assert(
      ['dev.flags', 'dev.menu', 'dev.theme', 'dev.maintenance', 'dev.version'].every((p) =>
        devLoginData.user.permissions.includes(p)
      ),
      'Developer memiliki semua izin dev.*'
    )
    const devToken = devLoginData.token

    // Developer calls staff approval (must 403)
    const devStaffApproveRes = await fetch(`${BASE_URL}/api/admin/staff?status=pending`, {
      headers: { Authorization: `Bearer ${devToken}` },
    })
    assert(devStaffApproveRes.status === 403, 'Developer memanggil /api/admin/staff DITOLAK (403)')

    // Developer calls users (allowed because developer has user.view)
    const devUsersRes = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${devToken}` },
    })
    assert(devUsersRes.status === 200, 'Developer memanggil /api/admin/users BERHASIL (200)')

    // Superadmin calls dev.flags (must 403 because superadmin has NO dev.*)
    const superDevFlagsRes = await fetch(`${BASE_URL}/api/dev/flags`, {
      headers: { Authorization: `Bearer ${superToken}` },
    })
    assert(superDevFlagsRes.status === 403, 'Superadmin memanggil /api/dev/flags DITOLAK (403, dev.* khusus developer)')

    // 13. Developer CRUD & Config
    console.log('\n--- 13. Developer Endpoints (Flags, Menu, Theme, Maintenance, Version) ---')
    // CRUD Flags: bersihkan dulu jika sisa dari tes sebelumnya
    await fetch(`${BASE_URL}/api/dev/flags/ai_chat_support`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${devToken}` },
    }).catch(() => {})

    const createFlagRes = await fetch(`${BASE_URL}/api/dev/flags`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${devToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'ai_chat_support', enabled: true }),
    })
    assert(createFlagRes.status === 201, 'Developer membuat feature flag ai_chat_support (201)')

    const updateFlagRes = await fetch(`${BASE_URL}/api/dev/flags/ai_chat_support`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${devToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    })
    assert(updateFlagRes.status === 200, 'Developer memperbarui feature flag ai_chat_support (200)')

    // Menu PUT & GET
    const putMenuRes = await fetch(`${BASE_URL}/api/dev/menu/adminfinance`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${devToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ title: 'Finance Center', path: '/admin/finance' }],
      }),
    })
    assert(putMenuRes.status === 200, 'Developer memperbarui menu role adminfinance (200)')

    const getMenuRes = await fetch(`${BASE_URL}/api/dev/menu/adminfinance`, {
      headers: { Authorization: `Bearer ${devToken}` },
    })
    const getMenuData = await getMenuRes.json()
    assert(getMenuRes.status === 200 && getMenuData.items.length === 1, 'GET menu config mengembalikan data yang diperbarui')

    // Theme PUT
    const themeRes = await fetch(`${BASE_URL}/api/dev/theme`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${devToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: 'dark' }),
    })
    assert(themeRes.status === 200, 'Developer memperbarui tema (200)')

    // Maintenance PUT
    const maintRes = await fetch(`${BASE_URL}/api/dev/maintenance`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${devToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false, message: 'Maintenance selesai' }),
    })
    assert(maintRes.status === 200, 'Developer memperbarui mode maintenance (200)')

    // Version POST
    const versionRes = await fetch(`${BASE_URL}/api/dev/version`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${devToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: '1.1.0', note: 'Staff 3-role update' }),
    })
    assert(versionRes.status === 201, 'Developer mencatat rilis versi 1.1.0 (201)')

    // 14. Superadmin Staff Rejection & Suspension Rules
    console.log('\n--- 14. Superadmin Rejection & Suspension Safety Rules ---')
    // Register candidate to reject
    const regRejectRes = await fetch(`${BASE_URL}/api/staff/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nama: 'testreject', password: 'password123', role: 'adminfinance' }),
    })
    const regRejectData = await regRejectRes.json()
    const rejectTargetId = regRejectData.user.id

    // Reject without reason (must fail 400)
    const rejectNoReasonRes = await fetch(`${BASE_URL}/api/admin/staff/${rejectTargetId}/reject`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert(rejectNoReasonRes.status === 400, 'Tolak staf tanpa alasan ditolak (400, alasan wajib)')

    // Reject with reason
    const rejectWithReasonRes = await fetch(`${BASE_URL}/api/admin/staff/${rejectTargetId}/reject`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Identitas tidak valid' }),
    })
    assert(rejectWithReasonRes.status === 200, 'Tolak staf dengan alasan berhasil (200)')

    // Superadmin cannot reject/suspend themselves
    const budiUser = await prisma.user.findUnique({ where: { username: 'budi@superadmin' } })
    const rejectSelfRes = await fetch(`${BASE_URL}/api/admin/staff/${budiUser.id}/reject`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Coba tolak diri sendiri' }),
    })
    assert(rejectSelfRes.status === 400, 'Superadmin tidak boleh menolak akun dirinya sendiri (400)')

    const suspendSelfRes = await fetch(`${BASE_URL}/api/admin/staff/${budiUser.id}/suspend`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${superToken}` },
    })
    assert(suspendSelfRes.status === 400, 'Superadmin tidak boleh menonaktifkan akun dirinya sendiri (400)')

    // 15. Rate Limit & Kunci Akun 15 Menit Setelah 5 Gagal
    console.log('\n--- 15. Rate Limit & Penguncian Akun Setelah 5 Kali Gagal Login ---')
    for (let i = 1; i <= 4; i++) {
      const failRes = await fetch(`${BASE_URL}/api/staff/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'faisal@adminfinance',
          password: 'WrongPassword!',
        }),
      })
      assert(failRes.status === 401, `Gagal login ke-${i} mengembalikan 401`)
    }
    // Gagal ke-5 -> Akun harus dikunci
    const lockRes = await fetch(`${BASE_URL}/api/staff/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'faisal@adminfinance',
        password: 'WrongPassword!',
      }),
    })
    assert(lockRes.status === 423, 'Gagal ke-5 menyebabkan akun terkunci (HTTP 423 Locked)')

    // Coba login dengan password benar saat akun terkunci -> tetap 423
    const lockedLoginRes = await fetch(`${BASE_URL}/api/staff/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'faisal@adminfinance',
        password: 'FinancePassword123!',
      }),
    })
    assert(lockedLoginRes.status === 423, 'Login dengan password benar saat akun terkunci tetap ditolak (423)')

    // 16. Verifikasi ActivityLog
    console.log('\n--- 16. Verifikasi Pencatatan ActivityLog ---')
    const logs = await prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
    assert(logs.length > 0, 'ActivityLog berhasil mencatat riwayat aksi staf')
    const loggedActions = logs.map((l) => l.action)
    console.log('Action yang tercatat di ActivityLog:', loggedActions)
    assert(loggedActions.some((a) => a.includes('LOGIN')), 'Aksi LOGIN tercatat di ActivityLog')
    assert(loggedActions.includes('APPROVE_STAFF'), 'Aksi APPROVE_STAFF tercatat di ActivityLog')
    assert(loggedActions.includes('DEV_FLAG_CREATE') || loggedActions.includes('CREATE_FEATURE_FLAG'), 'Aksi DEV_FLAG_CREATE tercatat di ActivityLog')

    console.log('\n========================================')
    console.log('🎉 SEMUA PENGUJIAN BERHASIL 100%!')
    console.log('========================================\n')
  } catch (err) {
    console.error('Test execution error:', err)
  } finally {
    server.close()
    await prisma.$disconnect()
  }
}

runTests()
