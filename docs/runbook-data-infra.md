# Runbook hạ tầng dữ liệu (ticket #04)

Mọi thứ ở đây tồn tại để **dữ liệu tài chính không bị sai và không bị mất**. Ba thứ dễ mất/sai nhất:
timezone, backup, và index thiếu.

## 1. Múi giờ

- `main.ts` nạp `src/shared/config/timezone.ts` **đầu tiên** → `process.env.TZ = Asia/Ho_Chi_Minh`.
- Mọi `@Cron` khai báo `timeZone: SYSTEM_TIME_ZONE` tường minh (không dựa vào TZ của container).
- `docker-compose.yml` đặt `TZ`/`PGTZ` cho Postgres.
- Báo cáo cắt ngày theo `Asia/Ho_Chi_Minh` (`resolveRange`), không theo UTC.

Kiểm nhanh: `/health` trả `timezone`; log cron ghi ngày giờ VN.

Vì sao: đơn 23:30 giờ VN nếu cắt theo UTC sẽ rơi sang ngày hôm sau → doanh thu chốt sai ngày.

## 2. Backup

Script: `scripts/db-backup.ps1` (pg_dump định dạng `-Fc`, giữ N bản, xoá bản cũ).

```powershell
# backup ngay (giữ 14 bản mặc định)
powershell -NoProfile -File scripts\db-backup.ps1

# giữ 30 bản
powershell -NoProfile -File scripts\db-backup.ps1 -Keep 30

# đặt lịch hằng ngày 23:30
schtasks /create /tn "res-mana backup DB" /sc daily /st 23:30 /ru %USERNAME% ^
  /tr "powershell -NoProfile -ExecutionPolicy Bypass -File D:\res-mana-system\restaurant-management-system\scripts\db-backup.ps1"
```

File nằm ở `backups/ecommerce_<yyyyMMdd_HHmmss>.dump` (đã gitignore). Script **tự báo lỗi nếu file 0 KB**
— backup rỗng còn tệ hơn không có backup vì tạo cảm giác an toàn giả.

### Restore

```powershell
# dừng BE trước (đang giữ connection sẽ bị ngắt giữa chừng)
powershell -NoProfile -File scripts\db-backup.ps1 -Restore backups\ecommerce_20261124_233000.dump
```

Sau khi restore: chạy lại BE rồi kiểm

```
GET /ledger/integrity   -> difference = 0, unbalancedEntries = 0
POST /reports/revenue/recompute  {fromDate, toDate}   # dựng lại projection doanh thu
```

## 3. Index

Migration `20261124140000_finance_query_indexes` thêm:

| Index | Dùng cho |
|---|---|
| `Payment(status, paidAt)` | đối soát theo kỳ: `Payment SUCCESS` trong khoảng ngày |
| `Payment(branchId, paidAt)` | cùng query nhưng lọc 1 chi nhánh |
| `Reservation(deletedAt, reservationTime)` | danh sách đặt bàn theo thời gian |

Đã có sẵn từ trước: `Order(branchId, createdAt)`, `Order(deletedAt, status, createdAt)`, `LedgerEntry(branchId, occurredAt)`,
`DailyBranchSummary(branchId, date)`.

Kiểm index có thật trong DB:

```sql
SELECT indexname FROM pg_indexes WHERE tablename IN ('Payment','Reservation','Order') ORDER BY 1;
```

## 4. Healthcheck + shutdown

- `GET /health` (public, bỏ throttler): kiểm Postgres (`SELECT 1`) + Redis (set/get) → 200 `{status:'ok'}`,
  hoặc **503** kèm `checks`/`errors` nếu có phụ thuộc chết.
- `app.enableShutdownHooks()` trong `main.ts`: SIGTERM đóng Prisma/BullMQ/Redis đúng cách (không mất job đang chạy).

Dùng cho Docker healthcheck / load balancer:

```
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
  interval: 30s
```
