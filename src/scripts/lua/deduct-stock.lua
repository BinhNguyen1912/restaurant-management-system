-- KEYS: none (sẽ truyền key trực tiếp bằng ARGV)
-- ARGV[1]: JSON string [{"skuId":1,"quantity":2}, ...]

local json = cjson.decode(ARGV[1])
local errors = {}
local lowStock = {} 
local updated = {}
local logs = {}

-- helper: đọc JSON từ Redis
local function read_json(key)
  local data = redis.call("GET", key)
  if not data then
    return nil
  end
  return cjson.decode(data)
end



for _, skuItem in ipairs(json) do
  local skuId = tostring(skuItem.skuId)
  local quantity = tonumber(skuItem.quantity)

  -- Đọc recipe của SKU
  local recipeKey = "recipe:" .. skuId
  local recipe = read_json(recipeKey)

  if not recipe then
    redis.log(redis.LOG_NOTICE, "Recipe not found for SKU " .. skuId)
    table.insert(errors, {skuId = skuId, message = "Recipe not found"})
  else
    local skuDeducted = {}
    for _, ing in ipairs(recipe) do
      local ingKey = "ingredient:" .. ing.ingredientId
      local ingData = redis.call("HGETALL", ingKey)
      if next(ingData) == nil then
        table.insert(errors, {skuId = skuId, message = "Ingredient missing: " .. ing.ingredientId})
      else
        local ingHash = {}
        for i = 1, #ingData, 2 do
          ingHash[ingData[i]] = ingData[i + 1]
        end

        local stock = tonumber(ingHash["stock"])
        local minStock = tonumber(ingHash["minStock"])
        local unitId = ingHash["unitId"]
        local needQty = tonumber(ing.quantity) * quantity

        -- Nếu đơn vị khác -> quy đổi
        if unitId ~= ing.unitId then
          local convKey = "unit:conv:" .. ing.unitId .. ":" .. unitId
          local factor = redis.call("GET", convKey)
          if not factor then
            table.insert(errors, {skuId = skuId, message = "Conversion missing " .. ing.unitId .. "→" .. unitId})
          else
            needQty = needQty * tonumber(factor)
          end
        end
        
        if stock < needQty then
          table.insert(errors, {skuId = skuId, message = "Not enough stock for ingredient " .. ing.ingredientId, NotEnough = 'true', skuItem = skuItem})
        else
          local newStock = stock - needQty
          redis.call("HSET", ingKey, "stock", newStock)

          if newStock < minStock then
            -- Gửi message qua Redis Pub/Sub để hệ thống khác có thể lắng nghe
            redis.call("PUBLISH", "stock:low", ing.ingredientId)
             -- Thêm vào danh sách lowStock để trả về
            table.insert(lowStock, { ingredientId = ing.ingredientId, newStock = newStock, minStock = minStock })
          end
          table.insert(updated, {ingredientId = ing.ingredientId, newStock = newStock})
        end
      end
    end
  end
end

return cjson.encode({ errors = errors, updated = updated, lowStock = lowStock })
