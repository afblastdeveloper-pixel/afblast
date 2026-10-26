const jwt = require('jsonwebtoken')

const BASE_URL = 'http://127.0.0.1:4000'

async function runTests() {
  console.log('=== MEMULAI TEST PEMISAHAN PORTAL & KEAMANAN DUA ARAH ===\n')
  let passed = 0
  let total = 0

  function assert(condition, testName) {
    total++
    if (condition) {
      console.log(`[PASS] ${testName}`)
      passed++
    } else {
      console.error(`[FAIL] ${testName}`)
    }
  }

  // 1. Test CORS
  console.log('--- 1. Validasi CORS ---')
  const corsMemberRes = await fetch(`${BASE_URL}/api/health`, {
    headers: { Origin: 'http://localhost:5173' }
  })
  assert(corsMemberRes.ok, 'Origin http://localhost:5173 diizinkan')

  const corsSubdomainRes = await fetch(`${BASE_URL}/api/health`, {
    headers: { Origin: 'http://staff.localhost:5173' }
  })
  assert(corsSubdomainRes.status === 403, 'Origin subdomain http://staff.localhost:5173 ditolak (hanya single origin)')

  const corsBadRes = await fetch(`${BASE_URL}/api/health`, {
    headers: { Origin: 'http://unauthorized-domain.com' }
  })
  assert(corsBadRes.status === 403, 'Origin unauthorized ditolak dengan status 403')

  // 2. Registrasi Member
  console.log('\n--- 2. Registrasi Member ---')
  const testEmail = `member_test_${Date.now()}@testafblast.id`
  const regMemberRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Member Test User',
      email: testEmail,
      password: 'password123',
      role: 'superadmin' // Client tries to sneak in role
    })
  })
  const regMemberData = await regMemberRes.json()
  assert(regMemberRes.status === 201, 'Registrasi member berhasil')
  assert(regMemberData.user.role === 'user', 'Field role client diabaikan, dipaksa user')

  const decodedMemberToken = jwt.decode(regMemberData.token)
  assert(decodedMemberToken.aud === 'member', 'Token member memiliki klaim aud: "member"')

  // 3. Tolak Registrasi Member dengan format nama@role
  const regStaffFormatRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Hacker',
      email: 'hacker@superadmin',
      password: 'password123'
    })
  })
  assert(regStaffFormatRes.status === 400, 'Registrasi format nama@role di portal member ditolak')

  // 4. Login Member
  console.log('\n--- 3. Login Member ---')
  const loginMemberRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: 'password123'
    })
  })
  const loginMemberData = await loginMemberRes.json()
  assert(loginMemberRes.status === 200, 'Login member berhasil')
  assert(loginMemberData.user.role === 'user', 'User role adalah user')
  const memberToken = loginMemberData.token

  // 5. Akun Staf (budi@superadmin) Login di Portal Member -> HARUS 401 Uniform Error
  const staffOnMemberRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'budi@superadmin',
      password: 'SuperPassword123!'
    })
  })
  const staffOnMemberData = await staffOnMemberRes.json()
  assert(staffOnMemberRes.status === 401, 'Akun staf ditolak di portal member')
  assert(staffOnMemberData.error === 'Username atau password salah', 'Pesan error login seragam (uniform error)')

  // 6. Akun Member Login di Portal Staf -> HARUS 401 Uniform Error
  console.log('\n--- 4. Isolasi Staf ---')
  const memberOnStaffRes = await fetch(`${BASE_URL}/api/staff/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: testEmail,
      password: 'password123'
    })
  })
  const memberOnStaffData = await memberOnStaffRes.json()
  assert(memberOnStaffRes.status === 401, 'Akun member ditolak di portal staf')
  assert(memberOnStaffData.error === 'Username atau password salah', 'Pesan error portal staf seragam')

  // 7. Login Staf Berhasil -> Cek aud: "staff"
  const staffLoginRes = await fetch(`${BASE_URL}/api/staff/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'budi@superadmin',
      password: 'SuperPassword123!'
    })
  })
  const staffLoginData = await staffLoginRes.json()
  assert(staffLoginRes.status === 200, 'Login staf budi@superadmin berhasil')
  const staffToken = staffLoginData.token
  const decodedStaffToken = jwt.decode(staffToken)
  assert(decodedStaffToken.aud === 'staff', 'Token staf memiliki klaim aud: "staff"')

  // 8. Cross-Token Boundary Testing (Dua Arah)
  console.log('\n--- 5. Pengujian Token Lintas Portal (Klaim aud) ---')
  // Member token panggil /api/admin/staff -> HARUS DITOLAK (403)
  const memberHitAdminRes = await fetch(`${BASE_URL}/api/admin/staff`, {
    headers: { Authorization: `Bearer ${memberToken}` }
  })
  assert(memberHitAdminRes.status === 403, 'Token member memanggil /api/admin/staff ditolak (403)')

  // Member token panggil /api/dev/flags -> HARUS DITOLAK (403)
  const memberHitDevRes = await fetch(`${BASE_URL}/api/dev/flags`, {
    headers: { Authorization: `Bearer ${memberToken}` }
  })
  assert(memberHitDevRes.status === 403, 'Token member memanggil /api/dev/flags ditolak (403)')

  // Staff token panggil /api/auth/me -> HARUS DITOLAK (403)
  const staffHitMemberRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${staffToken}` }
  })
  assert(staffHitMemberRes.status === 403, 'Token staf memanggil /api/auth/me ditolak (403)')

  // Valid calls work
  const validMemberMe = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${memberToken}` }
  })
  assert(validMemberMe.status === 200, 'Token member mengakses /api/auth/me sukses (200)')

  const validStaffStaff = await fetch(`${BASE_URL}/api/admin/staff`, {
    headers: { Authorization: `Bearer ${staffToken}` }
  })
  assert(validStaffStaff.status === 200, 'Token staf superadmin mengakses /api/admin/staff sukses (200)')

  console.log(`\n=== HASIL: ${passed}/${total} PENGUJIAN LULUS ===`)
  if (passed === total) {
    console.log('SELURUH PENGUJIAN BACKEND LULUS SEMPURNA!')
  } else {
    process.exit(1)
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err)
  process.exit(1)
})
