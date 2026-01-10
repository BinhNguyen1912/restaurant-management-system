import { SKUSchema } from '@/shared/models/shared-sku.model'
import { create } from 'domain'
import { z } from 'zod'

export const UpsertSKUBodySchema = SKUSchema.pick({
  image: true,
  price: true,
  value: true,
})

export type UpsertSKUBody = z.infer<typeof UpsertSKUBodySchema>

export const UpsertSKUResSchema = SKUSchema
