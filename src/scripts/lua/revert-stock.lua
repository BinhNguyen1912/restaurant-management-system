-- Hoàn tác tồn kho khi job đồng bộ DB thất bại (ticket #17).
--
-- Hợp đồng: ARGV[1] = JSON [{"ingredientId": 1, "quantity": 5}, ...] — CỘNG LẠI đúng số đã trừ.
-- Bản cũ tính `previousStock = newStock + (newStock - currentStock)` — sai công thức, hoàn tác
-- càng nhiều lần tồn kho càng lệch.

local json = cjson.decode(ARGV[1])
local updated = {}

for _, item in ipairs(json) do
  local ingKey = "ingredient:" .. item.ingredientId
  local currentStock = tonumber(redis.call("HGET", ingKey, "stock")) or 0
  local quantity = tonumber(item.quantity) or 0
  local restored = currentStock + quantity
  redis.call("HSET", ingKey, "stock", restored)
  table.insert(updated, { ingredientId = item.ingredientId, restoredTo = restored })
end

return cjson.encode({ success = true, updated = updated })
