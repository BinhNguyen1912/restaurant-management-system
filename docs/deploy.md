# Deploy BE lên VPS (Docker riêng, tách khỏi FE)

FE có Docker **riêng** (repo `restaurant-management-system-FE`) và proxy **riêng**
(`deploy/proxy`). Repo này chỉ quản API + Postgres + Redis.

## Kiến trúc

```
Caddy (deploy/proxy)  ── api.<domain> ──► be:4000
                      └─ app.<domain> ──► fe:3000   (repo FE)

network: res-mana (external)
  be · postgres · redis · fe · caddy
```

Postgres/Redis **không publish port** — chỉ container trong `res-mana` truy cập được.

## Chuẩn bị (một lần)

```bash
# 1. network chung cho FE + BE + proxy
docker network create res-mana

# 2. env
cp .env.production.example .env.production   # điền mật khẩu/secret thật

# 3. dựng DB + Redis
docker compose --env-file .env.production up -d postgres redis
```

## Deploy

```bash
# 0. BACKUP trước khi deploy (bỏ qua ở lần deploy ĐẦU TIÊN — chưa có DB/container để dump)
#    lần đầu trên VPS: chmod +x deploy/backup/*.sh && mkdir -p backups   (xem docs/backup.md)
./deploy/backup/backup-postgres.sh

# 1. build image
docker compose --env-file .env.production build be

# 2. DB + Redis trước
docker compose --env-file .env.production up -d postgres redis

# 3. MIGRATION + SEED TRƯỚC KHI START API (thứ tự này quan trọng)
#    App nạp cache tồn kho từ Postgres ngay trong onModuleInit; DB rỗng thì nó ném P2021,
#    container thoát và `restart: unless-stopped` lặp vô hạn, Caddy trả 502 suốt thời gian đó.
docker compose --env-file .env.production run --rm be npm run deploy:prepare:prod

# 4. giờ mới start API
docker compose --env-file .env.production up -d be
```

> **Khôi phục từ backup / chạy `data:vn` trên máy đang chạy**: sau khi ghi DB phải
> `docker compose --env-file .env.production restart be` rồi chạy
> `docker compose --env-file .env.production exec be node dist/scripts/ScriptOfSystem/reconcile-inventory.js --fix`
> để **Redis khớp lại tồn kho** — luồng bán hàng trừ kho trên Redis, không phải Postgres.
> Không có npm script cho việc này: image production chỉ có `dist`, không có `ts-node`.

`deploy:prepare:prod` = `prisma migrate deploy` → seed danh mục tài khoản → seed role + admin
(idempotent, **không** đổi mật khẩu admin đã có). **KHÔNG** còn chạy `create-permissions` (xem cảnh
báo ngay dưới).

> ⚠️ **Không** đưa `create-permissions` vào `CMD` của container **hoặc vào lệnh deploy**: script đó
> (a) gán lại toàn bộ quyền theo policy trong code bằng `set`, nên **xoá mọi thay đổi quyền bạn đã
> tick trên UI**, và (b) khởi động nguyên `AppModule` — tạo instance thứ hai chạy cron/BullMQ và
> **ghi đè tồn kho Redis từ Postgres** giữa lúc quán đang bán. Chỉ chạy tay khi **bộ route thay
> đổi** (thêm/xoá endpoint): `docker compose --env-file .env.production run --rm be node dist/scripts/ScriptOfSystem/create-permissions.js`.
>
> Nếu quên chạy: API vẫn lên nhưng **route mới trả 403 cho mọi vai trò**. Container sẽ in cảnh báo
> ngay lúc khởi động: `⚠️ Có N route CHƯA có permission…`.

## Job dọn nhật ký (tự động, hằng tháng)

