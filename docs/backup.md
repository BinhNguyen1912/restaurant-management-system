# Sao lưu & phục hồi (Postgres)

## Sao lưu cái gì — và **không** cần cái gì

| Nguồn | Có backup? | Vì sao |
|---|---|---|
| **Postgres** | ✅ **có** | Là **nguồn sự thật**: sổ cái append-only, đơn/thanh toán, tồn kho (`Ingredient.stock`), tài khoản, cấu hình chi nhánh |
| Redis | ❌ không | Chỉ giữ **tồn kho đang dùng** (bản gốc vẫn trong `Ingredient.stock`) + cache. Mất thì dựng lại bằng `node dist/scripts/ScriptOfSystem/reconcile-inventory.js --fix` (lệnh đầy đủ ở mục Phục hồi) |
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

Trên **VPS trắng** có hai thứ chưa tự có — thiếu một trong hai là bước backup chết ngay lần đầu:

```bash
# 1. bit thực thi. Git đã lưu mode 755, nhưng nếu code lên VPS bằng scp/zip hoặc checkout trên
#    filesystem không giữ mode thì phải cấp lại, không thì "./deploy/..." báo Permission denied
chmod +x deploy/backup/*.sh
#    (chưa muốn chmod: "bash deploy/backup/backup-postgres.sh" chạy được cả khi thiếu +x)

# 2. thư mục nhận log. Shell mở ">> backups/backup.log" TRƯỚC khi script kịp "mkdir -p" bên trong
#    -> VPS mới chưa có backups/ thì cron ghi "No such file or directory" rồi im lặng nhiều ngày
mkdir -p backups

# chạy tay thử
./deploy/backup/backup-postgres.sh

# cron: 02:30 hằng ngày (sau giờ đóng cửa)
crontab -e
30 2 * * * cd /opt/res-mana/restaurant-management-system && mkdir -p backups && ./deploy/backup/backup-postgres.sh >> backups/backup.log 2>&1

# muốn 4 lần/ngày
30 2,10,14,18 * * * cd /opt/res-mana/restaurant-management-system && mkdir -p backups && ./deploy/backup/backup-postgres.sh >> backups/backup.log 2>&1
```

> Cron chạy với **PATH tối giản** và thường **không thấy `docker`**. Nếu log ghi
> `docker: command not found`, thêm dòng đầu crontab: `PATH=/usr/local/bin:/usr/bin:/bin`
> (hoặc gọi thẳng `/usr/bin/docker`). Sửa xong kiểm lại bằng `crontab -l`.

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
docker compose --env-file .env.production restart be

# 4. Redis: tồn kho dựng lại từ DB (BẮT BUỘC — luồng bán hàng trừ kho trên Redis)
#    image production chỉ có "dist" (không có ts-node) nên gọi file .js đã biên dịch;
#    --fix = lấy DB làm chuẩn rồi ghi lại Redis
docker compose --env-file .env.production exec be node dist/scripts/ScriptOfSystem/reconcile-inventory.js --fix
```

> Backup chưa từng được **phục hồi thử** thì chưa được coi là backup. Diễn tập mỗi quý.

## Đã kiểm chứng (trên máy dev)
```
dump:    ecommerce-20261126-191812.sql.gz — 64KB, gzip -t OK, có header Postgres
retention: chạy 4 lần với KEEP_DAILY=2 -> còn đúng 2 file mới nhất
restore: phục hồi vào ecommerce_restore_test, so số dòng với DB gốc:
         Order 8/8 · Payment 8/8 · User 8/8 · Product 28/28 · Ingredient 7/7  (khớp hết)
```
