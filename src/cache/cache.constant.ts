export const CACHE_KEYS = {
  INGREDIENT: (id: number | string) => `ingredient:${id}`,
  UNIT_CONVERSION: (from: string, to: string) => `unit:conv:${from}:${to}`,
  SKU: (id: number | string) => `sku:${id}`,
  ROLE: (id: number) => `role:${id}`,
  SKU_RECIPE_INGREDIENT: ({ ingredientId, skuId }: { skuId: number; ingredientId: number }) =>
    `sKURecipeIngredient:${skuId}:${ingredientId}`,
  REMINDDER_ACTIVE: 'reminder:active',
}
export const CACHE_TTL = {
  INGREDIENT: 60 * 60,
  UNIT_CONVERSION: 24 * 60 * 60,
  SKU: 10 * 60,
  REMINDER_ACTIVE: 1800,
}
