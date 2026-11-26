#!/usr/bin/env bash
# Phục hồi từ file backup .sql.gz.
#
# CẢNH BÁO: `pg_dump --clean` trong file này sẽ DROP các object hiện có của DB đích.
# Dùng: ./deploy/backup/restore-postgres.sh backups/ecommerce-20261126-023000.sql.gz
#       DB_NAME=ecommerce_restore CONTAINER=res-mana-postgres ./deploy/backup/restore-postgres.sh <file>
set -euo pipefail

FILE="${1:-}"
CONTAINER="${CONTAINER:-res-mana-postgres}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-ecommerce}"

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Dùng: $0 <file .sql.gz>"
  exit 1
fi
gzip -t "$FILE" || { echo "File backup hỏng: $FILE"; exit 1; }

echo "Sẽ phục hồi '$FILE' vào database '$DB_NAME' (container $CONTAINER)."
echo "Toàn bộ object hiện có của '$DB_NAME' sẽ bị DROP theo nội dung file."
if [ "${FORCE:-}" != "1" ]; then
  read -r -p "Gõ chính xác tên database ($DB_NAME) để tiếp tục: " CONFIRM
  [ "$CONFIRM" = "$DB_NAME" ] || { echo "Huỷ."; exit 1; }
fi

# Giữ một bản an toàn của trạng thái HIỆN TẠI trước khi ghi đè
SAFETY="/tmp/pre-restore-$DB_NAME-$(date +%Y%m%d-%H%M%S).sql.gz"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner | gzip -9 > "$SAFETY"
echo "Đã dump trạng thái hiện tại trước khi phục hồi: $SAFETY"

gzip -dc "$FILE" | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 > /dev/null
echo "Phục hồi xong. Chạy 'docker compose restart be' để app nạp lại dữ liệu."
