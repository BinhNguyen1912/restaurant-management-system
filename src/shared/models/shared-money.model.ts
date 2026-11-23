import { Decimal } from '@prisma/client/runtime/library'
import { z } from 'zod'

/**
 * Cot tien trong DB la Decimal (chinh xac), nhung hop dong API voi FE van la number.
 * Schema nay nhan Decimal | number | string tu Prisma va tra ra number.
 */
export const moneyOutputSchema = z
  .union([z.instanceof(Decimal), z.number(), z.string()])
  .transform((value) => Number(value))
