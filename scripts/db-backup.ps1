# Backup / restore Postgres của res-mana-system
#
# Vì sao: toàn bộ sổ cái nằm trong volume Docker. Mất volume là mất sổ — không tái tạo được.
#
# Dùng:
#   powershell -NoProfile -File scripts\db-backup.ps1                 # backup ngay, giữ 14 bản
#   powershell -NoProfile -File scripts\db-backup.ps1 -Keep 30        # giữ 30 bản
#   powershell -NoProfile -File scripts\db-backup.ps1 -Restore backups\<file>.dump
#
# Chạy theo lịch (Task Scheduler, chạy mỗi ngày 23:30):
#   schtasks /create /tn "res-mana backup DB" /sc daily /st 23:30 /ru %USERNAME% ^
#     /tr "powershell -NoProfile -ExecutionPolicy Bypass -File D:\res-mana-system\restaurant-management-system\scripts\db-backup.ps1"
param(
  [int]$Keep = 14,
  [string]$Restore = '',
  [string]$Container = 'res-mana-postgres',
  [string]$DbUser = 'postgres',
  [string]$DbName = 'ecommerce'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$backupDir = Join-Path $repoRoot 'backups'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

function Wait-ContainerReady([int]$timeoutSec = 90) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    $state = docker inspect --format '{{.State.Health.Status}}' $Container 2>$null
    if ($state -eq 'healthy') { return $true }
    Start-Sleep -Seconds 2
  }
  throw "Container $Container chua healthy sau ${timeoutSec}s"
}

# ---------- RESTORE ----------
if ($Restore) {
  $file = if (Test-Path $Restore) { (Resolve-Path $Restore).Path } else { Join-Path $backupDir $Restore }
  if (-not (Test-Path $file)) { throw "Khong thay file backup: $file" }
  Wait-ContainerReady | Out-Null

  Write-Host "== RESTORE $file -> $DbName (ghi de toan bo) =="
  Write-Host '   Dung app lai truoc khi restore (BE dang giu ket noi se bi ngat giua chung).'
  # copy file vào container rồi restore từ trong: PowerShell không pipe/redirect nhị phân an toàn
  docker cp "$file" "${Container}:/tmp/restore.dump"
  if ($LASTEXITCODE -ne 0) { throw "docker cp that bai (exit $LASTEXITCODE)" }
  docker exec $Container pg_restore -U $DbUser -d $DbName --clean --if-exists --no-owner --no-privileges /tmp/restore.dump
  if ($LASTEXITCODE -ne 0) { throw "pg_restore that bai (exit $LASTEXITCODE)" }
  docker exec $Container rm -f /tmp/restore.dump | Out-Null
  Write-Host '== Xong. Chay lai BE, roi kiem: GET /ledger/integrity phai difference = 0 =='
  return
}

# ---------- BACKUP ----------
Wait-ContainerReady | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$target = Join-Path $backupDir "ecommerce_$stamp.dump"

Write-Host "== pg_dump $DbName -> $target =="
# -Fc: dinh dang custom, nen san, restore duoc tung bang; khong dung text de tranh loi encoding.
# dump TRONG container roi copy ra: pipe nhi phan qua PowerShell se bi doi byte -> file hong.
docker exec $Container pg_dump -U $DbUser -d $DbName -Fc -f /tmp/backup.dump
if ($LASTEXITCODE -ne 0) { throw "pg_dump that bai (exit $LASTEXITCODE)" }
docker cp "${Container}:/tmp/backup.dump" "$target"
if ($LASTEXITCODE -ne 0) { throw "docker cp that bai (exit $LASTEXITCODE)" }
docker exec $Container rm -f /tmp/backup.dump | Out-Null

$sizeKb = [math]::Round((Get-Item $target).Length / 1KB, 1)
if ($sizeKb -le 0) {
  # file rong = backup vo nghia, phai keu len chu khong im lang
  Remove-Item $target -Force
  throw 'File backup rong (0 KB) - kiem tra container/DB truoc khi tin backup nay'
}
Write-Host "   OK: $sizeKb KB"

# giu N ban moi nhat, xoa ban cu
$all = Get-ChildItem -Path $backupDir -Filter 'ecommerce_*.dump' | Sort-Object LastWriteTime -Descending
if ($all.Count -gt $Keep) {
  $all | Select-Object -Skip $Keep | ForEach-Object {
    Remove-Item $_.FullName -Force
    Write-Host "   Xoa ban cu: $($_.Name)"
  }
}

Write-Host "== Con lai $((Get-ChildItem -Path $backupDir -Filter 'ecommerce_*.dump').Count) ban (giu $Keep) =="
Write-Host 'Restore: scripts\db-backup.ps1 -Restore backups\<file>.dump'
