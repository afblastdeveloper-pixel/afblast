const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Seeding member features, withdrawal presets, and site settings...')

  // 1. Site Settings for Withdrawals
  const siteSettings = [
    { key: 'withdraw.min', value: '20000' },
    { key: 'withdraw.max', value: '5000000' },
    { key: 'withdraw.allowCustom', value: 'true' },
  ]

  for (const s of siteSettings) {
    await prisma.siteSetting.upsert({
      where: { key: s.key },
      update: {},
      create: { key: s.key, value: s.value },
    })
    console.log(`Setting ${s.key} ready`)
  }

  // 2. Withdrawal Presets: 20000, 50000, 100000, 150000, 200000, 500000
  const presets = [
    { amount: 20000, sortOrder: 1, isActive: true },
    { amount: 50000, sortOrder: 2, isActive: true },
    { amount: 100000, sortOrder: 3, isActive: true },
    { amount: 150000, sortOrder: 4, isActive: true },
    { amount: 200000, sortOrder: 5, isActive: true },
    { amount: 500000, sortOrder: 6, isActive: true },
  ]

  for (const p of presets) {
    await prisma.withdrawalPreset.upsert({
      where: { amount: p.amount },
      update: { sortOrder: p.sortOrder, isActive: p.isActive },
      create: p,
    })
    console.log(`Preset Rp${p.amount} ready`)
  }

  // 3. Optional sample active team members
  const sampleTeam = [
    { name: 'Rian Pratama', roleTitle: 'Head of Support', contact: '+6281234567890', sortOrder: 1, isActive: true },
    { name: 'Maya Anggraini', roleTitle: 'Finance Operations', contact: '+6281298765432', sortOrder: 2, isActive: true },
    { name: 'Bagus Setiawan', roleTitle: 'Broadcast Specialist', contact: '+6281311223344', sortOrder: 3, isActive: true },
  ]

  for (const m of sampleTeam) {
    const existing = await prisma.teamMember.findFirst({ where: { name: m.name } })
    if (!existing) {
      await prisma.teamMember.create({ data: m })
      console.log(`Team member ${m.name} created`)
    }
  }

  console.log('Seeding completed successfully!')
}

main()
  .catch((e) => {
    console.error('Seeding error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
