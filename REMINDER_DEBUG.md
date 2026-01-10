# Hướng dẫn Debug Reminder

Tài liệu này giúp bạn kiểm tra và debug tại sao reminder không hoạt động.

## ✅ Các vấn đề đã được sửa

1. **ReminderProcessor không emit được WebSocket events**
   - Đã sửa: Thay vì tạo WebSocketGateway riêng, giờ sử dụng AppGateway chung
   - File: `src/processors/reminder.processor.ts`

2. **Thiếu logging để debug**
   - Đã thêm: Logging chi tiết ở ReminderCronService
   - File: `src/job/reminder-cron.service.ts`

## 🔍 Các bước kiểm tra

### 1. Kiểm tra Reminder có tồn tại và đang active

```sql
-- Kiểm tra reminders trong database
SELECT
  id,
  title,
  time_to_remind,
  scheduled_date,
  repeat_mode,
  is_active,
  deletedAt,
  createdAt
FROM "Reminders"
WHERE "deletedAt" IS NULL
  AND "is_active" = true;
```

### 2. Kiểm tra Cron Job có chạy không

Xem logs của server, bạn sẽ thấy mỗi phút có log:

```
🔄 Starting reminder check...
📋 Checked reminders, found X due reminder(s)
```

Nếu không thấy logs này:

- Kiểm tra `ScheduleModule.forRoot()` đã được import trong `SharedModule`
- Kiểm tra `ReminderCronService` đã được provide trong `AppModule`

### 3. Kiểm tra Redis Connection

Reminder sử dụng Bull Queue với Redis. Kiểm tra:

```bash
# Kiểm tra Redis có chạy không
redis-cli ping
# Phải trả về: PONG

# Kiểm tra env variable
echo $REDIS_URL
# Hoặc kiểm tra trong .env file
```

Nếu Redis không hoạt động:

- Queue sẽ không hoạt động
- Jobs sẽ không được process

### 4. Kiểm tra Queue Jobs

Thêm endpoint tạm để kiểm tra queue stats:

```typescript
// Trong reminders.controller.ts (tạm thời để debug)
@Get('debug/queue-stats')
async getQueueStats() {
  return await this.remindersService.getQueueStats()
}
```

### 5. Kiểm tra WebSocket Connection

Frontend cần:

1. Kết nối WebSocket với authentication token
2. Join Manager Room (cho ADMIN/STAFF):
   ```typescript
   socket.emit('join-manager-room')
   ```
3. Subscribe events:

   ```typescript
   socket.on('reminder-triggered', (data) => {
     console.log('Reminder triggered:', data)
   })

   socket.on('reminder-notification', (data) => {
     console.log('Reminder notification:', data)
   })
   ```

### 6. Kiểm tra Reminder Logic

Reminder sẽ trigger khi:

- **Có `scheduled_date`**: Phải match chính xác ngày và giờ hiện tại
- **Không có `scheduled_date`**:
  - `repeat_mode = DAILY`: Trigger mỗi ngày vào `time_to_remind`
  - `repeat_mode = WEEKLY`: Trigger vào các ngày trong `repeat_days` vào `time_to_remind`
  - `repeat_mode = ONCE`: Trigger một lần vào `scheduled_date`
  - `repeat_mode = MONTHLY`: Trigger mỗi tháng vào ngày và giờ của `scheduled_date`
  - `repeat_mode = YEARLY`: Trigger mỗi năm vào ngày và giờ của `scheduled_date`

**Lưu ý:** Cron job check mỗi phút, nên reminder chỉ trigger trong vòng 1 phút đó.

## 🧪 Test Reminder

### Tạo test reminder để trigger ngay lập tức:

1. **Tạo reminder với scheduled_date = hiện tại:**

```json
POST /reminders
{
  "title": "Test Reminder",
  "time_to_remind": "HH:MM",  // Giờ hiện tại (ví dụ: "14:30")
  "scheduled_date": "2024-01-15",  // Ngày hiện tại
  "repeat_mode": "ONCE",
  "is_active": true,
  "assigned_role": [1]  // Role ID của bạn
}
```

2. **Hoặc tạo reminder DAILY:**

```json
{
  "title": "Test Daily Reminder",
  "time_to_remind": "14:31", // Giờ hiện tại + 1 phút
  "scheduled_date": null,
  "repeat_mode": "DAILY",
  "is_active": true,
  "assigned_role": [1]
}
```

