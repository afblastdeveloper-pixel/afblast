const { PrismaClient } = require('@prisma/client')

// Inisialisasi satu instance PrismaClient
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
})

module.exports = prisma
