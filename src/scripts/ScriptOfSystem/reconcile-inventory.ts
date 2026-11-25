import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import Redis from 'ioredis'
import envConfig from '@/shared/config'

/**
 * Đối chiếu tồn kho DB (`Ingredient.stock`) với Redis (`ingredient:<id>` hash) — ticket #17.
 *
 * Vì sao cần: tồn kho thật được trừ trên Redis trước (nhanh, chống oversell), DB cập nhật sau
 * bằng job. Job lỗi / hoàn tác sai → hai bên lệch và không ai biết. Script này nói ra.
 *
 * Chạy:
 *   npx ts-node -r tsconfig-paths/register src/scripts/ScriptOfSystem/reconcile-inventory.ts
 *   --fix : lấy DB làm chuẩn, ghi lại Redis (chỉ dùng khi đã xác định DB đúng)
 */

const prisma = new PrismaClient()
const redis = new Redis(envConfig.REDIS_URL)

async function main() {
  const shouldFix = process.argv.includes('--fix')
  const ingredients = await prisma.ingredient.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, stock: true, unitId: true, isActive: true },
    orderBy: { id: 'asc' },
  })

  const mismatches: { id: number; name: string; db: number; redis: number | null; diff: number }[] = []
  const missingInRedis: number[] = []

  for (const ingredient of ingredients) {
    const key = `ingredient:${ingredient.id}`
    const raw = await redis.hget(key, 'stock')
    const redisStock = raw === null ? null : Number(raw)
    const dbStock = Number(ingredient.stock)

    if (redisStock === null) {
      missingInRedis.push(ingredient.id)
      continue
    }
    if (Math.abs(dbStock - redisStock) > 0.000001) {
      mismatches.push({
        id: ingredient.id,
        name: ingredient.name,
        db: dbStock,
        redis: redisStock,
        diff: Number((redisStock - dbStock).toFixed(4)),
      })
    }
  }

  console.log(`Đã kiểm ${ingredients.length} nguyên liệu`)
  console.log(`- Redis thiếu hash (chưa nạp cache): ${missingInRedis.length}${missingInRedis.length ? ` -> ${missingInRedis.join(', ')}` : ''}`)
  console.log(`- Lệch số lượng: ${mismatches.length}`)
  for (const row of mismatches) {
    console.log(
      `  #${row.id} ${row.name}: DB ${row.db} · Redis ${row.redis} (lệch ${row.diff > 0 ? '+' : ''}${row.diff})`,
    )
  }

  if (shouldFix) {
    let fixed = 0
    for (const row of mismatches) {
      // DB là chuẩn: ghi lại stock cho Redis, giữ nguyên minStock/unitId/name đang có
      await redis.hset(`ingredient:${row.id}`, 'stock', row.db)
      fixed += 1
    }
    for (const id of missingInRedis) {
      const ingredient = ingredients.find((row) => row.id === id)!
      await redis.hset(`ingredient:${id}`, {
        stock: String(ingredient.stock),
        minStock: '0',
        unitId: ingredient.unitId,
        name: ingredient.name,
      })
      fixed += 1
    }
    console.log(`Đã ghi lại Redis theo DB cho ${fixed} nguyên liệu`)
  } else if (mismatches.length || missingInRedis.length) {
    console.log('Chạy lại với --fix để lấy DB làm chuẩn và ghi lại Redis.')
  }

  await prisma.$disconnect()
  await redis.quit()
  // exit code 1 khi còn lệch -> dùng được trong cron/CI
  process.exit(mismatches.length && !shouldFix ? 1 : 0)
}

main().catch(async (error) => {
  console.error('Đối chiếu tồn kho thất bại:', error)
  await prisma.$disconnect()
  await redis.quit()
  process.exit(2)
})
