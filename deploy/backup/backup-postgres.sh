#!/usr/bin/env bash
# Sao lưu Postgres của res-mana-system bằng pg_dump bên trong container DB.
#
# Vì sao CHỈ Postgres là nguồn sự thật: sổ cái là append-only và mọi con số báo cáo đều tính lại
# được từ nó (`DailyBranchSummary` chỉ là projection). Redis chỉ giữ tồn kho đang dùng + cache —
# tồn kho vẫn có trong `Ingredient.stock`, nên Redis mất thì `npm run reconcile` dựng lại được.
# => Không cần backup Redis; cần backup Postgres và cần biết cách dựng lại Redis.
#
# Dùng:
#   ./deploy/backup/backup-postgres.sh                 # chạy tay
#   KEEP_DAILY=21 ./deploy/backup/backup-postgres.sh   # đổi số bản giữ
#
# Cron (02:30 hằng ngày, sau khi quán đóng):
#   30 2 * * * cd /opt/res-mana/restaurant-management-system && ./deploy/backup/backup-postgres.sh >> backups/backup.log 2>&1
set -euo pipefail

CONTAINER="${CONTAINER:-res-mana-postgres}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-ecommerce}"
BACKUP_DIR="${BACKUP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/backups}"
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"
KEEP_MONTHLY="${KEEP_MONTHLY:-12}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
DAILY_FILE="$BACKUP_DIR/$DB_NAME-$STAMP.sql.gz"
TMP_FILE="$DAILY_FILE.part"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

log "Bắt đầu dump $DB_NAME từ container $CONTAINER -> $DAILY_FILE"

# pg_dump | gzip vào file tạm: nếu dump lỗi giữa đường thì KHÔNG để lại file .gz hỏng
# (file hỏng mà tưởng có backup là kiểu mất dữ liệu tệ nhất).
if ! docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --clean --if-exists \
  | gzip -9 > "$TMP_FILE"; then
  log "LỖI: pg_dump thất bại — xoá file tạm, KHÔNG ghi nhận bản backup này"
  rm -f "$TMP_FILE"
  exit 1
fi

# Kiểm tra file thật sự dùng được: giải nén thử + phải có dấu hiệu của dump Postgres
if ! gzip -t "$TMP_FILE"; then
  log "LỖI: file gzip hỏng — xoá"
  rm -f "$TMP_FILE"
  exit 1
fi
# Giải nén ra file rồi mới grep: `gzip -dc … | head -c` làm gzip nhận SIGPIPE, và với `pipefail`
# cả pipeline trả non-zero -> tưởng file hỏng dù nó tốt (đã gặp đúng lỗi này khi test).
CHECK_FILE="$TMP_FILE.check"
gzip -dc "$TMP_FILE" > "$CHECK_FILE"
if ! head -c 2000 "$CHECK_FILE" | grep -q 'PostgreSQL database dump'; then
  log "LỖI: nội dung không giống dump Postgres — xoá"
  rm -f "$TMP_FILE" "$CHECK_FILE"
  exit 1
fi
rm -f "$CHECK_FILE"

mv "$TMP_FILE" "$DAILY_FILE"
SIZE="$(du -h "$DAILY_FILE" | cut -f1)"
log "Xong: $DAILY_FILE ($SIZE)"

# Bản tuần (Chủ nhật) và bản tháng (ngày 1) — giữ lâu hơn bản ngày để lần ngược xa khi cần
if [ "$(date +%u)" = "7" ]; then
  cp -p "$DAILY_FILE" "$BACKUP_DIR/weekly-$DB_NAME-$(date +%G-W%V).sql.gz"
  log "Đã tạo bản tuần"
fi
if [ "$(date +%d)" = "01" ]; then
  cp -p "$DAILY_FILE" "$BACKUP_DIR/monthly-$DB_NAME-$(date +%Y-%m).sql.gz"
  log "Đã tạo bản tháng"
fi

# Dọn bản cũ: giữ N bản mỗi loại, xoá phần dư (mới nhất giữ lại)
prune() {
  local pattern="$1" keep="$2"
  # shellcheck disable=SC2012
  # `|| true`: chưa có file nào thì `ls` trả non-zero, và với pipefail + set -e sẽ làm script chết
  { ls -1t $BACKUP_DIR/$pattern 2>/dev/null || true; } | tail -n +$((keep + 1)) | while read -r old; do
    rm -f "$old"
    log "Xoá bản cũ: $(basename "$old")"
  done
}
prune "$DB_NAME-*.sql.gz" "$KEEP_DAILY"
prune "weekly-$DB_NAME-*.sql.gz" "$KEEP_WEEKLY"
prune "monthly-$DB_NAME-*.sql.gz" "$KEEP_MONTHLY"

log "Tổng số bản đang giữ: $(ls -1 "$BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l)"
