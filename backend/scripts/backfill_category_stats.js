const { backfillCategoryStats } = require('../src/services/targetStats.service')

async function run() {
  try {
    const res = await backfillCategoryStats()
    console.log('Backfill CategoryStats sukses:', JSON.stringify(res, null, 2))
    process.exit(0)
  } catch (err) {
    console.error('Backfill CategoryStats gagal:', err)
    process.exit(1)
  }
}

run()
