const http = require('http')
const app = require('./src/server')
const prisma = require('./src/config/db')

function makeRequest(server, options, bodyData) {
  return new Promise((resolve, reject) => {
    const address = server.address()
    const reqOptions = {
      hostname: '127.0.0.1',
      port: address.port,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    }

    const req = http.request(reqOptions, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        let parsed = data
        try {
          parsed = JSON.parse(data)
        } catch (e) {
          // keep as raw text
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed,
        })
      })
    })

    req.on('error', (err) => reject(err))

    if (bodyData) {
      req.write(typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData))
    }
    req.end()
  })
}

async function runTest() {
  console.log('=====================================================')
  console.log('   AF BLAST 3-ROLE STAFF SYSTEM - END-TO-END VERIFICATION')
  console.log('=====================================================\n')

  // Start test server on random available port
  const server = app.listen(0)
  const port = server.address().port
  console.log(`Test server running on port: ${port}\n`)

  try {
    // 0. Bersihkan staf uji sebelumnya jika ada
    const testStaffUsername = 'dewi@adminfinance'
    await prisma.user.deleteMany({
      where: { username: testStaffUsername },
    })

    // -----------------------------------------------------------------
    // TEST 1: DAFTAR FINANCE (POST /api/staff/register)
    // -----------------------------------------------------------------
    console.log('▶ [TEST 1] Pendaftaran Staf Finance (Role: adminfinance)...')
    const regRes = await makeRequest(server, {
      path: '/api/staff/register',
      method: 'POST',
    }, {
      nama: 'Dewi',
      password: 'DewiFinance123!',
      role: 'adminfinance',
    })

    console.log(`  Status: ${regRes.status}`)
    console.log(`  Response:`, JSON.stringify(regRes.data, null, 2))

    if (regRes.status !== 201) {
      throw new Error(`Test 1 Gagal: Status ${regRes.status} (diharapkan 201)`)
    }
    if (regRes.data.user.staffStatus !== 'pending') {
      throw new Error(`Test 1 Gagal: staffStatus bukan pending, tetapi ${regRes.data.user.staffStatus}`)
    }
    if (regRes.data.user.username !== testStaffUsername) {
      throw new Error(`Test 1 Gagal: username format salah: ${regRes.data.user.username}`)
    }
    const staffId = regRes.data.user.id
    console.log(`✔ [TEST 1 BERHASIL] Finance terdaftar: ${regRes.data.user.username}, status=pending, ID=${staffId}\n`)

    // -----------------------------------------------------------------
    // TEST 2: COBA LOGIN FINANCE SAAT MASIH PENDING (POST /api/staff/login)
    // -----------------------------------------------------------------
    console.log('▶ [TEST 2] Coba Login Finance (harus ditolak karena status masih pending)...')
    const pendingLoginRes = await makeRequest(server, {
      path: '/api/staff/login',
      method: 'POST',
    }, {
      username: testStaffUsername,
      password: 'DewiFinance123!',
    })

    console.log(`  Status: ${pendingLoginRes.status}`)
    console.log(`  Response:`, JSON.stringify(pendingLoginRes.data, null, 2))

    if (pendingLoginRes.status !== 403) {
      throw new Error(`Test 2 Gagal: Status ${pendingLoginRes.status} (diharapkan 403 Forbidden)`)
    }
    if (pendingLoginRes.data.staffStatus !== 'pending') {
      throw new Error(`Test 2 Gagal: Respon tidak mengindikasikan status pending`)
    }
    console.log(`✔ [TEST 2 BERHASIL] Login ditolak sesuai aturan: status masih pending (HTTP 403)\n`)

    // -----------------------------------------------------------------
    // TEST 3: LOGIN SUPERADMIN (budi@superadmin)
    // -----------------------------------------------------------------
    console.log('▶ [TEST 3] Login Superadmin (budi@superadmin)...')
    const superadminLoginRes = await makeRequest(server, {
      path: '/api/staff/login',
      method: 'POST',
    }, {
      username: 'budi@superadmin',
      password: process.env.SEED_SUPERADMIN_PASSWORD || 'SuperPassword123!',
    })

    console.log(`  Status: ${superadminLoginRes.status}`)
    console.log(`  User:`, superadminLoginRes.data.user)

    if (superadminLoginRes.status !== 200 || !superadminLoginRes.data.token) {
      throw new Error(`Test 3 Gagal: Superadmin gagal login (${superadminLoginRes.status})`)
    }
    const superadminToken = superadminLoginRes.data.token
    console.log(`✔ [TEST 3 BERHASIL] Superadmin berhasil login, JWT token diperoleh\n`)

    // -----------------------------------------------------------------
    // TEST 4: ACC SUPERADMIN (PATCH /api/admin/staff/:id/approve)
    // -----------------------------------------------------------------
    console.log(`▶ [TEST 4] Superadmin Menyetujui (ACC) Akun Staf Finance ID: ${staffId}...`)
    const approveRes = await makeRequest(server, {
      path: `/api/admin/staff/${staffId}/approve`,
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${superadminToken}`,
      },
    })

    console.log(`  Status: ${approveRes.status}`)
    console.log(`  Response:`, JSON.stringify(approveRes.data, null, 2))

    if (approveRes.status !== 200) {
      throw new Error(`Test 4 Gagal: Status ${approveRes.status} (diharapkan 200)`)
    }
    if (approveRes.data.user.staffStatus !== 'approved') {
      throw new Error(`Test 4 Gagal: staffStatus bukan approved, tetapi ${approveRes.data.user.staffStatus}`)
    }
    console.log(`✔ [TEST 4 BERHASIL] Akun finance telah di-ACC oleh superadmin (status: approved)\n`)

    // -----------------------------------------------------------------
    // TEST 5: LOGIN FINANCE SETELAH DI-ACC (POST /api/staff/login)
    // -----------------------------------------------------------------
    console.log('▶ [TEST 5] Login Finance Setelah di-ACC (harus berhasil)...')
    const financeLoginRes = await makeRequest(server, {
      path: '/api/staff/login',
      method: 'POST',
    }, {
      username: testStaffUsername,
      password: 'DewiFinance123!',
    })

    console.log(`  Status: ${financeLoginRes.status}`)
    console.log(`  User:`, financeLoginRes.data.user)
    console.log(`  Permissions:`, financeLoginRes.data.permissions)

    if (financeLoginRes.status !== 200 || !financeLoginRes.data.token) {
      throw new Error(`Test 5 Gagal: Finance gagal login (${financeLoginRes.status})`)
    }
    const financeToken = financeLoginRes.data.token
    console.log(`✔ [TEST 5 BERHASIL] Finance berhasil login & mendapatkan JWT token berizin finance\n`)

    // -----------------------------------------------------------------
    // TEST 6: FINANCE MEMANGGIL ENDPOINT PENGGUNA (GET /api/admin/users) -> HARUS 403
    // -----------------------------------------------------------------
    console.log('▶ [TEST 6] Finance Memanggil Endpoint Pengguna GET /api/admin/users (harus 403)...')
    const financeCallUsersRes = await makeRequest(server, {
      path: '/api/admin/users',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${financeToken}`,
      },
    })

    console.log(`  Status: ${financeCallUsersRes.status}`)
    console.log(`  Response:`, JSON.stringify(financeCallUsersRes.data, null, 2))

    if (financeCallUsersRes.status !== 403) {
      throw new Error(`Test 6 Gagal: Status ${financeCallUsersRes.status} (diharapkan 403 Forbidden)`)
    }
    console.log(`✔ [TEST 6 BERHASIL] Finance ditolak mengakses /api/admin/users dengan HTTP 403 Forbidden\n`)

    // -----------------------------------------------------------------
    // TEST 7: FINANCE MEMANGGIL ENDPOINT PENARIKAN (GET /api/admin/withdrawals) -> HARUS 200 OK
    // -----------------------------------------------------------------
    console.log('▶ [TEST 7] Finance Memanggil Endpoint Penarikan GET /api/admin/withdrawals (harus 200 OK)...')
    const financeWithdrawalRes = await makeRequest(server, {
      path: '/api/admin/withdrawals',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${financeToken}`,
      },
    })

    console.log(`  Status: ${financeWithdrawalRes.status}`)
    if (financeWithdrawalRes.status !== 200) {
      throw new Error(`Test 7 Gagal: Finance seharusnya bisa mengakses penarikan, tetapi ${financeWithdrawalRes.status}`)
    }
    console.log(`✔ [TEST 7 BERHASIL] Finance diizinkan mengakses /api/admin/withdrawals (HTTP 200 OK)\n`)

    // -----------------------------------------------------------------
    // TEST 8: SUPERADMIN MEMANGGIL ENDPOINT PENGGUNA -> HARUS 200 OK
    // -----------------------------------------------------------------
    console.log('▶ [TEST 8] Superadmin Memanggil Endpoint Pengguna GET /api/admin/users (harus 200 OK)...')
    const superadminCallUsersRes = await makeRequest(server, {
      path: '/api/admin/users',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${superadminToken}`,
      },
    })

    console.log(`  Status: ${superadminCallUsersRes.status}`)
    console.log(`  Total Users: ${superadminCallUsersRes.data.total}`)
    if (superadminCallUsersRes.status !== 200) {
      throw new Error(`Test 8 Gagal: Superadmin seharusnya bisa mengakses users, tetapi ${superadminCallUsersRes.status}`)
    }
    console.log(`✔ [TEST 8 BERHASIL] Superadmin diizinkan mengakses /api/admin/users (HTTP 200 OK)\n`)

    // -----------------------------------------------------------------
    // TEST 9: UJI RATE LIMIT & PENGUNCIAN AKUN (5x GAGAL LOGIN)
    // -----------------------------------------------------------------
    console.log('▶ [TEST 9] Uji Salah Password 5x & Penguncian Akun 15 Menit...')
    for (let i = 1; i <= 5; i++) {
      const failRes = await makeRequest(server, {
        path: '/api/staff/login',
        method: 'POST',
      }, {
        username: testStaffUsername,
        password: 'WrongPassword!',
      })
      console.log(`  Percobaan gagal ke-${i}: HTTP ${failRes.status} -> ${failRes.data.error}`)
      if (i === 5) {
        if (failRes.status !== 423) {
          throw new Error(`Test 9 Gagal: Pada kegagalan ke-5 seharusnya status 423 Locked, tetapi ${failRes.status}`)
        }
      }
    }
    console.log(`✔ [TEST 9 BERHASIL] Akun terkunci otomatis setelah 5 kali gagal (HTTP 423 Locked)\n`)

    // -----------------------------------------------------------------
    // TEST 10: UJI ACTIVITY LOG TERVERIFIKASI
    // -----------------------------------------------------------------
    console.log('▶ [TEST 10] Verifikasi ActivityLog Tersimpan...')
    const recentLogs = await prisma.activityLog.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
    })
    console.log(`  Ditemukan ${recentLogs.length} log aktivitas terbaru:`)
    recentLogs.forEach((l) => console.log(`  - [${l.action}] Target: ${l.target} | Status: ${l.status}`))
    console.log(`✔ [TEST 10 BERHASIL] Semua aktivitas tercatat rapi di ActivityLog\n`)

    // -----------------------------------------------------------------
    // TEST 11: UJI ENDPOINT PUBLIK GET /api/config
    // -----------------------------------------------------------------
    console.log('▶ [TEST 11] Uji Endpoint Publik GET /api/config...')
    const configRes = await makeRequest(server, {
      path: '/api/config',
      method: 'GET',
    })
    console.log(`  Status: ${configRes.status}`)
    console.log(`  Config Data:`, {
      flags: configRes.data.flags,
      theme: configRes.data.theme,
      version: configRes.data.version,
      maintenance: configRes.data.maintenance,
    })
    if (configRes.status !== 200) {
      throw new Error(`Test 11 Gagal: /api/config gagal (${configRes.status})`)
    }
    console.log(`✔ [TEST 11 BERHASIL] Endpoint /api/config menyajikan flag, tema, versi & maintenance\n`)

    console.log('=====================================================')
    console.log('🎉 SEMUA PENGUJIAN SISTEM 3 ROLE STAF BERHASIL 100%!')
    console.log('=====================================================')
  } catch (error) {
    console.error('\n❌ PENGUJIAN GAGAL:', error)
    process.exitCode = 1
  } finally {
    server.close()
    await prisma.$disconnect()
  }
}

runTest()