`LogRetentionCronService` chạy trong chính app: **03:00 ngày 1 mỗi tháng**, xoá `AccessLog` +
`LoginAttempt` cũ hơn `LOG_RETENTION_MONTHS` tháng. Con số nằm ở `.env.production`, **không** nằm
trong code — sửa một dòng rồi `restart be`, không cần build lại. Để trống biến này thì job tự bỏ qua
và ghi log lý do (app vẫn chạy bình thường).

Kiểm tra sau lần chạy đầu tiên:

```
docker compose --env-file .env.production logs be | grep "Dọn nhật ký"
```

Dòng log có dạng `Dọn nhật ký: mốc 2025-11-28 (12 tháng), đã xoá 0 dòng — AccessLog 0/0, LoginAttempt 0/0`.
Số `xoá/quá hạn` lệch nhau nghĩa là chạm trần 5000 dòng/bảng một lượt: chạy tay để dọn tiếp (trong
container chỉ có `dist`, không có `ts-node`, nên dùng file đã build):

```
docker compose --env-file .env.production exec be node dist/scripts/ScriptOfSystem/prune-logs.js --months=12 --apply
```

> ⚠️ Việc dọn **không** ghi `AuditLog` (lý do ở `docs/pii-retention-policy.md` §4b): dấu vết duy nhất
> là log của container, mà `docker compose logs` bị rotate. Muốn giữ lịch sử các lần dọn thì phải
> đẩy log ra ngoài container — chưa có trong repo này.

## ⚠️ Mật khẩu trong bộ dữ liệu mẫu
`npm run data:vn` tạo tài khoản với mật khẩu **`123456`**, **kể cả admin**. Đó là dữ liệu cho
máy dev/demo — trước khi mở staging ra Internet phải:
1. **đổi mật khẩu admin** (UI → Hồ sơ, hoặc `UPDATE "User" SET password=<bcrypt>`),
2. khoá hoặc đổi mật khẩu 48 tài khoản `@order.com` nếu không dùng thật.

`deploy:prepare:prod` **không** ghi đè mật khẩu admin đã tồn tại (`index.ts`) nên nó cũng không tự
"cứu" trường hợp này.

## Proxy + HTTPS

```bash
DOMAIN=abc.com docker compose -f deploy/proxy/docker-compose.yml up -d
```
Caddy tự xin cert Let's Encrypt cho `app.abc.com` và `api.abc.com` (cần DNS trỏ về VPS + port 80/443 mở).

## Ba cái bẫy của `docker --env-file` (đã gặp khi build local)
1. **Không có dấu cách quanh `=`**: `KEY = value` → `invalid env file: variable 'KEY ' contains whitespaces`.
   File `.env` của máy dev viết kiểu `DATABASE_URL = "..."` sẽ **không dùng được** cho Docker.
2. **Không bọc nháy**: Docker giữ nguyên dấu `"` (dotenv thì bỏ) → `DATABASE_URL="postgresql://…"`
   thành URL bắt đầu bằng `"` ⇒ Prisma báo `the URL must start with postgresql://`.
   Dùng `KEY=value`, không nháy.
3. **Container không tự đọc file `.env`**: file chỉ được nạp *vào biến môi trường* lúc `docker run/compose`.
   (Trước đây app còn `process.exit(1)` nếu thiếu file `.env` trong container — đã sửa: giờ app dùng
   env của process, vẫn kiểm tra thiếu biến nào.)

## Kiểm tra

```bash
docker compose --env-file .env.production logs -f be
curl -fsS https://api.abc.com/health
```

## Sao lưu
Xem **[docs/backup.md](./backup.md)** — có script `deploy/backup/backup-postgres.sh` (dump + kiểm tra
file + giữ 14 ngày/8 tuần/12 tháng) và `restore-postgres.sh`, kèm khuyến nghị tần suất theo RPO.

Tóm tắt: **chỉ Postgres cần backup** (sổ cái là nguồn sự thật; Redis và projection báo cáo dựng lại
được). Redis chạy `--appendonly yes` để restart không mất tồn kho đang dùng.
