import { SkuStatus } from '@/shared/constants/sku.constant'
import { moneyOutputSchema } from '@/shared/models/shared-money.model'
import { z } from 'zod'

export const SKUSchema = z.object({
  id: z.number(),
  value: z.string(),
  price: moneyOutputSchema,
  image: z.string().optional(),
  productId: z.number(),
  status: z.enum([SkuStatus.AVAILABLE, SkuStatus.OUT_OF_STOCK, SkuStatus.DISCONTINUED, SkuStatus.HIDDEN]),
  createdById: z.number(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type SKUSType = z.infer<typeof SKUSchema>
