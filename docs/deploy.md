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
# build + chạy API
docker compose --env-file .env.production up -d --build be

# BƯỚC QUAN TRỌNG: migration + seed nền + quyền — chạy MỘT LẦN mỗi lần deploy
docker compose --env-file .env.production run --rm be npm run deploy:prepare:prod
```

`deploy:prepare:prod` = `prisma migrate deploy` → seed danh mục tài khoản → seed role + admin
(idempotent, **không** đổi mật khẩu admin đã có) → `create-permissions`.

> ⚠️ **Không** đưa `create-permissions` vào `CMD` của container: script đó gán lại quyền theo
> policy trong code, nên chạy mỗi lần restart sẽ **xoá mọi thay đổi quyền bạn đã tick trên UI**.
> Chỉ chạy khi **bộ route thay đổi** (thêm/xoá endpoint).
>
> Nếu quên chạy: API vẫn lên nhưng **route mới trả 403 cho mọi vai trò**. Container sẽ in cảnh báo
> ngay lúc khởi động: `⚠️ Có N route CHƯA có permission…`.

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

```bash
docker exec res-mana-postgres pg_dump -U postgres ecommerce | gzip > backup-$(date +%F).sql.gz
```
Redis có AOF (`--appendonly yes`) vì **tồn kho nằm trong Redis**; mất Redis là mất số đã trừ.