3. **Đợi đến giờ `time_to_remind` và kiểm tra logs:**
   - Server logs sẽ hiển thị: `🔄 Starting reminder check...`
   - Nếu tìm thấy: `✅ Found X due reminders`
   - Processor logs: `Processing reminder: Test Reminder`

## 🐛 Common Issues

### Issue 1: Reminder không trigger

**Nguyên nhân có thể:**

- Reminder `is_active = false`
- Reminder đã bị `deletedAt` (soft delete)
- `scheduled_date` không match với thời gian hiện tại
- `time_to_remind` không match với thời gian hiện tại
- `repeat_mode` và `repeat_days` không match

**Giải pháp:**

- Kiểm tra database query trong `findDueReminders`
- Thêm logging vào `findDueReminders` để xem reminders nào được tìm thấy

### Issue 2: WebSocket events không được emit

**Nguyên nhân có thể:**

- `AppGateway.server` chưa được khởi tạo
- WebSocket client chưa kết nối
- Client chưa subscribe events

**Giải pháp:**

- Kiểm tra logs: `WebSocket server is not initialized`
- Đảm bảo WebSocket client đã kết nối với auth token
- Kiểm tra `appGateway.server` không null

### Issue 3: Queue jobs không được process

**Nguyên nhân có thể:**

- Redis không kết nối được
- Bull Queue chưa được setup đúng
- ReminderProcessor chưa được register

**Giải pháp:**

- Kiểm tra Redis connection
- Kiểm tra `REMINDER_QUEUE` đã được register trong `BullModule`
- Kiểm tra `ReminderProcessor` đã được provide trong `SharedModule`

### Issue 4: User không nhận được notification

**Nguyên nhân có thể:**

- User không có role trong `assigned_role`
- User không có WebSocket connection
- Socket không được join vào Manager Room

**Giải pháp:**

- Kiểm tra user có `roleId` trong `assigned_role` của reminder
- Kiểm tra user có socket connection (query table `Socket`)
- Đảm bảo user là ADMIN/STAFF và đã join Manager Room

## 📊 Debug Endpoints (Tạm thời)

Thêm các endpoints sau vào `reminders.controller.ts` để debug:

```typescript
// Kiểm tra queue stats
@Get('debug/queue-stats')
async getQueueStats() {
  // Cần inject ReminderCronService vào controller
  return await this.reminderCronService.getQueueStats()
}

// Test trigger reminder manually
@Post('debug/trigger/:id')
async manualTrigger(@Param('id', ParseIntPipe) id: number) {
  // Trigger reminder ngay lập tức (bypass cron)
  const reminder = await this.remindersService.findById(id)
  if (!reminder) throw ReminderNotFoundException

  // Tạo job manually
  // ...
}
```

## ✅ Checklist

- [ ] Redis đang chạy và kết nối được
- [ ] `ScheduleModule.forRoot()` đã được import
- [ ] `ReminderCronService` đã được provide trong AppModule
- [ ] `ReminderProcessor` đã được provide trong SharedModule
- [ ] `REMINDER_QUEUE` đã được register trong BullModule
- [ ] Có ít nhất 1 reminder với `is_active = true`
- [ ] Reminder có `time_to_remind` hoặc `scheduled_date` hợp lệ
- [ ] WebSocket client đã kết nối với auth token
- [ ] WebSocket client đã subscribe events
- [ ] User có role trong `assigned_role` của reminder
- [ ] Logs hiển thị cron job đang chạy mỗi phút

## 🔧 Quick Fix

Nếu vẫn không hoạt động, thử:

1. **Restart server:**

```bash
npm run start:dev
```

2. **Kiểm tra logs:**

```bash
# Tìm logs của ReminderCronService
grep "ReminderCronService" logs.txt

# Tìm logs của ReminderProcessor
grep "ReminderProcessor" logs.txt
```

3. **Kiểm tra Redis:**

```bash
redis-cli
> PING
> KEYS reminder-queue:*
> GET reminder-queue:*
```

4. **Test thủ công:**
   Tạo reminder với `time_to_remind` = giờ hiện tại + 1 phút, rồi đợi và xem logs.

---

**Cập nhật:** 2024-01-15
**Phiên bản:** 1.0.0
