# Sao lưu & phục hồi (Postgres)

## Sao lưu cái gì — và **không** cần cái gì

| Nguồn | Có backup? | Vì sao |
|---|---|---|
| **Postgres** | ✅ **có** | Là **nguồn sự thật**: sổ cái append-only, đơn/thanh toán, tồn kho (`Ingredient.stock`), tài khoản, cấu hình chi nhánh |
| Redis | ❌ không | Chỉ giữ **tồn kho đang dùng** (bản gốc vẫn trong `Ingredient.stock`) + cache. Mất thì chạy `npm run reconcile` để dựng lại từ DB |
| `DailyBranchSummary` (báo cáo) | ❌ không | Là **projection** — tính lại được từ sổ cái (`POST /reports/revenue/recompute`) |

Nói cách khác: **backup Postgres là đủ** để khôi phục toàn bộ số liệu; Redis và báo cáo dựng lại được.

## Bao lâu một lần — và vì sao
Dump hiện tại chỉ **~64KB** (nén) nên tần suất không tốn gì. Chọn theo **RPO** (mất tối đa bao nhiêu dữ liệu):

| Phương án | RPO | Khi nào dùng |
|---|---|---|
| **1 lần/ngày, 02:30** (mặc định) | ≤ 1 ngày | Quán nhỏ, chấp nhận dựng lại 1 ngày đơn nếu ổ hỏng |
| 4 lần/ngày (02:30, 10:30, 14:30, 18:30) | ≤ 4 giờ | **Khuyến nghị khi đã có doanh thu thật** — vẫn miễn phí vì dump nhỏ |
| WAL archiving (PITR) | ~1 phút | Chỉ khi cần khôi phục tới từng giao dịch; phức tạp hơn nhiều |

**Quan trọng hơn tần suất**: chạy backup **ngay trước mỗi lần deploy/migration**. Thực tế mất dữ liệu hay xảy ra lúc migrate, không phải lúc ổ cứng hỏng.

## Cài đặt

```bash
# chạy tay thử
./deploy/backup/backup-postgres.sh

# cron: 02:30 hằng ngày (sau giờ đóng cửa)
crontab -e
30 2 * * * cd /opt/res-mana/restaurant-management-system && ./deploy/backup/backup-postgres.sh >> backups/backup.log 2>&1

# muốn 4 lần/ngày
30 2,10,14,18 * * * cd /opt/res-mana/restaurant-management-system && ./deploy/backup/backup-postgres.sh >> backups/backup.log 2>&1
```

Giữ mặc định: **14 bản ngày + 8 bản tuần + 12 bản tháng** (đổi bằng `KEEP_DAILY`, `KEEP_WEEKLY`, `KEEP_MONTHLY`). File nằm ở `backups/` (đã bị `.gitignore` chặn).

## Script tự bảo vệ
- Ghi ra `.part` rồi mới `mv` ⇒ **không bao giờ để lại file `.gz` hỏng** mà tưởng là có backup.
- `gzip -t` + kiểm tra nội dung có `PostgreSQL database dump` trước khi nhận.
- Không có file nào để dọn cũng không làm script chết (`ls … || true`).

## Phục hồi (diễn tập định kỳ!)

```bash
# 1. phục hồi vào DB TẠM trước, kiểm tra số dòng, rồi mới quyết định
docker exec res-mana-postgres psql -U postgres -c 'CREATE DATABASE ecommerce_restore_test'
FORCE=1 DB_NAME=ecommerce_restore_test ./deploy/backup/restore-postgres.sh backups/ecommerce-YYYYmmdd-HHMMSS.sql.gz

# 2. so số dòng vài bảng chính
docker exec res-mana-postgres psql -U postgres -d ecommerce_restore_test -c 'select count(*) from "Order";'

# 3. phục hồi thật (script tự dump trạng thái hiện tại trước khi ghi đè)
./deploy/backup/restore-postgres.sh backups/ecommerce-YYYYmmdd-HHMMSS.sql.gz
docker compose restart be

# 4. Redis: tồn kho dựng lại từ DB
npm run reconcile
```

> Backup chưa từng được **phục hồi thử** thì chưa được coi là backup. Diễn tập mỗi quý.

## Đã kiểm chứng (trên máy dev)
```
dump:    ecommerce-20261126-191812.sql.gz — 64KB, gzip -t OK, có header Postgres
retention: chạy 4 lần với KEEP_DAILY=2 -> còn đúng 2 file mới nhất
restore: phục hồi vào ecommerce_restore_test, so số dòng với DB gốc:
         Order 8/8 · Payment 8/8 · User 8/8 · Product 28/28 · Ingredient 7/7  (khớp hết)
```
