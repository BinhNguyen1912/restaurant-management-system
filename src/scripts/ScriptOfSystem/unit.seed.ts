import { PrismaService } from '@/shared/service/prisma.service'

const prisma = new PrismaService()

const main = async () => {
  const unitCount = await prisma.unit.count()
  if (unitCount > 0) {
    throw new Error('Units already exist')
  }

  console.log(' Creating Units...')

  // Tạo các đơn vị cơ bản
  const unitsData = [
    { name: 'g', description: 'Gram' },
    { name: 'kg', description: 'Kilogram' },
    { name: 'ml', description: 'Milliliter' },
    { name: 'l', description: 'Liter' },
    { name: 'piece', description: 'Piece' },
  ]

  await prisma.unit.createMany({ data: unitsData })
  console.log(' Units created!')

  console.log(' Creating Unit Conversions...')

  // Các quy đổi 2 chiều
  const conversionsData = [
    // Gram ↔ Kilogram
    { fromUnitId: 'g', toUnitId: 'kg', factor: 0.001 },
    { fromUnitId: 'kg', toUnitId: 'g', factor: 1000 },

    // Milliliter ↔ Liter
    { fromUnitId: 'ml', toUnitId: 'l', factor: 0.001 },
    { fromUnitId: 'l', toUnitId: 'ml', factor: 1000 },
  ]

  // Kiểm tra trước khi thêm để tránh trùng @@unique([fromUnitId, toUnitId])
  for (const conversion of conversionsData) {
    const exists = await prisma.unitConversion.findUnique({
      where: {
        fromUnitId_toUnitId: {
          fromUnitId: conversion.fromUnitId,
          toUnitId: conversion.toUnitId,
        },
      },
    })
    if (!exists) {
      await prisma.unitConversion.create({ data: conversion })
    }
  }

  console.log('Unit Conversions created!')
}

main()
  .then(() => {
    console.log('🌱 Seeding Units and UnitConversions completed!')
  })
  .catch((error) => {
    console.error(' Seeding failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
