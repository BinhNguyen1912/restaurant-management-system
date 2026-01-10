export const SkuStatus = {
  AVAILABLE: 'AVAILABLE',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  DISCONTINUED: 'DISCONTINUED',
  HIDDEN: 'HIDDEN',
} as const
export type SkuStatusType = keyof typeof SkuStatus
