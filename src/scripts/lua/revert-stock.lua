-- KEYS: none
-- ARGV[1]: JSON string of updated ingredients [{ingredientId: 1, newStock: 10}, ...]

local json = cjson.decode(ARGV[1])

local updated = {}
for _, item in ipairs(json) do
  local ingKey = "ingredient:" .. item.ingredientId
  local currentStock = tonumber(redis.call("HGET", ingKey, "stock")) or 0
  local delta = item.newStock - currentStock
  local previousStock = item.newStock + delta
  redis.call("HSET", ingKey, "stock", previousStock)
  table.insert(updated, { ingredientId = item.ingredientId, revertedTo = previousStock })
end

return cjson.encode({ success = true, updated = updated })