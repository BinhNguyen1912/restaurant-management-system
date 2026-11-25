-- Trừ tồn kho khi tạo đơn — TẤT CẢ HOẶC KHÔNG GÌ (ticket #17).
--
-- Bản cũ trừ ngay trong lúc kiểm: nguyên liệu A trừ xong, nguyên liệu B thiếu -> đơn bị từ chối
-- nhưng A đã mất. Script này chạy 2 lượt:
--   Lượt 1: gom nhu cầu của MỌI nguyên liệu (cùng 1 nguyên liệu ở nhiều món thì CỘNG DỒN) và kiểm đủ/không đủ.
--   Lượt 2: chỉ khi KHÔNG có lỗi nào mới ghi tồn kho.
-- Trả về `deducted` (đã trừ bao nhiêu mỗi nguyên liệu) để job đồng bộ DB hoàn tác được ĐÚNG số.
--
-- ARGV[1]: JSON [{"skuId":1,"quantity":2}, ...]

local json = cjson.decode(ARGV[1])
local errors = {}
local lowStock = {}
local updated = {}
local deducted = {}

local needs = {}      -- ingredientId -> tổng số cần
local meta = {}       -- ingredientId -> {stock, minStock, unitId, key}
local firstSkuItem = {} -- ingredientId -> skuItem gây ra lỗi (để báo đúng món cho người dùng)

local function read_json(key)
  local data = redis.call("GET", key)
  if not data then
    return nil
  end
  return cjson.decode(data)
end

local function read_hash(key)
  local flat = redis.call("HGETALL", key)
  if next(flat) == nil then
    return nil
  end
  local hash = {}
  for i = 1, #flat, 2 do
    hash[flat[i]] = flat[i + 1]
  end
  return hash
end

-- ---------- LƯỢT 1: gom nhu cầu + kiểm tra ----------
for _, skuItem in ipairs(json) do
  local skuId = tostring(skuItem.skuId)
  local quantity = tonumber(skuItem.quantity)
  local recipe = read_json("recipe:" .. skuId)

  if not recipe then
    table.insert(errors, { skuId = skuId, message = "Recipe not found" })
  else
    for _, ing in ipairs(recipe) do
      local ingKey = "ingredient:" .. ing.ingredientId
      local ingHash = read_hash(ingKey)

      if ingHash == nil then
        table.insert(errors, { skuId = skuId, message = "Ingredient missing: " .. ing.ingredientId })
      else
        local stock = tonumber(ingHash["stock"]) or 0
        local minStock = tonumber(ingHash["minStock"]) or 0
        local unitId = ingHash["unitId"]
        local needQty = tonumber(ing.quantity) * quantity

        if unitId ~= ing.unitId then
          local factor = redis.call("GET", "unit:conv:" .. ing.unitId .. ":" .. unitId)
          if not factor then
            table.insert(errors, { skuId = skuId, message = "Conversion missing " .. ing.unitId .. "→" .. unitId })
            needQty = nil
          else
            needQty = needQty * tonumber(factor)
          end
        end

        if needQty ~= nil then
          local id = tostring(ing.ingredientId)
          needs[id] = (needs[id] or 0) + needQty
          meta[id] = { stock = stock, minStock = minStock, unitId = unitId, key = ingKey }
          if firstSkuItem[id] == nil then
            firstSkuItem[id] = skuItem
          end
        end
      end
    end
  end
end

-- kiểm đủ/không đủ trên TỔNG nhu cầu (không phải từng món riêng lẻ)
if #errors == 0 then
  for id, need in pairs(needs) do
    if meta[id].stock < need then
      table.insert(errors, {
        skuId = tostring(firstSkuItem[id].skuId),
        message = "Not enough stock for ingredient " .. id,
        NotEnough = 'true',
        skuItem = firstSkuItem[id],
      })
    end
  end
end

-- có bất kỳ lỗi nào -> KHÔNG ghi gì cả
if #errors > 0 then
  return cjson.encode({ errors = errors, updated = {}, lowStock = {}, deducted = {} })
end

-- ---------- LƯỢT 2: ghi tồn kho ----------
for id, need in pairs(needs) do
  local info = meta[id]
  local newStock = info.stock - need
  redis.call("HSET", info.key, "stock", newStock)

  table.insert(updated, { ingredientId = tonumber(id), newStock = newStock })
  table.insert(deducted, { ingredientId = tonumber(id), quantity = need })

  if newStock < info.minStock then
    redis.call("PUBLISH", "stock:low", id)
    table.insert(lowStock, { ingredientId = tonumber(id), newStock = newStock, minStock = info.minStock })
  end
end

return cjson.encode({ errors = {}, updated = updated, lowStock = lowStock, deducted = deducted })
